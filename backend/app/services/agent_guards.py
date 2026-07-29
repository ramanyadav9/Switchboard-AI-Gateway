"""Read-before-edit guard for the agentic loop.

Small models fire `edit_file` with an `old_text` they never actually saw — they
guess at the file's contents from the filename and the conversation. That either
fails the match (a wasted turn) or, worse, matches the wrong span. Every editor
users trust enforces the same invariant instead of hoping the prompt holds: a
file must be read before it can be edited.

State lives in Redis keyed by conversation, so the guard survives across the
worker that happens to serve each turn and spans the whole conversation rather
than a single request. A file the model just wrote counts as read — it authored
the contents, so a follow-up edit is legitimate without a re-read.

The guard is a per-model setting (`read_before_edit` on the capability profile),
off for frontier models that reliably read first on their own.
"""

import logging

from app.cache import get_async_redis

log = logging.getLogger("switchboard.agent")

READ_SET_TTL = 24 * 3600  # seconds — a conversation's read history


def _key(conversation_id: str) -> str:
    return f"agent:readfiles:{conversation_id}"


def normalize(path: str) -> str:
    """Comparable form of a path argument: forward slashes, no `./` prefix."""
    p = (path or "").strip().replace("\\", "/")
    while p.startswith("./"):
        p = p[2:]
    return p.rstrip("/")


def paths_match(a: str, b: str) -> bool:
    """True when two path spellings denote the same file.

    The model may read `src/app.py` and edit `/home/me/proj/src/app.py` (or the
    reverse), so a suffix match on a path boundary counts — anchored on `/` so
    `app.py` can't match `myapp.py`.
    """
    if a == b:
        return True
    return a.endswith("/" + b) or b.endswith("/" + a)


def extract_paths(tool: str, params: dict, result: dict | None) -> list[str]:
    """Every spelling of the file a read/write touched, for the read set."""
    if tool not in ("read_file", "write_file"):
        return []
    out = []
    raw = params.get("path")
    if isinstance(raw, str) and raw:
        out.append(normalize(raw))
    # The agent echoes the path it actually resolved to, which is what makes an
    # absolute-vs-relative mismatch on a later edit resolvable.
    resolved = (result or {}).get("resolved")
    if isinstance(resolved, str) and resolved:
        out.append(normalize(resolved))
    return out


async def mark_read(conversation_id: str, paths: list[str]):
    if not paths:
        return
    try:
        ar = get_async_redis()
        key = _key(conversation_id)
        await ar.sadd(key, *paths)
        await ar.expire(key, READ_SET_TTL)
    except Exception:
        log.exception("mark_read failed")


async def has_read(conversation_id: str, path: str) -> bool:
    """Whether this conversation has read (or written) `path`.

    Fails open: if Redis is unreachable we allow the edit rather than blocking
    the agent on infrastructure the guard is only advisory to.
    """
    target = normalize(path)
    if not target:
        return True
    try:
        members = await get_async_redis().smembers(_key(conversation_id))
    except Exception:
        log.exception("has_read failed — allowing the edit")
        return True
    for m in members:
        if isinstance(m, bytes):
            m = m.decode("utf-8", errors="replace")
        if paths_match(m, target):
            return True
    return False


def unread_refusal(path: str) -> str:
    return (
        f"edit_file refused — {path} has not been read in this conversation.\n\n"
        f"Call read_file on {path} first to get the exact current text for old_text; "
        "whitespace and indentation have to match. Reading it also lets you include "
        "2-3 lines of surrounding context so old_text is unique in the file. Do NOT "
        "guess the file's contents, and do NOT use write_file instead — that would "
        "replace the whole file."
    )
