# Switchboard AI Gateway

Self-hosted AI platform with ChatGPT-like chat, deep research, web search, and a developer API — all running on your own GPU. No data leaves your server.

## What You Get

**Chat App** (`/chat`) — like ChatGPT, on your hardware
- SSE streaming with thinking mode (Qwen3 `<think>` tags)
- Markdown rendering, code blocks with copy
- Web search mode (SearXNG) — LLM answers with cited sources
- Deep research mode — autonomous multi-step research with reports
- Skills/prompt templates with `/` picker
- Model selector — switch models mid-conversation
- BYOK — bring your own API keys (OpenAI, Anthropic, Google, Groq, etc.)
- Rolling conversation summary + RAG memory across sessions
- Light/dark theme

**API Platform** (`/dashboard`) — like OpenAI's developer dashboard
- OpenAI-compatible API (`/v1/chat/completions`, `/v1/audio/transcriptions`)
- API key management with per-key STT config
- Usage stats, charts, system health
- Playground for direct LLM/STT testing
- API documentation

**Speech-to-Text**
- Dual engine: SenseVoice (~70ms live streaming) + Whisper (99 languages batch)
- WebSocket real-time transcription with language/emotion detection
- REST file upload transcription

## Quick Start

```bash
git clone git@github.com:ramanyadav9/Switchboard-AI-Gateway.git
cd Switchboard-AI-Gateway
chmod +x deploy.sh
./deploy.sh
```

Or manually:
```bash
cp .env.production .env
nano .env  # set SECRET_KEY, POSTGRES_PASSWORD, PUBLIC_URL
docker compose up -d --build
```

Open `http://your-server:41237`

## Architecture

```
Internet → :41237 (Caddy) ← only public port
               │
               ├── /chat/*     → frontend:3000
               ├── /dashboard/* → frontend:3000
               ├── /v1/*       → backend:8081 → vLLM
               └── /ws/*       → backend:8081 → STT engines

┌─── Docker bridge network (internal) ────────────────┐
│  frontend ←→ backend ←→ postgres ←→ redis ←→ searxng │
└──────────────────────────────────────────────────────┘
                    ↕ host.docker.internal
         GPU services on host (127.0.0.1 only):
           vLLM :8000 · Whisper :8004 · SenseVoice :8006
```

## API Usage

Drop-in OpenAI replacement — change `base_url` and `api_key`:

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://your-server:41237/v1",
    api_key="sk-your-switchboard-key"
)

response = client.chat.completions.create(
    model="Qwen3-14B",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)
```

Works with Python, Node.js, cURL, or any OpenAI SDK.

## Features

| Feature | Description |
|---------|-------------|
| Chat + streaming | SSE with `<think>` tag support |
| Web search | SearXNG → LLM answers with citations |
| Deep research | Plan → search → read → extract → synthesize loop |
| RAG memory | pgvector embeddings, cross-conversation retrieval |
| Rolling summary | Auto-compress old messages every 10 turns |
| BYOK providers | OpenAI, Anthropic, Google, Groq, DeepSeek, Mistral, Together, OpenRouter |
| Skills | Reusable prompt templates with `/` picker |
| Dual STT | SenseVoice (live) + Whisper (batch) |
| API keys | Per-key model access, rate limits, STT config |
| Theme toggle | Light/dark across all pages |
| Keyboard shortcuts | Ctrl+N new chat, Ctrl+K search |
| PDF export | Download research reports as PDF |
| Global system prompt | Identity, safety, formatting rules |
| 32K context | Full Qwen3-14B context window |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python, FastAPI, SQLAlchemy, PostgreSQL (pgvector) |
| Frontend | Next.js 16, TypeScript, Tailwind CSS v4 |
| Cache | Redis 7 |
| Search | SearXNG (self-hosted) |
| Proxy | Caddy 2 |
| LLM | vLLM + Qwen3-14B (FP8) |
| STT | WhisperLiveKit + FunASR/SenseVoice |
| Embeddings | fastembed (BAAI/bge-small-en-v1.5, CPU) |

## Project Structure

```
Switchboard-AI-Gateway/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app
│   │   ├── config.py            # Settings
│   │   ├── context.py           # Context window + RAG + summary
│   │   ├── models/              # SQLAlchemy ORM
│   │   ├── routes/              # API endpoints
│   │   │   ├── chat.py          # SSE chat streaming
│   │   │   ├── research.py      # Deep research
│   │   │   ├── skills.py        # Prompt templates
│   │   │   ├── settings.py      # User settings + BYOK
│   │   │   └── ...
│   │   └── services/            # Business logic
│   │       ├── research.py      # IterResearch engine
│   │       ├── search.py        # SearXNG client
│   │       ├── rag.py           # Vector retrieval
│   │       └── providers.py     # BYOK encryption + routing
│   └── Dockerfile
├── frontend/
│   └── src/app/
│       ├── chat/                # Chat app
│       │   ├── [id]/page.tsx    # Conversation (streaming + markdown)
│       │   ├── settings/        # Profile + BYOK providers
│       │   ├── skills/          # Prompt template manager
│       │   └── research/        # Deep research UI
│       └── dashboard/           # API platform
├── docker-compose.yml           # Bridge network, 6 services
├── Caddyfile                    # Reverse proxy (port 41237)
├── deploy.sh                    # One-command deploy script
└── docs/
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SECRET_KEY` | Yes | JWT signing key |
| `POSTGRES_PASSWORD` | Yes | Database password |
| `VLLM_API_KEY` | No | GPU service auth key |
| `PUBLIC_URL` | No | Frontend API URL (empty = relative) |
| `GATEWAY_PORT` | No | Public port (default: 41237) |

## Security

- All Docker services on internal bridge network — only Caddy is public
- API keys stored with Fernet encryption (AES-128)
- bcrypt password hashing
- JWT authentication with configurable expiry
- GPU services bound to 127.0.0.1 only
- CORS configurable

## Documentation

- [API Reference](docs/API.md)
- [Deployment Guide](docs/DEPLOYMENT.md)

## License

MIT
