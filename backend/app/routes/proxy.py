from typing import Annotated
from time import time

import httpx
import json
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import RequestLog
from app.ratelimit import check_rate_limit, rpm_limit_for
from app.routes.auth import Caller, get_caller

router = APIRouter()
settings = get_settings()


def _extract_model(body: bytes, content_type: str) -> str | None:
    if "application/json" not in content_type:
        return None
    try:
        return json.loads(body).get("model") if body else None
    except json.JSONDecodeError:
        return None


def _log_request(
    db: Session,
    caller: Caller,
    method: str,
    path: str,
    model: str | None,
    status_code: int,
    latency_ms: int,
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
):
    log = RequestLog(
        user_id=caller.user.id,
        key_id=caller.api_key.id if caller.api_key else None,
        method=method,
        path=path,
        model=model,
        status_code=status_code,
        latency_ms=latency_ms,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
    )
    db.add(log)
    db.commit()


async def proxy_request(
    request: Request,
    target_url: str,
    caller: Caller,
    db: Session,
):
    limit_key = caller.api_key.id if caller.api_key else caller.user.id
    limit = rpm_limit_for(
        caller.user,
        caller.api_key.rpm_limit if caller.api_key else None,
    )
    allowed, retry_after = check_rate_limit(limit_key, limit)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded",
            headers={"Retry-After": str(retry_after)},
        )

    body = await request.body()
    content_type_in = request.headers.get("content-type", "application/json")
    model = _extract_model(body, content_type_in)
    req_path = request.url.path

    if caller.api_key and caller.api_key.models_allowed:
        if model and model not in caller.api_key.models_allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"API key not authorized for model '{model}'",
            )

    is_stream = False
    if "application/json" in content_type_in:
        try:
            is_stream = json.loads(body).get("stream", False) if body else False
        except json.JSONDecodeError:
            pass

    headers = {
        "Content-Type": content_type_in,
        "Authorization": f"Bearer {settings.VLLM_API_KEY}",
    }

    start = time()

    if is_stream:
        return await _stream_proxy(
            request.method, target_url, headers, body, request.query_params,
            caller, db, model, req_path, start,
        )

    async with httpx.AsyncClient(timeout=300.0) as client:
        try:
            response = await client.request(
                method=request.method,
                url=target_url,
                headers=headers,
                content=body,
                params=dict(request.query_params),
            )
            latency_ms = int((time() - start) * 1000)

            if response.status_code >= 400:
                _log_request(db, caller, request.method, req_path, model, response.status_code, latency_ms)
                try:
                    detail = response.json()
                except Exception:
                    detail = response.text
                raise HTTPException(status_code=response.status_code, detail=detail)

            result = response.json()
            usage = result.get("usage", {})
            _log_request(
                db, caller, request.method, req_path, model,
                response.status_code, latency_ms,
                usage.get("prompt_tokens", 0),
                usage.get("completion_tokens", 0),
            )
            return result

        except httpx.RequestError as e:
            latency_ms = int((time() - start) * 1000)
            _log_request(db, caller, request.method, req_path, model, 502, latency_ms)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Error connecting to model server: {str(e)}",
            )


async def _stream_proxy(
    method: str,
    url: str,
    headers: dict,
    body: bytes,
    query_params,
    caller: Caller,
    db: Session,
    model: str | None,
    req_path: str,
    start: float,
):
    client = httpx.AsyncClient(timeout=300.0)
    try:
        req = client.build_request(
            method=method, url=url, headers=headers, content=body,
            params=dict(query_params),
        )
        response = await client.send(req, stream=True)

        if response.status_code >= 400:
            error_body = await response.aread()
            await response.aclose()
            await client.aclose()
            latency_ms = int((time() - start) * 1000)
            _log_request(db, caller, method, req_path, model, response.status_code, latency_ms)
            try:
                detail = json.loads(error_body)
            except Exception:
                detail = error_body.decode(errors="replace")
            raise HTTPException(status_code=response.status_code, detail=detail)

        async def event_stream():
            try:
                async for chunk in response.aiter_text():
                    yield chunk
            finally:
                await response.aclose()
                await client.aclose()
                latency_ms = int((time() - start) * 1000)
                _log_request(db, caller, method, req_path, model, 200, latency_ms)

        return StreamingResponse(event_stream(), media_type="text/event-stream")

    except httpx.RequestError as e:
        await client.aclose()
        latency_ms = int((time() - start) * 1000)
        _log_request(db, caller, method, req_path, model, 502, latency_ms)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Error connecting to model server: {str(e)}",
        )


@router.post("/chat/completions")
async def chat_completions(
    request: Request,
    caller: Annotated[Caller, Depends(get_caller)],
    db: Annotated[Session, Depends(get_db)],
):
    return await proxy_request(
        request, f"{settings.VLLM_LLM_BASE_URL}/v1/chat/completions", caller, db,
    )


@router.post("/audio/transcriptions")
async def audio_transcription(
    request: Request,
    caller: Annotated[Caller, Depends(get_caller)],
    db: Annotated[Session, Depends(get_db)],
):
    return await proxy_request(
        request, f"{settings.VLLM_STT_BASE_URL}/v1/audio/transcriptions", caller, db,
    )


@router.post("/audio/speech")
async def audio_speech(
    request: Request,
    caller: Annotated[Caller, Depends(get_caller)],
    db: Annotated[Session, Depends(get_db)],
):
    return await proxy_request(
        request, f"{settings.VLLM_TTS_BASE_URL}/v1/audio/speech", caller, db,
    )


@router.get("/models")
async def list_models(
    caller: Annotated[Caller, Depends(get_caller)],
):
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(
                f"{settings.VLLM_LLM_BASE_URL}/v1/models",
                headers={"Authorization": f"Bearer {settings.VLLM_API_KEY}"},
            )
            return response.json()
        except httpx.RequestError as e:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Error connecting to model server: {str(e)}",
            )
