from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db import init_db
from app.routes import agents, auth, chat, conversations, keys, proxy, research, settings, skills, usage, web_search, ws_agent, ws_chat, ws_transcribe

cfg = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    app.state.http_client = httpx.AsyncClient(
        limits=httpx.Limits(max_connections=500, max_keepalive_connections=50),
        timeout=httpx.Timeout(300.0, connect=5.0),
    )
    yield
    await app.state.http_client.aclose()


app = FastAPI(
    title=cfg.APP_NAME,
    version=cfg.APP_VERSION,
    description="Switchboard - Self-Hosted Multi-Model AI Gateway",
    lifespan=lifespan,
)

from app.middleware import ObservabilityMiddleware
app.add_middleware(ObservabilityMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=cfg.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(keys.router, prefix="/me/keys", tags=["keys"])
app.include_router(chat.router, prefix="/me", tags=["chat"])
app.include_router(proxy.router, prefix="/v1", tags=["proxy"])
app.include_router(conversations.router, prefix="/me/conversations", tags=["conversations"])
app.include_router(usage.router, prefix="/me", tags=["usage"])
app.include_router(settings.router, prefix="/me", tags=["settings"])
app.include_router(skills.router, prefix="/me/skills", tags=["skills"])
app.include_router(web_search.router, prefix="/me", tags=["search"])
app.include_router(research.router, prefix="/me/research", tags=["research"])
app.include_router(agents.router, prefix="/me/agents", tags=["agents"])
app.include_router(agents.install_router, prefix="/api", tags=["agents"])
app.include_router(ws_agent.router, tags=["websocket"])
app.include_router(ws_chat.router, tags=["websocket"])
app.include_router(ws_transcribe.router, tags=["websocket"])


@app.get("/")
async def root():
    return {
        "name": cfg.APP_NAME,
        "version": cfg.APP_VERSION,
        "status": "running",
    }


@app.get("/health")
async def health():
    return {"status": "healthy"}
