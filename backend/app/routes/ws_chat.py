import asyncio
import json
import time

import httpx
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from jose import JWTError, jwt

from app.config import get_settings
from app.ratelimit import check_rate_limit, rpm_limit_for

router = APIRouter()
settings = get_settings()

IDLE_TIMEOUT = 30 * 60  # 30 minutes
PING_INTERVAL = 30      # 30 seconds


def _authenticate(token: str):
    from app.db import SessionLocal
    from app.models import ApiKey, User

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
            idle = time.monotonic() - last_activity
            if idle >= IDLE_TIMEOUT:
                await ws.send_json({"type": "timeout", "text": "Connection closed after 30 min idle"})
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

            model = req.get("model", settings.DEFAULT_MODEL)
            messages = req.get("messages", [])
            temperature = req.get("temperature", 0.7)
            max_tokens = req.get("max_tokens", 2048)
            top_p = req.get("top_p", 1.0)
            stream = req.get("stream", True)

            if not messages:
                await ws.send_json({"type": "error", "text": "No messages provided"})
                continue

            # Rate limit
            limit_key = api_key.id if api_key else user.id
            limit = rpm_limit_for(user, api_key.rpm_limit if api_key else None)
            allowed, retry_after = check_rate_limit(limit_key, limit)
            if not allowed:
                await ws.send_json({"type": "error", "text": f"Rate limited. Retry after {retry_after}s"})
                continue

            # Model scope check
            if api_key and api_key.models_allowed:
                if model not in api_key.models_allowed:
                    await ws.send_json({"type": "error", "text": f"Key not authorized for model '{model}'"})
                    continue

            body = {
                "model": model,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
                "top_p": top_p,
                "stream": stream,
            }

            if stream:
                await _stream_response(ws, body)
            else:
                await _full_response(ws, body)

    except WebSocketDisconnect:
        pass
    except Exception:
        try:
            await ws.close()
        except Exception:
            pass
    finally:
        ping_task.cancel()


async def _stream_response(ws: WebSocket, body: dict):
    await ws.send_json({"type": "start"})

    async with httpx.AsyncClient(timeout=300.0) as client:
        try:
            async with client.stream(
                "POST",
                f"{settings.VLLM_LLM_BASE_URL}/v1/chat/completions",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {settings.VLLM_API_KEY}",
                },
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
                            await ws.send_json({"type": "done"})
                            return
                        try:
                            parsed = json.loads(data)
                            delta = parsed.get("choices", [{}])[0].get("delta", {})
                            content = delta.get("content", "")
                            reasoning = delta.get("reasoning_content", "")

                            if content or reasoning:
                                msg: dict = {"type": "token"}
                                if content:
                                    msg["content"] = content
                                if reasoning:
                                    msg["reasoning"] = reasoning
                                await ws.send_json(msg)
                        except json.JSONDecodeError:
                            pass

        except httpx.RequestError as e:
            await ws.send_json({"type": "error", "text": f"Model server error: {str(e)}"})

    await ws.send_json({"type": "done"})


async def _full_response(ws: WebSocket, body: dict):
    async with httpx.AsyncClient(timeout=300.0) as client:
        try:
            response = await client.post(
                f"{settings.VLLM_LLM_BASE_URL}/v1/chat/completions",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {settings.VLLM_API_KEY}",
                },
                json=body,
            )
            if response.status_code >= 400:
                await ws.send_json({"type": "error", "text": response.text})
                return

            result = response.json()
            text = result.get("choices", [{}])[0].get("message", {}).get("content", "")
            usage = result.get("usage", {})
            await ws.send_json({
                "type": "response",
                "content": text,
                "usage": usage,
            })

        except httpx.RequestError as e:
            await ws.send_json({"type": "error", "text": str(e)})
