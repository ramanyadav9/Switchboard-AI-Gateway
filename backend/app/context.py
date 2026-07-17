from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.cache import get_cached_messages, cache_message
from app.models import ChatMessage, Conversation


@dataclass
class ChatContext:
    messages: list[dict]
    total_tokens: int
    was_truncated: bool


def estimate_tokens(text: str) -> int:
    return max(1, len(text) // 3)


def build_prompt(
    conversation: Conversation,
    new_message: str,
    db: Session,
    max_tokens: int = 28000,
) -> ChatContext:
    budget = max_tokens
    was_truncated = False

    # System prompt
    system_msgs: list[dict] = []
    if conversation.system_prompt:
        sys_tokens = estimate_tokens(conversation.system_prompt)
        system_msgs = [{"role": "system", "content": conversation.system_prompt}]
        budget -= sys_tokens

    # New user message
    new_tokens = estimate_tokens(new_message)
    budget -= new_tokens

    # Fetch history: Redis first, fallback PostgreSQL
    cached = get_cached_messages(conversation.id)
    if cached is not None:
        history = [{"role": m["role"], "content": m["content"]} for m in cached]
        token_counts = [m.get("token_count", estimate_tokens(m["content"])) for m in cached]
    else:
        db_msgs = (
            db.query(ChatMessage)
            .filter(ChatMessage.conversation_id == conversation.id)
            .order_by(ChatMessage.created_at.asc())
            .all()
        )
        history = [{"role": m.role, "content": m.content} for m in db_msgs]
        token_counts = [m.token_count or estimate_tokens(m.content) for m in db_msgs]
        # Warm the cache
        for m in db_msgs:
            cache_message(conversation.id, m.role, m.content, m.thinking, m.token_count)

    # Truncate: keep last N messages that fit in budget
    # Always keep at least the last 4 messages for context
    selected: list[dict] = []
    selected_tokens = 0
    min_keep = 4

    for i in range(len(history) - 1, -1, -1):
        msg_tokens = token_counts[i] if i < len(token_counts) else estimate_tokens(history[i]["content"])
        if selected_tokens + msg_tokens > budget and len(selected) >= min_keep:
            was_truncated = True
            break
        selected.insert(0, history[i])
        selected_tokens += msg_tokens

    # Assemble final prompt
    final = system_msgs + selected + [{"role": "user", "content": new_message}]
    total = sum(estimate_tokens(m["content"]) for m in final)

    return ChatContext(messages=final, total_tokens=total, was_truncated=was_truncated)
