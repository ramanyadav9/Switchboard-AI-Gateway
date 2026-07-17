import asyncio
import json
import re
import time
import uuid

import httpx
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.cache import (
    cache_message, check_request_rate, get_active_generations,
    incr_active_generations, decr_active_generations,
)
from app.config import get_settings
from app.context import build_prompt, estimate_tokens
from app.db import SessionLocal
from app.models import ApiKey, ChatMessage, Conversation, RequestLog, User
from app.ratelimit import rpm_limit_for

router = APIRouter()
settings = get_settings()

IDLE_TIMEOUT = 30 * 60
PING_INTERVAL = 30
MAX_CONCURRENT_GENS = 3


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


@router.websocket("/ws/chat")
async def ws_chat(ws: WebSocket):
    await ws.accept()

    token = ws.query_params.get("token", "")
    user, api_key = _authenticate(token)
    if not user:
        await ws.send_json({"error": "Unauthorized"})
        await ws.close(code=4001)
        return

    await ws.send_json({"status": "connected", "model": settings.DEFAULT_MODEL})

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
            req = json.loads(raw)

            if req.get("type") == "pong":
                continue

            action = req.get("action", "message")

            if action == "new_conversation":
                db = SessionLocal()
                try:
                    conv = Conversation(
                        id=str(uuid.uuid4()),
                        user_id=user.id,
                        title=req.get("title"),
                        model=req.get("model", settings.DEFAULT_MODEL),
                        system_prompt=req.get("system_prompt"),
                    )
                    db.add(conv)
                    db.commit()
                    await ws.send_json({"type": "conversation", "id": conv.id, "model": conv.model})
                finally:
                    db.close()
                continue

            if action == "message":
                conversation_id = req.get("conversation_id")
                content = req.get("content", "").strip()
                if not conversation_id or not content:
                    await ws.send_json({"type": "error", "text": "Missing conversation_id or content"})
                    continue

                # Rate limit
                limit = rpm_limit_for(user, api_key.rpm_limit if api_key else None)
                allowed, retry_after = check_request_rate(user.id, limit or 50)
                if not allowed:
                    await ws.send_json({"type": "error", "text": f"Rate limited. Retry after {retry_after}s"})
                    continue

                # Concurrency limit
                active = get_active_generations(user.id)
                if active >= MAX_CONCURRENT_GENS:
                    await ws.send_json({"type": "error", "text": "Too many concurrent requests"})
                    continue

                # Fetch conversation
                db = SessionLocal()
                try:
                    conv = db.query(Conversation).filter(
                        Conversation.id == conversation_id,
                        Conversation.user_id == user.id,
                    ).first()
                    if not conv:
                        await ws.send_json({"type": "error", "text": "Conversation not found"})
                        continue

                    model = req.get("model", conv.model)
                    temperature = req.get("temperature", 0.7)
                    max_tokens = req.get("max_tokens", 2048)

                    # Build context
                    ctx = build_prompt(conv, content, db)
                finally:
                    db.close()

                # Stream response
                incr_active_generations(user.id)
                try:
                    await _stream_and_save(ws, ctx, model, temperature, max_tokens, conversation_id, content, user.id)
                finally:
                    decr_active_generations(user.id)

            elif action == "stop":
                pass

    except WebSocketDisconnect:
        pass
    except Exception:
        try:
            await ws.close()
        except Exception:
            pass
    finally:
        ping_task.cancel()


async def _stream_and_save(
    ws: WebSocket,
    ctx,
    model: str,
    temperature: float,
    max_tokens: int,
    conversation_id: str,
    user_content: str,
    user_id: str,
):
    await ws.send_json({"type": "start"})

    body = {
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

    async with httpx.AsyncClient(timeout=300.0) as client:
        try:
            async with client.stream(
                "POST",
                f"{settings.VLLM_LLM_BASE_URL}/v1/chat/completions",
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {settings.VLLM_API_KEY}"},
                json=body,
            ) as response:
                if response.status_code >= 400:
                    error_body = await response.aread()
                    await ws.send_json({"type": "error", "text": error_body.decode(errors="replace")})
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
                                msg: dict = {"type": "token"}
                                if c:
                                    raw_content += c
                                    msg["content"] = c
                                if r:
                                    raw_thinking += r
                                    msg["reasoning"] = r
                                await ws.send_json(msg)
                        except json.JSONDecodeError:
                            pass

        except httpx.RequestError as e:
            await ws.send_json({"type": "error", "text": f"Model server error: {str(e)}"})
            return

    latency_ms = int((time.time() - start_time) * 1000)

    # Parse <think> tags from content
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

    await ws.send_json({
        "type": "done",
        "usage": {"prompt_tokens": prompt_tokens, "completion_tokens": completion_tokens, "latency_ms": latency_ms},
    })
