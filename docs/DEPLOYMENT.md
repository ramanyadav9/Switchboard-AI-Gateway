# Switchboard AI Gateway — Deployment Guide

## Prerequisites

On your GPU server:
- Docker & Docker Compose installed
- GPU services running on localhost (bound to 127.0.0.1):
  - Qwen3-14B LLM on port 8000
  - WhisperLiveKit STT on port 8004
  - FunASR/SenseVoice STT on port 8006

## Quick Deploy

```bash
# 1. Clone
git clone git@github.com:ramanyadav9/Switchboard-AI-Gateway.git
cd Switchboard-AI-Gateway

# 2. Configure
cp .env.production .env
nano .env   # set SECRET_KEY, POSTGRES_PASSWORD, PUBLIC_URL

# 3. Deploy
docker compose up -d --build

# 4. Verify
docker compose ps                    # all healthy
curl http://localhost:41237/health   # {"status":"healthy"}
```

The app is live at `http://your-server-ip:41237`.

## Architecture

```
Internet
  │
  :41237 (Caddy) ← ONLY public port
  │
  ├── /auth/*, /me/*, /v1/*, /ws/* → backend:8081
  └── /* → frontend:3000

  ┌─── switchboard-net (Docker bridge, internal only) ───┐
  │ backend ←→ postgres:5432 ←→ redis:6379 ←→ searxng   │
  │ frontend ←→ backend                                   │
  │ caddy ←→ backend + frontend                          │
  └──────────────────────────────────────────────────────┘
           ↕ host.docker.internal
  GPU services on host (127.0.0.1 only):
    :8000 vLLM (Qwen3-14B)
    :8004 WhisperLiveKit
    :8006 FunASR/SenseVoice
```

All Docker services communicate via bridge network DNS names.
GPU services run on the host, reachable via `host.docker.internal`.
No ports exposed except Caddy on 41237.

## Port Map

| Port | Service | Exposed? |
|------|---------|----------|
| 41237 | Caddy (reverse proxy) | Public — single entry point |
| 3000 | Next.js frontend | Internal (bridge network) |
| 8081 | FastAPI backend | Internal (bridge network) |
| 5432 | PostgreSQL (pgvector) | Internal (bridge network) |
| 6379 | Redis | Internal (bridge network) |
| 8080 | SearXNG | Internal (bridge network) |
| 8000 | vLLM LLM | Host only (127.0.0.1) |
| 8004 | WhisperLiveKit STT | Host only (127.0.0.1) |
| 8006 | FunASR/SenseVoice STT | Host only (127.0.0.1) |

## Firewall

Only port 41237 + SSH should be publicly accessible:

```bash
sudo iptables -A INPUT -p tcp --dport 22 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 41237 -j ACCEPT
sudo iptables -A INPUT -i lo -j ACCEPT
sudo iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
sudo iptables -P INPUT DROP

# Persist across reboots
sudo apt install iptables-persistent -y
sudo netfilter-persistent save
```

## Management

```bash
# Logs
docker compose logs -f backend
docker compose logs -f frontend

# Rebuild after code changes
git pull && docker compose up -d --build

# Restart
docker compose restart

# Stop (preserves data)
docker compose down
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SECRET_KEY` | (required) | JWT signing key |
| `POSTGRES_PASSWORD` | (required) | Database password |
| `VLLM_API_KEY` | `vaani-local-key` | API key for GPU services |
| `PUBLIC_URL` | (empty) | Public URL for frontend API calls |
| `GATEWAY_PORT` | `41237` | Port Caddy listens on |
| `DEFAULT_MODEL` | `Qwen3-14B` | Default LLM model name |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `1440` | JWT token lifetime (24h) |
