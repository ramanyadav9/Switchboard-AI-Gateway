#!/usr/bin/env bash
set -euo pipefail

# ─── Switchboard AI Gateway — Deploy Script ───────────────────
# Usage: ./deploy.sh [--fresh]
#   --fresh  Reset everything (WARNING: deletes all data)

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }
info() { echo -e "${CYAN}[→]${NC} $1"; }

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  Switchboard AI Gateway — Deploy${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# ─── Pre-checks ──────────────────────────────────────────────

command -v docker >/dev/null 2>&1 || err "Docker not found. Install Docker first."
docker compose version >/dev/null 2>&1 || err "Docker Compose not found."

# ─── Handle --fresh flag ─────────────────────────────────────

if [[ "${1:-}" == "--fresh" ]]; then
    warn "Fresh deploy requested — this will DELETE all data!"
    read -p "Type 'yes' to confirm: " confirm
    if [[ "$confirm" != "yes" ]]; then
        echo "Aborted."
        exit 0
    fi
    info "Stopping and removing everything..."
    docker compose down -v 2>/dev/null || true
    log "Clean slate ready"
fi

# ─── Environment setup ──────────────────────────────────────

if [[ ! -f .env ]]; then
    info "Creating .env from template..."
    cp .env.production .env

    SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))" 2>/dev/null || openssl rand -hex 32)
    PG_PASS=$(python3 -c "import secrets; print(secrets.token_hex(16))" 2>/dev/null || openssl rand -hex 16)

    sed -i "s|change-this-to-a-random-64-char-string|${SECRET}|" .env
    sed -i "s|switchboard-db-secret|${PG_PASS}|" .env

    log "Generated SECRET_KEY and POSTGRES_PASSWORD"

    # Detect public IP
    PUBLIC_IP=$(curl -s --max-time 5 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
    GATEWAY_PORT=$(grep GATEWAY_PORT .env | cut -d= -f2)
    GATEWAY_PORT=${GATEWAY_PORT:-41237}

    if [[ -n "$PUBLIC_IP" ]]; then
        sed -i "s|^PUBLIC_URL=.*|PUBLIC_URL=http://${PUBLIC_IP}:${GATEWAY_PORT}|" .env
        log "Set PUBLIC_URL=http://${PUBLIC_IP}:${GATEWAY_PORT}"
    else
        warn "Could not detect public IP — set PUBLIC_URL manually in .env"
    fi
else
    log ".env exists — using existing config"
fi

# ─── Verify GPU services ────────────────────────────────────

info "Checking GPU services..."

check_service() {
    local name=$1 url=$2
    if curl -s --max-time 3 "$url" >/dev/null 2>&1; then
        log "$name is running"
    else
        warn "$name not reachable at $url — chat/STT may not work"
    fi
}

check_service "vLLM (LLM)"     "http://localhost:8000/v1/models"
check_service "Whisper (STT)"   "http://localhost:8004/v1/models"
check_service "SenseVoice"      "http://localhost:8006"

# ─── Build and start ────────────────────────────────────────

info "Building and starting containers..."
docker compose up -d --build

info "Waiting for services to be healthy..."
sleep 5

MAX_WAIT=60
ELAPSED=0
while [[ $ELAPSED -lt $MAX_WAIT ]]; do
    HEALTH=$(docker compose ps --format json 2>/dev/null | grep -c '"healthy"' || echo "0")
    TOTAL=$(docker compose ps --format json 2>/dev/null | wc -l || echo "0")
    if [[ "$HEALTH" -ge 3 ]]; then
        break
    fi
    sleep 3
    ELAPSED=$((ELAPSED + 3))
done

# ─── Verify ──────────────────────────────────────────────────

echo ""
info "Container status:"
docker compose ps
echo ""

GATEWAY_PORT=$(grep GATEWAY_PORT .env 2>/dev/null | cut -d= -f2)
GATEWAY_PORT=${GATEWAY_PORT:-41237}

if curl -s --max-time 5 "http://localhost:${GATEWAY_PORT}/health" | grep -q "healthy"; then
    log "Health check passed"
else
    warn "Health check failed — check logs: docker compose logs backend --tail 30"
fi

# ─── Firewall reminder ──────────────────────────────────────

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Deploy complete!${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

PUBLIC_IP=$(grep PUBLIC_URL .env 2>/dev/null | sed 's|PUBLIC_URL=||' || echo "http://your-server:${GATEWAY_PORT}")
echo -e "  App:       ${GREEN}${PUBLIC_IP}${NC}"
echo -e "  Chat:      ${GREEN}${PUBLIC_IP}/chat${NC}"
echo -e "  Dashboard: ${GREEN}${PUBLIC_IP}/dashboard${NC}"
echo -e "  API:       ${GREEN}${PUBLIC_IP}/v1/chat/completions${NC}"
echo -e "  Health:    ${GREEN}${PUBLIC_IP}/health${NC}"
echo ""
echo -e "  ${YELLOW}Firewall:${NC} Only port ${GATEWAY_PORT} + SSH should be public."
echo -e "  Run this if not already done:"
echo ""
echo -e "    sudo iptables -A INPUT -p tcp --dport 22 -j ACCEPT"
echo -e "    sudo iptables -A INPUT -p tcp --dport ${GATEWAY_PORT} -j ACCEPT"
echo -e "    sudo iptables -A INPUT -i lo -j ACCEPT"
echo -e "    sudo iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT"
echo -e "    sudo iptables -P INPUT DROP"
echo -e "    sudo netfilter-persistent save"
echo ""
echo -e "  ${CYAN}Logs:${NC}    docker compose logs -f backend"
echo -e "  ${CYAN}Rebuild:${NC} git pull && docker compose up -d --build"
echo -e "  ${CYAN}Stop:${NC}    docker compose down"
echo ""
