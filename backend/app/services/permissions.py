"""Permission rules and modes for the agentic loop.

Ported from OpenCode's `permission/index.ts` + the mode definitions in
`agent/agent.ts`. The shape is deliberately simple:

    (permission, pattern) -> allow | ask | deny        last match wins

`permission` is an abstract capability (`read`, `edit`, `bash`), not a tool name,
so adding a tool doesn't mean writing new rules. `pattern` is the thing being
acted on — a path for read/edit, a command prefix for bash.

A **mode** is nothing more than a named ruleset. That is the whole design:
"auto", "manual" and "readonly" differ only in which rules they stack on top of
the shared defaults, so there is one evaluator to reason about and to get right.

Rules are ordered and the LAST match wins, which is what makes the carve-out
style readable:

    read: {"*": "allow", "*.env": "ask", "*.env.example": "allow"}

reads as "allow everything, except .env files, except the example one".

Note the two different defaults. `evaluate()` falls back to `ask` when no rule
matches at all — the safe answer for a capability nobody has configured. That is
separate from the *auto* mode's explicit `"*": "allow"`, which is a real rule and
deliberately permissive. Conflating the two makes auto mode silently
interrogative, which is exactly what users turn modes off to avoid.
"""

from dataclasses import dataclass
from fnmatch import fnmatch

Action = str  # "allow" | "ask" | "deny"

VALID_ACTIONS = {"allow", "ask", "deny"}


@dataclass(frozen=True)
class Rule:
    permission: str
    pattern: str
    action: Action


Ruleset = list[Rule]


# ---------- tool → capability ----------

# Several tools map to one capability so rules stay about *what is being done*
# rather than which tool happened to do it. A user who denies `edit` means "don't
# change my files", and that has to hold whether the model reaches for edit_file
# or write_file.
TOOL_PERMISSION: dict[str, str] = {
    "read_file": "read",
    "grep": "read",
    "glob": "read",
    "ls": "read",
    "write_file": "edit",
    "edit_file": "edit",
    "bash": "bash",
}


def permission_for(tool: str) -> str:
    return TOOL_PERMISSION.get(tool, tool)


# ---------- evaluation ----------

def evaluate(permission: str, pattern: str, *rulesets: Ruleset) -> Rule:
    """Resolve one (permission, pattern) against the given rulesets, last match wins.

    Falls back to `ask` when nothing matches: an unconfigured capability should
    surface to the user, never silently proceed.
    """
    match: Rule | None = None
    for rule in [r for rs in rulesets for r in rs]:
        if fnmatch(permission, rule.permission) and fnmatch(pattern, rule.pattern):
            match = rule
    return match or Rule(permission=permission, pattern="*", action="ask")


def from_config(config: dict) -> Ruleset:
    """Build a ruleset from the nested dict form.

        {"read": {"*": "allow", "*.env": "ask"}, "bash": "ask"}

    A bare string is shorthand for `{"*": action}`. Invalid actions are dropped
    rather than raising — a malformed user override must not take the agent down,
    and a dropped rule falls through to a stricter default.
    """
    out: Ruleset = []
    for permission, value in config.items():
        if isinstance(value, str):
            if value in VALID_ACTIONS:
                out.append(Rule(permission, "*", value))
            continue
        if not isinstance(value, dict):
            continue
        for pattern, action in value.items():
            if action in VALID_ACTIONS:
                out.append(Rule(permission, pattern, action))
    return out


def merge(*rulesets: Ruleset) -> Ruleset:
    return [r for rs in rulesets for r in rs]


# ---------- what counts as sensitive ----------

# Reading these is how a coding agent turns into a credential harvester, and it
# is rarely what the user meant. Ask rather than deny: reading a .env is a
# legitimate thing to want, it just shouldn't happen without the user seeing it.
SECRET_PATTERNS = [
    "*.env", "*.env.*", ".env", ".env.*",
    "*id_rsa*", "*id_ed25519*", "*id_ecdsa*", "*.pem", "*.key", "*.pfx", "*.p12",
    "*.ssh/*", "*/.ssh/*", "*.aws/credentials", "*/.aws/*",
    "*.npmrc", "*.pypirc", "*.netrc", "*credentials.json", "*service-account*.json",
]

# `.env.example` and friends are templates checked into the repo — asking about
# them is pure noise, and noise is what trains users to click through prompts.
SECRET_EXCEPTIONS = ["*.env.example", "*.env.sample", "*.env.template", "*.env.dist"]

# Commands worth a second look even in auto mode. Matched against the derived
# command prefix, not the raw string — see command_prefix().
DESTRUCTIVE_COMMANDS = [
    "rm", "rmdir", "shred", "dd",
    "git push", "git reset", "git clean", "git checkout", "git restore",
    "git rebase", "git branch", "git stash",
    "npm publish", "yarn publish", "pnpm publish", "cargo publish", "twine",
    "docker", "kubectl", "terraform", "aws", "gcloud", "az",
    "chmod", "chown", "mkfs", "mount", "umount",
    "curl", "wget",
    "sudo", "su", "systemctl", "service", "kill", "killall", "pkill",
    "shutdown", "reboot", "halt",
]


def _secret_rules(action: Action = "ask") -> Ruleset:
    rules = [Rule("read", p, action) for p in SECRET_PATTERNS]
    rules += [Rule("read", p, "allow") for p in SECRET_EXCEPTIONS]
    return rules


def _destructive_rules(action: Action = "ask") -> Ruleset:
    return [Rule("bash", f"{c}*", action) for c in DESTRUCTIVE_COMMANDS]


# ---------- modes ----------

# Shared by every mode. Anything a mode doesn't explicitly override lands here.
_DEFAULTS: Ruleset = merge(
    from_config({
        "doom_loop": "ask",
        # Touching anything outside the agent's workspace always surfaces,
        # whatever the mode. The workspace is the boundary the user agreed to.
        "external_directory": "ask",
    }),
)

MODES: dict[str, Ruleset] = {
    # "The AI does all of it" — but not silently, for the handful of actions that
    # are expensive to undo or that leak credentials.
    "auto": merge(
        _DEFAULTS,
        from_config({"read": "allow", "edit": "allow", "bash": "allow"}),
        _secret_rules("ask"),
        _destructive_rules("ask"),
    ),
    # "Ask me before you change anything." Reads still flow so the agent can
    # investigate without a prompt per file — otherwise the mode is unusable.
    "manual": merge(
        _DEFAULTS,
        from_config({"read": "allow", "edit": "ask", "bash": "ask"}),
        _secret_rules("ask"),
    ),
    # Explore safely: look at anything, change nothing. Denials are hard, so the
    # model is told no rather than the user being asked.
    "readonly": merge(
        _DEFAULTS,
        from_config({"read": "allow", "edit": "deny", "bash": "deny"}),
        _secret_rules("ask"),
    ),
}

DEFAULT_MODE = "auto"


def mode_ruleset(mode: str | None) -> Ruleset:
    return MODES.get(mode or DEFAULT_MODE, MODES[DEFAULT_MODE])


# ---------- deriving the pattern to match ----------

def command_prefix(command: str) -> str:
    """The human-meaningful head of a shell command.

    Port of OpenCode's `BashArity.prefix`. Matching on the raw command string is
    useless for approval — `npm run dev` and `npm publish` share no useful
    prefix, and "always allow this command" has to mean something narrower than
    "always allow npm". Subcommands count, flags never do.
    """
    tokens = [t for t in command.strip().split() if not t.startswith("-")]
    if not tokens:
        return command.strip()
    for length in range(len(tokens), 0, -1):
        head = " ".join(tokens[:length])
        arity = ARITY.get(head)
        if arity is not None:
            return " ".join(tokens[:arity])
    return tokens[0]


# How many tokens define the command. Only entries whose arity differs from what
# the shorter prefix implies need listing.
ARITY: dict[str, int] = {
    "apt": 2, "apt-get": 2, "brew": 2, "cargo": 2, "composer": 2, "docker": 2,
    "docker compose": 3, "gem": 2, "git": 2, "go": 2, "gradle": 2, "helm": 2,
    "kubectl": 2, "make": 2, "mvn": 2, "npm": 2, "npm run": 3, "npx": 2,
    "pip": 2, "pip3": 2, "pnpm": 2, "pnpm run": 3, "poetry": 2, "systemctl": 2,
    "terraform": 2, "uv": 2, "uv run": 3, "yarn": 2, "yarn run": 3,
    "aws": 2, "gcloud": 2, "az": 2, "bundle": 2, "rake": 2, "dotnet": 2,
}


def split_segments(command: str) -> list[str]:
    """Split a shell command on chaining operators, ignoring quoted regions.

    Without this the whole control is bypassable in one line: `npm test && rm -rf /`
    has the prefix `npm test`, so a rule that allows the test runner would wave
    through everything chained behind it. Each segment has to stand on its own.
    """
    parts: list[str] = []
    cur: list[str] = []
    quote: str | None = None
    esc = False
    i = 0
    while i < len(command):
        c = command[i]
        if quote:
            cur.append(c)
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == quote:
                quote = None
            i += 1
            continue
        if c in "'\"":
            quote = c
            cur.append(c)
            i += 1
            continue
        two = command[i:i + 2]
        if two in ("&&", "||"):
            parts.append("".join(cur))
            cur = []
            i += 2
            continue
        if c in ";|\n":
            parts.append("".join(cur))
            cur = []
            i += 1
            continue
        cur.append(c)
        i += 1
    parts.append("".join(cur))
    return [p.strip() for p in parts if p.strip()]


# Shell redirection reaches the filesystem without going near write_file, which
# is how a refused write becomes `cat > file << EOF`. Route those through the
# `edit` capability so one rule governs "may this change my files".
_WRITE_REDIRECT = (">", ">>")


def writes_via_shell(command: str) -> bool:
    """True when a segment redirects output into a file."""
    quote: str | None = None
    esc = False
    for i, c in enumerate(command):
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
        elif c == ">" and command[i - 1:i] != "2":
            return True
    return False


def patterns_for(tool: str, params: dict) -> list[str]:
    """Every pattern this call must satisfy. A call is only as permitted as its
    strictest segment."""
    if tool == "bash":
        segments = split_segments(str(params.get("command") or ""))
        return [command_prefix(s) for s in segments] or ["*"]
    return [pattern_for(tool, params)]


def pattern_for(tool: str, params: dict) -> str:
    """What to match a rule against for this call (first/primary pattern)."""
    if tool == "bash":
        return command_prefix(str(params.get("command") or ""))
    path = params.get("path")
    return str(path) if isinstance(path, str) and path else "*"


# Strictest wins when a call spans several patterns.
_SEVERITY = {"allow": 0, "ask": 1, "deny": 2}


def evaluate_call(tool: str, params: dict, *rulesets: Ruleset) -> Rule:
    """Resolve a whole tool call, accounting for chained shell segments and for
    shell redirection counting as an edit."""
    permission = permission_for(tool)
    worst: Rule | None = None
    for pattern in patterns_for(tool, params):
        rule = evaluate(permission, pattern, *rulesets)
        if worst is None or _SEVERITY[rule.action] > _SEVERITY[worst.action]:
            worst = rule
    if tool == "bash" and writes_via_shell(str(params.get("command") or "")):
        edit_rule = evaluate("edit", "*", *rulesets)
        if worst is None or _SEVERITY[edit_rule.action] > _SEVERITY[worst.action]:
            worst = edit_rule
    return worst or Rule(permission, "*", "ask")


def always_pattern(tool: str, params: dict) -> str:
    """The pattern an "always allow" grant should cover.

    Deliberately wider than the exact call — approving one `npm run test` should
    not re-prompt on the next one — but never wider than the command family, so
    approving `npm run test` cannot silently authorise `npm publish`.
    """
    if tool == "bash":
        return command_prefix(str(params.get("command") or "")) + "*"
    return pattern_for(tool, params)
