from threading import Lock
from time import time

from app.models import User

# Per-user/per-key request timestamps (rolling 60s window). In-memory for MVP;
# swap for Redis in production for multi-worker support.
_requests: dict[str, list[float]] = {}
_lock = Lock()

# Requests-per-minute ceiling by plan tier (None = unlimited).
TIER_RPM: dict[str, int | None] = {
    "free": 50,
    "team": 60,
    "admin": None,
}


def _cleanup(window: list[float], now: float) -> None:
    cutoff = now - 60
    while window and window[0] <= cutoff:
        window.pop(0)


def check_rate_limit(key: str, limit: int | None) -> tuple[bool, int]:
    """Return (allowed, retry_after_seconds)."""
    if limit is None:
        return True, 0

    with _lock:
        now = time()
        window = _requests.setdefault(key, [])
        _cleanup(window, now)
        if len(window) >= limit:
            retry_after = int(60 - (now - window[0])) + 1
            return False, max(retry_after, 1)
        window.append(now)
    return True, 0


def rpm_limit_for(user: User, key_limit: int | None) -> int | None:
    if key_limit is not None:
        return key_limit
    return TIER_RPM.get(user.tier, TIER_RPM["free"])
