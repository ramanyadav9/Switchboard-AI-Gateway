import uuid
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import User, UserProvider, UserSettings
from app.routes.auth import get_current_user
from app.services.providers import (
    PROVIDER_TEMPLATES,
    decrypt_api_key,
    discover_models,
    encrypt_api_key,
    mask_api_key,
)

router = APIRouter()
settings = get_settings()


# ── Settings ────────────────────────────────────────────

class SettingsResponse(BaseModel):
    display_name: str | None
    default_model: str | None
    default_temperature: float
    default_system_prompt: str | None


class SettingsUpdate(BaseModel):
    display_name: str | None = None
    default_model: str | None = None
    default_temperature: float | None = None
    default_system_prompt: str | None = None


@router.get("/settings", response_model=SettingsResponse)
def get_settings_route(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    s = db.query(UserSettings).filter(UserSettings.user_id == user.id).first()
    if not s:
        return SettingsResponse(
            display_name=None,
            default_model=None,
            default_temperature=0.7,
            default_system_prompt=None,
        )
    return SettingsResponse(
        display_name=s.display_name,
        default_model=s.default_model,
        default_temperature=s.default_temperature,
        default_system_prompt=s.default_system_prompt,
    )


@router.patch("/settings")
def update_settings(
    body: SettingsUpdate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    s = db.query(UserSettings).filter(UserSettings.user_id == user.id).first()
    if not s:
        s = UserSettings(user_id=user.id)
        db.add(s)
    if body.display_name is not None:
        s.display_name = body.display_name
    if body.default_model is not None:
        s.default_model = body.default_model
    if body.default_temperature is not None:
        s.default_temperature = body.default_temperature
    if body.default_system_prompt is not None:
        s.default_system_prompt = body.default_system_prompt
    db.commit()
    return {"detail": "Updated"}


# ── Providers ───────────────────────────────────────────

class ProviderCreate(BaseModel):
    provider: str
    api_key: str
    base_url: str | None = None
    name: str | None = None


class ProviderUpdate(BaseModel):
    api_key: str | None = None
    base_url: str | None = None
    name: str | None = None
    is_enabled: bool | None = None


class ProviderResponse(BaseModel):
    id: str
    provider: str
    name: str
    base_url: str
    api_key_masked: str
    models: list[str]
    is_enabled: bool
    created_at: str


@router.get("/providers/templates")
def get_provider_templates():
    return PROVIDER_TEMPLATES


@router.get("/providers", response_model=list[ProviderResponse])
def list_providers(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    providers = (
        db.query(UserProvider)
        .filter(UserProvider.user_id == user.id)
        .order_by(UserProvider.created_at)
        .all()
    )
    return [_to_response(p) for p in providers]


@router.post("/providers", response_model=ProviderResponse, status_code=201)
async def add_provider(
    body: ProviderCreate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    template = PROVIDER_TEMPLATES.get(body.provider, PROVIDER_TEMPLATES["custom"])
    base_url = body.base_url or template["base_url"]
    if not base_url:
        raise HTTPException(status_code=400, detail="base_url required for custom provider")

    models = await discover_models(base_url, body.api_key)

    p = UserProvider(
        id=str(uuid.uuid4()),
        user_id=user.id,
        provider=body.provider,
        name=body.name or template["name"],
        api_key_encrypted=encrypt_api_key(body.api_key),
        base_url=base_url,
        models_cached=models,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return _to_response(p)


@router.patch("/providers/{provider_id}", response_model=ProviderResponse)
async def update_provider(
    provider_id: str,
    body: ProviderUpdate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    p = db.query(UserProvider).filter(
        UserProvider.id == provider_id, UserProvider.user_id == user.id
    ).first()
    if not p:
        raise HTTPException(status_code=404, detail="Provider not found")

    if body.api_key is not None:
        p.api_key_encrypted = encrypt_api_key(body.api_key)
        models = await discover_models(p.base_url, body.api_key)
        if models:
            p.models_cached = models
    if body.base_url is not None:
        p.base_url = body.base_url
    if body.name is not None:
        p.name = body.name
    if body.is_enabled is not None:
        p.is_enabled = body.is_enabled
    db.commit()
    db.refresh(p)
    return _to_response(p)


@router.delete("/providers/{provider_id}")
def delete_provider(
    provider_id: str,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    p = db.query(UserProvider).filter(
        UserProvider.id == provider_id, UserProvider.user_id == user.id
    ).first()
    if not p:
        raise HTTPException(status_code=404, detail="Provider not found")
    db.delete(p)
    db.commit()
    return {"detail": "Deleted"}


@router.post("/providers/{provider_id}/refresh", response_model=ProviderResponse)
async def refresh_models(
    provider_id: str,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    p = db.query(UserProvider).filter(
        UserProvider.id == provider_id, UserProvider.user_id == user.id
    ).first()
    if not p:
        raise HTTPException(status_code=404, detail="Provider not found")
    api_key = decrypt_api_key(p.api_key_encrypted)
    models = await discover_models(p.base_url, api_key)
    p.models_cached = models
    db.commit()
    db.refresh(p)
    return _to_response(p)


@router.get("/models/all")
async def all_models(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    result = []

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                f"{settings.VLLM_LLM_BASE_URL}/v1/models",
                headers={"Authorization": f"Bearer {settings.VLLM_API_KEY}"},
            )
            if resp.status_code == 200:
                for m in resp.json().get("data", []):
                    result.append({"id": m["id"], "provider": "local", "name": "Local GPU"})
    except Exception:
        result.append({"id": settings.DEFAULT_MODEL, "provider": "local", "name": "Local GPU"})

    providers = (
        db.query(UserProvider)
        .filter(UserProvider.user_id == user.id, UserProvider.is_enabled == True)
        .all()
    )
    for p in providers:
        for model_id in p.models_cached or []:
            result.append({"id": model_id, "provider": p.provider, "name": p.name})

    return result


def _to_response(p: UserProvider) -> ProviderResponse:
    api_key = decrypt_api_key(p.api_key_encrypted)
    return ProviderResponse(
        id=p.id,
        provider=p.provider,
        name=p.name,
        base_url=p.base_url,
        api_key_masked=mask_api_key(api_key),
        models=p.models_cached or [],
        is_enabled=p.is_enabled,
        created_at=p.created_at.isoformat(),
    )
