import argparse
import asyncio
import json
import logging
import os
import signal
import sys
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(
        prog="switchboard-agent",
        description="Switchboard AI Gateway — Remote Coding Agent",
    )
    sub = parser.add_subparsers(dest="command")

    # connect
    connect_p = sub.add_parser("connect", help="First-time setup")
    connect_p.add_argument("server_url", help="Switchboard server URL")
    connect_p.add_argument("--key", required=True, help="API key")
    connect_p.add_argument("--name", help="Agent display name")

    # run
    run_p = sub.add_parser("run", help="Start agent")
    run_p.add_argument("--dir", default=".", help="Working directory")
    run_p.add_argument("--name", help="Agent display name")
    run_p.add_argument("--server", help="Server URL (overrides config)")
    run_p.add_argument("--key", help="API key (overrides config)")
    run_p.add_argument("--background", action="store_true", help="Run in background")

    # status
    sub.add_parser("status", help="Show connection status")

    # logout
    sub.add_parser("logout", help="Clear credentials and disconnect")

    # stop
    sub.add_parser("stop", help="Stop background agent")

    # install-service
    svc_p = sub.add_parser("install-service", help="Install as OS service")
    svc_p.add_argument("--dir", default=".", help="Working directory for service")

    # devices
    sub.add_parser("devices", help="List approved devices")

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        sys.exit(1)

    if args.command == "connect":
        _do_connect(args)
    elif args.command == "run":
        _do_run(args)
    elif args.command == "status":
        _do_status()
    elif args.command == "logout":
        _do_logout()
    elif args.command == "stop":
        _do_stop()
    elif args.command == "install-service":
        _do_install_service(args)
    elif args.command == "devices":
        _do_devices()


def _load_config() -> dict:
    config_path = Path.home() / ".switchboard" / "config.json"
    if config_path.exists():
        return json.loads(config_path.read_text())
    return {}


def _save_config(config: dict):
    config_dir = Path.home() / ".switchboard"
    config_dir.mkdir(parents=True, exist_ok=True)
    (config_dir / "config.json").write_text(json.dumps(config, indent=2))


def _do_connect(args):
    from .fingerprint import get_fingerprint
    config = _load_config()
    config["server_url"] = args.server_url
    config["api_key"] = args.key
    config["agent_name"] = args.name or config.get("agent_name")
    config["fingerprint"] = get_fingerprint()
    _save_config(config)
    print(f"Configuration saved to ~/.switchboard/config.json")
    print(f"Server: {args.server_url}")
    print(f"Run 'switchboard-agent run' to connect.")


def _do_run(args):
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    config = _load_config()
    server = args.server or config.get("server_url")
    key = args.key or config.get("api_key")
    name = args.name or config.get("agent_name")
    workspace = os.path.abspath(args.dir)

    if not server or not key:
        print("Error: No server/key configured. Run 'switchboard-agent connect <url> --key <key>' first.")
        sys.exit(1)

    if args.background:
        import subprocess as sp
        log_path = Path.home() / ".switchboard" / "agent.log"
        log_path.parent.mkdir(parents=True, exist_ok=True)
        cmd = [sys.executable, "-m", "switchboard_agent", "run", "--dir", workspace]
        if name:
            cmd.extend(["--name", name])
        with open(log_path, "a") as log:
            proc = sp.Popen(cmd, stdout=log, stderr=log, start_new_session=True)
        pid_path = Path.home() / ".switchboard" / "agent.pid"
        pid_path.write_text(str(proc.pid))
        print(f"Agent started in background (PID {proc.pid})")
        print(f"Logs: tail -f {log_path}")
        return

    from .connection import AgentConnection
    agent = AgentConnection(server, key, workspace, name)

    def shutdown(sig, frame):
        print("\nShutting down...")
        agent.stop()

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    print(f"Switchboard Agent v{__import__('switchboard_agent').__version__}")
    print(f"Server:    {server}")
    print(f"Workspace: {workspace}")
    print(f"Name:      {name or 'auto'}")
    print()

    asyncio.run(agent.connect())


def _do_status():
    config = _load_config()
    if not config:
        print("Not configured. Run 'switchboard-agent connect' first.")
        return
    print(f"Server:      {config.get('server_url', 'not set')}")
    print(f"Agent name:  {config.get('agent_name', 'auto')}")
    print(f"Workspace:   {config.get('default_workspace', 'not set')}")
    print(f"Fingerprint: {config.get('fingerprint', 'not set')}")
    print(f"Device token: {'set' if config.get('device_token') else 'not set'}")
    pid_path = Path.home() / ".switchboard" / "agent.pid"
    if pid_path.exists():
        pid = pid_path.read_text().strip()
        try:
            os.kill(int(pid), 0)
            print(f"Background:  running (PID {pid})")
        except (OSError, ValueError):
            print(f"Background:  not running")
    else:
        print(f"Background:  not running")


def _do_logout():
    config_dir = Path.home() / ".switchboard"
    config_path = config_dir / "config.json"
    if config_path.exists():
        config_path.unlink()
        print("Credentials cleared.")
    _do_stop()


def _do_stop():
    pid_path = Path.home() / ".switchboard" / "agent.pid"
    if pid_path.exists():
        pid = pid_path.read_text().strip()
        try:
            os.kill(int(pid), signal.SIGTERM)
            print(f"Agent stopped (PID {pid})")
        except (OSError, ValueError):
            print("Agent not running")
        pid_path.unlink(missing_ok=True)
    else:
        print("No background agent running")


def _do_install_service(args):
    from .service import install_service
    workspace = os.path.abspath(args.dir)
    install_service(workspace)


def _do_devices():
    config = _load_config()
    server = config.get("server_url")
    key = config.get("api_key")
    if not server or not key:
        print("Not configured. Run 'switchboard-agent connect' first.")
        return
    try:
        import urllib.request
        req = urllib.request.Request(
            f"{server}/me/agents",
            headers={"Authorization": f"Bearer {key}"},
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            agents = json.loads(resp.read())
            if not agents:
                print("No devices registered.")
                return
            for a in agents:
                status = a.get("status", "unknown")
                if status == "online":
                    status_icon = "[online]"
                elif status == "pending":
                    status_icon = "[pending]"
                else:
                    status_icon = "[offline]"
                print(f"  {status_icon} {a.get('name', 'Unknown')} -- {a.get('hostname', '')} ({a.get('os', '')})")
                print(f"     Workspace: {a.get('workspace', '')}")
                print(f"     Status: {a.get('status', 'unknown')}")
                print()
    except Exception as e:
        print(f"Error fetching devices: {e}")


if __name__ == "__main__":
    main()
