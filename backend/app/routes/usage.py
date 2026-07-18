from datetime import datetime, timedelta, timezone
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import RequestLog
from app.routes.auth import User, get_current_user

router = APIRouter()
settings = get_settings()


class DailyUsage(BaseModel):
    date: str
    requests: int
    tokens: int


class UsageStats(BaseModel):
    requests_today: int
    requests_yesterday: int
    tokens_today: int
    tokens_yesterday: int
    daily: list[DailyUsage]


class RecentRequest(BaseModel):
    method: str
    path: str
    status_code: int
    latency_ms: int
    created_at: datetime


class ServiceStatus(BaseModel):
    name: str
    status: str
    latency_ms: int | None


class StatusResponse(BaseModel):
    services: list[ServiceStatus]


@router.get("/usage", response_model=UsageStats)
def get_usage(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    days: int = 30,
):
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday_start = today_start - timedelta(days=1)
    range_start = today_start - timedelta(days=days)

    uid = current_user.id

    requests_today = db.query(func.count(RequestLog.id)).filter(
        RequestLog.user_id == uid, RequestLog.created_at >= today_start
    ).scalar() or 0

    tokens_today = db.query(
        func.coalesce(func.sum(RequestLog.prompt_tokens + RequestLog.completion_tokens), 0)
    ).filter(
        RequestLog.user_id == uid, RequestLog.created_at >= today_start
    ).scalar() or 0

    requests_yesterday = db.query(func.count(RequestLog.id)).filter(
        RequestLog.user_id == uid,
        RequestLog.created_at >= yesterday_start,
        RequestLog.created_at < today_start,
    ).scalar() or 0

    tokens_yesterday = db.query(
        func.coalesce(func.sum(RequestLog.prompt_tokens + RequestLog.completion_tokens), 0)
    ).filter(
        RequestLog.user_id == uid,
        RequestLog.created_at >= yesterday_start,
        RequestLog.created_at < today_start,
    ).scalar() or 0

    day_label = func.date(RequestLog.created_at)
    daily_rows = (
        db.query(
            day_label.label("day"),
            func.count().label("requests"),
            func.coalesce(func.sum(RequestLog.prompt_tokens + RequestLog.completion_tokens), 0).label("tokens"),
        )
        .filter(RequestLog.user_id == uid, RequestLog.created_at >= range_start)
        .group_by(day_label)
        .order_by(day_label)
        .all()
    )

    daily = [DailyUsage(date=str(r.day), requests=r.requests, tokens=r.tokens) for r in daily_rows]

    return UsageStats(
        requests_today=requests_today,
        requests_yesterday=requests_yesterday,
        tokens_today=tokens_today,
        tokens_yesterday=tokens_yesterday,
        daily=daily,
    )


@router.get("/recent", response_model=list[RecentRequest])
def get_recent(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    limit: int = 10,
):
    logs = (
        db.query(RequestLog)
        .filter(RequestLog.user_id == current_user.id)
        .order_by(RequestLog.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        RecentRequest(
            method=log.method,
            path=log.path,
            status_code=log.status_code,
            latency_ms=log.latency_ms,
            created_at=log.created_at,
        )
        for log in logs
    ]


class TranslateRequest(BaseModel):
    text: str
    target_language: str = "en"


class TranslateResponse(BaseModel):
    original: str
    translated: str
    target_language: str


@router.post("/translate", response_model=TranslateResponse)
async def translate_text(
    body: TranslateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
):
    async with httpx.AsyncClient(timeout=60.0) as client:
        lang_names = {"en": "English", "hi": "Hindi", "mr": "Marathi", "es": "Spanish", "fr": "French", "de": "German", "ja": "Japanese", "zh": "Chinese", "ar": "Arabic", "pt": "Portuguese", "ko": "Korean"}
        target = lang_names.get(body.target_language, body.target_language)
        resp = await client.post(
            f"{settings.VLLM_LLM_BASE_URL}/v1/chat/completions",
            headers={"Authorization": f"Bearer {settings.VLLM_API_KEY}"},
            json={
                "model": settings.DEFAULT_MODEL,
                "messages": [
                    {"role": "system", "content": f"Translate the following text to {target}. Output ONLY the translation, nothing else."},
                    {"role": "user", "content": body.text},
                ],
                "temperature": 0.1,
                "max_tokens": 1024,
            },
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail="Translation failed")
        result = resp.json()
        translated = result["choices"][0]["message"]["content"].strip()
        # Strip <think> tags if present
        import re
        translated = re.sub(r"<think>[\s\S]*?</think>\s*", "", translated).strip()
        return TranslateResponse(original=body.text, translated=translated, target_language=body.target_language)


@router.get("/status", response_model=StatusResponse)
async def get_status():
    services = [
        ("API Gateway", "http://localhost:8081/health"),
        ("LLM (Qwen3-14B)", f"{settings.VLLM_LLM_BASE_URL}/v1/models"),
        ("STT (Whisper)", f"{settings.VLLM_STT_BASE_URL}/v1/models"),
    ]

    results: list[ServiceStatus] = []
    async with httpx.AsyncClient(timeout=5.0) as client:
        for name, url in services:
            try:
                from time import time
                start = time()
                resp = await client.get(url, headers={"Authorization": f"Bearer {settings.VLLM_API_KEY}"})
                latency = int((time() - start) * 1000)
                if resp.status_code < 400:
                    results.append(ServiceStatus(name=name, status="operational", latency_ms=latency))
                else:
                    results.append(ServiceStatus(name=name, status="degraded", latency_ms=latency))
            except Exception:
                results.append(ServiceStatus(name=name, status="down", latency_ms=None))

    return StatusResponse(services=results)
