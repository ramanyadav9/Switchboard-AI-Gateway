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
# On Windows (Git Bash/MSYS), use the real Windows home so CMD/PowerShell can find it
if [ -n "${USERPROFILE:-}" ] && command -v cygpath &>/dev/null; then
    INSTALL_DIR="$(cygpath "$USERPROFILE")/.switchboard"
fi

# ─── CLI args ────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case "$1" in
        --server)          SERVER_URL="$2"; shift 2 ;;
        --key)             API_KEY="$2"; shift 2 ;;
        --name)            AGENT_NAME="$2"; shift 2 ;;
        --no-modify-path)  NO_MODIFY_PATH=true; shift ;;
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

# Interactive read that works in curl|bash (reads from /dev/tty)
prompt() {
    local var_name="$1" prompt_text="$2" result=""
    if [ -t 0 ]; then
        read -p "$prompt_text" result
    elif [ -e /dev/tty ]; then
        read -p "$prompt_text" result < /dev/tty
    fi
    eval "$var_name=\"\$result\""
}

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

IS_WINDOWS=false
case "$OS" in
    Linux*)                OS_NAME="Linux" ;;
    Darwin*)               OS_NAME="macOS" ;;
    MINGW*|MSYS*|CYGWIN*)  OS_NAME="Windows"; IS_WINDOWS=true ;;
    *)                     OS_NAME="$OS" ;;
esac

case "$ARCH" in
    x86_64|amd64)   ARCH_NAME="x64" ;;
    aarch64|arm64)   ARCH_NAME="arm64" ;;
    *)               ARCH_NAME="$ARCH" ;;
esac

info "$OS_NAME $ARCH_NAME"

# ─── Find Python 3.10+ ──────────────────────────────────────
step "Checking Python"

PYTHON=""
PY_VERSION=""

if [ "$IS_WINDOWS" = true ]; then
    CANDIDATES=("py" "python" "python3" "python.exe" "py.exe")
else
    CANDIDATES=("python3" "python" "py")
fi

for cmd in "${CANDIDATES[@]}"; do
    if command -v "$cmd" &>/dev/null; then
        ver=$("$cmd" -c "import sys; v=sys.version_info; print(f'{v.major}.{v.minor}')" 2>/dev/null) || continue
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

# ─── Check existing install ─────────────────────────────────
if [ -d "$INSTALL_DIR/agent" ]; then
    CURRENT=$("$PYTHON" -c "
import sys; sys.path.insert(0,'$INSTALL_DIR/agent')
from switchboard_agent import __version__; print(__version__)
" 2>/dev/null || echo "unknown")
    info "Existing installation found: v$CURRENT"
fi

# ─── Get server URL ─────────────────────────────────────────
step "Configuration"

if [ -z "$SERVER_URL" ]; then
    prompt SERVER_URL "  Server URL: "
    echo ""
fi

SERVER_URL="${SERVER_URL%/}"

if [ -z "$SERVER_URL" ]; then
    echo ""
    fail "Server URL is required. Use:\n    curl -fsSL <server>/api/install | SWITCHBOARD_SERVER=<server> SWITCHBOARD_KEY=<key> bash"
fi

info "Checking server..."
if ! curl -fsSL --max-time 10 "$SERVER_URL/health" &>/dev/null; then
    warn "Server at $SERVER_URL not responding — continuing anyway"
else
    success "Server reachable"
fi

# ─── Download ────────────────────────────────────────────────
step "Downloading"

TMP_DIR=$(mktemp -d 2>/dev/null || mktemp -d -t 'switchboard')
trap 'rm -rf "$TMP_DIR"' EXIT

DOWNLOAD_URL="$SERVER_URL/api/agent-source"
info "$DOWNLOAD_URL"

if ! curl -fSL --progress-bar --max-time 60 "$DOWNLOAD_URL" -o "$TMP_DIR/agent.tar.gz" 2>&1; then
    echo ""
    fail "Download failed. Is the server running?"
fi

success "Downloaded"

# ─── Install (no pip — pure extract) ────────────────────────
step "Installing to $INSTALL_DIR"

tar xzf "$TMP_DIR/agent.tar.gz" -C "$TMP_DIR" 2>/dev/null || fail "Failed to extract package"

# Create install directory
mkdir -p "$INSTALL_DIR/bin"
mkdir -p "$INSTALL_DIR/agent"
mkdir -p "$INSTALL_DIR/vendor"

# Copy agent source
if [ -d "$TMP_DIR/switchboard-agent/switchboard_agent" ]; then
    rm -rf "$INSTALL_DIR/agent/switchboard_agent"
    cp -r "$TMP_DIR/switchboard-agent/switchboard_agent" "$INSTALL_DIR/agent/switchboard_agent"
    success "Agent source installed"
else
    fail "Package missing switchboard_agent/ directory"
fi

# Copy vendored dependencies (websockets)
if [ -d "$TMP_DIR/switchboard-agent/vendor" ]; then
    rm -rf "$INSTALL_DIR/vendor/websockets"
    cp -r "$TMP_DIR/switchboard-agent/vendor/websockets" "$INSTALL_DIR/vendor/websockets"
    success "Dependencies installed"
else
    warn "No vendored dependencies found — websockets must be installed separately"
fi

# ─── Create wrapper script ──────────────────────────────────
step "Creating launcher"

# Resolve the Python path for the wrapper
PYTHON_PATH=$(command -v "$PYTHON")

cat > "$INSTALL_DIR/bin/switchboard-agent" << WRAPPER
#!/usr/bin/env bash
export PYTHONPATH="$INSTALL_DIR/vendor:$INSTALL_DIR/agent:\${PYTHONPATH:-}"
exec "$PYTHON_PATH" -m switchboard_agent "\$@"
WRAPPER
chmod +x "$INSTALL_DIR/bin/switchboard-agent"

# Windows: also create a .cmd wrapper for CMD/PowerShell
if [ "$IS_WINDOWS" = true ]; then
    INSTALL_DIR_WIN=$(cygpath -w "$INSTALL_DIR" 2>/dev/null || echo "$INSTALL_DIR")
    PYTHON_PATH_WIN=$(cygpath -w "$PYTHON_PATH" 2>/dev/null || echo "$PYTHON_PATH")
    cat > "$INSTALL_DIR/bin/switchboard-agent.cmd" << CMDWRAP
@echo off
set "PYTHONPATH=${INSTALL_DIR_WIN}\\vendor;${INSTALL_DIR_WIN}\\agent;%PYTHONPATH%"
"${PYTHON_PATH_WIN}" -m switchboard_agent %*
CMDWRAP
    success "Launchers created (bash + cmd)"
else
    success "Launcher created"
fi

# ─── Verify ──────────────────────────────────────────────────
export PYTHONPATH="$INSTALL_DIR/vendor:$INSTALL_DIR/agent:${PYTHONPATH:-}"
INSTALLED_VER=$("$PYTHON_PATH" -c "from switchboard_agent import __version__; print(__version__)" 2>/dev/null || echo "0.1.0")
success "switchboard-agent v$INSTALLED_VER"

# ─── Update PATH ────────────────────────────────────────────
BIN_DIR="$INSTALL_DIR/bin"

if [ "$NO_MODIFY_PATH" = false ]; then
    case ":$PATH:" in
        *":$BIN_DIR:"*) ;; # already on PATH
        *)
            step "Updating PATH"

            SHELL_NAME=$(basename "${SHELL:-/bin/bash}")
            CONFIG_FILE=""
            PATH_LINE="export PATH=\"$BIN_DIR:\$PATH\""

            case "$SHELL_NAME" in
                fish)
                    CONFIG_FILE="$HOME/.config/fish/config.fish"
                    PATH_LINE="set -gx PATH $BIN_DIR \$PATH"
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

            if [ -n "$CONFIG_FILE" ] && ! grep -qF "$BIN_DIR" "$CONFIG_FILE" 2>/dev/null; then
                echo "" >> "$CONFIG_FILE"
                echo "# Switchboard Agent" >> "$CONFIG_FILE"
                echo "$PATH_LINE" >> "$CONFIG_FILE"
                success "Added to $CONFIG_FILE"
            fi

            # Windows: add to user PATH via setx (works for CMD + PowerShell)
            if [ "$IS_WINDOWS" = true ]; then
                BIN_DIR_WIN=$(cygpath -w "$BIN_DIR" 2>/dev/null || echo "$BIN_DIR")
                CURRENT_PATH=$(cmd.exe //c "echo %PATH%" 2>/dev/null | tr -d '\r' || echo "")
                if [[ "$CURRENT_PATH" != *"$BIN_DIR_WIN"* ]]; then
                    setx PATH "$BIN_DIR_WIN;%PATH%" &>/dev/null && success "Added to Windows PATH (restart terminal)" || warn "Could not update Windows PATH — add $BIN_DIR_WIN manually"
                fi
            fi

            # GitHub Actions
            if [ -n "${GITHUB_PATH:-}" ]; then
                echo "$BIN_DIR" >> "$GITHUB_PATH"
            fi

            export PATH="$BIN_DIR:$PATH"
            ;;
    esac
fi

# ─── Connect ────────────────────────────────────────────────
echo ""
step "Connecting to server"

if [ -z "$API_KEY" ]; then
    echo ""
    echo -e "  ${DIM}Enter your API key (from Dashboard > API Keys)${NC}"
    echo ""
    prompt API_KEY "  API key: "
    echo ""
fi

if [ -z "$API_KEY" ]; then
    echo ""
    info "Installation complete but not connected."
    info "Connect manually:"
    echo ""
    echo -e "  ${BOLD}switchboard-agent connect $SERVER_URL --key YOUR_API_KEY${NC}"
    echo ""
    exit 0
fi

CONNECT_ARGS=("$SERVER_URL" --key "$API_KEY")
if [ -n "$AGENT_NAME" ]; then
    CONNECT_ARGS+=(--name "$AGENT_NAME")
else
    prompt AGENT_NAME "  Agent name (Enter for auto): "
    if [ -n "$AGENT_NAME" ]; then
        CONNECT_ARGS+=(--name "$AGENT_NAME")
    fi
fi

"$INSTALL_DIR/bin/switchboard-agent" connect "${CONNECT_ARGS[@]}" || fail "Connection failed"

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
