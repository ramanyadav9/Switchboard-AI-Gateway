#!/usr/bin/env bash
set -euo pipefail

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Switchboard Agent — Installer"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check Python
PYTHON=""
for cmd in python3 python; do
    if command -v "$cmd" &>/dev/null; then
        PY_VERSION=$("$cmd" -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>/dev/null || echo "0.0")
        PY_MAJOR=$(echo "$PY_VERSION" | cut -d. -f1)
        PY_MINOR=$(echo "$PY_VERSION" | cut -d. -f2)
        if [ "$PY_MAJOR" -ge 3 ] && [ "$PY_MINOR" -ge 10 ]; then
            PYTHON="$cmd"
            break
        fi
    fi
done

if [ -z "$PYTHON" ]; then
    echo "Error: Python 3.10+ is required."
    echo "Install it from https://python.org"
    exit 1
fi

echo "[+] Python $PY_VERSION found ($PYTHON)"

# Ensure pip is available
if ! "$PYTHON" -m pip --version &>/dev/null; then
    echo "[->] pip not found, installing..."
    "$PYTHON" -m ensurepip --upgrade 2>/dev/null || {
        echo "Error: Could not install pip. Install it manually:"
        echo "  curl -fsSL https://bootstrap.pypa.io/get-pip.py | $PYTHON"
        exit 1
    }
fi

echo "[+] pip available"

# Detect server URL (the URL this script was downloaded from)
SERVER_URL="${SWITCHBOARD_SERVER:-}"
if [ -z "$SERVER_URL" ]; then
    read -p "Enter your Switchboard server URL (e.g. http://your-server:41237): " SERVER_URL
fi
SERVER_URL="${SERVER_URL%/}"

# Download agent package from server
echo "[->] Downloading agent package from $SERVER_URL..."
TMP_DIR=$(mktemp -d)
trap "rm -rf $TMP_DIR" EXIT

curl -fsSL "$SERVER_URL/api/agent-source" -o "$TMP_DIR/agent.tar.gz" || {
    echo "Error: Could not download agent package from $SERVER_URL/api/agent-source"
    echo "Make sure the server is running and accessible."
    exit 1
}

echo "[+] Downloaded"

# Extract and install
echo "[->] Installing switchboard-agent..."
tar xzf "$TMP_DIR/agent.tar.gz" -C "$TMP_DIR"
"$PYTHON" -m pip install --quiet "$TMP_DIR/switchboard-agent" || {
    echo "Error: pip install failed."
    exit 1
}

echo "[+] Installed"
echo ""

# Setup
API_KEY="${SWITCHBOARD_KEY:-}"
if [ -z "$API_KEY" ]; then
    read -p "Enter your API key: " API_KEY
fi
read -p "Agent name (press Enter for auto): " AGENT_NAME

switchboard-agent connect "$SERVER_URL" --key "$API_KEY" ${AGENT_NAME:+--name "$AGENT_NAME"}

echo ""
echo "[+] Setup complete!"
echo ""
echo "  Run:     switchboard-agent run"
echo "  Service: switchboard-agent install-service"
echo "  Status:  switchboard-agent status"
echo ""
