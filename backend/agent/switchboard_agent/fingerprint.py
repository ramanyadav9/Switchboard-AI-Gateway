import hashlib
import os
import platform
import getpass


def get_fingerprint(workspace: str | None = None) -> str:
    """SHA256(hostname + OS + username + machine_id [+ workspace]).

    Including the workspace makes each folder on the same machine a distinct
    agent, so running the agent in two different directories shows two agents.
    """
    parts = [platform.node(), platform.system(), getpass.getuser()]
    # Try to get machine-id on Linux
    for path in ["/etc/machine-id", "/var/lib/dbus/machine-id"]:
        try:
            with open(path) as f:
                parts.append(f.read().strip())
                break
        except FileNotFoundError:
            continue
    else:
        parts.append(platform.machine())
    if workspace:
        parts.append(os.path.normcase(os.path.abspath(workspace)))
    raw = "|".join(parts)
    return "sha256:" + hashlib.sha256(raw.encode()).hexdigest()[:32]
