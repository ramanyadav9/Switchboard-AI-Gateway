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


def resolve_llm_target(user_providers: list, model: str, local_base: str, local_key: str) -> tuple[str, str]:
    """Return (base_url, api_key) for `model`.

    Routes to a matching enabled BYOK provider, else the local server. Raises
    ValueError if the model is only served by a provider that is currently disabled,
    so we never silently send a BYOK model id to the local server (which yields an
    opaque upstream error).
    """
    ext = resolve_provider(user_providers, model)
    if ext:
        return ext["base_url"], ext["api_key"]
    for p in user_providers:
        if model in (getattr(p, "models_cached", None) or []):
            raise ValueError(
                f"Model '{model}' belongs to a provider that is currently disabled. "
                f"Enable it in Settings or choose another model."
            )
    return local_base, local_key


def chat_completions_url(base: str) -> str:
    """Build the /chat/completions URL for either a local or BYOK base.

    BYOK provider base_urls already include the OpenAI-compatible version segment
    (e.g. .../v1, .../v1beta/openai), so appending another /v1 would double it and
    break routing (e.g. Kong "no Route matched"). The local vLLM base has no version
    segment, so we add /v1 there.
    """
    b = (base or "").rstrip("/")
    if b.endswith("/v1") or b.endswith("/openai"):
        return f"{b}/chat/completions"
    return f"{b}/v1/chat/completions"
