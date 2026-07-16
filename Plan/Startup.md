# VAANI Platform — Self-Hosted Multi-Model AI Gateway
### Project Specification & Build Plan

---

## 1. Project Overview

**What we're building**: A self-hosted, multi-tenant API gateway ("your own OpenRouter") running on our L40S GPU server, serving LLM, STT, and TTS models through a single OpenAI-compatible API. Users sign up through a web UI, generate their own scoped API keys, see usage/quota, and plug those keys into their own applications — exactly like using OpenAI or OpenRouter, except it's our own infrastructure and models.

**Core goals**:
- One GPU, multiple models (LLM + STT + TTS), served concurrently
- Multi-user, multi-tenant: each user has their own login, API key(s), quota, and usage dashboard
- Fast: streaming responses, continuous batching, low time-to-first-token
- OpenAI SDK-compatible so any existing app can point at us with zero code changes besides `base_url` and `api_key`

---

## 2. Hardware & Current Model Config (already validated)

- **GPU**: 1x NVIDIA L40S, 46GB VRAM
- **LLM**: Qwen3-14B-FP8, served via vLLM (~25GB VRAM footprint at current config)
- **Remaining VRAM budget**: ~20GB for STT + TTS + headroom
- **STT**: Whisper (large-v3-turbo or similar) served via vLLM's native `/v1/audio/transcriptions` endpoint
- **TTS**: TBD — candidate models to be selected once STT is running and real VRAM usage is confirmed (Kokoro-82M or Piper as lightweight options; Voxtral/Qwen3-TTS if vLLM-native support fits)

---

## 3. Tech Stack

### Inference layer
| Component | Choice | Purpose |
|---|---|---|
| LLM serving | **vLLM** | Continuous batching, PagedAttention, OpenAI-compatible chat API |
| STT serving | **vLLM** (`/v1/audio/transcriptions`) | Whisper-family model, streaming transcription support |
| TTS serving | **vLLM** (if supported model) or dedicated TTS server | Text-to-speech synthesis |
| Process management | **systemd** services (already in use: `vllm.service`) | Auto-restart, boot persistence |

### Gateway / API management layer
| Component | Choice | Purpose |
|---|---|---|
| API Gateway | **LiteLLM Proxy** | Unified OpenAI-compatible endpoint across all 3 model types, key issuance, per-key rate limits/budgets, usage logging |
| Gateway DB | **PostgreSQL** | Stores keys, users, spend/usage logs (required by LiteLLM) |
| Reverse proxy | **Nginx** or **Caddy** | TLS termination, routing, request size limits |

### Backend-for-frontend (our custom layer)
| Component | Choice | Purpose |
|---|---|---|
| Framework | **FastAPI** (Python) | Handles signup/login, talks to LiteLLM's management API using the master key (never exposed to browser), exposes safe scoped endpoints to our frontend |
| Auth | **Custom JWT auth** or **Clerk/Supabase Auth** | User signup, login, session management |
| DB (app-level) | **PostgreSQL** (can share instance with LiteLLM, separate schema) | User profiles, org/team structure, plan tiers |
| Task queue (for batch STT/TTS jobs + webhooks) | **Redis + RQ** (or Celery) | Async job handling for file uploads that don't need live streaming |
| WebSocket layer (for live voice) | **FastAPI WebSocket** | Chunked audio streaming to STT → LLM → TTS pipeline |

### Frontend
| Component | Choice | Purpose |
|---|---|---|
| Framework | **Next.js (React)** | Dashboard, key management, usage charts, playground |
| Styling | **Tailwind CSS** | Fast, consistent UI |
| Auth UI | Provided by Clerk/Supabase, or custom pages | Signup/login/forgot-password flows |
| Charts | **Recharts** | Usage graphs (tokens/day, requests/day, spend) |

### Infra / deployment
| Component | Choice | Purpose |
|---|---|---|
| Containerization | **Docker Compose** | LiteLLM + Postgres + Redis + BFF service, one command up/down |
| GPU services | Native systemd (not containerized, to keep direct GPU/driver access simple) | vLLM instances |
| Monitoring | **Prometheus + Grafana** | vLLM exposes `/metrics` natively; track GPU util, queue depth, latency |
| Logging | **Loki** (optional) or simple file logs + `journalctl` | Centralized log viewing |

---

## 4. Architecture Diagram

```
                         ┌─────────────────────────────┐
   Browser (user)  ────▶ │   Next.js Frontend            │
                         │   (signup/login/dashboard/     │
                         │    playground/usage)           │
                         └───────────────┬─────────────────┘
                                         │  (session cookie/JWT)
                                         ▼
                         ┌─────────────────────────────┐
                         │   FastAPI BFF (our backend)   │
                         │   - /auth/signup, /auth/login  │
                         │   - /me/keys (create/list/rev) │
                         │   - /me/usage                  │
                         │   - holds LiteLLM MASTER key    │
                         │     (never sent to browser)     │
                         └───────────────┬─────────────────┘
                                         │  (master key calls)
                                         ▼
                         ┌─────────────────────────────┐
   User's own app  ────▶ │   LiteLLM Proxy                │
   (calls with THEIR     │   - validates user's key        │
    own generated key)   │   - rate limit / budget check    │
                         │   - routes by "model" field      │
                         └──────┬───────────┬──────────┬────┘
                                │           │          │
                    ┌───────────▼──┐ ┌──────▼─────┐ ┌──▼────────┐
                    │ vLLM: LLM     │ │ vLLM: STT   │ │ vLLM: TTS  │
                    │ Qwen3-14B-FP8 │ │ Whisper     │ │ (TBD model)│
                    │ :8000         │ │ :8001       │ │ :8002      │
                    └───────────────┘ └─────────────┘ └────────────┘
                                All on the same L40S GPU

   Live voice (WebSocket path, separate from above):
   User's app ──ws──▶ FastAPI WebSocket Gateway ──▶ vLLM STT (chunked)
                                                  ──▶ vLLM LLM (streamed)
                                                  ──▶ vLLM/TTS (streamed audio out)
                       └──▶ streams audio back to user over same socket
```

---

## 5. UI Flow

### 5.1 Public pages
1. **Landing page** — brief pitch, "Sign up" / "Log in" CTAs, list of available models (LLM/STT/TTS) with short descriptions.
2. **Sign up** — email + password (or OAuth if using Clerk/Supabase). On success → auto-create a LiteLLM user + default API key behind the scenes.
3. **Log in** — standard auth, redirects to dashboard.

### 5.2 Authenticated dashboard
1. **Dashboard home**
   - Quick stats: requests today, tokens used, active keys, current plan/quota.
   - Usage chart (last 7/30 days) — requests and tokens over time, per model.

2. **API Keys page**
   - List of existing keys (masked, e.g. `sk-...ab12`), creation date, last used, status (active/revoked).
   - "Create new key" button → modal: name the key, optionally restrict to specific models (LLM only / STT only / all), set a soft budget limit.
   - "Revoke" action per key.
   - Copy-to-clipboard for key value (shown once at creation, standard security practice).

3. **Playground page** (test before integrating)
   - Model selector dropdown (populated from currently-served models).
   - For LLM: simple chat UI, streaming response, toggle for "thinking mode" if applicable.
   - For STT: upload/record audio → see transcript stream in.
   - For TTS: type text → hear synthesized audio, download option.
   - Shows the equivalent `curl`/Python snippet for whatever action was just performed — huge usability win, lets users copy working code immediately.

4. **Docs page**
   - Base URL, auth header format, example requests per modality (LLM chat, STT transcription, TTS synthesis), rate limit headers explanation, error code reference.

5. **Usage / Billing page** (even if not charging real money yet, worth building the structure)
   - Per-key breakdown: requests, tokens in/out, audio minutes processed, estimated cost (even if internal/free, useful for capacity planning).
   - Plan tier display (Free / Team / Admin) and its limits.

6. **Admin panel** (you / team leads only)
   - User list, ability to adjust individual user quotas/tiers.
   - Global model status (which vLLM instances are up, current queue depth — pull from Prometheus or vLLM `/metrics`).
   - Ability to disable a model temporarily (maintenance mode) without taking down the whole gateway.

---

## 6. Rate Limiting & Quotas (per-user level)

Handled primarily through **LiteLLM's native per-key controls**, configured via our BFF when a key is created:

| Limit type | Mechanism | Example |
|---|---|---|
| Requests per minute (RPM) | LiteLLM `rpm_limit` on key | 30 rpm for Free tier, higher for Team tier |
| Tokens per minute (TPM) | LiteLLM `tpm_limit` on key | 20,000 tpm for Free tier |
| Max budget (spend cap) | LiteLLM `max_budget` on key | e.g. $5 equivalent/month, auto-blocks after |
| Model access restriction | LiteLLM `models` list on key | Free tier: LLM only; Team tier: LLM+STT+TTS |
| Concurrent request cap | LiteLLM `max_parallel_requests` | Prevents one user from saturating vLLM's `max_num_seqs` |
| Audio-specific limits (custom, since LiteLLM's budget model is token-centric) | Tracked in our own Postgres table, checked in BFF before proxying | e.g. 60 minutes of STT/TTS per day for Free tier |

**Tiering example** (adjust to your actual needs):

| Tier | RPM | TPM | Models | Concurrent | Notes |
|---|---|---|---|---|---|
| Free | 20 | 10k | LLM only | 2 | default on signup |
| Team | 60 | 50k | LLM + STT + TTS | 5 | manually upgraded by admin |
| Admin | unlimited | unlimited | all | unlimited | internal/staff only |

Rate limit responses should return standard `429 Too Many Requests` with a `Retry-After` header — LiteLLM does this natively; make sure the frontend playground surfaces this clearly rather than showing a generic error.

---

## 7. Framework Choice for LLM Serving — Confirmed: vLLM

Reasons, specific to this project:
- OpenAI-compatible `/v1/chat/completions`, `/v1/audio/transcriptions`, and (for supported models) `/v1/audio/speech` — one consistent client pattern across all three modalities.
- Continuous batching + PagedAttention — best throughput/latency balance for concurrent multi-user chat without manual batching logic.
- Native FP8 support on Ada Lovelace (our L40S) — lets us run a quality 14B model in a fraction of the VRAM a naive BF16 deploy would need.
- Active support for tool/function calling (`--tool-call-parser hermes` for Qwen3), which we've already validated works with our model.
- Built-in Prometheus metrics for monitoring without extra instrumentation work.

---

## 8. Data Model (high-level)

**Users table**: `id, email, password_hash (or auth provider id), tier, created_at`

**API Keys table** (mirrors LiteLLM key metadata, or queried live from LiteLLM): `id, user_id, litellm_key_id, name, models_allowed, rpm_limit, tpm_limit, max_budget, status, created_at, last_used_at`

**Usage logs table** (either pulled from LiteLLM's spend logs or duplicated locally for custom audio metrics): `id, key_id, model, request_type (chat/stt/tts), tokens_or_duration, timestamp, latency_ms`

**Audio quota table** (custom, since LiteLLM doesn't natively track "minutes of audio"): `user_id, date, stt_minutes_used, tts_minutes_used`

---

## 9. Build Order (recommended sequence)

1. **Finalize vLLM configs** for LLM (done) + STT (in progress) + TTS (pending model choice) — confirm combined VRAM fits with margin.
2. **Stand up LiteLLM Proxy + Postgres** via Docker Compose, pointing at all three vLLM instances in `config.yaml`. Verify key generation and model routing work via `curl` before touching any UI.
3. **Build the FastAPI BFF**: signup/login, key creation/listing/revocation (calling LiteLLM's management API), usage endpoint. Test entirely via `curl`/Postman first.
4. **Build the Next.js frontend**: auth pages → dashboard → keys page → playground → docs page, in that order.
5. **Add rate limiting/tiering logic**: wire tier → LiteLLM key params at creation time; add the custom audio-minutes tracking table + enforcement check in the BFF.
6. **Add monitoring**: Prometheus scraping vLLM + LiteLLM metrics, basic Grafana dashboard for GPU util, request latency, error rate.
7. **Add the live-voice WebSocket layer** (only once STT+TTS are independently working) — this is the most complex piece, build it last.
8. **Load test**: use `vllm bench serve` and a simple concurrent-user script to validate real throughput before rolling out to the whole team.

---

## 10. Open Decisions (need your input before/while building)

- **TTS model**: final pick pending VRAM headroom check after STT is loaded.
- **Auth provider**: build custom JWT auth, or use a managed provider (Clerk/Supabase) to save time on signup/login/password-reset flows?
- **Billing**: internal-only quota enforcement for now, or do you want actual Stripe billing wired in later?
- **Multi-GPU growth path**: if the team grows beyond what one L40S can serve, do we plan for a second GPU now (tensor parallelism / additional replica) or defer that decision?