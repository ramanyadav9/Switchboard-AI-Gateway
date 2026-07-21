#!/usr/bin/env bash
set -euo pipefail

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Switchboard Agent — Installer"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check Python
if ! command -v python3 &>/dev/null; then
    echo "Error: Python 3.10+ is required."
    echo "Install it from https://python.org"
    exit 1
fi

PY_VERSION=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
PY_MAJOR=$(echo $PY_VERSION | cut -d. -f1)
PY_MINOR=$(echo $PY_VERSION | cut -d. -f2)

if [ "$PY_MAJOR" -lt 3 ] || ([ "$PY_MAJOR" -eq 3 ] && [ "$PY_MINOR" -lt 10 ]); then
    echo "Error: Python 3.10+ required (found $PY_VERSION)"
    exit 1
fi

echo "[+] Python $PY_VERSION found"

# Install
echo "[->] Installing switchboard-agent..."
pip3 install --quiet switchboard-agent 2>/dev/null || python3 -m pip install --quiet switchboard-agent

echo "[+] Installed"
echo ""

# Setup
read -p "Enter your Switchboard server URL: " SERVER_URL
read -p "Enter your API key: " API_KEY
read -p "Agent name (press Enter for auto): " AGENT_NAME

switchboard-agent connect "$SERVER_URL" --key "$API_KEY" ${AGENT_NAME:+--name "$AGENT_NAME"}

echo ""
echo "[+] Setup complete!"
echo ""
echo "  Run:     switchboard-agent run"
echo "  Service: switchboard-agent install-service"
echo "  Status:  switchboard-agent status"
echo ""
