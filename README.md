# Switchboard AI Gateway

**Your own AI platform, on your own hardware.** Chat, a coding agent that works on your real machines, deep research, speech-to-text, and a drop-in OpenAI-compatible API — all self-hosted, all private. Nothing leaves your server.

Think of it as the operator's console for AI in your org: one place to *patch* your people and apps through to the models you run (or the ones you bring), without handing your data to anyone.

---

## Why Switchboard

- **It's yours.** Runs on your GPU (or any OpenAI-compatible endpoint you point it at). Conversations, code, and keys stay on your infrastructure.
- **One gateway, every model.** Serve a local model like Qwen3-14B, *and* bring your own keys for OpenAI, Anthropic, Google, Groq, and more — switch per conversation.
- **More than a chat box.** A real coding agent, autonomous research, live transcription, and a developer API — not just a wrapper around one endpoint.
- **Familiar.** The chat feels like ChatGPT; the API is a literal drop-in for the OpenAI SDK. Your team and your code barely notice the switch.

---

## What you can do with it

**🔒 A private ChatGPT for your team**
Give everyone a fast, streaming chat assistant that runs entirely on your own GPU. No usage caps you don't set, no data sent to a third party.

**🤖 An AI that works on your actual machines**
Connect a lightweight agent to your laptop, a dev box, or a server. The model can then **read, write, and edit files and run commands *there*** — scaffold a project, fix a bug, run tests — while you watch the workspace change live in the browser.

**🔌 A drop-in OpenAI replacement for your apps**
Point any app or SDK at Switchboard and it just works — same API shape, your keys, your models, your usage dashboard.

**🔎 A research assistant that cites its sources**
Ask a hard question; it searches the web, reads the results, and writes a sourced report you can export to PDF.

**🎙️ A transcription service**
Real-time and batch speech-to-text with language and emotion detection.

---

## Features

### 💬 Chat (`/chat`)
- ChatGPT-style streaming replies with **thinking mode** (see the model reason, collapsed)
- Markdown + syntax-highlighted code blocks with one-click copy
- **Switch models mid-conversation** — local or any provider you've connected
- **Skills** — reusable prompt templates, invoked with `/`
- **Slash commands** — `/model`, `/cost`, `/search`, `/research`, and more (arrow-key + Tab navigation)
- Light/dark theme, keyboard shortcuts, delete-with-confirm

### 🤖 Coding Agent
- Install a **tiny, zero-dependency agent** on any machine (Linux, macOS, WSL, Windows) with one command
- **Approve devices** from the web UI — the agent only runs after you say so
- The model gets tools — `read`, `write`, `edit`, `bash`, `grep`, `glob`, `ls` — that **execute on your machine**, not ours
- **Live workspace panel**: an expandable **file tree** that updates as the agent creates and edits files (changed files highlighted), plus a **Changes tab** showing `git` status and colored diffs
- **Inline diffs** on every edit — see exactly what changed, `+/-` line counts and all
- Run several agents (different machines *or* different folders) and pick which one handles a chat
- **Esc interrupts** a running task instantly
- Turn any chat into an agent session — plan in chat, then execute with an agent, same conversation

### 🔎 Web Search & Deep Research
- **Search mode** — the model answers from live web results with numbered citations
- **Deep research** — an autonomous plan → search → read → synthesize loop that produces a structured, sourced report (exportable as PDF)

### 🧠 Memory
- **Rolling summary** keeps a long conversation coherent — the model doesn't forget what the session is about
- **Cross-chat memory** (optional toggle in settings) — let a chat recall relevant summaries from your *other* conversations, so you don't repeat yourself

### 🔌 Developer API (`/dashboard`)
- **OpenAI-compatible** — `/v1/chat/completions`, `/v1/audio/transcriptions`
- API-key management with per-key model access, rate limits, and STT config
- Usage stats, charts, and system health at a glance
- Built-in **playground** to test models and transcription

### 🎙️ Speech-to-Text
- Dual engine: **SenseVoice** for ~real-time live streaming, **Whisper** for 99-language batch
- WebSocket live transcription + REST file upload

### 🌐 Bring Your Own Model / Keys
- Connect OpenAI, Anthropic, Google, Groq, DeepSeek, Mistral, Together, OpenRouter — keys encrypted at rest
- Mix local and hosted models freely; each conversation picks its own

---

## How it works

1. **Deploy** Switchboard on your server with Docker. It serves the web app + API behind a single port.
2. **Bring a model** — run a local one on your GPU (Qwen3-14B out of the box), and/or connect provider keys.
3. **Use it** — open the chat/research/agent web app, or point your apps at the OpenAI-compatible API.
4. **For coding tasks** — install the agent on a machine, approve it, and the model works *there* while you watch in the browser.

Everything runs inside your network; only the gateway port is exposed.

---

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
nano .env   # set SECRET_KEY, POSTGRES_PASSWORD, PUBLIC_URL
docker compose up -d --build
```

Then open the gateway in your browser (default port **41237**).

> Deploying the coding agent, split GPU servers, and full configuration are covered in the [Deployment Guide](docs/DEPLOYMENT.md) and [Agent Guide](docs/AGENT.md).

---

## Use it as an API

A drop-in OpenAI replacement — just change `base_url` and `api_key`:

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://your-server:41237/v1",
    api_key="sk-your-switchboard-key",
)

resp = client.chat.completions.create(
    model="Qwen3-14B",
    messages=[{"role": "user", "content": "Hello!"}],
)
print(resp.choices[0].message.content)
```

Works with the Python or Node OpenAI SDKs, cURL, or anything that speaks the OpenAI API.

---

## Under the hood (short version)

Self-hosted stack, everything on an internal network with a single public gateway:

- **Frontend** — Next.js + TypeScript + Tailwind
- **Backend** — FastAPI (Python) + PostgreSQL (pgvector) + Redis
- **Models** — vLLM serving your local model, plus any OpenAI-compatible provider you connect
- **Speech** — Whisper + SenseVoice
- **Search** — self-hosted SearXNG
- **Gateway** — Caddy reverse proxy (one exposed port)

Full architecture, environment variables, and service layout live in the [Deployment Guide](docs/DEPLOYMENT.md).

---

## Security

- Only the gateway port is public — every other service sits on an internal network, GPU services bound to localhost
- API keys encrypted at rest (Fernet), passwords hashed with bcrypt, JWT auth
- Coding agents connect **outbound** and run only after you approve the device; tools execute on *your* machine under your control

---

## Documentation

- [API Reference](docs/API.md) — endpoints and examples
- [Deployment Guide](docs/DEPLOYMENT.md) — all-in-one and split-server setups
- [Agent Guide](docs/AGENT.md) — installing and running the coding agent

## License

MIT
