# Switchboard AI Gateway — Deployment Guide

## Prerequisites

On your GPU server:
- Docker & Docker Compose installed
- GPU services already running:
  - Qwen3-14B LLM on port 8000
  - WhisperLiveKit STT on port 8004
  - FunASR/SenseVoice STT on port 8006
- Ports 80, 3000, 8080 available

## Quick Deploy

```bash
# 1. Clone the repo
git clone git@github.com:ramanyadav9/Switchboard-AI-Gateway.git
cd Switchboard-AI-Gateway

# 2. Set up environment
cp .env.production .env
# Edit .env — set SECRET_KEY and VLLM_API_KEY
nano .env

# 3. Deploy
docker compose up -d --build

# 4. Check status
docker compose ps
docker compose logs -f
```

The app is now live at `http://your-server-ip` (port 80).

## Architecture

```
Port 80 (Caddy)
  ├── /auth/*, /me/*, /v1/*, /ws/* → Backend (port 8080)
  └── /* → Frontend (port 3000)

Backend (port 8080)
  ├── Chat → localhost:8000 (Qwen3-14B via vLLM)
  ├── File STT → localhost:8004 (Whisper via WhisperLiveKit)
  ├── Live STT → localhost:8006 (SenseVoice via FunASR)
  └── SQLite DB → ./switchboard.db
```

All services use `network_mode: host` — Docker containers share the host network, so `localhost:8000/8004/8006` connects directly to the GPU services.

## Port Map

| Port | Service | Access |
|------|---------|--------|
| 80 | Caddy (reverse proxy) | Public — single entry point |
| 3000 | Next.js frontend | Internal (Caddy proxies) |
| 8000 | vLLM LLM | Internal (backend proxies) |
| 8004 | WhisperLiveKit STT | Internal (backend proxies) |
| 8006 | FunASR/SenseVoice STT | Internal (backend proxies) |
| 8080 | FastAPI backend | Internal (Caddy proxies) |

## HTTPS (Optional)

To enable HTTPS with automatic certificates, edit the `Caddyfile`:

```
# Replace :80 with your domain:
your-domain.com {
    # ... same handle blocks ...
}
```

Caddy automatically provisions Let's Encrypt certificates.

## Management

```bash
# View logs
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f caddy

# Restart
docker compose restart

# Rebuild after code changes
docker compose up -d --build

# Stop
docker compose down

# Reset database
docker compose down
rm backend/switchboard.db
docker compose up -d
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SECRET_KEY` | (required) | JWT signing key — generate with `python -c "import secrets; print(secrets.token_hex(32))"` |
| `VLLM_API_KEY` | `vaani-local-key` | API key for GPU services |
| `VLLM_LLM_BASE_URL` | `http://localhost:8000` | LLM endpoint |
| `VLLM_STT_BASE_URL` | `http://localhost:8004` | Whisper STT endpoint |
| `VLLM_TTS_BASE_URL` | `http://localhost:8002` | TTS endpoint (future) |
| `DEFAULT_MODEL` | `Qwen3-14B` | Default LLM model name |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `1440` | JWT token lifetime (24h) |
