"""HTTP long-poll agent transport — Redis-backed, multi-worker safe.

Agent polls GET /api/agent/poll (long-poll, up to 25s via Redis BRPOP).
Tool calls are queued in Redis (shared across all uvicorn workers, survives restart).
Agent posts results to POST /api/agent/result.

Queue keys:
  agent:queue:{agent_id}      — list of pending tool calls (LPUSH / BRPOP)
  agent:resultq:{request_id}  — single-item list holding a tool result (LPUSH / BRPOP)

No persistent connection. Each request is independent. Works with any worker count.
Connection status: last_seen < AGENT_ONLINE_THRESHOLD ago = online.
"""
import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Annotated

import bcrypt
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from app.cache import get_async_redis
from app.config import get_settings
from app.db import SessionLocal
from app.models import AgentConnection, ApiKey, User

router = APIRouter()
settings = get_settings()
log = logging.getLogger("switchboard.agent")

LONG_POLL_TIMEOUT = 25  # seconds — how long a poll blocks waiting for work (Redis BRPOP)
# Must be > LONG_POLL_TIMEOUT, else an agent mid-long-poll looks "offline"
AGENT_ONLINE_THRESHOLD = 40  # seconds — agent is "online" if polled within this
QUEUE_TTL = 300  # seconds — pending tool-call queue expiry
RESULT_TTL = 130  # seconds — result list expiry


def _queue_key(agent_id: str) -> str:
    return f"agent:queue:{agent_id}"


def _result_key(request_id: str) -> str:
    return f"agent:resultq:{request_id}"


# ---------- Auth ----------

def _auth_agent(token: str) -> tuple[User | None, ApiKey | None]:
    db = SessionLocal()
    try:
        if token.startswith("sk-"):
            from app.routes.keys import verify_api_key
            prefix = token[:12]
            candidates = db.query(ApiKey).filter(ApiKey.key_prefix == prefix, ApiKey.status == "active").all()
            for c in candidates:
                if verify_api_key(token, c.key_hash):
                    user = db.query(User).filter(User.id == c.user_id).first()
                    if user:
                        return user, c
            return None, None
        from jose import JWTError, jwt as jose_jwt
        payload = jose_jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id = payload.get("sub")
        if isinstance(user_id, str):
            user = db.query(User).filter(User.id == user_id).first()
            return user, None
        return None, None
    except Exception:
        return None, None
    finally:
        db.close()


def _get_auth(authorization: str = Header(default="")) -> tuple[User, ApiKey | None]:
    token = authorization.replace("Bearer ", "").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing authorization")
    user, api_key = _auth_agent(token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")
    return user, api_key


# ---------- Pydantic models ----------

class AgentRegisterRequest(BaseModel):
    fingerprint: str
    device_token: str | None = None
    hostname: str | None = None
    os: str | None = None
    workspace: str | None = None
    name: str | None = None
    tools: list[str] | None = None
    agent_version: str | None = None


class ToolResultRequest(BaseModel):
    agent_id: str
    request_id: str
    success: bool
    result: dict | None = None
    error: str | None = None
    duration_ms: int = 0


# ---------- Endpoints ----------

@router.post("/agent/register")
def register_agent(
    body: AgentRegisterRequest,
    authorization: Annotated[str, Header()] = "",
):
    """Register or re-register an agent. Returns agent_id and status."""
    user, _ = _get_auth(authorization)

    db = SessionLocal()
    try:
        agent = db.query(AgentConnection).filter(
            AgentConnection.device_fingerprint == body.fingerprint,
            AgentConnection.user_id == user.id,
        ).first()

        if not agent:
            agent = AgentConnection(
                id=str(uuid.uuid4()),
                user_id=user.id,
                name=body.name or "",
                hostname=body.hostname or "",
                os=body.os or "",
                workspace=body.workspace or "",
                status="pending",
                device_fingerprint=body.fingerprint,
                tools=body.tools or [],
                agent_version=body.agent_version or "0.1.0",
            )
            db.add(agent)
            db.commit()
            db.refresh(agent)
            log.info(f"New agent registered: {agent.id} (pending approval)")
            return {"agent_id": agent.id, "status": "pending"}

        # Existing agent — verify device token if approved
        if agent.status != "pending" and agent.device_token_hash:
            if not body.device_token:
                # Agent lost its token (logout/reinstall) — reset to pending
                agent.status = "pending"
                agent.device_token_hash = None
                db.commit()
                log.info(f"Agent {agent.id} reset to pending (no device token)")
                return {"agent_id": agent.id, "status": "pending"}
            if not bcrypt.checkpw(
                body.device_token.encode("utf-8"),
                agent.device_token_hash.encode("utf-8"),
            ):
                raise HTTPException(status_code=403, detail="Invalid device token")

        # Update agent info
        if body.hostname:
            agent.hostname = body.hostname
        if body.os:
            agent.os = body.os
        if body.workspace:
            agent.workspace = body.workspace
        if body.name:
            agent.name = body.name
        if body.tools:
            agent.tools = body.tools
        if body.agent_version:
            agent.agent_version = body.agent_version
        agent.last_seen = datetime.now(timezone.utc)
        agent.connected_at = datetime.now(timezone.utc)

        if agent.status == "offline":
            agent.status = "online"

        db.commit()
        log.info(f"Agent re-registered: {agent.id} ({agent.status})")
        return {"agent_id": agent.id, "status": agent.status}
    finally:
        db.close()


@router.get("/agent/poll")
async def poll_for_work(
    agent_id: str,
    authorization: Annotated[str, Header()] = "",
):
    """Long-poll for pending tool calls. Blocks up to 30s, returns immediately if work is available."""
    user, _ = _get_auth(authorization)

    db = SessionLocal()
    try:
        agent = db.query(AgentConnection).filter(
            AgentConnection.id == agent_id,
            AgentConnection.user_id == user.id,
        ).first()
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")
        prev_status = agent.status
        agent.last_seen = datetime.now(timezone.utc)
        if agent.status == "pending":
            db.commit()
            return {"status": "pending", "tool_calls": []}
        # Agent was just approved — generate and return device token
        if not agent.device_token_hash:
            import secrets as _secrets
            device_token = _secrets.token_urlsafe(32)
            hashed = bcrypt.hashpw(device_token.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
            agent.device_token_hash = hashed
            agent.status = "online"
            db.commit()
            log.info(f"Agent {agent.name or agent.id} approved and online")
            return {"status": "approved", "device_token": device_token, "tool_calls": []}
        if agent.status != "online":
            agent.status = "online"
            log.info(f"Agent {agent.name or agent.id} back online (was {prev_status})")
        db.commit()
    finally:
        db.close()

    # Blocking pop from Redis queue (this IS the long-poll — works across all workers)
    ar = get_async_redis()
    qkey = _queue_key(agent_id)
    popped = await ar.brpop([qkey], timeout=LONG_POLL_TIMEOUT)
    if not popped:
        return {"status": "online", "tool_calls": []}

    calls = [json.loads(popped[1])]
    # Drain any other immediately-available calls (non-blocking)
    while True:
        more = await ar.rpop(qkey)
        if not more:
            break
        calls.append(json.loads(more))

    return {"status": "online", "tool_calls": calls}


@router.post("/agent/result")
async def submit_result(
    body: ToolResultRequest,
    authorization: Annotated[str, Header()] = "",
):
    """Agent submits tool call result."""
    user, _ = _get_auth(authorization)

    # Verify agent belongs to user
    db = SessionLocal()
    try:
        agent = db.query(AgentConnection).filter(
            AgentConnection.id == body.agent_id,
            AgentConnection.user_id == user.id,
        ).first()
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")
        agent.last_seen = datetime.now(timezone.utc)
        db.commit()
    finally:
        db.close()

    # Push result to Redis so the waiting agentic loop (any worker) picks it up
    ar = get_async_redis()
    rkey = _result_key(body.request_id)
    await ar.lpush(rkey, json.dumps({
        "success": body.success,
        "result": body.result,
        "error": body.error,
        "duration_ms": body.duration_ms,
    }))
    await ar.expire(rkey, RESULT_TTL)
    return {"status": "accepted"}


# ---------- Functions used by the agentic loop (chat.py) ----------

async def execute_tool(agent_id: str, tool: str, params: dict, timeout: float = 120.0) -> dict:
    """Queue a tool call in Redis and block (BRPOP) until the agent returns a result.

    Multi-worker safe: the agent's poll may hit a different uvicorn worker than the
    one running this loop — Redis is the shared channel between them.
    """
    if not is_agent_online(agent_id):
        raise ValueError("Agent not connected")

    request_id = str(uuid.uuid4())
    ar = get_async_redis()
    qkey = _queue_key(agent_id)
    rkey = _result_key(request_id)

    # Enqueue the tool call (LPUSH → head; agent BRPOPs from tail = FIFO)
    await ar.lpush(qkey, json.dumps({
        "request_id": request_id,
        "tool": tool,
        "params": params,
    }))
    await ar.expire(qkey, QUEUE_TTL)

    # Block until the agent posts the result to rkey (or timeout)
    popped = await ar.brpop([rkey], timeout=int(timeout))
    if not popped:
        return {"success": False, "error": f"Tool call timed out after {timeout}s"}
    return json.loads(popped[1])


def _seconds_since(dt) -> float:
    """Elapsed seconds since dt, tolerant of naive/aware datetimes from the DB."""
    if dt is None:
        return 1e9
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - dt).total_seconds()


def is_agent_online(agent_id: str) -> bool:
    """Check if agent has polled recently."""
    db = SessionLocal()
    try:
        agent = db.query(AgentConnection).filter(AgentConnection.id == agent_id).first()
        if not agent or agent.status == "pending":
            return False
        return _seconds_since(agent.last_seen) < AGENT_ONLINE_THRESHOLD
    finally:
        db.close()


def get_online_agents(user_id: str) -> list[str]:
    """Get list of online agent IDs for a user."""
    db = SessionLocal()
    try:
        agents = db.query(AgentConnection).filter(
            AgentConnection.user_id == user_id,
            AgentConnection.status != "pending",
        ).all()
        return [
            a.id for a in agents
            if _seconds_since(a.last_seen) < AGENT_ONLINE_THRESHOLD
        ]
    finally:
        db.close()


async def offline_sweeper():
    """Background task: mark agents offline when they stop polling, and log transitions."""
    while True:
        try:
            await asyncio.sleep(20)
            db = SessionLocal()
            try:
                online = db.query(AgentConnection).filter(
                    AgentConnection.status == "online",
                ).all()
                for agent in online:
                    if _seconds_since(agent.last_seen) >= AGENT_ONLINE_THRESHOLD:
                        agent.status = "offline"
                        log.info(f"Agent {agent.name or agent.id} went offline (no poll for {int(_seconds_since(agent.last_seen))}s)")
                db.commit()
            finally:
                db.close()
        except asyncio.CancelledError:
            break
        except Exception:
            log.exception("offline_sweeper error")
