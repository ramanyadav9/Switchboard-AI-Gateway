# Switchboard AI Gateway

Self-hosted, multi-model AI gateway. One API for LLM chat, speech-to-text, and real-time transcription. OpenAI-compatible.

## Features

- **LLM Chat** — Qwen3-14B with streaming, function calling, thinking mode
- **Speech-to-Text** — File upload via Whisper, real-time streaming via SenseVoice
- **Real-time Transcription** — WebSocket with auto language detection and emotion detection
- **Multi-tenant** — User accounts, API keys with per-key STT configuration
- **Translation** — LLM-powered text translation to any language
- **Dashboard** — Usage stats, request logs, system health monitoring
- **API Documentation** — Built-in docs page

## Quick Start

```bash
# Clone
git clone git@github.com:ramanyadav9/Switchboard-AI-Gateway.git
cd Switchboard-AI-Gateway

# Configure
cp .env.production .env
# Edit SECRET_KEY and VLLM_API_KEY in .env

# Deploy
docker compose up -d --build

# Open
open http://your-server-ip
```

## API Usage

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://your-server.com/v1",
    api_key="sk-your-api-key"
)

# Chat
response = client.chat.completions.create(
    model="Qwen3-14B",
    messages=[{"role": "user", "content": "Hello!"}]
)

# Transcribe
with open("audio.wav", "rb") as f:
    transcript = client.audio.transcriptions.create(
        model="whisper-large-v3-turbo", file=f
    )
```

Real-time transcription via WebSocket:
```python
import asyncio, websockets

async def live():
    async with websockets.connect("ws://your-server.com/ws/transcribe?token=API_KEY") as ws:
        # Send raw PCM16 16kHz audio bytes
        # Receive: {"type": "partial", "text": "...", "language": "en"}
```

## Architecture

```
Client → Caddy (:80) → Backend (:8080) → GPU Services
                     → Frontend (:3000)

GPU Services (on same server):
  ├── Qwen3-14B LLM (:8000) — vLLM
  ├── Whisper STT (:8004) — WhisperLiveKit
  └── SenseVoice STT (:8006) — FunASR
```

## Documentation

- [API Reference](docs/API.md)
- [Deployment Guide](docs/DEPLOYMENT.md)

## Tech Stack

- **Backend**: Python, FastAPI, SQLAlchemy, SQLite
- **Frontend**: Next.js 16, TypeScript, Tailwind CSS
- **Proxy**: Caddy
- **LLM**: vLLM + Qwen3-14B
- **STT**: WhisperLiveKit + FunASR/SenseVoice
- **Design**: Stitch (Google) design system
