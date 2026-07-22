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
            "description": "Create or overwrite a file with content.",
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
            "description": "Edit a file by replacing old_text with new_text. Use for targeted changes.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "File path relative to workspace"},
                    "old_text": {"type": "string", "description": "Exact text to find and replace"},
                    "new_text": {"type": "string", "description": "Replacement text"},
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

TOOL_SYSTEM_PROMPT = """## Agent Tools
You have access to tools on the user's machine. Use them to read, write, edit files and run commands.

Guidelines:
- Read files before editing to understand the context
- Use edit_file for targeted changes (find and replace), write_file for new files
- Run bash commands to test, build, install dependencies
- Use grep to search for code patterns, glob to find files
- Always explain what you're doing before and after tool calls
- If a tool call fails, explain the error and try an alternative approach"""
