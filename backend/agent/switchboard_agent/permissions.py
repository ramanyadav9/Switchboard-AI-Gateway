import json
import os
import fnmatch
from pathlib import Path

DEFAULT_RULES = [
    {"tool": "*", "action": "allow"},
    {"tool": "bash", "pattern": "rm -rf /", "action": "deny"},
    {"tool": "bash", "pattern": "rm -rf /*", "action": "deny"},
    {"tool": "bash", "pattern": "sudo rm*", "action": "deny"},
    {"tool": "bash", "pattern": ":(){ :|:& };:*", "action": "deny"},
]


class PermissionDenied(Exception):
    pass


def load_rules() -> list[dict]:
    config_path = Path.home() / ".switchboard" / "permissions.json"
    if config_path.exists():
        try:
            data = json.loads(config_path.read_text())
            return data.get("rules", DEFAULT_RULES)
        except Exception:
            pass
    return DEFAULT_RULES


def check_permission(tool: str, params: dict, rules: list[dict] | None = None) -> str:
    """Returns 'allow', 'deny', or 'ask'."""
    if rules is None:
        rules = load_rules()
    action = "allow"
    command = params.get("command", "") if tool == "bash" else params.get("path", "")
    for rule in rules:
        if rule["tool"] != "*" and rule["tool"] != tool:
            continue
        pattern = rule.get("pattern")
        if pattern and not fnmatch.fnmatch(command, pattern):
            continue
        action = rule["action"]
    return action
