#!/usr/bin/env bash
set -euo pipefail

# ─── Colors ──────────────────────────────────────────────────
BOLD='\033[1m'
DIM='\033[2m'
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# ─── Defaults ────────────────────────────────────────────────
SERVER_URL="${SWITCHBOARD_SERVER:-}"
API_KEY="${SWITCHBOARD_KEY:-}"
AGENT_NAME=""
NO_MODIFY_PATH=false
INSTALL_DIR="$HOME/.switchboard"
BIN_DIR="$INSTALL_DIR/bin"

# ─── CLI args ────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case "$1" in
        --server)       SERVER_URL="$2"; shift 2 ;;
        --key)          API_KEY="$2"; shift 2 ;;
        --name)         AGENT_NAME="$2"; shift 2 ;;
        --no-modify-path) NO_MODIFY_PATH=true; shift ;;
        --help|-h)
            echo "Switchboard Agent Installer"
            echo ""
            echo "Usage: curl -fsSL <server>/api/install | bash"
            echo "   or: ./install.sh [options]"
            echo ""
            echo "Options:"
            echo "  --server <url>     Switchboard server URL"
            echo "  --key <key>        API key (sk-...)"
            echo "  --name <name>      Agent display name"
            echo "  --no-modify-path   Don't add to shell PATH"
            echo "  --help             Show this help"
            echo ""
            echo "Environment variables:"
            echo "  SWITCHBOARD_SERVER   Server URL"
            echo "  SWITCHBOARD_KEY      API key"
            exit 0
            ;;
        *)  echo -e "${RED}Unknown option: $1${NC}"; exit 1 ;;
    esac
done

# ─── Helpers ─────────────────────────────────────────────────
info()    { echo -e "  ${DIM}│${NC} $1"; }
success() { echo -e "  ${GREEN}✓${NC} $1"; }
warn()    { echo -e "  ${YELLOW}!${NC} $1"; }
fail()    { echo -e "  ${RED}✗${NC} $1"; exit 1; }
step()    { echo -e "  ${CYAN}→${NC} ${BOLD}$1${NC}"; }

# ─── Banner ──────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${CYAN}"
cat << 'BANNER'
   ┌─────────────────────────────────────┐
   │      switchboard  agent             │
   │      ─────────────────              │
   │      remote coding agent            │
   └─────────────────────────────────────┘
BANNER
echo -e "${NC}"

# ─── Detect OS ───────────────────────────────────────────────
step "Detecting system"

OS="$(uname -s 2>/dev/null || echo "Unknown")"
ARCH="$(uname -m 2>/dev/null || echo "Unknown")"

case "$OS" in
    Linux*)   OS_NAME="Linux" ;;
    Darwin*)  OS_NAME="macOS" ;;
    MINGW*|MSYS*|CYGWIN*) OS_NAME="Windows (Git Bash)" ;;
    *)        OS_NAME="$OS" ;;
esac

case "$ARCH" in
    x86_64|amd64) ARCH_NAME="x64" ;;
    aarch64|arm64) ARCH_NAME="arm64" ;;
    *)            ARCH_NAME="$ARCH" ;;
esac

info "$OS_NAME $ARCH_NAME"

# ─── Find Python ────────────────────────────────────────────
step "Checking Python"

PYTHON=""
PY_VERSION=""

for cmd in python3 python py; do
    if command -v "$cmd" &>/dev/null; then
        ver=$("$cmd" -c "import sys; v=sys.version_info; print(f'{v.major}.{v.minor}')" 2>/dev/null || continue)
        major=$(echo "$ver" | cut -d. -f1)
        minor=$(echo "$ver" | cut -d. -f2)
        if [ "$major" -ge 3 ] && [ "$minor" -ge 10 ]; then
            PYTHON="$cmd"
            PY_VERSION="$ver"
            break
        fi
    fi
done

if [ -z "$PYTHON" ]; then
    fail "Python 3.10+ is required. Install from https://python.org"
fi

success "Python $PY_VERSION ($PYTHON)"

# ─── Ensure pip ──────────────────────────────────────────────
step "Checking pip"

ensure_pip() {
    if "$PYTHON" -m pip --version &>/dev/null; then
        return 0
    fi

    info "pip not found, attempting to install..."

    # Method 1: ensurepip
    if "$PYTHON" -m ensurepip --upgrade &>/dev/null 2>&1; then
        if "$PYTHON" -m pip --version &>/dev/null; then
            info "Installed via ensurepip"
            return 0
        fi
    fi

    # Method 2: get-pip.py
    info "Trying get-pip.py..."
    local tmp
    tmp=$(mktemp -d 2>/dev/null || mktemp -d -t 'switchboard')
    if curl -fsSL https://bootstrap.pypa.io/get-pip.py -o "$tmp/get-pip.py" 2>/dev/null; then
        if "$PYTHON" "$tmp/get-pip.py" --quiet 2>/dev/null; then
            rm -rf "$tmp"
            if "$PYTHON" -m pip --version &>/dev/null; then
                info "Installed via get-pip.py"
                return 0
            fi
        fi
        rm -rf "$tmp"
    fi

    return 1
}

if ! ensure_pip; then
    echo ""
    fail "Could not install pip. Install manually:\n    $PYTHON -m ensurepip --upgrade\n    or: curl https://bootstrap.pypa.io/get-pip.py | $PYTHON"
fi

PIP_VER=$("$PYTHON" -m pip --version 2>/dev/null | awk '{print $2}')
success "pip $PIP_VER"

# ─── Check existing install ─────────────────────────────────
if command -v switchboard-agent &>/dev/null; then
    CURRENT=$(switchboard-agent --version 2>/dev/null || echo "unknown")
    info "Existing installation found: $CURRENT"
fi

# ─── Get server URL ─────────────────────────────────────────
step "Configuration"

if [ -z "$SERVER_URL" ]; then
    echo ""
    echo -e "  ${DIM}Enter your Switchboard server URL${NC}"
    echo -e "  ${DIM}Example: http://your-server:41237${NC}"
    echo ""
    read -p "  Server URL: " SERVER_URL
    echo ""
fi

SERVER_URL="${SERVER_URL%/}"

if [ -z "$SERVER_URL" ]; then
    fail "Server URL is required"
fi

# Verify server is reachable
info "Checking server..."
if ! curl -fsSL --max-time 10 "$SERVER_URL/health" &>/dev/null; then
    warn "Server at $SERVER_URL is not responding — continuing anyway"
else
    success "Server reachable"
fi

# ─── Download agent package ─────────────────────────────────
step "Downloading agent package"

TMP_DIR=$(mktemp -d 2>/dev/null || mktemp -d -t 'switchboard')
trap 'rm -rf "$TMP_DIR"' EXIT

DOWNLOAD_URL="$SERVER_URL/api/agent-source"
info "$DOWNLOAD_URL"

if ! curl -fSL --progress-bar --max-time 60 "$DOWNLOAD_URL" -o "$TMP_DIR/agent.tar.gz" 2>&1; then
    echo ""
    fail "Download failed. Make sure the server is running and accessible."
fi

success "Downloaded"

# ─── Extract and install ────────────────────────────────────
step "Installing"

tar xzf "$TMP_DIR/agent.tar.gz" -C "$TMP_DIR" 2>/dev/null || fail "Failed to extract package"

# Try normal install, fall back to --user, then --break-system-packages
INSTALL_CMD="$PYTHON -m pip install --quiet"
if $INSTALL_CMD "$TMP_DIR/switchboard-agent" 2>/dev/null; then
    : # success
elif $INSTALL_CMD --user "$TMP_DIR/switchboard-agent" 2>/dev/null; then
    info "Installed to user site-packages (--user)"
elif $INSTALL_CMD --break-system-packages "$TMP_DIR/switchboard-agent" 2>/dev/null; then
    info "Installed with --break-system-packages"
else
    echo ""
    fail "pip install failed. Try in a virtual environment:\n    $PYTHON -m venv ~/.switchboard/venv\n    source ~/.switchboard/venv/bin/activate\n    Then re-run this installer."
fi

# Verify the command exists
if ! command -v switchboard-agent &>/dev/null; then
    # Check common user bin locations
    USER_BIN=$("$PYTHON" -c "import site; print(site.getusersitepackages().replace('lib/python','bin').split('/lib/')[0]+'/bin')" 2>/dev/null || echo "")
    if [ -n "$USER_BIN" ] && [ -f "$USER_BIN/switchboard-agent" ]; then
        warn "Installed but not on PATH: $USER_BIN"
        export PATH="$USER_BIN:$PATH"
    fi
fi

INSTALLED_VER=$(switchboard-agent --version 2>/dev/null || echo "0.1.0")
success "switchboard-agent $INSTALLED_VER"

# ─── Update PATH ────────────────────────────────────────────
if [ "$NO_MODIFY_PATH" = false ] && ! command -v switchboard-agent &>/dev/null; then
    step "Updating PATH"

    # Find where pip installed the script
    SCRIPT_DIR=$("$PYTHON" -c "import sysconfig; print(sysconfig.get_path('scripts'))" 2>/dev/null || echo "")
    if [ -z "$SCRIPT_DIR" ]; then
        SCRIPT_DIR=$("$PYTHON" -c "import site; print(site.getusersitepackages().replace('site-packages','../../bin'))" 2>/dev/null || echo "")
    fi

    if [ -n "$SCRIPT_DIR" ] && [ -d "$SCRIPT_DIR" ]; then
        PATH_LINE="export PATH=\"$SCRIPT_DIR:\$PATH\""

        # Detect shell config file
        SHELL_NAME=$(basename "${SHELL:-/bin/bash}")
        CONFIG_FILE=""

        case "$SHELL_NAME" in
            fish)
                CONFIG_FILE="$HOME/.config/fish/config.fish"
                PATH_LINE="set -gx PATH $SCRIPT_DIR \$PATH"
                ;;
            zsh)
                for f in "$HOME/.zshrc" "$HOME/.zshenv"; do
                    [ -f "$f" ] && CONFIG_FILE="$f" && break
                done
                [ -z "$CONFIG_FILE" ] && CONFIG_FILE="$HOME/.zshrc"
                ;;
            *)
                for f in "$HOME/.bashrc" "$HOME/.bash_profile" "$HOME/.profile"; do
                    [ -f "$f" ] && CONFIG_FILE="$f" && break
                done
                [ -z "$CONFIG_FILE" ] && CONFIG_FILE="$HOME/.bashrc"
                ;;
        esac

        # Add if not already present
        if [ -n "$CONFIG_FILE" ] && ! grep -qF "switchboard" "$CONFIG_FILE" 2>/dev/null; then
            echo "" >> "$CONFIG_FILE"
            echo "# Switchboard Agent" >> "$CONFIG_FILE"
            echo "$PATH_LINE" >> "$CONFIG_FILE"
            success "Added to $CONFIG_FILE"
            info "Restart your shell or run: source $CONFIG_FILE"
        fi

        # Also add to GITHUB_PATH for CI
        if [ -n "${GITHUB_PATH:-}" ]; then
            echo "$SCRIPT_DIR" >> "$GITHUB_PATH"
        fi

        export PATH="$SCRIPT_DIR:$PATH"
    fi
fi

# ─── Connect to server ──────────────────────────────────────
echo ""
step "Connecting to server"

if [ -z "$API_KEY" ]; then
    echo ""
    echo -e "  ${DIM}Enter your API key (from Dashboard > API Keys)${NC}"
    echo ""
    read -p "  API key: " API_KEY
    echo ""
fi

if [ -z "$API_KEY" ]; then
    fail "API key is required"
fi

CONNECT_ARGS=("$SERVER_URL" --key "$API_KEY")
if [ -n "$AGENT_NAME" ]; then
    CONNECT_ARGS+=(--name "$AGENT_NAME")
else
    read -p "  Agent name (Enter for auto): " AGENT_NAME
    if [ -n "$AGENT_NAME" ]; then
        CONNECT_ARGS+=(--name "$AGENT_NAME")
    fi
fi

switchboard-agent connect "${CONNECT_ARGS[@]}" || fail "Connection failed"

# ─── Done ────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}"
cat << 'DONE'
   ┌─────────────────────────────────────┐
   │                                     │
   │      Installation complete!         │
   │                                     │
   └─────────────────────────────────────┘
DONE
echo -e "${NC}"
echo -e "  ${BOLD}Next steps:${NC}"
echo ""
echo -e "  ${CYAN}1.${NC} Start the agent:"
echo -e "     ${DIM}switchboard-agent run${NC}"
echo ""
echo -e "  ${CYAN}2.${NC} Approve the device in the web UI"
echo ""
echo -e "  ${CYAN}3.${NC} (Optional) Install as a background service:"
echo -e "     ${DIM}switchboard-agent install-service${NC}"
echo ""
echo -e "  ${DIM}Commands:${NC}"
echo -e "  ${DIM}  switchboard-agent status     Check connection${NC}"
echo -e "  ${DIM}  switchboard-agent devices     List devices${NC}"
echo -e "  ${DIM}  switchboard-agent stop        Stop background agent${NC}"
echo -e "  ${DIM}  switchboard-agent logout      Clear credentials${NC}"
echo ""
