import httpx
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import ApiKey, User
from app.routes.auth import get_current_user

router = APIRouter()
settings = get_settings()


class KeyCreate(BaseModel):
    name: str
    models_allowed: list[str] | None = None
    rpm_limit: int | None = None
    tpm_limit: int | None = None
    stt_engine: str = "sensevoice"
    stt_language: str = "auto"
    stt_target_language: str | None = None


class KeyResponse(BaseModel):
    id: str
    name: str
    key_prefix: str
    models_allowed: list[str]
    stt_engine: str
    stt_language: str
    stt_target_language: str | None
    status: str
    created_at: datetime


class KeyCreatedResponse(KeyResponse):
    key: str


def generate_api_key() -> str:
    import secrets

    return f"sk-{secrets.token_hex(32)}"


def try_provision_litellm_key(
    name: str,
    models_allowed: list[str],
    rpm_limit: int | None,
) -> str | None:
    """Issue a key via LiteLLM if reachable; otherwise return None to fall back
    to a locally generated key. Never raises — absence of LiteLLM is fine."""
    if not settings.LITELLM_BASE_URL:
        return None
    try:
        with httpx.Client(timeout=5.0) as client:
            res = client.post(
                f"{settings.LITELLM_BASE_URL}/key/generate",
                headers={"Authorization": f"Bearer {settings.LITELLM_MASTER_KEY}"},
                json={
                    "key_alias": name,
                    "models": models_allowed,
                    "rpm_limit": rpm_limit,
                },
            )
            if res.status_code == 200:
                return res.json().get("key")
    except httpx.RequestError:
        return None
    return None


@router.post("", response_model=KeyCreatedResponse)
def create_key(
    key_data: KeyCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    models_allowed = key_data.models_allowed or [settings.DEFAULT_MODEL]
    litellm_key = try_provision_litellm_key(
        key_data.name, models_allowed, key_data.rpm_limit
    )
    api_key = litellm_key or generate_api_key()
    key_id = f"key_{(db.query(func.count(ApiKey.id)).scalar() or 0) + 1}"

    key_record = ApiKey(
        id=key_id,
        user_id=current_user.id,
        name=key_data.name,
        key=api_key,
        key_prefix=api_key[:8] + "..." + api_key[-4:],
        models_allowed=models_allowed,
        rpm_limit=key_data.rpm_limit,
        tpm_limit=key_data.tpm_limit,
        stt_engine=key_data.stt_engine,
        stt_language=key_data.stt_language,
        stt_target_language=key_data.stt_target_language,
        status="active",
        created_at=datetime.now(timezone.utc),
    )
    db.add(key_record)
    db.commit()
    db.refresh(key_record)

    return KeyCreatedResponse(
        id=key_record.id,
        name=key_record.name,
        key_prefix=key_record.key_prefix,
        models_allowed=key_record.models_allowed,
        stt_engine=key_record.stt_engine,
        stt_language=key_record.stt_language,
        stt_target_language=key_record.stt_target_language,
        status=key_record.status,
        created_at=key_record.created_at,
        key=api_key,
    )


@router.get("", response_model=list[KeyResponse])
def list_keys(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    user_keys = (
        db.query(ApiKey).filter(ApiKey.user_id == current_user.id).all()
    )
    return [
        KeyResponse(
            id=k.id,
            name=k.name,
            key_prefix=k.key_prefix,
            models_allowed=k.models_allowed,
            stt_engine=k.stt_engine,
            stt_language=k.stt_language,
            stt_target_language=k.stt_target_language,
            status=k.status,
            created_at=k.created_at,
        )
        for k in user_keys
    ]


@router.delete("/{key_id}")
def revoke_key(
    key_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    key = db.query(ApiKey).filter(ApiKey.id == key_id).first()
    if key is None or key.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Key not found",
        )

    key.status = "revoked"
    db.commit()
    return {"detail": "Key revoked"}
