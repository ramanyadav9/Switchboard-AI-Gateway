import asyncio
import json
import re
import time
import uuid
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.cache import (
    cache_message, check_request_rate, get_active_generations,
    incr_active_generations, decr_active_generations,
)
from app.config import get_settings
from app.context import build_prompt, build_summary_messages, estimate_tokens, should_summarize
from app.models import UserProvider
from app.services.providers import resolve_provider
from app.db import SessionLocal, get_db
from app.models import ApiKey, ChatMessage, Conversation, User
from app.ratelimit import rpm_limit_for
from app.routes.auth import Caller, get_caller

router = APIRouter()
settings = get_settings()

MAX_CONCURRENT_GENS = 3


class ChatRequest(BaseModel):
    conversation_id: str
    content: str
    display_content: str | None = None
    model: str | None = None
    agent_id: str | None = None
    temperature: float = 0.7
    max_tokens: int = 2048
    stream: bool = True


def _save_message(conversation_id: str, role: str, content: str, thinking: str | None, token_count: int):
    db = SessionLocal()
    try:
        msg = ChatMessage(
            id=str(uuid.uuid4()),
            conversation_id=conversation_id,
            role=role,
            content=content,
            thinking=thinking,
            token_count=token_count,
        )
        db.add(msg)
        conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
        if conv:
            conv.total_tokens = (conv.total_tokens or 0) + token_count
            from datetime import datetime, timezone
            conv.updated_at = datetime.now(timezone.utc)
        db.commit()
    finally:
        db.close()
    cache_message(conversation_id, role, content, thinking, token_count)


def _maybe_summarize(conversation_id: str, http_client):
    db = SessionLocal()
    try:
        conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
        if not conv:
            return
        msg_count = db.query(ChatMessage).filter(ChatMessage.conversation_id == conversation_id).count()
        if not should_summarize(conv, msg_count):
            return
        prompt = build_summary_messages(conversation_id, db)
        if not prompt:
            return

        import httpx as _httpx
        with _httpx.Client(timeout=60.0) as client:
            resp = client.post(
                f"{settings.VLLM_LLM_BASE_URL}/v1/chat/completions",
                headers={"Authorization": f"Bearer {settings.VLLM_API_KEY}"},
                json={
                    "model": settings.DEFAULT_MODEL,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.2,
                    "max_tokens": 512,
                },
            )
            if resp.status_code == 200:
                summary = resp.json()["choices"][0]["message"]["content"].strip()
                import re
                summary = re.sub(r"<think>[\s\S]*?</think>\s*", "", summary).strip()
                conv.summary = summary
                conv.summary_up_to = msg_count
                db.commit()

                try:
                    from app.services.rag import index_content
                    index_content(db, conv.user_id, "chat_summary", conversation_id, conv.title or "Chat", summary)
                except Exception:
                    pass
    except Exception:
        pass
    finally:
        db.close()


def _auto_title(conversation_id: str, user_message: str):
    title = user_message[:60].strip()
    if len(user_message) > 60:
        title = title.rsplit(" ", 1)[0] + "..."
    db = SessionLocal()
    try:
        conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
        if conv and not conv.title:
            conv.title = title
            db.commit()
    finally:
        db.close()


@router.post("/chat")
async def chat_sse(
    request: Request,
    body: ChatRequest,
    caller: Annotated[Caller, Depends(get_caller)],
    db: Annotated[Session, Depends(get_db)],
):
    user = caller.user
    api_key = caller.api_key

    # Rate limit
    limit = rpm_limit_for(user, api_key.rpm_limit if api_key else None)
    allowed, retry_after = check_request_rate(user.id, limit or 50)
    if not allowed:
        raise HTTPException(status_code=429, detail=f"Rate limited. Retry after {retry_after}s")

    # Concurrency limit
    active = get_active_generations(user.id)
    if active >= MAX_CONCURRENT_GENS:
        raise HTTPException(status_code=429, detail="Too many concurrent requests")

    # Fetch conversation
    conv = db.query(Conversation).filter(
        Conversation.id == body.conversation_id,
        Conversation.user_id == user.id,
    ).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    model = body.model or conv.model
    content = body.content.strip()
    save_content = (body.display_content or content).strip()
    if not content:
        raise HTTPException(status_code=400, detail="Empty message")

    # Model scope check
    if api_key and api_key.models_allowed:
        if model not in api_key.models_allowed:
            raise HTTPException(status_code=403, detail=f"Key not authorized for model '{model}'")

    # Build context
    has_agent = bool(body.agent_id)
    ctx = build_prompt(conv, content, db, agent_tools=has_agent)

    http_client = request.app.state.http_client

    # Resolve provider (external BYOK or local vLLM)
    user_providers = db.query(UserProvider).filter(UserProvider.user_id == user.id).all()
    ext = resolve_provider(user_providers, model)
    llm_base = ext["base_url"] if ext else settings.VLLM_LLM_BASE_URL
    llm_key = ext["api_key"] if ext else settings.VLLM_API_KEY

    if has_agent:
        return StreamingResponse(
            _agentic_sse_stream(http_client, ctx, model, body.temperature, body.max_tokens, body.conversation_id, save_content, user.id, llm_base, llm_key, body.agent_id),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    if not body.stream:
        return await _non_streaming(http_client, ctx, model, body.temperature, body.max_tokens, body.conversation_id, save_content, user.id, llm_base, llm_key)

    return StreamingResponse(
        _sse_stream(http_client, ctx, model, body.temperature, body.max_tokens, body.conversation_id, save_content, user.id, llm_base, llm_key),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


async def _sse_stream(http_client, ctx, model, temperature, max_tokens, conversation_id, user_content, user_id, llm_base=None, llm_key=None):
    incr_active_generations(user_id)

    llm_body = {
        "model": model,
        "messages": ctx.messages,
        "stream": True,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

    raw_content = ""
    raw_thinking = ""
    prompt_tokens = 0
    completion_tokens = 0
    start_time = time.time()

    try:
        base = llm_base or settings.VLLM_LLM_BASE_URL
        key = llm_key or settings.VLLM_API_KEY
        async with http_client.stream(
            "POST",
            f"{base}/v1/chat/completions",
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"},
            json=llm_body,
        ) as response:
            if response.status_code >= 400:
                error_body = await response.aread()
                yield f"data: {json.dumps({'type': 'error', 'text': error_body.decode(errors='replace')})}\n\n"
                return

            buffer = ""
            async for chunk in response.aiter_text():
                buffer += chunk
                while "\n" in buffer:
                    line, buffer = buffer.split("\n", 1)
                    line = line.strip()
                    if not line.startswith("data: "):
                        continue
                    data = line[6:]
                    if data == "[DONE]":
                        break
                    try:
                        parsed = json.loads(data)
                        delta = parsed.get("choices", [{}])[0].get("delta", {})
                        usage = parsed.get("usage")
                        if usage:
                            prompt_tokens = usage.get("prompt_tokens", 0)
                            completion_tokens = usage.get("completion_tokens", 0)

                        c = delta.get("content", "")
                        r = delta.get("reasoning_content", "")
                        if c or r:
                            evt: dict = {"type": "token"}
                            if c:
                                raw_content += c
                                evt["content"] = c
                            if r:
                                raw_thinking += r
                                evt["reasoning"] = r
                            yield f"data: {json.dumps(evt)}\n\n"
                    except json.JSONDecodeError:
                        pass

    except httpx.RequestError as e:
        yield f"data: {json.dumps({'type': 'error', 'text': str(e)})}\n\n"
        return
    finally:
        decr_active_generations(user_id)

    latency_ms = int((time.time() - start_time) * 1000)

    # Parse <think> tags
    think_match = re.match(r"^\s*<think>([\s\S]*?)</think>\s*([\s\S]*)$", raw_content)
    if think_match:
        raw_thinking = raw_thinking or think_match.group(1).strip()
        raw_content = think_match.group(2).strip()

    user_tokens = estimate_tokens(user_content)
    assistant_tokens = completion_tokens or estimate_tokens(raw_content)

    # Save asynchronously
    loop = asyncio.get_event_loop()
    loop.run_in_executor(None, _save_message, conversation_id, "user", user_content, None, user_tokens)
    loop.run_in_executor(None, _save_message, conversation_id, "assistant", raw_content, raw_thinking or None, assistant_tokens)
    loop.run_in_executor(None, _auto_title, conversation_id, user_content)
    loop.run_in_executor(None, _maybe_summarize, conversation_id, None)

    yield f"data: {json.dumps({'type': 'done', 'usage': {'prompt_tokens': prompt_tokens, 'completion_tokens': completion_tokens, 'latency_ms': latency_ms}})}\n\n"


def _save_tool_execution(conversation_id: str, agent_id: str, tool_name: str, params: dict, result: dict, turn: int):
    import logging
    db = SessionLocal()
    try:
        from app.models import ToolExecution
        te = ToolExecution(
            id=str(uuid.uuid4()),
            conversation_id=conversation_id,
            agent_id=agent_id,
            tool_name=tool_name,
            params_json=params,
            result_json=result.get("result") if result.get("success") else None,
            success=result.get("success", False),
            error=result.get("error"),
            duration_ms=result.get("duration_ms", 0),
            turn_number=turn,
        )
        db.add(te)
        db.commit()
    except Exception:
        logging.getLogger("switchboard").exception(f"Failed to save tool execution: {tool_name}")
        db.rollback()
    finally:
        db.close()


def _save_tool_message(conversation_id: str, role: str, content: str, message_type: str,
                       tool_calls_json: list | None = None, tool_call_id: str | None = None):
    import logging
    db = SessionLocal()
    try:
        token_count = estimate_tokens(content or "")
        msg = ChatMessage(
            id=str(uuid.uuid4()),
            conversation_id=conversation_id,
            role=role,
            content=content,
            message_type=message_type,
            tool_calls_json=tool_calls_json,
            tool_call_id=tool_call_id,
            token_count=token_count,
        )
        db.add(msg)
        conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
        if conv:
            conv.total_tokens = (conv.total_tokens or 0) + token_count
            from datetime import datetime, timezone
            conv.updated_at = datetime.now(timezone.utc)
        db.commit()
    except Exception:
        logging.getLogger("switchboard").exception(f"Failed to save tool message: {role}/{message_type}")
        db.rollback()
    finally:
        db.close()
    cache_message(conversation_id, role, content or "", None, estimate_tokens(content or ""),
                  message_type, tool_calls_json, tool_call_id)


DOOM_LOOP_THRESHOLD = 3


def _detect_doom_loop(history: list[tuple[str, str]]) -> bool:
    if len(history) < DOOM_LOOP_THRESHOLD:
        return False
    last = history[-DOOM_LOOP_THRESHOLD:]
    return all(t == last[0] for t in last)


async def _llm_stream_with_retry(http_client, url, headers, body, max_retries=3):
    for attempt in range(max_retries):
        try:
            response = await http_client.send(
                http_client.build_request("POST", url, headers=headers, json=body),
                stream=True,
            )
            if response.status_code == 429:
                retry_after = float(response.headers.get("retry-after", 2 * (2 ** attempt)))
                await response.aclose()
                await asyncio.sleep(min(retry_after, 30))
                continue
            if response.status_code >= 500:
                await response.aclose()
                await asyncio.sleep(2 * (2 ** attempt))
                continue
            return response
        except httpx.RequestError:
            if attempt == max_retries - 1:
                raise
            await asyncio.sleep(2 * (2 ** attempt))
    return None


async def _agentic_sse_stream(http_client, ctx, model, temperature, max_tokens, conversation_id, user_content, user_id, llm_base=None, llm_key=None, agent_id=None):
    from app.routes.agent_poll import execute_tool
    from app.services.agent_tools import TOOL_DEFINITIONS

    incr_active_generations(user_id)
    base = llm_base or settings.VLLM_LLM_BASE_URL
    key = llm_key or settings.VLLM_API_KEY
    messages = list(ctx.messages)
    total_prompt = 0
    total_completion = 0
    start_time = time.time()
    max_turns = 10
    tool_call_history: list[tuple[str, str]] = []
    completed_normally = False

    loop = asyncio.get_event_loop()
    user_tokens = estimate_tokens(user_content)
    await loop.run_in_executor(None, _save_message, conversation_id, "user", user_content, None, user_tokens)
    loop.run_in_executor(None, _auto_title, conversation_id, user_content)

    try:
        for turn in range(max_turns):
            raw_content = ""
            raw_thinking = ""
            tool_calls_accum: dict[int, dict] = {}

            try:
                response = await _llm_stream_with_retry(
                    http_client,
                    f"{base}/v1/chat/completions",
                    {"Content-Type": "application/json", "Authorization": f"Bearer {key}"},
                    {"model": model, "messages": messages, "stream": True,
                     "temperature": temperature, "max_tokens": max_tokens,
                     "tools": TOOL_DEFINITIONS},
                )
                if not response:
                    yield f"data: {json.dumps({'type': 'error', 'text': 'LLM request failed after retries'})}\n\n"
                    return

                if response.status_code >= 400:
                    error_body = await response.aread()
                    yield f"data: {json.dumps({'type': 'error', 'text': error_body.decode(errors='replace')})}\n\n"
                    return

                buffer = ""
                async for chunk in response.aiter_text():
                    buffer += chunk
                    while "\n" in buffer:
                        line, buffer = buffer.split("\n", 1)
                        line = line.strip()
                        if not line.startswith("data: "):
                            continue
                        data = line[6:]
                        if data == "[DONE]":
                            break
                        try:
                            parsed = json.loads(data)
                            choice = parsed.get("choices", [{}])[0]
                            delta = choice.get("delta", {})
                            usage = parsed.get("usage")
                            if usage:
                                total_prompt = usage.get("prompt_tokens", 0)
                                total_completion += usage.get("completion_tokens", 0)

                            c = delta.get("content", "")
                            r = delta.get("reasoning_content", "")
                            if c or r:
                                evt: dict = {"type": "token"}
                                if c:
                                    raw_content += c
                                    evt["content"] = c
                                if r:
                                    raw_thinking += r
                                    evt["reasoning"] = r
                                yield f"data: {json.dumps(evt)}\n\n"

                            for tc_delta in delta.get("tool_calls", []):
                                idx = tc_delta.get("index", 0)
                                if idx not in tool_calls_accum:
                                    tool_calls_accum[idx] = {"id": "", "name": "", "arguments": ""}
                                if tc_delta.get("id"):
                                    tool_calls_accum[idx]["id"] = tc_delta["id"]
                                fn = tc_delta.get("function", {})
                                if fn.get("name"):
                                    tool_calls_accum[idx]["name"] = fn["name"]
                                if fn.get("arguments"):
                                    tool_calls_accum[idx]["arguments"] += fn["arguments"]
                        except json.JSONDecodeError:
                            pass

                await response.aclose()

            except httpx.RequestError as e:
                yield f"data: {json.dumps({'type': 'error', 'text': str(e)})}\n\n"
                return

            # No tool calls — final text response
            if not tool_calls_accum:
                think_match = re.match(r"^\s*<think>([\s\S]*?)</think>\s*([\s\S]*)$", raw_content)
                if think_match:
                    raw_thinking = raw_thinking or think_match.group(1).strip()
                    raw_content = think_match.group(2).strip()
                completed_normally = True
                break

            # Build assistant message with tool_calls
            tc_list = []
            for idx in sorted(tool_calls_accum.keys()):
                tc = tool_calls_accum[idx]
                tc_list.append({"id": tc["id"], "type": "function",
                                "function": {"name": tc["name"], "arguments": tc["arguments"]}})

            assistant_msg: dict = {"role": "assistant", "content": raw_content or None, "tool_calls": tc_list}
            messages.append(assistant_msg)

            # Persist assistant tool_call message
            loop.run_in_executor(None, _save_tool_message, conversation_id, "assistant",
                                raw_content or "", "tool_call",
                                [{"id": tc["id"], "name": tc["function"]["name"],
                                  "arguments": tc["function"]["arguments"]} for tc in tc_list])

            # Execute each tool call
            for tc_entry in tc_list:
                tc_name = tc_entry["function"]["name"]
                try:
                    params = json.loads(tc_entry["function"]["arguments"])
                except json.JSONDecodeError:
                    params = {}

                # Doom loop detection
                params_key = json.dumps(params, sort_keys=True)
                tool_call_history.append((tc_name, params_key))
                if _detect_doom_loop(tool_call_history):
                    doom_msg = f"Stopped: tool '{tc_name}' called {DOOM_LOOP_THRESHOLD} times with identical params. Try a different approach."
                    yield f"data: {json.dumps({'type': 'tool_result', 'tool': tc_name, 'success': False, 'error': doom_msg})}\n\n"
                    messages.append({"role": "tool", "tool_call_id": tc_entry["id"],
                                     "content": json.dumps({"error": doom_msg})})
                    continue

                yield f"data: {json.dumps({'type': 'tool_call', 'tool': tc_name, 'params': params})}\n\n"

                try:
                    result = await execute_tool(agent_id, tc_name, params)
                except Exception as e:
                    result = {"success": False, "error": str(e)}

                yield f"data: {json.dumps({'type': 'tool_result', 'tool': tc_name, 'success': result.get('success', False), 'result': result.get('result'), 'error': result.get('error'), 'duration_ms': result.get('duration_ms')})}\n\n"

                tool_content = result.get("result", {}) if result.get("success") else {"error": result.get("error", "Unknown error")}
                messages.append({"role": "tool", "tool_call_id": tc_entry["id"],
                                 "content": json.dumps(tool_content)})

                # Persist tool result message + execution record
                loop.run_in_executor(None, _save_tool_message, conversation_id, "tool",
                                     json.dumps(tool_content), "tool_result", None, tc_entry["id"])
                loop.run_in_executor(None, _save_tool_execution, conversation_id,
                                     agent_id or "", tc_name, params, result, turn)

    finally:
        decr_active_generations(user_id)

    latency_ms = int((time.time() - start_time) * 1000)

    if completed_normally:
        assistant_tokens = total_completion or estimate_tokens(raw_content)
        loop.run_in_executor(None, _save_message, conversation_id, "assistant", raw_content, raw_thinking or None, assistant_tokens)
        loop.run_in_executor(None, _maybe_summarize, conversation_id, None)

    yield f"data: {json.dumps({'type': 'done', 'usage': {'prompt_tokens': total_prompt, 'completion_tokens': total_completion, 'latency_ms': latency_ms}})}\n\n"


async def _non_streaming(http_client, ctx, model, temperature, max_tokens, conversation_id, user_content, user_id, llm_base=None, llm_key=None):
    incr_active_generations(user_id)
    try:
        base = llm_base or settings.VLLM_LLM_BASE_URL
        key = llm_key or settings.VLLM_API_KEY
        response = await http_client.post(
            f"{base}/v1/chat/completions",
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"},
            json={
                "model": model,
                "messages": ctx.messages,
                "stream": False,
                "temperature": temperature,
                "max_tokens": max_tokens,
            },
        )
        if response.status_code >= 400:
            raise HTTPException(status_code=response.status_code, detail=response.text)

        result = response.json()
        text = result.get("choices", [{}])[0].get("message", {}).get("content", "")
        usage = result.get("usage", {})

        thinking = None
        think_match = re.match(r"^\s*<think>([\s\S]*?)</think>\s*([\s\S]*)$", text)
        if think_match:
            thinking = think_match.group(1).strip()
            text = think_match.group(2).strip()

        user_tokens = estimate_tokens(user_content)
        assistant_tokens = usage.get("completion_tokens", 0) or estimate_tokens(text)

        loop = asyncio.get_event_loop()
        loop.run_in_executor(None, _save_message, conversation_id, "user", user_content, None, user_tokens)
        loop.run_in_executor(None, _save_message, conversation_id, "assistant", text, thinking, assistant_tokens)
        loop.run_in_executor(None, _auto_title, conversation_id, user_content)

        return {"content": text, "thinking": thinking, "usage": usage}
    finally:
        decr_active_generations(user_id)
