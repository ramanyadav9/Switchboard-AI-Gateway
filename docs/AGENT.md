# Switchboard Agent — Installation & Deployment Guide

The Switchboard Agent is a lightweight Python package you install on any machine (laptop, dev server, Raspberry Pi, cloud VM) to give Switchboard remote access to that machine's terminal and filesystem — directly from the chat UI.

```
┌─────────────────────┐          ┌─────────────────────────┐
│  Your Machine       │          │  Switchboard Server     │
│                     │ outbound │                         │
│  switchboard-agent  │────WSS──►│  :41237 (Caddy)         │
│  (Python CLI)       │          │  ├─ Backend             │
│                     │          │  ├─ Frontend            │
│  Tools:             │          │  └─ ...                 │
│  ├─ read_file       │◄─ tool ──┤                         │
│  ├─ write_file      │  calls   │  LLM asks to run tools  │
│  ├─ edit_file       │────────►│  Agent sends results    │
│  ├─ bash            │          │                         │
│  ├─ grep            │          │                         │
│  ├─ glob            │          │                         │
│  └─ ls              │          │                         │
└─────────────────────┘          └─────────────────────────┘
```

The agent connects OUTBOUND via WebSocket. No port forwarding, no ngrok, no tunnel. Works through NAT, firewalls, VPNs, and coffee shop WiFi — same as opening a website.

---

## Requirements

- Python 3.10+
- `pip` (comes with Python)
- Network access to your Switchboard server

---

## Quick Install

### Option A: One-liner (from your Switchboard server)

```bash
# Linux / macOS
curl -fsSL http://<YOUR_SERVER>:41237/api/install | bash

# Windows PowerShell
irm http://<YOUR_SERVER>:41237/api/install.ps1 | iex
```

The script will:
1. Check Python 3.10+ is installed
2. `pip install switchboard-agent`
3. Ask for your server URL and API key
4. Save config to `~/.switchboard/config.json`
5. Offer to install as a background service

### Option B: Manual install

```bash
# 1. Install the package
pip install switchboard-agent

# 2. Connect to your server (first time only)
switchboard-agent connect http://<YOUR_SERVER>:41237 --key <YOUR_API_KEY>

# 3. Start the agent
switchboard-agent run
```

### Option C: Install from source (for development)

```bash
# Clone the repo
git clone https://github.com/ramanyadav9/Switchboard-AI-Gateway.git
cd Switchboard-AI-Gateway/backend/agent

# Install in editable mode
pip install -e .

# Connect and run
switchboard-agent connect http://<YOUR_SERVER>:41237 --key <YOUR_API_KEY>
switchboard-agent run
```

---

## Getting Your API Key

1. Go to `http://<YOUR_SERVER>:41237/chat`
2. Sign up / log in
3. Go to Dashboard > API Keys (or `http://<YOUR_SERVER>:41237/dashboard/keys`)
4. Click "Create Key" — copy the `sk-...` key

---

## First-Time Setup (Device Approval)

When the agent connects for the first time from a new machine, it goes through a pairing flow:

```
1. You run: switchboard-agent run
2. Agent connects → server sees NEW device fingerprint
3. Server marks agent as "Pending Approval"
4. Agent prints: "Waiting for approval in web UI..."
5. You go to: http://<SERVER>:41237/chat → Agents page
6. You see: "New device wants to connect: YourPC (Linux)"
7. Click "Approve"
8. Agent receives a device_token → saved to ~/.switchboard/config.json
9. Future connections from this machine are instant (no re-approval)
```

The device fingerprint is `SHA256(hostname + OS + username + machine_id)` — unique per machine. If you reinstall the OS or change machines, you'll need to approve again.

---

## CLI Commands

```bash
# First-time setup — saves server URL + API key
switchboard-agent connect <SERVER_URL> --key <API_KEY> [--name "My Laptop"]

# Start agent (foreground — see logs in terminal)
switchboard-agent run [--dir /path/to/workspace]

# Start agent (background — runs in background, logs to file)
switchboard-agent run --background

# Check connection status
switchboard-agent status

# List all registered devices
switchboard-agent devices

# Install as OS service (auto-start on boot)
switchboard-agent install-service [--dir /path/to/workspace]

# Stop background agent
switchboard-agent stop

# Clear credentials and disconnect
switchboard-agent logout
```

---

## Running as a Background Service

### Linux (systemd)

```bash
# Auto-installs a user-level systemd service
switchboard-agent install-service --dir /home/you/projects

# Manage it
systemctl --user status switchboard-agent
systemctl --user stop switchboard-agent
systemctl --user restart switchboard-agent
journalctl --user -u switchboard-agent -f    # logs
```

The service auto-starts on boot and restarts on crash.

### macOS (launchd)

```bash
switchboard-agent install-service --dir /Users/you/projects

# Logs
tail -f ~/.switchboard/agent.log
```

The plist is installed at `~/Library/LaunchAgents/com.switchboard.agent.plist`.

### Windows

Use the background mode:

```powershell
switchboard-agent run --background --dir C:\Users\you\projects
```

Or create a Startup shortcut:
1. Press `Win+R`, type `shell:startup`
2. Create a shortcut to: `switchboard-agent run --dir C:\Users\you\projects`

### Docker (run agent inside a container)

```dockerfile
FROM python:3.12-slim
RUN pip install switchboard-agent
WORKDIR /workspace
CMD ["switchboard-agent", "run"]
```

```bash
docker run -d \
  -e SWITCHBOARD_SERVER=http://your-server:41237 \
  -e SWITCHBOARD_KEY=sk-your-key \
  -v /path/to/code:/workspace \
  switchboard-agent
```

---

## Using the Agent from Chat

Once the agent is approved and online:

1. Open `http://<SERVER>:41237/chat`
2. In the chat toolbar, click the agent dropdown (bottom of input)
3. Select your online agent
4. Ask the LLM to do anything on that machine:

```
"Read the package.json and tell me what dependencies are installed"
"Run the test suite and fix any failing tests"
"Find all TODO comments in the codebase"
"Create a new Python file that does X"
"Run git status and show me what changed"
```

The LLM will call tools (read_file, bash, edit_file, etc.) on the agent, and you'll see each tool call rendered inline in the chat.

### Slash Commands

Type `/` in the chat input to see available commands:

| Command | What it does |
|---------|-------------|
| `/agent` | Select which agent to use |
| `/compact` | Summarize context (free up token budget) |
| `/model` | Switch LLM model |
| `/clear` | Start new conversation |
| `/export` | Download conversation as markdown |
| `/cost` | Show token usage |
| `/skills` | Browse prompt templates |
| `/search` | Toggle web search mode |
| `/research` | Toggle deep research mode |

---

## Available Tools

The agent exposes 7 tools to the LLM:

| Tool | What it does |
|------|-------------|
| `read_file` | Read file contents with line numbers. Supports offset/limit for large files. |
| `write_file` | Create or overwrite a file. Auto-creates parent directories. |
| `edit_file` | Find-and-replace in a file. Has fuzzy fallback for whitespace differences. |
| `bash` | Run any shell command. Returns stdout, stderr, exit code. 120s default timeout. |
| `grep` | Regex search across files. Supports glob filters and context lines. |
| `glob` | Find files by pattern (e.g. `**/*.py`). Returns paths, sizes, sorted by modified time. |
| `ls` | List directory contents with file types and sizes. |

---

## Security

### Permission System

The agent has a built-in permission system. Default rules block dangerous operations:

```json
[
  {"tool": "*", "action": "allow"},
  {"tool": "bash", "pattern": "rm -rf /", "action": "deny"},
  {"tool": "bash", "pattern": "rm -rf /*", "action": "deny"},
  {"tool": "bash", "pattern": "sudo rm*", "action": "deny"},
  {"tool": "bash", "pattern": ":(){ :|:& };:*", "action": "deny"}
]
```

Custom rules go in `~/.switchboard/permissions.json`:

```json
{
  "rules": [
    {"tool": "*", "action": "allow"},
    {"tool": "bash", "pattern": "rm -rf *", "action": "deny"},
    {"tool": "bash", "pattern": "sudo *", "action": "deny"},
    {"tool": "write_file", "pattern": "*.env", "action": "deny"},
    {"tool": "write_file", "pattern": "*.key", "action": "deny"},
    {"tool": "write_file", "pattern": "*.pem", "action": "deny"},
    {"tool": "bash", "pattern": "docker rm*", "action": "deny"}
  ]
}
```

Rules use last-match-wins. Actions: `allow`, `deny`, `ask` (ask prompts in web UI — coming in Phase 4).

### Path Sandboxing

All file operations are sandboxed to the workspace directory. The agent resolves paths with `os.path.realpath()` to prevent `../../../etc/passwd` traversal attacks.

### Device Approval

- New devices require manual approval in the web UI
- Each device gets a unique `device_token` stored locally
- The token is hashed with bcrypt on the server (never stored in plaintext)
- Revoking a device in the web UI invalidates the token instantly
- `switchboard-agent logout` clears all local credentials

### Connection Security

- WebSocket connection upgrades HTTP → WS (or HTTPS → WSS)
- Heartbeat every 15 seconds keeps the connection alive
- Auto-reconnect with exponential backoff (1s → 30s) on disconnect
- If the server has HTTPS (via Caddy + domain), all traffic is encrypted end-to-end

---

## Configuration Files

### `~/.switchboard/config.json`

Created automatically on `switchboard-agent connect`:

```json
{
  "server_url": "http://your-server:41237",
  "api_key": "sk-...",
  "device_token": "dt-...",
  "agent_name": "My Laptop",
  "default_workspace": "/home/you/projects",
  "fingerprint": "sha256:abc123..."
}
```

### `~/.switchboard/permissions.json` (optional)

Custom permission rules. See [Permission System](#permission-system) above.

### `~/.switchboard/agent.log`

Log file for background mode and service mode.

### `~/.switchboard/agent.pid`

PID file for the background process. Used by `switchboard-agent stop`.

---

## Deploying Agent on a Remote Server (headless)

To install the agent on a remote server (e.g. a staging server, build server, or cloud VM) so Switchboard can manage it:

```bash
# SSH into the server
ssh user@remote-server

# Install
pip install switchboard-agent

# Connect (non-interactive)
switchboard-agent connect http://your-switchboard:41237 --key sk-your-key --name "Staging Server"

# Approve the device from the web UI

# Run as a service (auto-start on boot, auto-reconnect)
switchboard-agent install-service --dir /var/www/myapp

# Verify
switchboard-agent status
systemctl --user status switchboard-agent
```

Now from the Switchboard chat, you can:
- Deploy code to that server
- Check logs and processes
- Edit config files
- Run database migrations
- Debug issues

All from the browser, on any network.

---

## Multiple Agents

You can connect multiple machines to the same Switchboard account:

```
Laptop      → switchboard-agent run (workspace: ~/code)
Dev Server  → switchboard-agent run (workspace: /var/www)
GPU Box     → switchboard-agent run (workspace: /home/ml/models)
Raspberry Pi → switchboard-agent run (workspace: /home/pi/iot)
```

Each appears as a separate device in the web UI. In chat, select which agent to talk to from the agent dropdown.

---

## Troubleshooting

### Agent stuck on "Waiting for approval"

Go to `http://<SERVER>:41237/chat` → click "Agents" in the sidebar dropdown → find the pending device → click "Approve".

### Connection keeps dropping

```bash
# Check the server is reachable
curl http://<SERVER>:41237/health

# Check agent logs
tail -f ~/.switchboard/agent.log

# Or run in foreground to see live logs
switchboard-agent run
```

The agent auto-reconnects with exponential backoff (1s, 2s, 4s, 8s, ... up to 30s max).

### "Not configured" error

Run the connect command first:

```bash
switchboard-agent connect http://<SERVER>:41237 --key <YOUR_KEY>
```

### Tool calls not working

Check the agent is:
1. Running (`switchboard-agent status`)
2. Online (check web UI → Agents)
3. Approved (not "Pending")

Check permissions in `~/.switchboard/permissions.json` — a rule might be blocking the tool.

### Agent can't reach server

- Server firewall must allow port 41237
- If behind corporate proxy, the WebSocket upgrade might be blocked — try HTTPS (WSS) instead
- Check `switchboard-agent status` for the configured server URL

### Reset everything

```bash
switchboard-agent logout    # clears credentials
rm -rf ~/.switchboard       # full reset
```
