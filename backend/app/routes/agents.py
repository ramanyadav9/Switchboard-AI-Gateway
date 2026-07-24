import io
import os
import secrets
import tarfile
import time
from datetime import datetime, timezone
from typing import Annotated, Any

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import PlainTextResponse, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import AgentConnection, User
from app.routes.auth import get_current_user
from app.routes.agent_poll import execute_tool, is_agent_online

router = APIRouter()
install_router = APIRouter()


# ---------- Pydantic models ----------


class AgentResponse(BaseModel):
    id: str
    name: str
    hostname: str
    os: str
    workspace: str
    status: str  # pending/online/offline
    tools: list[str]
    agent_version: str
    approved_at: datetime | None
    connected_at: datetime | None
    last_seen: datetime
    created_at: datetime


class ToolExecRequest(BaseModel):
    tool: str
    params: dict


class ToolExecResponse(BaseModel):
    success: bool
    result: Any | None = None
    error: str | None = None
    duration_ms: int | None = None


# ---------- Helpers ----------


def _agent_to_response(agent: AgentConnection) -> dict:
    status = agent.status
    if status != "pending" and is_agent_online(agent.id):
        status = "online"
    elif status == "online" and not is_agent_online(agent.id):
        status = "offline"
    return {
        "id": agent.id,
        "name": agent.name,
        "hostname": agent.hostname,
        "os": agent.os,
        "workspace": agent.workspace,
        "status": status,
        "tools": agent.tools or [],
        "agent_version": agent.agent_version,
        "approved_at": agent.approved_at,
        "connected_at": agent.connected_at,
        "last_seen": agent.last_seen,
        "created_at": agent.created_at,
    }


# ---------- Endpoints ----------


@router.get("", response_model=list[AgentResponse])
def list_agents(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    agents = (
        db.query(AgentConnection)
        .filter(AgentConnection.user_id == user.id)
        .order_by(AgentConnection.created_at.desc())
        .all()
    )
    return [_agent_to_response(a) for a in agents]


@router.get("/{agent_id}", response_model=AgentResponse)
def get_agent(
    agent_id: str,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    agent = db.query(AgentConnection).filter(
        AgentConnection.id == agent_id,
        AgentConnection.user_id == user.id,
    ).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return _agent_to_response(agent)


@router.post("/{agent_id}/approve")
def approve_agent(
    agent_id: str,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    agent = db.query(AgentConnection).filter(
        AgentConnection.id == agent_id,
        AgentConnection.user_id == user.id,
    ).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    if agent.status != "pending":
        raise HTTPException(status_code=400, detail="Agent is not pending approval")

    device_token = secrets.token_urlsafe(32)
    hashed = bcrypt.hashpw(device_token.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    agent.device_token_hash = hashed
    agent.status = "offline"
    agent.approved_at = datetime.now(timezone.utc)
    db.commit()

    return {"device_token": device_token}


@router.post("/{agent_id}/exec", response_model=ToolExecResponse)
async def exec_tool(
    agent_id: str,
    body: ToolExecRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    agent = db.query(AgentConnection).filter(
        AgentConnection.id == agent_id,
        AgentConnection.user_id == user.id,
    ).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    if not is_agent_online(agent_id):
        raise HTTPException(status_code=409, detail="Agent is not online")

    start = time.time()
    try:
        result = await execute_tool(agent_id, body.tool, body.params)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))

    duration_ms = int((time.time() - start) * 1000)

    success = result.get("success", True) if isinstance(result, dict) else True
    error = result.get("error") if isinstance(result, dict) else None

    return ToolExecResponse(
        success=success,
        result=result,
        error=error,
        duration_ms=duration_ms,
    )


@router.delete("/{agent_id}")
async def revoke_agent(
    agent_id: str,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    agent = db.query(AgentConnection).filter(
        AgentConnection.id == agent_id,
        AgentConnection.user_id == user.id,
    ).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    db.delete(agent)
    db.commit()
    return {"detail": "Agent revoked"}


@install_router.get("/install", response_class=PlainTextResponse)
def get_install_script(request: Request):
    script_path = os.path.join(os.path.dirname(__file__), "..", "..", "agent", "install.sh")
    script_path = os.path.normpath(script_path)
    if not os.path.isfile(script_path):
        raise HTTPException(status_code=404, detail="Install script not found")
    with open(script_path, "r", encoding="utf-8") as f:
        content = f.read()
    origin = f"{request.url.scheme}://{request.url.netloc}"
    content = content.replace(
        'SERVER_URL="${SWITCHBOARD_SERVER:-}"',
        f'SERVER_URL="${{SWITCHBOARD_SERVER:-{origin}}}"',
    )
    return PlainTextResponse(content=content, media_type="text/plain")


@install_router.get("/install.ps1", response_class=PlainTextResponse)
def get_install_script_ps1():
    script_path = os.path.join(os.path.dirname(__file__), "..", "..", "agent", "install.ps1")
    script_path = os.path.normpath(script_path)
    if not os.path.isfile(script_path):
        raise HTTPException(status_code=404, detail="Install script not found")
    with open(script_path, "r", encoding="utf-8") as f:
        return PlainTextResponse(content=f.read(), media_type="text/x-powershell")


@install_router.get("/agent-source")
def get_agent_source():
    agent_dir = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", "agent"))
    if not os.path.isdir(agent_dir):
        raise HTTPException(status_code=404, detail="Agent package not found")

    skip_dirs = {"__pycache__", ".egg-info", "dist", "build", ".git"}

    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        # Add agent source under switchboard-agent/switchboard_agent/
        src_dir = os.path.join(agent_dir, "switchboard_agent")
        for root, dirs, files in os.walk(src_dir):
            dirs[:] = [d for d in dirs if d not in skip_dirs]
            for f in files:
                if f.endswith((".pyc", ".pyo")):
                    continue
                full = os.path.join(root, f)
                arcname = os.path.join("switchboard-agent", "switchboard_agent", os.path.relpath(full, src_dir))
                tar.add(full, arcname=arcname)

        # No vendor dependencies needed — agent uses only stdlib

    buf.seek(0)
    return Response(
        content=buf.read(),
        media_type="application/gzip",
        headers={"Content-Disposition": "attachment; filename=switchboard-agent.tar.gz"},
    )
