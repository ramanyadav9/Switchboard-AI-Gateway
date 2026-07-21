import os
import sys
import platform
import subprocess
from pathlib import Path

SYSTEMD_UNIT = """[Unit]
Description=Switchboard Agent
After=network.target

[Service]
Type=simple
ExecStart={python} -m switchboard_agent run
WorkingDirectory={workspace}
Restart=always
RestartSec=5
Environment=HOME={home}

[Install]
WantedBy=multi-user.target
"""


def install_service(workspace: str):
    system = platform.system()
    if system == "Linux":
        _install_systemd(workspace)
    elif system == "Darwin":
        _install_launchd(workspace)
    else:
        print(f"Service installation not supported on {system}. Use 'switchboard-agent run --background' instead.")


def _install_systemd(workspace: str):
    python = sys.executable
    home = str(Path.home())
    unit = SYSTEMD_UNIT.format(python=python, workspace=workspace, home=home)
    unit_path = Path.home() / ".config" / "systemd" / "user" / "switchboard-agent.service"
    unit_path.parent.mkdir(parents=True, exist_ok=True)
    unit_path.write_text(unit)
    subprocess.run(["systemctl", "--user", "daemon-reload"], check=True)
    subprocess.run(["systemctl", "--user", "enable", "switchboard-agent"], check=True)
    subprocess.run(["systemctl", "--user", "start", "switchboard-agent"], check=True)
    print(f"Service installed and started.")
    print(f"  Status: systemctl --user status switchboard-agent")
    print(f"  Logs:   journalctl --user -u switchboard-agent -f")


def _install_launchd(workspace: str):
    python = sys.executable
    plist = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>com.switchboard.agent</string>
    <key>ProgramArguments</key><array>
        <string>{python}</string><string>-m</string><string>switchboard_agent</string><string>run</string>
    </array>
    <key>WorkingDirectory</key><string>{workspace}</string>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
    <key>StandardOutPath</key><string>{Path.home()}/.switchboard/agent.log</string>
    <key>StandardErrorPath</key><string>{Path.home()}/.switchboard/agent.log</string>
</dict>
</plist>"""
    plist_path = Path.home() / "Library" / "LaunchAgents" / "com.switchboard.agent.plist"
    plist_path.parent.mkdir(parents=True, exist_ok=True)
    plist_path.write_text(plist)
    subprocess.run(["launchctl", "load", str(plist_path)], check=True)
    print(f"Service installed and started.")
    print(f"  Logs: tail -f ~/.switchboard/agent.log")
