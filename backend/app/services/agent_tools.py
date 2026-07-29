TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read a file's contents. Returns numbered lines.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "File path relative to workspace"},
                    "offset": {"type": "integer", "description": "Line offset to start from (0-based)", "default": 0},
                    "limit": {"type": "integer", "description": "Max lines to read", "default": 200},
                },
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": (
                "Create a NEW file with the given content. Not for changing an existing "
                "file — use edit_file for that; writing over a file replaces everything "
                "in it, including the parts you didn't mean to change."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "File path relative to workspace"},
                    "content": {"type": "string", "description": "Full file content to write"},
                },
                "required": ["path", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "edit_file",
            "description": (
                "Change part of an existing file by replacing old_text with new_text. "
                "Read the file first and copy old_text from what you read, including "
                "whitespace and indentation, with 2-3 lines of surrounding context so it "
                "matches exactly one place in the file."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "File path relative to workspace"},
                    "old_text": {"type": "string", "description": "Exact text to find and replace"},
                    "new_text": {"type": "string", "description": "Replacement text"},
                    "replace_all": {
                        "type": "boolean",
                        "description": "Replace every occurrence instead of requiring a unique match",
                        "default": False,
                    },
                },
                "required": ["path", "old_text", "new_text"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "bash",
            "description": "Run a shell command. Returns stdout, stderr, and exit code.",
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {"type": "string", "description": "Shell command to execute"},
                    "timeout": {"type": "integer", "description": "Timeout in seconds", "default": 120},
                },
                "required": ["command"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "grep",
            "description": "Search for a regex pattern in files.",
            "parameters": {
                "type": "object",
                "properties": {
                    "pattern": {"type": "string", "description": "Regex pattern to search for"},
                    "path": {"type": "string", "description": "Directory or file to search in", "default": "."},
                    "glob": {"type": "string", "description": "File glob filter", "default": "*"},
                },
                "required": ["pattern"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "glob",
            "description": "Find files matching a glob pattern.",
            "parameters": {
                "type": "object",
                "properties": {
                    "pattern": {"type": "string", "description": "Glob pattern (e.g. '**/*.py')"},
                    "path": {"type": "string", "description": "Base directory", "default": "."},
                },
                "required": ["pattern"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "ls",
            "description": "List directory contents with file types and sizes.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Directory path", "default": "."},
                },
            },
        },
    },
]

TOOL_NAMES = {t["function"]["name"] for t in TOOL_DEFINITIONS}


TOOL_SYSTEM_PROMPT = """## Coding agent mode

You are operating as a coding agent on the user's own machine. Your tools run
there for real: files you write are written, commands you run execute. Work like
an engineer with a terminal open, not like a chat assistant describing what
someone else should type.

### Finish the job
- Keep working until the request is actually resolved. Do not stop at a plan, and
  do not hand back "you could now run X" when running X is your job.
- When you say you are going to make a tool call, make it in the same turn. Never
  end a turn announcing an action you did not take.
- Only stop early to ask the user something you genuinely cannot determine
  yourself, or when a step would be destructive and they haven't authorized it.

### Before you change anything
- Find out how the code actually works first: grep for the symbol, glob for the
  files, read the ones that matter. Do not infer a file's contents from its name.
- For anything spanning more than one or two files, state a short plan first —
  what you'll change, in which files, and how you'll verify it — then execute it.
  Adjust the plan out loud if what you find contradicts it.

### Editing
- read_file before edit_file, every time. old_text must be copied from what you
  read, byte for byte, including indentation.
- Include 2-3 lines of surrounding context in old_text so it matches exactly one
  place. If an edit reports multiple matches, add more context — don't guess.
- edit_file is for existing files; write_file is for new ones. If an edit fails,
  re-read the file and retry the edit. Never fall back to write_file to "fix" a
  failed edit: that replaces the entire file and silently drops everything you
  didn't reproduce.
- One edit per logical change. Several small, verifiable edits beat one large one.

### Verifying
- After changing code, actually check it: run the project's tests, linter, type
  checker, or build — whatever it already uses. Find the command (package.json,
  Makefile, pyproject.toml) rather than assuming one.
- If a command fails, read the error and fix the cause. Don't repeat the identical
  call and hope; if something fails twice the same way, change approach.
- Never commit or push unless the user asked you to.

### Tools
- Prefer the file tools over shell equivalents: read_file over `cat`, edit_file
  over `sed`, grep over `grep`, glob over `find`. They're sandboxed and give
  structured results.
- Use bash for what only a shell can do: running tests, builds, installs, git.
- Independent lookups can go in one turn; don't serialize what doesn't depend on
  the previous result.

### Reporting
- Be brief. Say what you changed and what you verified, not a narration of every
  call — the user can see the tool calls.
- Reference code as `path/to/file.py:42` so it's clickable.
- If you couldn't finish part of the task, say exactly which part and why."""


def build_environment_block(agent=None) -> str:
    """Runtime facts the model otherwise has to guess at or ask for.

    Without this the model doesn't know which OS it's on (so it guesses shell
    syntax), doesn't know the workspace root (so it invents absolute paths), and
    doesn't know today's date. All three produce failed tool calls on turn one.
    """
    from datetime import datetime, timezone

    lines = [f"Date: {datetime.now(timezone.utc).strftime('%Y-%m-%d')}"]
    if agent is not None:
        if getattr(agent, "workspace", None):
            lines.append(f"Working directory: {agent.workspace}")
        if getattr(agent, "os", None):
            lines.append(f"Operating system: {agent.os}")
        if getattr(agent, "name", None):
            lines.append(f"Machine: {agent.name}")
    return "## Environment\n" + "\n".join(f"- {ln}" for ln in lines)
