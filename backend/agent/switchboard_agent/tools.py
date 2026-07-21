import os
import re
import subprocess
import json
from pathlib import Path
from .sandbox import resolve_path, SandboxError

MAX_FILE_SIZE = 1024 * 1024  # 1MB read limit
MAX_BASH_TIMEOUT = 600


def read_file(workspace: str, params: dict) -> dict:
    path = resolve_path(workspace, params["path"])
    offset = params.get("offset", 0)
    limit = params.get("limit", 2000)
    try:
        with open(path, "r", errors="replace") as f:
            lines = f.readlines()
        total = len(lines)
        selected = lines[offset:offset + limit]
        content = "".join(f"{offset + i + 1}\t{line}" for i, line in enumerate(selected))
        return {"content": content, "total_lines": total, "showing": f"{offset+1}-{min(offset+limit, total)}"}
    except Exception as e:
        return {"error": str(e)}


def write_file(workspace: str, params: dict) -> dict:
    path = resolve_path(workspace, params["path"])
    content = params["content"]
    create_dirs = params.get("create_dirs", True)
    try:
        if create_dirs:
            os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as f:
            f.write(content)
        return {"written": len(content), "path": params["path"]}
    except Exception as e:
        return {"error": str(e)}


def edit_file(workspace: str, params: dict) -> dict:
    path = resolve_path(workspace, params["path"])
    old_text = params["old_text"]
    new_text = params["new_text"]
    try:
        with open(path, "r") as f:
            content = f.read()
        if old_text not in content:
            # Fuzzy fallback — try stripped whitespace match
            stripped_old = "\n".join(line.rstrip() for line in old_text.split("\n"))
            stripped_content = "\n".join(line.rstrip() for line in content.split("\n"))
            if stripped_old in stripped_content:
                idx = stripped_content.index(stripped_old)
                lines_before = stripped_content[:idx].count("\n")
                lines_in = stripped_old.count("\n") + 1
                original_lines = content.split("\n")
                before = "\n".join(original_lines[:lines_before])
                after = "\n".join(original_lines[lines_before + lines_in:])
                content = before + ("\n" if before else "") + new_text + ("\n" if after else "") + after
            else:
                return {"error": f"old_text not found in {params['path']}"}
        else:
            content = content.replace(old_text, new_text, 1)
        with open(path, "w") as f:
            f.write(content)
        return {"edited": params["path"]}
    except Exception as e:
        return {"error": str(e)}


def bash(workspace: str, params: dict) -> dict:
    command = params["command"]
    timeout = min(params.get("timeout", 120), MAX_BASH_TIMEOUT)
    try:
        result = subprocess.run(
            command, shell=True, cwd=workspace,
            capture_output=True, text=True, timeout=timeout,
        )
        output = result.stdout
        if result.stderr:
            output += ("\n" if output else "") + result.stderr
        if len(output) > 50000:
            output = output[:50000] + "\n... (truncated)"
        return {"exit_code": result.returncode, "output": output}
    except subprocess.TimeoutExpired:
        return {"error": f"Command timed out after {timeout}s"}
    except Exception as e:
        return {"error": str(e)}


def grep(workspace: str, params: dict) -> dict:
    pattern = params["pattern"]
    search_path = resolve_path(workspace, params.get("path", "."))
    glob_filter = params.get("glob", "*")
    context = params.get("context", 0)
    try:
        regex = re.compile(pattern)
    except re.error as e:
        return {"error": f"Invalid regex: {e}"}
    results = []
    search = Path(search_path)
    files = search.rglob(glob_filter) if search.is_dir() else [search]
    for fp in files:
        if not fp.is_file() or fp.stat().st_size > MAX_FILE_SIZE:
            continue
        try:
            lines = fp.read_text(errors="replace").split("\n")
            for i, line in enumerate(lines):
                if regex.search(line):
                    match_lines = []
                    start = max(0, i - context)
                    end = min(len(lines), i + context + 1)
                    for j in range(start, end):
                        match_lines.append(f"{j+1}: {lines[j]}")
                    results.append({"file": str(fp.relative_to(workspace)), "matches": match_lines})
                    if len(results) >= 50:
                        return {"results": results, "truncated": True}
        except Exception:
            continue
    return {"results": results, "total": len(results)}


def glob_search(workspace: str, params: dict) -> dict:
    pattern = params["pattern"]
    search_path = resolve_path(workspace, params.get("path", "."))
    try:
        p = Path(search_path)
        matches = sorted(p.glob(pattern), key=lambda x: x.stat().st_mtime if x.exists() else 0, reverse=True)
        files = []
        for m in matches[:100]:
            try:
                rel = str(m.relative_to(workspace))
                stat = m.stat()
                files.append({"path": rel, "size": stat.st_size, "is_dir": m.is_dir()})
            except Exception:
                continue
        return {"files": files, "total": len(matches)}
    except Exception as e:
        return {"error": str(e)}


def ls(workspace: str, params: dict) -> dict:
    path = resolve_path(workspace, params.get("path", "."))
    try:
        entries = []
        for name in sorted(os.listdir(path)):
            full = os.path.join(path, name)
            try:
                stat = os.stat(full)
                entries.append({
                    "name": name,
                    "type": "dir" if os.path.isdir(full) else "file",
                    "size": stat.st_size,
                })
            except Exception:
                entries.append({"name": name, "type": "unknown", "size": 0})
        return {"entries": entries, "path": params.get("path", ".")}
    except Exception as e:
        return {"error": str(e)}


TOOLS = {
    "read_file": read_file,
    "write_file": write_file,
    "edit_file": edit_file,
    "bash": bash,
    "grep": grep,
    "glob": glob_search,
    "ls": ls,
}

TOOL_NAMES = list(TOOLS.keys())
