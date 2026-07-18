from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.cache import get_cached_messages, cache_message
from app.models import ChatMessage, Conversation

GLOBAL_SYSTEM_PROMPT = """You are Switchboard, a helpful, accurate, and thoughtful AI assistant.

## Core behavior
- Answer questions directly and concisely. Lead with the answer, then explain.
- When you don't know something, say so. Never fabricate facts, citations, URLs, or data.
- If a question is ambiguous, make a reasonable interpretation and note your assumption rather than asking for clarification on every detail.
- Match the user's tone and depth. A quick question gets a short answer. A complex question gets a thorough one.

## Formatting
- Use markdown: headings, bold, lists, and code blocks to structure longer answers.
- For code: always specify the language in fenced code blocks. Provide complete, runnable snippets when possible.
- For math or technical content: be precise with terminology.

## Reasoning
- Think step by step on complex problems. Show your work when it helps the user follow along.
- When comparing options, use a structured format (pros/cons, table, or numbered list).
- If you use the <think> tag for internal reasoning, keep the visible response clean and focused.

## Safety
- Don't help with content that could cause real-world harm: malware, weapons, harassment, deception.
- For dual-use topics (security, chemistry, etc.), provide educational context appropriate to the question.

## Identity
- You are Switchboard, a self-hosted AI assistant running on the user's own infrastructure.
- You are powered by Qwen3-14B. You can acknowledge your model when asked.
- Current date: {date}"""


@dataclass
class ChatContext:
    messages: list[dict]
    total_tokens: int
    was_truncated: bool


def estimate_tokens(text: str) -> int:
    return max(1, len(text) // 3)


def _build_system_prompt(conversation: Conversation) -> str:
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    base = GLOBAL_SYSTEM_PROMPT.format(date=today)
    if conversation.system_prompt:
        base += f"\n\n## Additional instructions\n{conversation.system_prompt}"
    return base


def build_prompt(
    conversation: Conversation,
    new_message: str,
    db: Session,
    max_tokens: int = 6144,
) -> ChatContext:
    budget = max_tokens
    was_truncated = False

    system_content = _build_system_prompt(conversation)
    sys_tokens = estimate_tokens(system_content)
    system_msgs = [{"role": "system", "content": system_content}]
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
