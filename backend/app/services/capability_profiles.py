"""Per-model capability profiles — how much correction the harness applies.

Switchboard is a multi-model gateway, not a small-model tool. The same agent loop
and the same tool set serve a Qwen3-14B on a hobby GPU and a frontier model behind
someone's own API key. What must differ is the safety net: a small local model
needs its tool calls recovered from prose, its whole-file rewrites refused, and a
wide fuzzy net under every edit; a frontier model emits near-exact text and every
one of those corrections is either dead weight or an extra chance to guess wrong.

So each reliability mechanism is a per-model setting resolved from the model id:

    model id → profile → { edit_fuzz, write_guard, read_before_edit,
                           parse_text_toolcalls, max_turns, temperature }

Resolution order is exact id → separator-insensitive prefix → the locality default
(local vs bring-your-own-key), so `qwen3-14b-instruct` picks up the `qwen3` entry
and an unknown model still lands somewhere sensible. Operators can add or override
entries with the AGENT_MODEL_PROFILES env var without touching this file.
"""

import json
import logging
import os
from dataclasses import dataclass, replace as _dc_replace

log = logging.getLogger("switchboard.profiles")


@dataclass(frozen=True)
class CapabilityProfile:
    name: str = "default"
    # off | low | medium | high — how far the agent's edit tool escalates its
    # replacer ladder before giving up (see agent/switchboard_agent/edit_engine.py).
    edit_fuzz: str = "medium"
    # off | soft | on — refuse write_file on a file that already exists.
    write_guard: str = "off"
    # Block edit_file on a file this conversation hasn't read.
    read_before_edit: bool = False
    # Recover tool calls the model emitted as text instead of native tool_calls.
    parse_text_toolcalls: bool = False
    # Assistant steps per user turn before the loop wraps up.
    max_turns: int = 10
    # Pin sampling temperature (local servers default to ~0.8, which adds real
    # variance on exact-text edits). None = leave the caller's value alone.
    temperature: float | None = None

    def tool_policy(self) -> dict:
        """The subset the remote agent needs, sent alongside each tool call."""
        return {"edit_fuzz": self.edit_fuzz, "write_guard": self.write_guard}


# A local model on the user's own GPU: assume it needs the full net.
LOCAL_DEFAULT = CapabilityProfile(
    name="local-default",
    edit_fuzz="high",
    write_guard="on",
    read_before_edit=True,
    parse_text_toolcalls=True,
    max_turns=12,
    temperature=0.3,
)

# Bring-your-own-key, i.e. someone else's hosted model. Almost always frontier
# class with solid native function-calling — correct lightly, stay out of the way.
REMOTE_DEFAULT = CapabilityProfile(
    name="remote-default",
    edit_fuzz="medium",
    write_guard="soft",
    read_before_edit=False,
    parse_text_toolcalls=False,
    max_turns=10,
)

# Keys are matched as prefixes after separator normalization, so "qwen3" covers
# "Qwen3-14B", "qwen3:14b-instruct", "qwen3.5-32b", and so on.
BUILTIN_PROFILES: dict[str, CapabilityProfile] = {
    "qwen3": _dc_replace(LOCAL_DEFAULT, name="qwen3"),
    "qwen2": _dc_replace(LOCAL_DEFAULT, name="qwen2"),
    "llama": _dc_replace(LOCAL_DEFAULT, name="llama", edit_fuzz="medium", temperature=None),
    "mistral": _dc_replace(LOCAL_DEFAULT, name="mistral", edit_fuzz="medium"),
    "gemma": _dc_replace(LOCAL_DEFAULT, name="gemma", edit_fuzz="medium"),
    "deepseek": _dc_replace(LOCAL_DEFAULT, name="deepseek", edit_fuzz="medium", temperature=None),
    # Larger open models: native tool-calling is reliable enough to stop parsing prose.
    "gpt-oss": _dc_replace(LOCAL_DEFAULT, name="gpt-oss", edit_fuzz="medium",
                           parse_text_toolcalls=False, write_guard="soft", temperature=None),
    # Frontier, reached through the user's own key.
    "claude": _dc_replace(REMOTE_DEFAULT, name="claude", edit_fuzz="low", write_guard="off"),
    "gpt-4": _dc_replace(REMOTE_DEFAULT, name="gpt-4", edit_fuzz="low"),
    "gpt-5": _dc_replace(REMOTE_DEFAULT, name="gpt-5", edit_fuzz="low"),
    "o1": _dc_replace(REMOTE_DEFAULT, name="o1", edit_fuzz="low"),
    "o3": _dc_replace(REMOTE_DEFAULT, name="o3", edit_fuzz="low"),
    "gemini": _dc_replace(REMOTE_DEFAULT, name="gemini", edit_fuzz="low"),
}

_VALID_FUZZ = {"off", "low", "medium", "high"}
_VALID_GUARD = {"off", "soft", "on"}


def _norm(s: str) -> str:
    """Separator-insensitive key. Without this, a profile written `qwen3-14b`
    silently fails to match a runtime id of `qwen3:14b` and every model falls
    through to the default."""
    return s.replace(":", "-").replace("_", "-").replace("/", "-").lower()


def _from_dict(name: str, data: dict, base: CapabilityProfile) -> CapabilityProfile:
    p = _dc_replace(base, name=name)
    if data.get("edit_fuzz") in _VALID_FUZZ:
        p = _dc_replace(p, edit_fuzz=data["edit_fuzz"])
    if data.get("write_guard") in _VALID_GUARD:
        p = _dc_replace(p, write_guard=data["write_guard"])
    for key in ("read_before_edit", "parse_text_toolcalls"):
        if isinstance(data.get(key), bool):
            p = _dc_replace(p, **{key: data[key]})
    if isinstance(data.get("max_turns"), int) and 1 <= data["max_turns"] <= 50:
        p = _dc_replace(p, max_turns=data["max_turns"])
    if isinstance(data.get("temperature"), (int, float)):
        p = _dc_replace(p, temperature=float(data["temperature"]))
    elif data.get("temperature", "missing") is None:
        p = _dc_replace(p, temperature=None)
    return p


def _load_overrides() -> dict[str, CapabilityProfile]:
    """AGENT_MODEL_PROFILES: a JSON object of {model-key: {field: value}}, merged
    over the built-ins so an operator can retune a model without a code change."""
    raw = os.environ.get("AGENT_MODEL_PROFILES", "").strip()
    if not raw:
        return {}
    try:
        data = json.loads(raw)
        if not isinstance(data, dict):
            raise ValueError("expected a JSON object")
    except Exception as e:
        log.warning("Ignoring AGENT_MODEL_PROFILES: %s", e)
        return {}

    out: dict[str, CapabilityProfile] = {}
    for key, val in data.items():
        if not isinstance(val, dict):
            continue
        base = BUILTIN_PROFILES.get(key) or LOCAL_DEFAULT
        out[key] = _from_dict(key, val, base)
    return out


_overrides: dict[str, CapabilityProfile] | None = None


def _all_profiles() -> dict[str, CapabilityProfile]:
    global _overrides
    if _overrides is None:
        _overrides = _load_overrides()
    return {**BUILTIN_PROFILES, **_overrides}


def resolve_profile(model: str | None, is_local: bool = True) -> CapabilityProfile:
    """Pick the profile for a model id: exact → prefix → locality default."""
    default = LOCAL_DEFAULT if is_local else REMOTE_DEFAULT
    if not model:
        return default

    profiles = _all_profiles()
    if model in profiles:
        return profiles[model]

    target = _norm(model)
    # Longest key first, so `gpt-oss` wins over a hypothetical `gpt` entry.
    for key in sorted(profiles, key=len, reverse=True):
        if target.startswith(_norm(key)):
            return profiles[key]
    return default
