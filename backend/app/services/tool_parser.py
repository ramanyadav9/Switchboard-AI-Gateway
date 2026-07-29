"""Recover tool calls that a model emitted as text instead of native tool_calls.

Small local models routinely "describe" a tool call rather than emitting one
through the provider's function-calling channel — as a ```json fence, inside
<tool_call> tags, as a bare object, or (LiquidAI/LFM2) as a Python call list.
When that happens the turn is wasted: the loop sees no tool_calls, treats the
prose as the final answer, and stops.

This module turns that prose back into a call. Ported from little-coder's
output-parser, with one deliberate difference: little-coder can only *nudge* the
model back onto native calls, because it doesn't own the loop. We do own the
loop, so a recovered call is executed directly and the turn is saved.

Two layers:
  repair_json        — a ladder of increasingly aggressive fixes for the almost-
                       JSON these models produce (literal newlines inside
                       strings, trailing commas, single quotes, unquoted keys,
                       missing closing braces).
  parse_text_calls   — the four text encodings, checked in order of how
                       unambiguous they are.

Both are pure functions and never raise, so a parse failure degrades to "no
calls found" rather than breaking the stream.
"""

import json
import re

_TOOL_CALL_TAG = re.compile(r"<tool_call>\s*([\s\S]*?)\s*</tool_call>")
_FENCE = re.compile(r"```(?:tool_call|tool|json)\s*\n([\s\S]*?)\n```")
_BARE = re.compile(r'\{[^{}]*"name"\s*:\s*"(\w+)"[^{}]*\}')
_UNQUOTED_KEY = re.compile(r"(?<=[{,\s])(\w+)\s*:")

LIQUID_START = "<|tool_call_start|>"
LIQUID_END = "<|tool_call_end|>"


def escape_control_chars_in_strings(text: str) -> str:
    """Escape raw newlines/tabs that appear inside JSON string literals.

    This is by far the most common corruption: a model writes a multi-line file
    body as a `content` value with real newlines in it, which is invalid JSON but
    trivially recoverable — we just have to track whether we're inside a string.
    """
    out: list[str] = []
    in_string = False
    i = 0
    while i < len(text):
        ch = text[i]
        if ch == "\\" and in_string and i + 1 < len(text):
            out.append(ch)
            out.append(text[i + 1])
            i += 2
            continue
        if ch == '"':
            in_string = not in_string
            out.append(ch)
        elif in_string and ch == "\n":
            out.append("\\n")
        elif in_string and ch == "\t":
            out.append("\\t")
        elif in_string and ch == "\r":
            out.append("\\r")
        else:
            out.append(ch)
        i += 1
    return "".join(out)


def repair_json(raw: str) -> dict:
    """Parse `raw` as a JSON object, escalating through repairs. Never raises;
    returns {"_raw": raw} when nothing works."""
    trimmed = (raw or "").strip()
    if not trimmed:
        return {}

    def _try(text: str) -> dict | None:
        try:
            parsed = json.loads(text)
        except Exception:
            return None
        return parsed if isinstance(parsed, dict) else None

    got = _try(trimmed)
    if got is not None:
        return got

    fixed = escape_control_chars_in_strings(trimmed)
    got = _try(fixed)
    if got is not None:
        return got

    fixed = re.sub(r",\s*}", "}", fixed)
    fixed = re.sub(r",\s*]", "]", fixed)
    # Single→double quotes, but only when there are no double quotes to break.
    if '"' not in fixed and "'" in fixed:
        fixed = fixed.replace("'", '"')
    # Unquoted keys, but only when nothing is already quoted (else we'd corrupt
    # a `"url": "http://x"` value by quoting the `//x` after the colon).
    if '": ' not in fixed and '":"' not in fixed:
        fixed = _UNQUOTED_KEY.sub(r'"\1":', fixed)
    # Truncated tail — close whatever is still open.
    fixed += "}" * max(0, fixed.count("{") - fixed.count("}"))
    fixed += "]" * max(0, fixed.count("[") - fixed.count("]"))
    got = _try(fixed)
    if got is not None:
        return got

    m = re.search(r"\{[^{}]*\}", fixed)
    if m:
        got = _try(m.group(0))
        # Only take a *non-empty* object: our brace-balancing appends `{}` to
        # unclosed input, so accepting an empty one would turn arbitrary garbage
        # into a confident "a call with no arguments".
        if got:
            return got

    return {"_raw": raw}


def _args_of(data: dict) -> dict:
    for key in ("arguments", "input", "parameters", "args", "params"):
        val = data.get(key)
        if isinstance(val, dict):
            return val
        if isinstance(val, str):
            parsed = repair_json(val)
            if parsed and "_raw" not in parsed:
                return parsed
    # Some models inline the arguments as siblings of "name".
    return {k: v for k, v in data.items()
            if k not in ("name", "tool", "tool_name", "type", "id")}


def _name_of(data: dict) -> str | None:
    for key in ("name", "tool", "tool_name", "function"):
        val = data.get(key)
        if isinstance(val, str) and val:
            return val
        if isinstance(val, dict) and isinstance(val.get("name"), str):
            return val["name"]
    return None


# ---------- LFM2 / Liquid "Pythonic" calls ----------
# e.g. <|tool_call_start|>[read_file(path='a.py'), bash(command='ls')]<|tool_call_end|>

def _split_top_level(s: str, sep: str) -> list[str]:
    """Split on `sep`, ignoring separators inside quotes or brackets."""
    parts: list[str] = []
    depth = 0
    quote: str | None = None
    esc = False
    cur: list[str] = []
    for c in s:
        if quote:
            cur.append(c)
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == quote:
                quote = None
            continue
        if c in "'\"":
            quote = c
        elif c in "([{":
            depth += 1
        elif c in ")]}":
            depth -= 1
        elif c == sep and depth == 0:
            parts.append("".join(cur))
            cur = []
            continue
        cur.append(c)
    parts.append("".join(cur))
    return parts


def _top_level_index(s: str, ch: str) -> int:
    depth = 0
    quote: str | None = None
    esc = False
    for i, c in enumerate(s):
        if quote:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == quote:
                quote = None
            continue
        if c in "'\"":
            quote = c
        elif c in "([{":
            depth += 1
        elif c in ")]}":
            depth -= 1
        elif c == ch and depth == 0:
            return i
    return -1


_PY_ESCAPES = {"n": "\n", "t": "\t", "r": "\r", "'": "'", '"': '"', "\\": "\\"}


def _parse_py_value(raw: str):
    s = raw.strip()
    if not s:
        return None
    c0 = s[0]
    if c0 in "'\"":
        inner = s[1:-1] if len(s) >= 2 and s[-1] == c0 else s[1:]
        return re.sub(r"\\(['\"\\nrt])", lambda m: _PY_ESCAPES[m.group(1)], inner)
    if c0 == "{":
        parsed = repair_json(s)
        return s if "_raw" in parsed else parsed
    if c0 == "[":
        inner = s.strip()[1:-1] if s.strip().endswith("]") else s.strip()[1:]
        if not inner.strip():
            return []
        return [v for v in (_parse_py_value(p) for p in _split_top_level(inner, ",")) if v is not None]
    low = s.lower()
    if low == "true":
        return True
    if low == "false":
        return False
    if low in ("none", "null"):
        return None
    if re.fullmatch(r"[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?", s):
        return float(s) if ("." in s or "e" in low) else int(s)
    return s


def _parse_py_call(raw: str) -> tuple[str, dict] | None:
    s = raw.strip()
    open_idx = s.find("(")
    if open_idx < 0:
        return None
    name = s[:open_idx].strip()
    if not re.fullmatch(r"[A-Za-z_]\w*", name):
        return None

    depth = 0
    quote: str | None = None
    esc = False
    end = -1
    for i in range(open_idx, len(s)):
        c = s[i]
        if quote:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == quote:
                quote = None
            continue
        if c in "'\"":
            quote = c
        elif c == "(":
            depth += 1
        elif c == ")":
            depth -= 1
            if depth == 0:
                end = i
                break
    blob = s[open_idx + 1:end] if end >= 0 else s[open_idx + 1:]

    args: dict = {}
    for part in _split_top_level(blob, ","):
        seg = part.strip()
        if not seg:
            continue
        eq = _top_level_index(seg, "=")
        if eq < 0:
            continue  # positional/garbage — this format always emits kwargs
        key = seg[:eq].strip()
        if not re.fullmatch(r"[A-Za-z_]\w*", key):
            continue
        args[key] = _parse_py_value(seg[eq + 1:])
    return name, args


def parse_liquid_calls(text: str) -> list[dict]:
    has_start = LIQUID_START in text
    has_end = LIQUID_END in text
    if has_start or has_end:
        region = text
        if has_start:
            region = region[region.index(LIQUID_START) + len(LIQUID_START):]
        if LIQUID_END in region:
            region = region[:region.index(LIQUID_END)]
    else:
        # Without the special tokens, only fire when the whole message is a
        # bracket list — otherwise ordinary prose containing `f(x)` would trip it.
        # The opening <think> is optional: reasoning parsers routinely emit the
        # closing tag into content while the thinking itself went out separately.
        t = re.sub(r"^(?:<think>)?[\s\S]*?</think>\s*", "", text.strip()).strip()
        if not (t.startswith("[") and t.endswith("]")):
            return []
        region = t

    region = re.sub(r"<\|tool_call_(?:start|end)\|>", "", region)
    region = region.replace("<|im_end|>", "").strip()
    if region.startswith("["):
        region = region[1:]
    if region.endswith("]"):
        region = region[:-1]
    region = region.strip()
    if not region:
        return []

    calls = []
    for part in _split_top_level(region, ","):
        parsed = _parse_py_call(part)
        if parsed:
            calls.append({"name": parsed[0], "arguments": parsed[1], "format": "liquid"})
    return calls


def parse_text_calls(text: str, known_tools: set[str] | None = None) -> list[dict]:
    """Extract tool calls encoded as text. Returns [{name, arguments, format}].

    `known_tools` filters out hallucinated names — without it a model narrating
    `{"name": "the_plan"}` would be dispatched as a tool call.
    """
    if not text:
        return []

    calls: list[dict] = []

    def add(data: dict, fmt: str):
        name = _name_of(data)
        if name:
            calls.append({"name": name, "arguments": _args_of(data), "format": fmt})

    calls.extend(parse_liquid_calls(text))

    for m in _FENCE.finditer(text):
        add(repair_json(m.group(1)), "fenced")

    for m in _TOOL_CALL_TAG.finditer(text):
        add(repair_json(m.group(1)), "tag")

    # Bare objects are the loosest signal — only consider them when nothing more
    # explicit was found, so a fenced call isn't also matched a second time.
    if not calls:
        for m in _BARE.finditer(text):
            add(repair_json(m.group(0)), "bare")

    if known_tools is not None:
        calls = [c for c in calls if c["name"] in known_tools]

    # Drop calls whose arguments couldn't be recovered at all — dispatching those
    # produces a confusing tool error instead of a useful correction.
    return [c for c in calls if "_raw" not in c["arguments"]]


def strip_tool_call_text(text: str) -> str:
    """Remove the recovered call markup, leaving whatever prose surrounded it."""
    cleaned = _FENCE.sub("", text)
    cleaned = _TOOL_CALL_TAG.sub("", cleaned)
    cleaned = re.sub(
        re.escape(LIQUID_START) + r"[\s\S]*?" + re.escape(LIQUID_END), "", cleaned)
    cleaned = re.sub(r"<\|tool_call_(?:start|end)\|>|<\|im_end\|>", "", cleaned)
    return cleaned.strip()
