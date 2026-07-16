# Switchboard API Reference

Base URL: `https://your-server.com` (or `http://164.52.194.98` for local)

## Authentication

All API requests require a Bearer token — either a JWT (from login) or an API key (from the dashboard).

```
Authorization: Bearer <YOUR_API_KEY>
```

---

## Auth Endpoints

### POST /auth/signup
Create a new account.

```bash
curl -X POST https://your-server.com/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email": "dev@example.com", "password": "your-password"}'
```

**Response:**
```json
{"id": "user_1", "email": "dev@example.com", "tier": "free", "created_at": "2026-07-16T..."}
```

### POST /auth/login
Get a JWT access token.

```bash
curl -X POST https://your-server.com/auth/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=dev@example.com&password=your-password"
```

**Response:**
```json
{"access_token": "eyJ...", "token_type": "bearer"}
```

### GET /auth/me
Get current user info.

```bash
curl https://your-server.com/auth/me \
  -H "Authorization: Bearer <TOKEN>"
```

---

## API Keys

### POST /me/keys
Create a new API key with STT configuration.

```bash
curl -X POST https://your-server.com/me/keys \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "production-key",
    "stt_engine": "sensevoice",
    "stt_language": "auto",
    "stt_target_language": null
  }'
```

**STT Config Options:**

| Field | Values | Default | Description |
|-------|--------|---------|-------------|
| `stt_engine` | `sensevoice`, `whisper` | `sensevoice` | STT model for real-time transcription |
| `stt_language` | `auto`, `en`, `hi`, `mr`, `ja`, `zh`, etc. | `auto` | Source language detection |
| `stt_target_language` | `en`, `hi`, etc. or `null` | `null` | Translate to this language (null = no translation) |

### GET /me/keys
List all API keys.

### DELETE /me/keys/{key_id}
Revoke an API key.

---

## Chat Completions (LLM)

### POST /v1/chat/completions
OpenAI-compatible chat completions. Proxied to Qwen3-14B.

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://your-server.com/v1",
    api_key="sk-your-api-key"
)

response = client.chat.completions.create(
    model="Qwen3-14B",
    messages=[{"role": "user", "content": "Hello!"}],
    stream=True  # streaming supported
)

for chunk in response:
    print(chunk.choices[0].delta.content, end="")
```

**cURL:**
```bash
curl https://your-server.com/v1/chat/completions \
  -H "Authorization: Bearer <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "Qwen3-14B",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### GET /v1/models
List available models.

---

## Speech-to-Text (File Upload)

### POST /v1/audio/transcriptions
OpenAI-compatible audio transcription. Upload a file for batch processing.

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://your-server.com/v1",
    api_key="sk-your-api-key"
)

with open("audio.wav", "rb") as f:
    transcript = client.audio.transcriptions.create(
        model="whisper-large-v3-turbo",
        file=f
    )
print(transcript.text)
```

**cURL:**
```bash
curl https://your-server.com/v1/audio/transcriptions \
  -H "Authorization: Bearer <API_KEY>" \
  -F file=@audio.wav \
  -F model=whisper-large-v3-turbo
```

**Supported formats:** WAV, MP3, MP4, M4A, FLAC, OGG, WebM

---

## Real-time Speech-to-Text (WebSocket)

### WS /ws/transcribe
Live streaming transcription via WebSocket. Sends raw PCM16 audio, receives text in real-time.

**Connection:**
```
ws://your-server.com/ws/transcribe?token=<API_KEY>&engine=sensevoice&language=auto
```

**Query Parameters:**

| Param | Values | Description |
|-------|--------|-------------|
| `token` | API key or JWT | **Required.** Authentication |
| `engine` | `sensevoice`, `whisper` | STT engine (defaults to API key config) |
| `language` | `auto`, `en`, `hi`, `mr`, etc. | Source language (defaults to API key config) |
| `target_language` | `en`, `hi`, etc. | Translate output (defaults to API key config) |

**Protocol:**

1. Connect → receive `{"status": "connected", "engine": "sensevoice"}`
2. Send binary frames with raw PCM16 audio (16kHz, mono, int16)
3. Receive JSON messages:
   - `{"type": "partial", "text": "hello world", "language": "en", "emotion": "neutral"}`
   - `{"type": "final", "text": "...", "language": "en"}`
   - `{"type": "done"}`
4. Send `{"action": "stop"}` to end session

**Python Example:**
```python
import asyncio
import websockets
import pyaudio
import json

API_KEY = "sk-your-api-key"

async def live_transcribe():
    url = f"ws://your-server.com/ws/transcribe?token={API_KEY}&engine=sensevoice"

    async with websockets.connect(url) as ws:
        connected = await ws.recv()
        print("Connected:", connected)

        # Capture mic → raw PCM16 16kHz
        pa = pyaudio.PyAudio()
        stream = pa.open(format=pyaudio.paInt16, channels=1,
                         rate=16000, input=True, frames_per_buffer=4096)

        async def send_audio():
            while True:
                data = stream.read(4096, exception_on_overflow=False)
                await ws.send(data)
                await asyncio.sleep(0.1)

        async def receive_text():
            async for msg in ws:
                result = json.loads(msg)
                if result.get("text"):
                    print(f"[{result.get('language', '')}] {result['text']}")

        await asyncio.gather(send_audio(), receive_text())

asyncio.run(live_transcribe())
```

**JavaScript (Browser):**
```javascript
const ws = new WebSocket("ws://your-server.com/ws/transcribe?token=API_KEY&engine=sensevoice");

// Capture mic as raw PCM16 via AudioWorklet
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
const ctx = new AudioContext({ sampleRate: 16000 });
await ctx.audioWorklet.addModule("/pcm-processor.js");
const source = ctx.createMediaStreamSource(stream);
const worklet = new AudioWorkletNode(ctx, "pcm-processor");

worklet.port.onmessage = (e) => {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(new Uint8Array(e.data));
    }
};

source.connect(worklet);
worklet.connect(ctx.destination);

ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.text) console.log(`[${msg.language}] ${msg.text}`);
};
```

---

## Translation (LLM-powered)

### POST /me/translate
Translate text using the LLM (Qwen3-14B).

```bash
curl -X POST https://your-server.com/me/translate \
  -H "Authorization: Bearer <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"text": "नमस्ते, कैसे हो?", "target_language": "en"}'
```

**Response:**
```json
{"original": "नमस्ते, कैसे हो?", "translated": "Hello, how are you?", "target_language": "en"}
```

---

## Usage & Monitoring

### GET /me/usage?days=30
Get request and token usage stats.

### GET /me/recent?limit=10
Get recent API request logs.

### GET /me/status
Get system health status (LLM, STT services).

### GET /health
Simple health check.

---

## STT Engines

| Engine | Model | Latency | Best for |
|--------|-------|---------|----------|
| `sensevoice` | SenseVoice-Small (234M) | ~70ms | Real-time streaming, emotion detection |
| `whisper` | Whisper large-v3-turbo | ~2-3s | File uploads, batch processing, 99 languages |

---

## Rate Limits

| Tier | RPM (requests/min) |
|------|--------------------|
| Free | 50 |
| Team | 60 |
| Admin | Unlimited |
