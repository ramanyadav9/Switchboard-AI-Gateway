# Switchboard AI Gateway — Deployment Guide

Two deployment modes:

| Mode | What | When to use |
|------|------|-------------|
| [Mode A: All-in-One GPU Server](#mode-a-all-in-one-gpu-server) | Everything on one GPU machine | You have a single GPU server (e.g. L40S, A100, 4090) |
| [Mode B: Split Deployment](#mode-b-split-deployment-remote-gpu) | Switchboard on VPS, LLM on GPU server | You want cheap hosting + remote GPU, or multiple GPU sources |

---

## Prerequisites (both modes)

- Docker & Docker Compose v2+
- Git
- 4 GB RAM minimum (for Switchboard stack — DB, Redis, backend, frontend)
- GPU services running somewhere:
  - **vLLM** serving your model (Qwen3-14B, Llama, etc.) on port `8000`
  - **WhisperLiveKit** STT on port `8004` (optional)
  - **SenseVoice** STT on port `8006` (optional)

---

## Mode A: All-in-One GPU Server

Everything runs on the same machine. Docker containers talk to GPU services via `host.docker.internal`.

```
┌──────────── Your GPU Server ─────────────┐
│                                          │
│  Docker (switchboard-net)                │
│  ┌─────────────────────────────────────┐ │
│  │ Caddy        :41237 ← public port  │ │
│  │ Frontend     :3000  (internal)      │ │
│  │ Backend      :8081  (internal)      │ │
│  │ PostgreSQL   :5432  (internal)      │ │
│  │ Redis        :6379  (internal)      │ │
│  │ SearXNG      :8080  (internal)      │ │
│  └───────────┬─────────────────────────┘ │
│              │ host.docker.internal       │
│  GPU Services (on host, localhost only)   │
│    vLLM         :8000                    │
│    WhisperLive  :8004                    │
│    SenseVoice   :8006                    │
└──────────────────────────────────────────┘
         ↑
    Users & Agents connect here (:41237)
```

### Step 1: Start GPU services

Make sure vLLM and STT are running on the host (not in Docker):

```bash
# vLLM (adjust model and GPU memory as needed)
python -m vllm.entrypoints.openai.api_server \
  --model Qwen/Qwen3-14B \
  --host 127.0.0.1 \
  --port 8000 \
  --max-model-len 32768 \
  --gpu-memory-utilization 0.55 \
  --api-key vaani-local-key \
  --enable-auto-tool-choice \
  --tool-call-parser hermes

# WhisperLiveKit STT (optional)
whisper-live --host 127.0.0.1 --port 8004

# SenseVoice STT (optional)
# Start your SenseVoice server on port 8006
```

Verify they're running:

```bash
curl http://localhost:8000/v1/models   # should list your model
curl http://localhost:8004/v1/models   # whisper model
```

### Step 2: Clone and configure

```bash
git clone https://github.com/ramanyadav9/Switchboard-AI-Gateway.git
cd Switchboard-AI-Gateway

cp .env.production .env
```

Edit `.env`:

```env
# REQUIRED — generate these
SECRET_KEY=<run: python3 -c "import secrets; print(secrets.token_hex(32))">
POSTGRES_PASSWORD=<run: python3 -c "import secrets; print(secrets.token_hex(16))">

# GPU on same machine — leave GPU_SERVER_HOST empty
GPU_SERVER_HOST=

# Ports (defaults match standard setup — change only if yours differ)
VLLM_LLM_PORT=8000
VLLM_STT_PORT=8004
SENSEVOICE_PORT=8006

# API key must match what vLLM expects
VLLM_API_KEY=vaani-local-key

# Model name must match what vLLM serves
DEFAULT_MODEL=Qwen3-14B

# Leave empty — Caddy handles routing, frontend uses relative URLs
PUBLIC_URL=

# Single public port
GATEWAY_PORT=41237
```

### Step 3: Deploy

```bash
# Option A: Use the deploy script (recommended — generates secrets, checks services)
chmod +x deploy.sh
./deploy.sh

# Option B: Manual
docker compose up -d --build
```

### Step 4: Verify

```bash
# All containers healthy
docker compose ps

# Health check
curl http://localhost:41237/health
# → {"status":"healthy"}

# Test LLM
curl http://localhost:41237/v1/models
# → should list Qwen3-14B
```

### Step 5: Firewall

Only port `41237` and SSH should be publicly accessible:

```bash
# UFW (Ubuntu/Debian)
sudo ufw default deny incoming
sudo ufw allow ssh
sudo ufw allow 41237/tcp
sudo ufw enable

# --- OR iptables ---
sudo iptables -A INPUT -p tcp --dport 22 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 41237 -j ACCEPT
sudo iptables -A INPUT -i lo -j ACCEPT
sudo iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
sudo iptables -P INPUT DROP
sudo apt install iptables-persistent -y
sudo netfilter-persistent save
```

GPU ports (8000, 8004, 8006) stay on `127.0.0.1` — never exposed to the internet.

### Step 6: Access

```
Chat:      http://<SERVER_IP>:41237/chat
Dashboard: http://<SERVER_IP>:41237/dashboard
API:       http://<SERVER_IP>:41237/v1/chat/completions
Health:    http://<SERVER_IP>:41237/health
```

---

## Mode B: Split Deployment (Remote GPU)

Switchboard runs on a cheap VPS/cloud server. LLM and STT run on a separate GPU server. The backend reaches the GPU server over the network.

```
┌──────────── Server A (VPS) ──────────────┐       ┌─── Server B (GPU) ───┐
│                                          │       │                      │
│  Docker (switchboard-net)                │ HTTP  │  vLLM       :8000   │
│  ┌─────────────────────────────────────┐ │──────►│  WhisperLive :8004   │
│  │ Caddy        :41237 ← public port  │ │       │  SenseVoice  :8006   │
│  │ Frontend     :3000  (internal)      │ │       │                      │
│  │ Backend      :8081  (internal)      │ │       └──────────────────────┘
│  │ PostgreSQL   :5432  (internal)      │ │
│  │ Redis        :6379  (internal)      │ │
│  │ SearXNG      :8080  (internal)      │ │
│  └─────────────────────────────────────┘ │
└──────────────────────────────────────────┘
         ↑
    Users & Agents connect here (:41237)
```

### Step 1: Prepare the GPU server (Server B)

vLLM must bind to `0.0.0.0` so Server A can reach it:

```bash
# IMPORTANT: --host 0.0.0.0 (not 127.0.0.1)
python -m vllm.entrypoints.openai.api_server \
  --model Qwen/Qwen3-14B \
  --host 0.0.0.0 \
  --port 8000 \
  --max-model-len 32768 \
  --gpu-memory-utilization 0.55 \
  --api-key vaani-local-key \
  --enable-auto-tool-choice \
  --tool-call-parser hermes
```

Lock down firewall — only allow Server A:

```bash
# UFW: allow ONLY Server A's IP to reach GPU ports
sudo ufw default deny incoming
sudo ufw allow ssh
sudo ufw allow from <SERVER_A_IP> to any port 8000  # LLM
sudo ufw allow from <SERVER_A_IP> to any port 8004  # STT
sudo ufw allow from <SERVER_A_IP> to any port 8006  # SenseVoice
sudo ufw enable
```

Verify from Server A:

```bash
# Run this ON Server A to confirm connectivity
curl http://<GPU_SERVER_IP>:8000/v1/models
# → should list your model
```

### Step 2: Deploy Switchboard on Server A (VPS)

```bash
git clone https://github.com/ramanyadav9/Switchboard-AI-Gateway.git
cd Switchboard-AI-Gateway

cp .env.production .env
```

Edit `.env` — the key difference is `GPU_SERVER_HOST`:

```env
# REQUIRED — generate these
SECRET_KEY=<run: python3 -c "import secrets; print(secrets.token_hex(32))">
POSTGRES_PASSWORD=<run: python3 -c "import secrets; print(secrets.token_hex(16))">

# ┌─────────────────────────────────────────────┐
# │ THIS IS THE KEY SETTING — your GPU server IP │
# └─────────────────────────────────────────────┘
GPU_SERVER_HOST=164.52.194.98

# Ports on the GPU server
VLLM_LLM_PORT=8000
VLLM_STT_PORT=8004
SENSEVOICE_PORT=8006

# Must match GPU server's vLLM --api-key
VLLM_API_KEY=vaani-local-key

# Must match GPU server's model name
DEFAULT_MODEL=Qwen3-14B

PUBLIC_URL=
GATEWAY_PORT=41237
```

```bash
chmod +x deploy.sh
./deploy.sh
```

The deploy script will automatically:
- Generate secrets (if `.env` doesn't exist yet)
- Check connectivity to GPU services on the remote server
- Build and start all containers
- Run health checks

### Step 3: Firewall on Server A

```bash
sudo ufw default deny incoming
sudo ufw allow ssh
sudo ufw allow 41237/tcp
sudo ufw enable
```

### Step 4: Verify

```bash
docker compose ps                         # all healthy
curl http://localhost:41237/health         # {"status":"healthy"}
curl http://localhost:41237/v1/models      # lists your model
```

---

## BYOK Mode (No GPU Server)

You can run Switchboard with zero GPU infrastructure. Users bring their own API keys (OpenAI, Anthropic, Google, Groq, etc.) via Settings > Providers.

```env
# .env — no GPU server needed
GPU_SERVER_HOST=
DEFAULT_MODEL=gpt-4o

# Users add their own keys in the web UI at /chat → Settings → Providers
```

The backend routes requests to whichever provider the user has configured. This works on any $5/month VPS.

---

## Remote Coding Agent

Install the agent on any device to give Switchboard terminal/file access:

```bash
# On any machine (laptop, dev server, Raspberry Pi, etc.)
curl -fsSL http://<YOUR_SERVER>:41237/api/install | bash

# Connect
switchboard-agent connect http://<YOUR_SERVER>:41237 --key <YOUR_API_KEY>
switchboard-agent run
```

The agent connects OUTBOUND to Switchboard via WebSocket — no tunnel, no ngrok, no port forwarding needed. Works through NAT, firewalls, and corporate proxies.

Approve the device in the web UI at `/chat` → Agents → Approve.

---

## Docker Compose Reference

### Services

| Service | Image | Purpose | Internal Port |
|---------|-------|---------|---------------|
| `caddy` | `caddy:2-alpine` | Reverse proxy, single public port | 41237 |
| `frontend` | Custom (Next.js) | Web UI | 3000 |
| `backend` | Custom (FastAPI) | API server | 8081 |
| `postgres` | `pgvector/pgvector:pg16` | Database + vector search | 5432 |
| `redis` | `redis:7-alpine` | Caching, sessions, rate limits | 6379 |
| `searxng` | `searxng/searxng` | Self-hosted web search | 8080 |

### Networking

All services run on `switchboard-net` (Docker bridge network). Only Caddy exposes a port to the host. Services reference each other by Docker DNS names (`backend:8081`, `postgres:5432`, etc.).

### Volumes

| Volume | Purpose |
|--------|---------|
| `pgdata` | PostgreSQL data (conversations, users, RAG vectors) |
| `redis-data` | Redis persistence (sessions, cache) |
| `caddy-data` | TLS certificates (if using HTTPS) |
| `caddy-config` | Caddy runtime config |

---

## Environment Variables

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `SECRET_KEY` | — | Yes | JWT signing key (64 char hex) |
| `POSTGRES_PASSWORD` | — | Yes | PostgreSQL password |
| `GPU_SERVER_HOST` | *(empty)* | No | GPU server IP. Empty = same machine (`host.docker.internal`) |
| `VLLM_LLM_PORT` | `8000` | No | vLLM LLM port on GPU server |
| `VLLM_STT_PORT` | `8004` | No | WhisperLiveKit port on GPU server |
| `VLLM_TTS_PORT` | `8002` | No | TTS port on GPU server |
| `SENSEVOICE_PORT` | `8006` | No | SenseVoice port on GPU server |
| `VLLM_API_KEY` | `vaani-local-key` | No | API key for GPU services |
| `DEFAULT_MODEL` | `Qwen3-14B` | No | Default model name (must match vLLM) |
| `PUBLIC_URL` | *(empty)* | No | Public URL override for frontend |
| `GATEWAY_PORT` | `41237` | No | Public-facing port |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `1440` | No | JWT token lifetime (24h) |

---

## HTTPS with TLS

To enable HTTPS, update the `Caddyfile` with your domain:

```caddyfile
{
    admin off
}

switchboard.yourdomain.com {
    handle /auth/* {
        reverse_proxy backend:8081
    }
    handle /me/* {
        reverse_proxy backend:8081
    }
    handle /v1/* {
        reverse_proxy backend:8081
    }
    handle /health {
        reverse_proxy backend:8081
    }
    handle /ws/* {
        reverse_proxy backend:8081
    }
    handle /api/* {
        reverse_proxy backend:8081
    }
    handle {
        reverse_proxy frontend:3000
    }
}
```

Caddy auto-provisions Let's Encrypt certificates. Make sure:
- Port 80 and 443 are open (for ACME challenge)
- DNS A record points to your server
- Remove `GATEWAY_PORT` override or set to `443`

Update `docker-compose.yml` Caddy ports:

```yaml
caddy:
  ports:
    - "80:80"
    - "443:443"
```

---

## Management

```bash
# Logs
docker compose logs -f backend        # API logs
docker compose logs -f frontend       # Next.js logs
docker compose logs backend --tail 50 # last 50 lines

# Rebuild after code changes
git pull && docker compose up -d --build

# Restart a single service
docker compose restart backend

# Stop (preserves all data)
docker compose down

# Full reset (WARNING: deletes all data)
./deploy.sh --fresh

# Database backup
docker compose exec postgres pg_dump -U switchboard switchboard > backup.sql

# Database restore
cat backup.sql | docker compose exec -T postgres psql -U switchboard switchboard
```

---

## Troubleshooting

### Backend can't reach GPU server

```bash
# From inside the backend container
docker compose exec backend python -c "
import urllib.request
try:
    r = urllib.request.urlopen('http://<GPU_IP>:8000/v1/models')
    print('OK:', r.read().decode()[:200])
except Exception as e:
    print('FAIL:', e)
"
```

Common fixes:
- GPU server firewall blocking the connection → allow Server A's IP
- vLLM bound to `127.0.0.1` → change to `0.0.0.0`
- Wrong API key → match `--api-key` in vLLM with `VLLM_API_KEY` in `.env`

### Containers not starting

```bash
docker compose logs backend --tail 30   # check for errors
docker compose ps                        # check health status
```

### Database migration issues

```bash
# The backend auto-creates tables on startup. If schema changed:
docker compose down
docker volume rm switchboard-ai-gateway_pgdata   # WARNING: deletes data
docker compose up -d --build
```

### Port already in use

```bash
# Find what's using port 41237
sudo lsof -i :41237
# or
sudo ss -tlnp | grep 41237
```
