"""HTTP long-poll agent transport — replaces WebSocket.

Agent polls GET /api/agent/poll (long-poll, up to 30s).
Server queues tool_calls in-memory. Agent picks them up on next poll.
Agent posts results to POST /api/agent/result.

No persistent connection. Each request is independent.
Connection status: last_poll < 15s ago = online.
"""
import asyncio
import json
import logging
import platform
import time
import uuid
from datetime import datetime, timezone
from typing import Annotated

import bcrypt
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import SessionLocal, get_db
from app.models import AgentConnection, ApiKey, User

router = APIRouter()
settings = get_settings()
log = logging.getLogger("switchboard.agent")

LONG_POLL_TIMEOUT = 30  # seconds
AGENT_ONLINE_THRESHOLD = 15  # seconds — agent is "online" if polled within this

# In-memory tool call queue and pending futures
# {agent_id: [{"request_id": str, "tool": str, "params": dict}]}
_tool_queues: dict[str, list[dict]] = {}
# {request_id: asyncio.Future}
_pending_futures: dict[str, asyncio.Future] = {}
# {agent_id: asyncio.Event} — signaled when a new tool call is queued
_poll_events: dict[str, asyncio.Event] = {}


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
            return {"status": "approved", "device_token": device_token, "tool_calls": []}
        if agent.status != "online":
            agent.status = "online"
        db.commit()
    finally:
        db.close()

    # Check for queued tool calls
    queue = _tool_queues.get(agent_id, [])
    if queue:
        calls = list(queue)
        queue.clear()
        return {"status": "online", "tool_calls": calls}

    # Long-poll: wait up to LONG_POLL_TIMEOUT for a tool call
    event = _poll_events.get(agent_id)
    if not event:
        event = asyncio.Event()
        _poll_events[agent_id] = event
    event.clear()

    try:
        await asyncio.wait_for(event.wait(), timeout=LONG_POLL_TIMEOUT)
    except asyncio.TimeoutError:
        pass

    # Check again after wait
    queue = _tool_queues.get(agent_id, [])
    if queue:
        calls = list(queue)
        queue.clear()
        return {"status": "online", "tool_calls": calls}

    return {"status": "online", "tool_calls": []}


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

    # Resolve the pending future
    future = _pending_futures.pop(body.request_id, None)
    if future and not future.done():
        future.set_result({
            "success": body.success,
            "result": body.result,
            "error": body.error,
            "duration_ms": body.duration_ms,
        })
        return {"status": "accepted"}

    return {"status": "no_pending_request"}


# ---------- Functions used by the agentic loop (chat.py) ----------

async def execute_tool(agent_id: str, tool: str, params: dict, timeout: float = 120.0) -> dict:
    """Queue a tool call for the agent and wait for the result."""
    if not is_agent_online(agent_id):
        raise ValueError("Agent not connected")

    request_id = str(uuid.uuid4())
    future = asyncio.get_event_loop().create_future()
    _pending_futures[request_id] = future

    # Queue the tool call
    if agent_id not in _tool_queues:
        _tool_queues[agent_id] = []
    _tool_queues[agent_id].append({
        "request_id": request_id,
        "tool": tool,
        "params": params,
    })

    # Wake up the long-poll
    event = _poll_events.get(agent_id)
    if event:
        event.set()

    try:
        result = await asyncio.wait_for(future, timeout=timeout)
        return result
    except asyncio.TimeoutError:
        _pending_futures.pop(request_id, None)
        return {"success": False, "error": f"Tool call timed out after {timeout}s"}


def is_agent_online(agent_id: str) -> bool:
    """Check if agent has polled recently."""
    db = SessionLocal()
    try:
        agent = db.query(AgentConnection).filter(AgentConnection.id == agent_id).first()
        if not agent or agent.status == "pending":
            return False
        if not agent.last_seen:
            return False
        elapsed = (datetime.now(timezone.utc) - agent.last_seen).total_seconds()
        return elapsed < AGENT_ONLINE_THRESHOLD
    finally:
        db.close()


def get_online_agents(user_id: str) -> list[str]:
    """Get list of online agent IDs for a user."""
    db = SessionLocal()
    try:
        threshold = datetime.now(timezone.utc)
        agents = db.query(AgentConnection).filter(
            AgentConnection.user_id == user_id,
            AgentConnection.status != "pending",
        ).all()
        return [
            a.id for a in agents
            if a.last_seen and (threshold - a.last_seen).total_seconds() < AGENT_ONLINE_THRESHOLD
        ]
    finally:
        db.close()
