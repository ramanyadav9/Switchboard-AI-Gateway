import hashlib
import os
import platform
import getpass


def get_fingerprint() -> str:
    """SHA256(hostname + OS + username + machine_id)"""
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
    raw = "|".join(parts)
    return "sha256:" + hashlib.sha256(raw.encode()).hexdigest()[:32]
