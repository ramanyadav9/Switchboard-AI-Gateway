from dataclasses import dataclass, field
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.cache import get_cached_messages, cache_message
from app.config import get_settings
from app.models import ChatMessage, Conversation

_settings = get_settings()

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

## Capabilities
- You have access to web search. When the user activates search mode, you receive search results and should cite sources with [1], [2], etc.
- You can perform deep research on complex topics when the user activates research mode.
- You support skills — reusable prompt templates the user can invoke with "/".

## Identity
- You are Switchboard, a self-hosted AI assistant running on the user's own infrastructure.
- You are powered by Qwen3-14B. You can acknowledge your model when asked.
- When asked about your capabilities, mention web search, deep research, and skills.
- Current date: {date}"""

SUMMARY_PROMPT = """Summarize this conversation so far in 3-5 concise sentences.
Focus on: key topics discussed, decisions made, important facts mentioned, and any ongoing tasks.
Write in third person ("The user asked about..., The assistant explained...").

Conversation:
{messages}

Summary:"""

SUMMARY_TRIGGER = 10


@dataclass
class ChatContext:
    messages: list[dict]
    total_tokens: int
    was_truncated: bool
    rag_sources: list[dict] = field(default_factory=list)
    has_summary: bool = False


def estimate_tokens(text: str) -> int:
    return max(1, len(text) // 3)


def _build_system_prompt(
    conversation: Conversation,
    rag_context: str = "",
    agent_tools: bool = False,
) -> str:
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    base = GLOBAL_SYSTEM_PROMPT.format(date=today)
    if conversation.system_prompt:
        base += f"\n\n## Additional instructions\n{conversation.system_prompt}"
    if agent_tools:
        from app.services.agent_tools import TOOL_SYSTEM_PROMPT
        base += f"\n\n{TOOL_SYSTEM_PROMPT}"
    if rag_context:
        base += f"\n\n## Relevant knowledge\nUse the following context if relevant to the user's question. Cite the source when you use it.\n\n{rag_context}"
    return base


def _fetch_rag_context(user_id: str, query: str, db: Session) -> tuple[str, list[dict]]:
    try:
        from app.services.rag import retrieve
        results = retrieve(db, user_id, query, top_k=3)
        if not results:
            return "", []
        context = "\n\n".join(
            f"[Source: {r['title'] or r['source_type']}]\n{r['content']}"
            for r in results
        )
        return context, results
    except Exception:
        return "", []


def build_prompt(
    conversation: Conversation,
    new_message: str,
    db: Session,
    max_tokens: int | None = None,
    agent_tools: bool = False,
) -> ChatContext:
    if max_tokens is None:
        max_tokens = int(_settings.MAX_MODEL_LEN * 0.75)
    budget = max_tokens
    was_truncated = False

    rag_context, rag_sources = _fetch_rag_context(
        conversation.user_id, new_message, db
    )

    system_content = _build_system_prompt(conversation, rag_context, agent_tools)
    sys_tokens = estimate_tokens(system_content)
    system_msgs = [{"role": "system", "content": system_content}]
    budget -= sys_tokens

    new_tokens = estimate_tokens(new_message)
    budget -= new_tokens

    # Rolling summary prefix
    summary_msgs: list[dict] = []
    if conversation.summary:
        summary_text = f"[Summary of earlier conversation: {conversation.summary}]"
        summary_tokens = estimate_tokens(summary_text)
        summary_msgs = [{"role": "system", "content": summary_text}]
        budget -= summary_tokens

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
        for m in db_msgs:
            cache_message(conversation.id, m.role, m.content, m.thinking, m.token_count)

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

    final = system_msgs + summary_msgs + selected + [{"role": "user", "content": new_message}]
    total = sum(estimate_tokens(m["content"]) for m in final)

    return ChatContext(
        messages=final,
        total_tokens=total,
        was_truncated=was_truncated,
        rag_sources=rag_sources,
        has_summary=bool(conversation.summary),
    )


def should_summarize(conversation: Conversation, message_count: int) -> bool:
    already_summarized = conversation.summary_up_to or 0
    return message_count - already_summarized >= SUMMARY_TRIGGER


def build_summary_messages(conversation_id: str, db: Session) -> str:
    msgs = (
        db.query(ChatMessage)
        .filter(ChatMessage.conversation_id == conversation_id)
        .order_by(ChatMessage.created_at.asc())
        .all()
    )
    if len(msgs) < SUMMARY_TRIGGER:
        return ""
    cutoff = len(msgs) - 4
    to_summarize = msgs[:cutoff]
    text = "\n".join(f"{m.role}: {m.content[:300]}" for m in to_summarize)
    if len(text) > 4000:
        text = text[:4000] + "..."
    return SUMMARY_PROMPT.format(messages=text)
