import asyncio
import json
import time
import uuid
from datetime import datetime, timezone

import bcrypt
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import SessionLocal
from app.models import AgentConnection, ApiKey, User

router = APIRouter()
settings = get_settings()

IDLE_TIMEOUT = 30 * 60
PING_INTERVAL = 30

# In-memory agent registry
_agents: dict[str, dict] = {}
# Each entry: {ws: WebSocket, user_id: str, info: dict, pending: dict[str, asyncio.Future]}


def _authenticate(token: str) -> tuple[User | None, ApiKey | None]:
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

        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id = payload.get("sub")
        if isinstance(user_id, str):
            user = db.query(User).filter(User.id == user_id).first()
            return user, None
        return None, None
    except JWTError:
        return None, None
    finally:
        db.close()


@router.websocket("/ws/agent")
async def ws_agent(ws: WebSocket):
    await ws.accept()

    token = ws.query_params.get("token", "")
    fingerprint = ws.query_params.get("fingerprint", "")
    device_token = ws.query_params.get("device_token", "")

    user, api_key = _authenticate(token)
    if not user:
        await ws.send_json({"error": "Unauthorized"})
        await ws.close(code=4001)
        return

    if not fingerprint:
        await ws.send_json({"error": "Missing fingerprint"})
        await ws.close(code=4002)
        return

    # Look up AgentConnection by fingerprint
    db = SessionLocal()
    try:
        agent_conn = db.query(AgentConnection).filter(
            AgentConnection.device_fingerprint == fingerprint,
            AgentConnection.user_id == user.id,
        ).first()

        new_device_token = None

        if not agent_conn:
            # Create new pending connection
            agent_conn = AgentConnection(
                id=str(uuid.uuid4()),
                user_id=user.id,
                name="",
                hostname="",
                os="",
                workspace="",
                status="pending",
                device_fingerprint=fingerprint,
                tools=[],
            )
            db.add(agent_conn)
            db.commit()
            db.refresh(agent_conn)

        agent_id = agent_conn.id

        if agent_conn.status == "pending":
            # Send pending approval and wait
            await ws.send_json({"type": "pending_approval", "agent_id": agent_id})
            while True:
                await asyncio.sleep(3)
                db.refresh(agent_conn)
                if agent_conn.status != "pending":
                    break
                # Check if websocket is still alive
                try:
                    await ws.send_json({"type": "pending_approval", "agent_id": agent_id})
                except Exception:
                    return
        elif agent_conn.device_token_hash:
            # Verify device_token via bcrypt
            if not device_token or not bcrypt.checkpw(
                device_token.encode("utf-8"),
                agent_conn.device_token_hash.encode("utf-8"),
            ):
                await ws.send_json({"error": "Invalid device token"})
                await ws.close(code=4003)
                return

        # Update status to online
        agent_conn.status = "online"
        agent_conn.connected_at = datetime.now(timezone.utc)
        agent_conn.last_seen = datetime.now(timezone.utc)
        db.commit()

    finally:
        db.close()

    # Register in memory
    _agents[agent_id] = {
        "ws": ws,
        "user_id": user.id,
        "info": {},
        "pending": {},
    }

    # Send registered message
    reg_msg: dict = {"type": "registered", "agent_id": agent_id}
    if new_device_token:
        reg_msg["device_token"] = new_device_token
    await ws.send_json(reg_msg)

    last_activity = time.monotonic()

    async def ping_loop():
        nonlocal last_activity
        while True:
            await asyncio.sleep(PING_INTERVAL)
            if time.monotonic() - last_activity >= IDLE_TIMEOUT:
                await ws.send_json({"type": "timeout", "text": "Idle timeout"})
                await ws.close(code=1000)
                return
            try:
                await ws.send_json({"type": "ping"})
            except Exception:
                return

    ping_task = asyncio.create_task(ping_loop())

    try:
        while True:
            raw = await ws.receive_text()
            last_activity = time.monotonic()
            msg = json.loads(raw)

            msg_type = msg.get("type", "")

            if msg_type == "pong":
                continue

            if msg_type == "heartbeat":
                db = SessionLocal()
                try:
                    conn = db.query(AgentConnection).filter(AgentConnection.id == agent_id).first()
                    if conn:
                        conn.last_seen = datetime.now(timezone.utc)
                        db.commit()
                finally:
                    db.close()
                continue

            if msg_type == "register":
                db = SessionLocal()
                try:
                    conn = db.query(AgentConnection).filter(AgentConnection.id == agent_id).first()
                    if conn:
                        conn.hostname = msg.get("hostname", conn.hostname)
                        conn.os = msg.get("os", conn.os)
                        conn.workspace = msg.get("workspace", conn.workspace)
                        conn.tools = msg.get("tools", conn.tools)
                        conn.name = msg.get("name", conn.name)
                        conn.agent_version = msg.get("agent_version", conn.agent_version)
                        conn.last_seen = datetime.now(timezone.utc)
                        db.commit()
                    _agents[agent_id]["info"] = {
                        "hostname": conn.hostname if conn else "",
                        "os": conn.os if conn else "",
                        "workspace": conn.workspace if conn else "",
                    }
                finally:
                    db.close()
                await ws.send_json({"type": "registered_ack"})
                continue

            if msg_type == "tool_result":
                request_id = msg.get("request_id", "")
                future = _agents.get(agent_id, {}).get("pending", {}).pop(request_id, None)
                if future and not future.done():
                    future.set_result(msg.get("result", {}))
                continue

    except WebSocketDisconnect:
        pass
    except Exception:
        try:
            await ws.close()
        except Exception:
            pass
    finally:
        ping_task.cancel()
        # Update status to offline
        db = SessionLocal()
        try:
            conn = db.query(AgentConnection).filter(AgentConnection.id == agent_id).first()
            if conn:
                conn.status = "offline"
                conn.last_seen = datetime.now(timezone.utc)
                db.commit()
        finally:
            db.close()
        _agents.pop(agent_id, None)


# ---------- Helper functions (exported) ----------


async def execute_tool(agent_id: str, tool: str, params: dict, timeout: float = 120.0) -> dict:
    """Send tool_call to agent, await result via Future."""
    agent = _agents.get(agent_id)
    if not agent or not agent["ws"]:
        raise ValueError("Agent not connected")
    request_id = str(uuid.uuid4())
    future = asyncio.get_event_loop().create_future()
    agent["pending"][request_id] = future
    await agent["ws"].send_json({
        "type": "tool_call",
        "request_id": request_id,
        "tool": tool,
        "params": params,
    })
    try:
        result = await asyncio.wait_for(future, timeout=timeout)
        return result
    except asyncio.TimeoutError:
        agent["pending"].pop(request_id, None)
        return {"success": False, "error": f"Tool call timed out after {timeout}s"}


def get_online_agents(user_id: str) -> list[str]:
    """Get list of online agent IDs for a user."""
    return [aid for aid, data in _agents.items() if data["user_id"] == user_id]


def is_agent_online(agent_id: str) -> bool:
    return agent_id in _agents
