import json
from contextlib import contextmanager

import redis

from app.config import get_settings

settings = get_settings()

pool = redis.ConnectionPool.from_url(settings.REDIS_URL, decode_responses=True)


def get_redis() -> redis.Redis:
    return redis.Redis(connection_pool=pool)


SESSION_TTL = 30 * 60  # 30 minutes
MAX_SESSION_MESSAGES = 40


def cache_message(conversation_id: str, role: str, content: str, thinking: str | None = None, token_count: int = 0,
                   message_type: str = "text", tool_calls_json: list | None = None, tool_call_id: str | None = None):
    r = get_redis()
    key = f"session:{conversation_id}"
    msg = json.dumps({"role": role, "content": content, "thinking": thinking, "token_count": token_count,
                       "message_type": message_type, "tool_calls_json": tool_calls_json, "tool_call_id": tool_call_id})
    r.rpush(key, msg)
    r.ltrim(key, -MAX_SESSION_MESSAGES, -1)
    r.expire(key, SESSION_TTL)


def get_cached_messages(conversation_id: str) -> list[dict] | None:
    r = get_redis()
    key = f"session:{conversation_id}"
    msgs = r.lrange(key, 0, -1)
    if not msgs:
        return None
    r.expire(key, SESSION_TTL)
    return [json.loads(m) for m in msgs]


def clear_session(conversation_id: str):
    r = get_redis()
    r.delete(f"session:{conversation_id}")


def check_token_rate(user_id: str, tokens: int, limit: int) -> tuple[bool, int]:
    if limit <= 0:
        return True, 0
    r = get_redis()
    import time
    minute = int(time.time() // 60)
    key = f"tpm:{user_id}:{minute}"
    current = r.incrby(key, tokens)
    r.expire(key, 120)
    if current > limit:
        return False, 60 - int(time.time() % 60)
    return True, 0


def check_request_rate(user_id: str, limit: int) -> tuple[bool, int]:
    if limit <= 0:
        return True, 0
    r = get_redis()
    import time
    minute = int(time.time() // 60)
    key = f"rpm:{user_id}:{minute}"
    current = r.incr(key)
    r.expire(key, 120)
    if current > limit:
        return False, 60 - int(time.time() % 60)
    return True, 0


def get_active_generations(user_id: str) -> int:
    r = get_redis()
    val = r.get(f"gen:{user_id}")
    return int(val) if val else 0


def incr_active_generations(user_id: str):
    r = get_redis()
    r.incr(f"gen:{user_id}")
    r.expire(f"gen:{user_id}", 300)


def decr_active_generations(user_id: str):
    r = get_redis()
    r.decr(f"gen:{user_id}")
