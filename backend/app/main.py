from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db import init_db
from app.routes import auth, chat, conversations, keys, proxy, usage, ws_chat, ws_transcribe

settings = get_settings()


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
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Switchboard - Self-Hosted Multi-Model AI Gateway",
    lifespan=lifespan,
)

from app.middleware import ObservabilityMiddleware
app.add_middleware(ObservabilityMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
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
app.include_router(ws_chat.router, tags=["websocket"])
app.include_router(ws_transcribe.router, tags=["websocket"])


@app.get("/")
async def root():
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "running",
    }


@app.get("/health")
async def health():
    return {"status": "healthy"}
