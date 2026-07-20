import asyncio
import json
import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import SessionLocal, get_db
from app.models import ResearchTask, User
from app.routes.auth import get_current_user
from app.services.research import ResearchEngine

router = APIRouter()

_running: dict[str, asyncio.Task] = {}


class ResearchStart(BaseModel):
    query: str
    conversation_id: str | None = None


class ResearchResponse(BaseModel):
    id: str
    query: str
    status: str
    current_round: int
    sources_count: int
    report: str | None
    sources: list | None
    created_at: datetime


@router.post("", status_code=201)
async def start_research(
    body: ResearchStart,
    request: Request,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    research_id = str(uuid.uuid4())
    r = ResearchTask(
        id=research_id,
        user_id=user.id,
        query=body.query,
        conversation_id=body.conversation_id,
    )
    db.add(r)
    db.commit()

    engine = ResearchEngine(
        research_id, body.query, user.id, request.app.state.http_client,
        conversation_id=body.conversation_id,
    )
    task = asyncio.create_task(engine.run())
    _running[research_id] = task
    task.add_done_callback(lambda _: _running.pop(research_id, None))

    return {"id": research_id, "status": "planning"}


@router.get("", response_model=list[dict])
def list_research(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    items = (
        db.query(ResearchTask)
        .filter(ResearchTask.user_id == user.id)
        .order_by(ResearchTask.created_at.desc())
        .limit(20)
        .all()
    )
    return [
        {
            "id": r.id,
            "query": r.query,
            "status": r.status,
            "current_round": r.current_round,
            "sources_count": r.sources_count,
            "created_at": r.created_at.isoformat(),
        }
        for r in items
    ]


@router.get("/{research_id}", response_model=ResearchResponse)
def get_research(
    research_id: str,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    r = db.query(ResearchTask).filter(
        ResearchTask.id == research_id, ResearchTask.user_id == user.id
    ).first()
    if not r:
        raise HTTPException(status_code=404, detail="Research not found")
    return r


@router.get("/{research_id}/stream")
async def stream_research(
    research_id: str,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    r = db.query(ResearchTask).filter(
        ResearchTask.id == research_id, ResearchTask.user_id == user.id
    ).first()
    if not r:
        raise HTTPException(status_code=404, detail="Research not found")

    async def event_stream():
        last_status = ""
        last_round = 0
        while True:
            sdb = SessionLocal()
            try:
                research = sdb.query(ResearchTask).filter(
                    ResearchTask.id == research_id
                ).first()
                if not research:
                    break
                if research.status != last_status or research.current_round != last_round:
                    last_status = research.status
                    last_round = research.current_round
                    yield f"data: {json.dumps({'status': research.status, 'round': research.current_round, 'sources': research.sources_count})}\n\n"
                if research.status in ("done", "failed", "cancelled"):
                    yield f"data: {json.dumps({'status': research.status, 'report': research.report, 'sources': research.sources or []})}\n\n"
                    break
            finally:
                sdb.close()
            await asyncio.sleep(2)

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/{research_id}/cancel")
async def cancel_research(
    research_id: str,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    r = db.query(ResearchTask).filter(
        ResearchTask.id == research_id, ResearchTask.user_id == user.id
    ).first()
    if not r:
        raise HTTPException(status_code=404, detail="Research not found")
    task = _running.get(research_id)
    if task and not task.done():
        task.cancel()
    r.status = "cancelled"
    db.commit()
    return {"detail": "Cancelled"}


@router.delete("/{research_id}")
def delete_research(
    research_id: str,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    r = db.query(ResearchTask).filter(
        ResearchTask.id == research_id, ResearchTask.user_id == user.id
    ).first()
    if not r:
        raise HTTPException(status_code=404, detail="Research not found")
    task = _running.get(research_id)
    if task and not task.done():
        task.cancel()
    db.delete(r)
    db.commit()
    return {"detail": "Deleted"}
