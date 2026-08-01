"""The blocking ask: pause the agent mid-turn, ask the browser, resume.

No new transport. `execute_tool` already solves the same problem — push work to
Redis, block on BRPOP until an answer arrives, and it works across uvicorn
workers because Redis is the shared channel. The permission ask reuses that
shape with different keys:

    loop:  SSE {type: "permission_request", id, tool, params}
           BRPOP agent:perm:reply:{id}          <- blocks here
    UI:    POST /me/permissions/{id}/reply
           LPUSH agent:perm:reply:{id}

Three things this has to get right, none of which are obvious:

* **A timeout is mandatory.** A closed tab must not hold a generation open
  forever — it pins a concurrency slot and the user can never spend it again.
  Timing out is treated as a rejection: the safe answer when nobody is there to
  approve is "no".
* **Interrupt has to work while blocked.** The wait polls in short hops instead
  of one long BRPOP so Esc is noticed within a couple of seconds rather than
  after the full timeout.
* **The reply has to be authorised.** This feature exists to close a security
  gap; it must not open one. Each pending request records the user who owns it,
  and a reply from anyone else is rejected — otherwise approving someone else's
  dangerous action would be a single guessed UUID away.

`always` grants are scoped to the conversation, matching OpenCode, where
approvals live in per-instance state rather than on disk. A grant is a decision
about a piece of work, not a permanent change to how the agent behaves.
"""

import json
import logging

from app.cache import get_async_redis
from app.services.permissions import Rule

log = logging.getLogger("switchboard.permission")

# How long to wait for a human. Long enough to read a diff and think, short
# enough that an abandoned tab frees the slot.
PERMISSION_TIMEOUT = 300  # seconds
POLL_INTERVAL = 2         # seconds per BRPOP hop, so interrupts land quickly
REQUEST_TTL = PERMISSION_TIMEOUT + 60
GRANT_TTL = 24 * 3600


def _reply_key(request_id: str) -> str:
    return f"agent:perm:reply:{request_id}"


def _request_key(request_id: str) -> str:
    return f"agent:perm:req:{request_id}"


def _grants_key(conversation_id: str) -> str:
    return f"agent:perm:grants:{conversation_id}"


async def register_request(request_id: str, user_id: str, conversation_id: str,
                           tool: str, permission: str, pattern: str) -> None:
    """Record who may answer this request, and what it's about."""
    ar = get_async_redis()
    await ar.set(
        _request_key(request_id),
        json.dumps({"user_id": user_id, "conversation_id": conversation_id,
                    "tool": tool, "permission": permission, "pattern": pattern}),
        ex=REQUEST_TTL,
    )


async def get_request(request_id: str) -> dict | None:
    try:
        raw = await get_async_redis().get(_request_key(request_id))
    except Exception:
        log.exception("get_request failed")
        return None
    if not raw:
        return None
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8", errors="replace")
    try:
        return json.loads(raw)
    except Exception:
        return None


async def submit_reply(request_id: str, reply: str, message: str | None = None) -> None:
    ar = get_async_redis()
    key = _reply_key(request_id)
    await ar.lpush(key, json.dumps({"reply": reply, "message": message}))
    await ar.expire(key, REQUEST_TTL)


async def wait_for_reply(request_id: str, client_gone=None,
                         timeout: int = PERMISSION_TIMEOUT) -> dict:
    """Block until the UI answers, the user interrupts, or we give up.

    Returns {"reply": "once"|"always"|"reject", "message": str|None}. Every
    non-approval path collapses to a rejection, because "we don't have a yes" is
    the only safe reading of silence.
    """
    ar = get_async_redis()
    key = _reply_key(request_id)
    waited = 0
    while waited < timeout:
        if client_gone is not None and await client_gone():
            return {"reply": "reject", "message": None, "reason": "interrupted"}
        try:
            popped = await ar.brpop([key], timeout=POLL_INTERVAL)
        except Exception:
            # Redis trouble mid-ask: fail closed. An unanswerable request must
            # not become an implicit approval.
            log.exception("wait_for_reply Redis error")
            return {"reply": "reject", "message": None, "reason": "unavailable"}
        if popped:
            try:
                data = json.loads(popped[1])
            except Exception:
                return {"reply": "reject", "message": None, "reason": "malformed"}
            reply = data.get("reply")
            if reply not in ("once", "always", "reject"):
                return {"reply": "reject", "message": None, "reason": "malformed"}
            return {"reply": reply, "message": data.get("message")}
        waited += POLL_INTERVAL
    return {"reply": "reject", "message": None, "reason": "timeout"}


async def cleanup_request(request_id: str) -> None:
    try:
        ar = get_async_redis()
        await ar.delete(_request_key(request_id))
        await ar.delete(_reply_key(request_id))
    except Exception:
        pass


# ---------- conversation-scoped grants ----------

async def add_grant(conversation_id: str, permission: str, pattern: str) -> None:
    try:
        ar = get_async_redis()
        key = _grants_key(conversation_id)
        await ar.sadd(key, f"{permission}\x00{pattern}")
        await ar.expire(key, GRANT_TTL)
    except Exception:
        log.exception("add_grant failed")


async def session_grants(conversation_id: str) -> list[Rule]:
    """Rules the user has already approved with "always" in this conversation.

    Returned as a ruleset to merge *after* the mode, so a grant overrides the
    mode's ask — that's the whole point of "always". Fails to an empty list: a
    lost grant means asking once more, which is a nuisance, whereas a
    fabricated one would be a silent approval.
    """
    try:
        members = await get_async_redis().smembers(_grants_key(conversation_id))
    except Exception:
        log.exception("session_grants failed")
        return []
    rules: list[Rule] = []
    for m in members:
        if isinstance(m, bytes):
            m = m.decode("utf-8", errors="replace")
        permission, _, pattern = m.partition("\x00")
        if permission and pattern:
            rules.append(Rule(permission, pattern, "allow"))
    return rules


# ---------- messages fed back to the model ----------

def denied_message(tool: str, mode: str) -> str:
    return (
        f"'{tool}' is not permitted in {mode} mode, and retrying will not change "
        "that. Do not attempt this action or an equivalent one by another route. "
        "Continue with what you can do, and tell the user plainly what you could "
        "not do and why."
    )


def rejected_message(tool: str, feedback: str | None, reason: str | None = None) -> str:
    if reason == "timeout":
        return (
            f"The request to run '{tool}' timed out with no response from the user. "
            "Stop here and summarise what you have done so far."
        )
    if reason == "interrupted":
        return f"The user interrupted before approving '{tool}'. Stop and summarise."
    if feedback:
        # OpenCode's CorrectedError: a rejection carrying direction is worth far
        # more than a bare no, because the model can act on it immediately.
        return (
            f"The user declined '{tool}' and said: {feedback}\n\n"
            "Take that as your instruction and adjust your approach."
        )
    return (
        f"The user declined '{tool}'. Do not retry it. Consider a different "
        "approach, or ask the user how they would like to proceed."
    )
