# Switchboard Agent

Remote coding agent for the Switchboard AI Gateway. Install on any machine to make it accessible from the Switchboard web UI.

## Install

```bash
pip install switchboard-agent
```

## Quick Start

```bash
# 1. Connect to your server
switchboard-agent connect https://your-server:41237 --key sk-your-api-key

# 2. Run in current directory
switchboard-agent run

# 3. Or install as background service
switchboard-agent install-service
```

## Commands

| Command | Description |
|---------|-------------|
| `connect <url> --key <key>` | First-time setup |
| `run [--dir path] [--name name]` | Start agent |
| `run --background` | Run in background |
| `install-service` | Install as OS service |
| `status` | Show connection status |
| `devices` | List registered devices |
| `logout` | Clear credentials |
| `stop` | Stop background agent |

## Tools

The agent exposes these tools to the LLM:

- `read_file` -- Read file contents
- `write_file` -- Create/write files
- `edit_file` -- Find-and-replace edit
- `bash` -- Run shell commands
- `grep` -- Search file contents
- `glob` -- Find files by pattern
- `ls` -- List directory
