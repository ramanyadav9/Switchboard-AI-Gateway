import asyncio
import json
import re
import time
import uuid
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.cache import (
    cache_message, check_request_rate, get_active_generations,
    incr_active_generations, decr_active_generations,
)
from app.config import get_settings
from app.context import build_prompt, estimate_tokens
from app.db import SessionLocal, get_db
from app.models import ApiKey, ChatMessage, Conversation, User
from app.ratelimit import rpm_limit_for
from app.routes.auth import Caller, get_caller

router = APIRouter()
settings = get_settings()

MAX_CONCURRENT_GENS = 3


class ChatRequest(BaseModel):
    conversation_id: str
    content: str
    model: str | None = None
    temperature: float = 0.7
    max_tokens: int = 2048
    stream: bool = True


def _save_message(conversation_id: str, role: str, content: str, thinking: str | None, token_count: int):
    db = SessionLocal()
    try:
        msg = ChatMessage(
            id=str(uuid.uuid4()),
            conversation_id=conversation_id,
            role=role,
            content=content,
            thinking=thinking,
            token_count=token_count,
        )
        db.add(msg)
        conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
        if conv:
            conv.total_tokens = (conv.total_tokens or 0) + token_count
            from datetime import datetime, timezone
            conv.updated_at = datetime.now(timezone.utc)
        db.commit()
    finally:
        db.close()
    cache_message(conversation_id, role, content, thinking, token_count)


def _auto_title(conversation_id: str, user_message: str):
    title = user_message[:60].strip()
    if len(user_message) > 60:
        title = title.rsplit(" ", 1)[0] + "..."
    db = SessionLocal()
    try:
        conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
        if conv and not conv.title:
            conv.title = title
            db.commit()
    finally:
        db.close()


@router.post("/chat")
async def chat_sse(
    request: Request,
    body: ChatRequest,
    caller: Annotated[Caller, Depends(get_caller)],
    db: Annotated[Session, Depends(get_db)],
):
    user = caller.user
    api_key = caller.api_key

    # Rate limit
    limit = rpm_limit_for(user, api_key.rpm_limit if api_key else None)
    allowed, retry_after = check_request_rate(user.id, limit or 50)
    if not allowed:
        raise HTTPException(status_code=429, detail=f"Rate limited. Retry after {retry_after}s")

    # Concurrency limit
    active = get_active_generations(user.id)
    if active >= MAX_CONCURRENT_GENS:
        raise HTTPException(status_code=429, detail="Too many concurrent requests")

    # Fetch conversation
    conv = db.query(Conversation).filter(
        Conversation.id == body.conversation_id,
        Conversation.user_id == user.id,
    ).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    model = body.model or conv.model
    content = body.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Empty message")

    # Model scope check
    if api_key and api_key.models_allowed:
        if model not in api_key.models_allowed:
            raise HTTPException(status_code=403, detail=f"Key not authorized for model '{model}'")

    # Build context
    ctx = build_prompt(conv, content, db)

    http_client = request.app.state.http_client

    if not body.stream:
        return await _non_streaming(http_client, ctx, model, body.temperature, body.max_tokens, body.conversation_id, content, user.id)

    return StreamingResponse(
        _sse_stream(http_client, ctx, model, body.temperature, body.max_tokens, body.conversation_id, content, user.id),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


async def _sse_stream(http_client, ctx, model, temperature, max_tokens, conversation_id, user_content, user_id):
    incr_active_generations(user_id)

    llm_body = {
        "model": model,
        "messages": ctx.messages,
        "stream": True,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

    raw_content = ""
    raw_thinking = ""
    prompt_tokens = 0
    completion_tokens = 0
    start_time = time.time()

    try:
        async with http_client.stream(
            "POST",
            f"{settings.VLLM_LLM_BASE_URL}/v1/chat/completions",
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {settings.VLLM_API_KEY}"},
            json=llm_body,
        ) as response:
            if response.status_code >= 400:
                error_body = await response.aread()
                yield f"data: {json.dumps({'type': 'error', 'text': error_body.decode(errors='replace')})}\n\n"
                return

            buffer = ""
            async for chunk in response.aiter_text():
                buffer += chunk
                while "\n" in buffer:
                    line, buffer = buffer.split("\n", 1)
                    line = line.strip()
                    if not line.startswith("data: "):
                        continue
                    data = line[6:]
                    if data == "[DONE]":
                        break
                    try:
                        parsed = json.loads(data)
                        delta = parsed.get("choices", [{}])[0].get("delta", {})
                        usage = parsed.get("usage")
                        if usage:
                            prompt_tokens = usage.get("prompt_tokens", 0)
                            completion_tokens = usage.get("completion_tokens", 0)

                        c = delta.get("content", "")
                        r = delta.get("reasoning_content", "")
                        if c or r:
                            evt: dict = {"type": "token"}
                            if c:
                                raw_content += c
                                evt["content"] = c
                            if r:
                                raw_thinking += r
                                evt["reasoning"] = r
                            yield f"data: {json.dumps(evt)}\n\n"
                    except json.JSONDecodeError:
                        pass

    except httpx.RequestError as e:
        yield f"data: {json.dumps({'type': 'error', 'text': str(e)})}\n\n"
        return
    finally:
        decr_active_generations(user_id)

    latency_ms = int((time.time() - start_time) * 1000)

    # Parse <think> tags
    think_match = re.match(r"^<think>([\s\S]*?)</think>\s*([\s\S]*)$", raw_content)
    if think_match:
        raw_thinking = raw_thinking or think_match.group(1).strip()
        raw_content = think_match.group(2).strip()

    user_tokens = estimate_tokens(user_content)
    assistant_tokens = completion_tokens or estimate_tokens(raw_content)

    # Save asynchronously
    loop = asyncio.get_event_loop()
    loop.run_in_executor(None, _save_message, conversation_id, "user", user_content, None, user_tokens)
    loop.run_in_executor(None, _save_message, conversation_id, "assistant", raw_content, raw_thinking or None, assistant_tokens)
    loop.run_in_executor(None, _auto_title, conversation_id, user_content)

    yield f"data: {json.dumps({'type': 'done', 'usage': {'prompt_tokens': prompt_tokens, 'completion_tokens': completion_tokens, 'latency_ms': latency_ms}})}\n\n"


async def _non_streaming(http_client, ctx, model, temperature, max_tokens, conversation_id, user_content, user_id):
    incr_active_generations(user_id)
    try:
        response = await http_client.post(
            f"{settings.VLLM_LLM_BASE_URL}/v1/chat/completions",
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {settings.VLLM_API_KEY}"},
            json={
                "model": model,
                "messages": ctx.messages,
                "stream": False,
                "temperature": temperature,
                "max_tokens": max_tokens,
            },
        )
        if response.status_code >= 400:
            raise HTTPException(status_code=response.status_code, detail=response.text)

        result = response.json()
        text = result.get("choices", [{}])[0].get("message", {}).get("content", "")
        usage = result.get("usage", {})

        thinking = None
        think_match = re.match(r"^<think>([\s\S]*?)</think>\s*([\s\S]*)$", text)
        if think_match:
            thinking = think_match.group(1).strip()
            text = think_match.group(2).strip()

        user_tokens = estimate_tokens(user_content)
        assistant_tokens = usage.get("completion_tokens", 0) or estimate_tokens(text)

        loop = asyncio.get_event_loop()
        loop.run_in_executor(None, _save_message, conversation_id, "user", user_content, None, user_tokens)
        loop.run_in_executor(None, _save_message, conversation_id, "assistant", text, thinking, assistant_tokens)
        loop.run_in_executor(None, _auto_title, conversation_id, user_content)

        return {"content": text, "thinking": thinking, "usage": usage}
    finally:
        decr_active_generations(user_id)
