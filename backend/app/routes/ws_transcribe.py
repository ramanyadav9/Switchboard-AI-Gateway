import asyncio
import json

import websockets
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from jose import JWTError, jwt

from app.config import get_settings

router = APIRouter()
settings = get_settings()

STT_HOST = settings.VLLM_STT_BASE_URL.replace("http://", "").rstrip("/")
SENSEVOICE_HOST = getattr(settings, "SENSEVOICE_BASE_URL", "http://localhost:8006").replace("http://", "").rstrip("/")
ENGINES = {
    "whisper": {"url": f"ws://{STT_HOST}/asr", "protocol": "whisperlivekit"},
    "sensevoice": {"url": f"ws://{SENSEVOICE_HOST}", "protocol": "funasr"},
}


class AuthResult:
    def __init__(self, user_id: str, stt_engine: str = "sensevoice", stt_language: str = "auto", stt_target_language: str | None = None):
        self.user_id = user_id
        self.stt_engine = stt_engine
        self.stt_language = stt_language
        self.stt_target_language = stt_target_language


def _authenticate_ws(token: str) -> AuthResult | None:
    from app.db import SessionLocal
    from app.models import ApiKey

    if token.startswith("sk-"):
        from app.routes.keys import verify_api_key
        db = SessionLocal()
        try:
            prefix = token[:12]
            candidates = db.query(ApiKey).filter(ApiKey.key_prefix == prefix, ApiKey.status == "active").all()
            for candidate in candidates:
                if verify_api_key(token, candidate.key_hash):
                    return AuthResult(
                        user_id=candidate.user_id,
                        stt_engine=candidate.stt_engine or "sensevoice",
                        stt_language=candidate.stt_language or "auto",
                        stt_target_language=candidate.stt_target_language,
                    )
        finally:
            db.close()
        return None

    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id = payload.get("sub")
        if isinstance(user_id, str):
            return AuthResult(user_id=user_id)
        return None
    except JWTError:
        return None


@router.websocket("/ws/transcribe")
async def live_transcribe(ws: WebSocket):
    await ws.accept()

    token = ws.query_params.get("token", "")
    auth = _authenticate_ws(token)
    if not auth:
        await ws.send_json({"error": "Unauthorized"})
        await ws.close(code=4001)
        return

    # Query params override API key defaults
    engine_name = ws.query_params.get("engine", auth.stt_engine)
    engine = ENGINES.get(engine_name, ENGINES["sensevoice"])
    language = ws.query_params.get("language", auth.stt_language)
    target_language = ws.query_params.get("target_language", auth.stt_target_language or "")

    if engine["protocol"] == "whisperlivekit":
        params = f"?language={language}"
        if target_language:
            params += f"&target_language={target_language}"
        upstream_url = engine["url"] + params
    else:
        params = f"?language={language}"
        upstream_url = engine["url"] + params

    try:
        async with websockets.connect(upstream_url) as upstream:
            # Read and discard initial config message
            try:
                init_msg = await asyncio.wait_for(upstream.recv(), timeout=5)
                _ = json.loads(init_msg)
            except Exception:
                pass

            await ws.send_json({"status": "connected", "engine": engine_name})

            async def browser_to_upstream():
                try:
                    while True:
                        message = await ws.receive()
                        if message.get("type") == "websocket.disconnect":
                            break
                        if "bytes" in message and message["bytes"]:
                            await upstream.send(message["bytes"])
                        elif "text" in message and message["text"]:
                            msg = json.loads(message["text"])
                            if msg.get("action") == "stop":
                                if engine["protocol"] == "funasr":
                                    await upstream.send(json.dumps({"action": "stop"}))
                                break
                except WebSocketDisconnect:
                    pass

            async def upstream_to_browser():
                try:
                    async for raw in upstream:
                        msg = json.loads(raw)

                        if engine["protocol"] == "whisperlivekit":
                            if msg.get("status") == "active_transcription":
                                lines = msg.get("lines", [])
                                text = " ".join(l.get("text", "").strip() for l in lines if l.get("text", "").strip())
                                if not text:
                                    continue
                                out: dict = {"type": "partial", "text": text}
                                for l in lines:
                                    if l.get("detected_language"):
                                        out["language"] = l["detected_language"]
                                buf = msg.get("buffer_translation", "")
                                if buf:
                                    out["translation"] = buf.strip()
                                await ws.send_json(out)

                        elif engine["protocol"] == "funasr":
                            msg_type = msg.get("type", "")
                            if msg_type in ("partial", "final"):
                                out = {"type": msg_type, "text": msg.get("text", "")}
                                if msg.get("language"):
                                    out["language"] = msg["language"]
                                if msg.get("emotion"):
                                    out["emotion"] = msg["emotion"]
                                if out["text"]:
                                    await ws.send_json(out)
                            elif msg_type == "done":
                                break
                except Exception:
                    pass

            done, pending = await asyncio.wait(
                [asyncio.create_task(browser_to_upstream()), asyncio.create_task(upstream_to_browser())],
                return_when=asyncio.FIRST_COMPLETED,
            )
            for task in pending:
                task.cancel()

            await ws.send_json({"type": "done"})

    except Exception as e:
        try:
            await ws.send_json({"type": "error", "text": str(e)})
        except Exception:
            pass

    try:
        await ws.close()
    except Exception:
        pass
