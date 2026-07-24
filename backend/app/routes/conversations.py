import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.config import get_settings
from app.db import get_db
from app.models import ChatMessage, Conversation, User
from app.routes.auth import get_current_user
from app.cache import clear_session

router = APIRouter()
settings = get_settings()


class ConversationCreate(BaseModel):
    model: str | None = None
    system_prompt: str | None = None
    title: str | None = None
    mode: str | None = None


class ConversationResponse(BaseModel):
    id: str
    title: str | None
    model: str
    mode: str
    total_tokens: int
    is_archived: bool
    message_count: int
    created_at: datetime
    updated_at: datetime


class ConversationDetail(ConversationResponse):
    system_prompt: str | None
    messages: list[dict]


class MessageResponse(BaseModel):
    id: str
    role: str
    content: str
    thinking: str | None
    token_count: int
    created_at: datetime


@router.post("", response_model=ConversationResponse, status_code=201)
def create_conversation(
    body: ConversationCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    conv = Conversation(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        title=body.title,
        model=body.model or settings.DEFAULT_MODEL,
        system_prompt=body.system_prompt,
        mode=body.mode or "chat",
    )
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return ConversationResponse(
        id=conv.id, title=conv.title, model=conv.model,
        mode=conv.mode or "chat",
        total_tokens=0, is_archived=False, message_count=0,
        created_at=conv.created_at, updated_at=conv.updated_at,
    )


@router.get("", response_model=list[ConversationResponse])
def list_conversations(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    archived: bool = False,
    limit: int = Query(50, le=200),
    offset: int = 0,
):
    convs = (
        db.query(Conversation)
        .filter(Conversation.user_id == current_user.id, Conversation.is_archived == archived)
        .order_by(Conversation.updated_at.desc())
        .offset(offset).limit(limit)
        .all()
    )
    result = []
    for c in convs:
        msg_count = db.query(func.count(ChatMessage.id)).filter(ChatMessage.conversation_id == c.id).scalar() or 0
        result.append(ConversationResponse(
            id=c.id, title=c.title, model=c.model,
            mode=getattr(c, "mode", None) or "chat",
            total_tokens=c.total_tokens, is_archived=c.is_archived,
            message_count=msg_count,
            created_at=c.created_at, updated_at=c.updated_at,
        ))
    return result


@router.get("/{conv_id}", response_model=ConversationDetail)
def get_conversation(
    conv_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    conv = db.query(Conversation).filter(Conversation.id == conv_id, Conversation.user_id == current_user.id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.conversation_id == conv_id)
        .order_by(ChatMessage.created_at.asc())
        .all()
    )
    msg_count = len(messages)
    return ConversationDetail(
        id=conv.id, title=conv.title, model=conv.model,
        mode=getattr(conv, "mode", None) or "chat",
        system_prompt=conv.system_prompt,
        total_tokens=conv.total_tokens, is_archived=conv.is_archived,
        message_count=msg_count,
        created_at=conv.created_at, updated_at=conv.updated_at,
        messages=[
            {"id": m.id, "role": m.role, "content": m.content, "thinking": m.thinking,
             "token_count": m.token_count, "created_at": m.created_at.isoformat(),
             "message_type": getattr(m, "message_type", "text"),
             "tool_calls_json": getattr(m, "tool_calls_json", None),
             "tool_call_id": getattr(m, "tool_call_id", None)}
            for m in messages
        ],
    )


@router.get("/{conv_id}/messages", response_model=list[MessageResponse])
def get_messages(
    conv_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    limit: int = Query(50, le=200),
    before: str | None = None,
):
    conv = db.query(Conversation).filter(Conversation.id == conv_id, Conversation.user_id == current_user.id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    query = db.query(ChatMessage).filter(ChatMessage.conversation_id == conv_id)
    if before:
        ref = db.query(ChatMessage).filter(ChatMessage.id == before).first()
        if ref:
            query = query.filter(ChatMessage.created_at < ref.created_at)
    messages = query.order_by(ChatMessage.created_at.desc()).limit(limit).all()
    messages.reverse()
    return [
        MessageResponse(id=m.id, role=m.role, content=m.content, thinking=m.thinking, token_count=m.token_count, created_at=m.created_at)
        for m in messages
    ]


@router.patch("/{conv_id}")
def update_conversation(
    conv_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    title: str | None = None,
    system_prompt: str | None = None,
    is_archived: bool | None = None,
    mode: str | None = None,
):
    conv = db.query(Conversation).filter(Conversation.id == conv_id, Conversation.user_id == current_user.id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if title is not None:
        conv.title = title
    if system_prompt is not None:
        conv.system_prompt = system_prompt
    if is_archived is not None:
        conv.is_archived = is_archived
    if mode is not None:
        conv.mode = mode
    db.commit()
    return {"detail": "Updated"}


@router.delete("/{conv_id}")
def delete_conversation(
    conv_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    conv = db.query(Conversation).filter(Conversation.id == conv_id, Conversation.user_id == current_user.id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    db.query(ChatMessage).filter(ChatMessage.conversation_id == conv_id).delete()
    db.delete(conv)
    db.commit()
    clear_session(conv_id)
    return {"detail": "Deleted"}
