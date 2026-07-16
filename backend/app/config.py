from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # App
    APP_NAME: str = "Switchboard API"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = True
    
    # JWT Auth
    SECRET_KEY: str = "your-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # Database (SQLite for local dev; use postgresql://... in Docker/prod)
    DATABASE_URL: str = "sqlite:///./switchboard.db"
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379"
    
    # LiteLLM (optional; key issuance falls back to local keys if unreachable)
    LITELLM_MASTER_KEY: str = "sk-your-master-key-here"
    LITELLM_BASE_URL: str = "http://localhost:4000"

    # Default model served by the gateway (vLLM serves Qwen3-14B, not gpt-3.5-turbo)
    DEFAULT_MODEL: str = "Qwen3-14B"
    
    # vLLM endpoints (remote GPU server)
    VLLM_LLM_BASE_URL: str = "http://164.52.194.98:8000"
    VLLM_STT_BASE_URL: str = "http://164.52.194.98:8004"
    VLLM_TTS_BASE_URL: str = "http://164.52.194.98:8002"
    VLLM_API_KEY: str = "vaani-local-key"
    
    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost:3001"]
    
    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache
def get_settings() -> Settings:
    return Settings()
