# VAANI Platform — Local Development Plan

## Current State
- **Developing on**: Windows laptop
- **GPU Server**: 164.52.194.98 (vLLM endpoints on different ports)
- **Goal**: Build & test locally → Ship to production server

---

## Phase 1: Project Scaffolding (Day 1-2)

### 1.1 Initialize Project Structure
```
model-backend/
├── backend/                  # FastAPI BFF
│   ├── app/
│   │   ├── main.py
│   │   ├── routes/
│   │   ├── models/
│   │   ├── services/
│   │   └── config.py
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/                 # Next.js
│   ├── src/
│   ├── package.json
│   └── Dockerfile
├── litellm/                  # LiteLLM config
│   ├── config.yaml
│   └── Dockerfile
├── docker-compose.yml
└── .env.example
```

### 1.2 Environment Configuration
```env
# .env (local development)
# Point to remote GPU server
VLLM_LLM_BASE_URL=http://164.52.194.98:8000
VLLM_STT_BASE_URL=http://164.52.194.98:8001
VLLM_TTS_BASE_URL=http://164.52.194.98:8002

# LiteLLM
LITELLM_MASTER_KEY=sk-your-master-key-here
DATABASE_URL=postgresql://vaani:password@localhost:5432/vaani

# App
SECRET_KEY=your-secret-key
```

---

## Phase 2: Backend (FastAPI BFF) - Day 3-5

### 2.1 Core Features
- [ ] User authentication (JWT-based)
- [ ] API key CRUD operations
- [ ] Proxy to LiteLLM for model inference
- [ ] Usage tracking & quota enforcement

### 2.2 Key Endpoints
```
POST /auth/signup          - User registration
POST /auth/login           - User login
GET  /me                   - Get current user
POST /me/keys              - Create API key
GET  /me/keys              - List API keys
DELETE /me/keys/{id}       - Revoke API key
GET  /me/usage             - Usage statistics
POST /v1/chat/completions  - Proxy to LLM
POST /v1/audio/transcriptions - Proxy to STT
POST /v1/audio/speech      - Proxy to TTS
```

---

## Phase 3: LiteLLM Proxy Setup - Day 6-7

### 3.1 Config for Remote GPU Server
```yaml
# litellm/config.yaml
model_list:
  - model_name: gpt-3.5-turbo  # Alias for OpenAI SDK compatibility
    litellm_params:
      model: openai/qwen3-14b-fp8
      api_base: http://164.52.194.98:8000
      api_key: os.environ/VLLM_API_KEY
      
  - model_name: whisper-large-v3
    litellm_params:
      model: openai/whisper-large-v3-turbo
      api_base: http://164.52.194.98:8001
      api_key: os.environ/VLLM_API_KEY
      
  - model_name: tts-1
    litellm_params:
      model: openai/kokoro-82m
      api_base: http://164.52.194.98:8002
      api_key: os.environ/VLLM_API_KEY
```

---

## Phase 4: Frontend (Next.js) - Day 8-12

### 4.1 Pages
- [ ] Landing page
- [ ] Auth pages (login/signup)
- [ ] Dashboard (usage stats)
- [ ] API Keys management
- [ ] Playground (test models)
- [ ] Documentation

### 4.2 Key Components
- [ ] Auth context/provider
- [ ] API client with key management
- [ ] Streaming chat component
- [ ] Audio recorder/upload for STT
- [ ] Audio player for TTS

---

## Phase 5: Docker Compose (Local) - Day 13

### 5.1 Services
```yaml
services:
  postgres:
    image: postgres:16
    ports: ["5432:5432"]
    environment:
      POSTGRES_DB: vaani
      POSTGRES_USER: vaani
      POSTGRES_PASSWORD: password
    
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    
  litellm:
    build: ./litellm
    ports: ["4000:4000"]
    depends_on: [postgres]
    env_file: .env
    
  backend:
    build: ./backend
    ports: ["8080:8080"]
    depends_on: [postgres, redis, litellm]
    env_file: .env
    
  frontend:
    build: ./frontend
    ports: ["3000:3000"]
    depends_on: [backend]
```

---

## Phase 6: Testing & Validation - Day 14-15

### 6.1 Test Checklist
- [ ] User signup/login flow
- [ ] API key creation & usage
- [ ] LLM chat completion via playground
- [ ] STT transcription via playground
- [ ] TTS synthesis via playground
- [ ] Rate limiting enforcement
- [ ] Usage tracking accuracy

---

## Phase 7: Production Deployment - Day 16+

### 7.1 Server Setup (164.52.194.98)
```bash
# On the GPU server
git clone <repo>
cd model-backend

# Update .env with production values
cp .env.example .env
# Edit .env with actual secrets

# Start services
docker compose up -d

# Verify vLLM instances are running
curl http://localhost:8000/v1/models
curl http://localhost:8001/v1/models
curl http://localhost:8002/v1/models
```

### 7.2 Nginx Config (for domain + SSL)
```nginx
server {
    listen 443 ssl;
    server_name api.vaani.ai;
    
    ssl_certificate /etc/letsencrypt/live/api.vaani.ai/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.vaani.ai/privkey.pem;
    
    location / {
        proxy_pass http://localhost:3000;  # Frontend
    }
    
    location /api/ {
        proxy_pass http://localhost:8080;  # Backend
    }
    
    location /v1/ {
        proxy_pass http://localhost:4000;  # LiteLLM
    }
}
```

---

## Immediate Next Steps

1. **Create GitHub repo** and push initial structure
2. **Set up Python environment** with uv (modern toolchain)
3. **Initialize Next.js** with TypeScript + Tailwind
4. **Create Docker Compose** for local dev
5. **Test connectivity** to 164.52.194.98 from your laptop

Want me to start executing this plan? I can begin with:
- Setting up the project structure
- Creating the FastAPI backend scaffold
- Initializing the Next.js frontend
- Writing the Docker Compose config

Which would you like to tackle first?
