import base64
import hashlib

import httpx
from cryptography.fernet import Fernet

from app.config import get_settings

settings = get_settings()

PROVIDER_TEMPLATES = {
    "openai": {
        "name": "OpenAI",
        "base_url": "https://api.openai.com/v1",
        "icon": "smart_toy",
        "hint": "sk-...",
    },
    "anthropic": {
        "name": "Anthropic",
        "base_url": "https://api.anthropic.com/v1",
        "icon": "psychology",
        "hint": "sk-ant-...",
    },
    "google": {
        "name": "Google AI",
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai",
        "icon": "cloud",
        "hint": "AIza...",
    },
    "groq": {
        "name": "Groq",
        "base_url": "https://api.groq.com/openai/v1",
        "icon": "bolt",
        "hint": "gsk_...",
    },
    "deepseek": {
        "name": "DeepSeek",
        "base_url": "https://api.deepseek.com/v1",
        "icon": "explore",
        "hint": "sk-...",
    },
    "mistral": {
        "name": "Mistral",
        "base_url": "https://api.mistral.ai/v1",
        "icon": "air",
        "hint": "...",
    },
    "together": {
        "name": "Together AI",
        "base_url": "https://api.together.xyz/v1",
        "icon": "groups",
        "hint": "...",
    },
    "openrouter": {
        "name": "OpenRouter",
        "base_url": "https://openrouter.ai/api/v1",
        "icon": "route",
        "hint": "sk-or-...",
    },
    "custom": {
        "name": "Custom Provider",
        "base_url": "",
        "icon": "tune",
        "hint": "...",
    },
}


def _get_fernet() -> Fernet:
    key = hashlib.sha256(settings.SECRET_KEY.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def encrypt_api_key(plain: str) -> str:
    return _get_fernet().encrypt(plain.encode()).decode()


def decrypt_api_key(encrypted: str) -> str:
    return _get_fernet().decrypt(encrypted.encode()).decode()


def mask_api_key(key: str) -> str:
    if len(key) <= 8:
        return "••••" + key[-4:]
    return key[:3] + "••••" + key[-4:]


async def discover_models(base_url: str, api_key: str) -> list[str]:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{base_url}/models",
                headers={"Authorization": f"Bearer {api_key}"},
            )
            if resp.status_code != 200:
                return []
            data = resp.json()
            models = data.get("data", [])
            return sorted([m.get("id", "") for m in models if m.get("id")])
    except Exception:
        return []


def resolve_provider(user_providers: list, model: str) -> dict | None:
    for p in user_providers:
        if not p.is_enabled:
            continue
        cached = p.models_cached or []
        if model in cached:
            return {
                "base_url": p.base_url,
                "api_key": decrypt_api_key(p.api_key_encrypted),
                "provider": p.provider,
            }
    return None
