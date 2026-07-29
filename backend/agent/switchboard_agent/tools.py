import os
import re
import subprocess
import json
from pathlib import Path
from .sandbox import resolve_path, is_reserved_device_name, SandboxError
from .edit_engine import replace, EditError

MAX_FILE_SIZE = 1024 * 1024  # 1MB read limit
MAX_BASH_TIMEOUT = 600

BOM = "﻿"


def _policy(params: dict) -> dict:
    """Per-call policy the backend attaches from the model's capability profile.

    It rides in `params` under a reserved key rather than in the transport
    envelope so an older agent simply ignores it (degrading to no guards) instead
    of failing to parse the tool call.
    """
    pol = params.get("__policy")
    return pol if isinstance(pol, dict) else {}


def _read_text(path: str) -> tuple[str, str, bool]:
    """Return (text, line_ending, had_bom) — everything needed to write it back
    byte-identical apart from the edit itself."""
    with open(path, "rb") as f:
        raw = f.read()
    text = raw.decode("utf-8", errors="replace")
    had_bom = text.startswith(BOM)
    if had_bom:
        text = text[len(BOM):]
    ending = "\r\n" if "\r\n" in text else "\n"
    return text, ending, had_bom


def _write_text(path: str, text: str, had_bom: bool = False):
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write((BOM if had_bom else "") + text)


def read_file(workspace: str, params: dict) -> dict:
    path = resolve_path(workspace, params["path"])
    offset = params.get("offset", 0)
    limit = params.get("limit", 2000)
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            lines = f.readlines()
        total = len(lines)
        selected = lines[offset:offset + limit]
        content = "".join(f"{offset + i + 1}\t{line}" for i, line in enumerate(selected))
        # `resolved` lets the backend's read-before-edit guard key on the real
        # path, so `src/a.py` and `./src/a.py` count as the same file.
        return {"content": content, "total_lines": total,
                "showing": f"{offset+1}-{min(offset+limit, total)}", "resolved": path}
    except Exception as e:
        return {"error": str(e)}


def _write_refusal(path: str) -> str:
    return (
        f"write_file refused — {path} already exists.\n\n"
        "write_file creates NEW files only. To change an existing file use edit_file:\n"
        '  {"path": "<same path>", "old_text": "<exact text currently in the file>", '
        '"new_text": "<replacement>"}\n\n'
        "If you don't already know the file's current contents, read_file it first so "
        "old_text matches exactly (whitespace and indentation included), and include "
        "2-3 lines of surrounding context so old_text is unique. For several changes, "
        "issue one edit_file per location. Do NOT retry write_file — it will be "
        "refused again."
    )


def write_file(workspace: str, params: dict) -> dict:
    try:
        path = resolve_path(workspace, params["path"])
    except SandboxError as e:
        return {"error": str(e)}
    content = params["content"]
    create_dirs = params.get("create_dirs", True)
    guard = _policy(params).get("write_guard", "off")

    if is_reserved_device_name(path):
        return {"error": (
            f'"{os.path.basename(path)}" is a reserved device name (CON, PRN, AUX, NUL, '
            "COM1-9, LPT1-9). Writing it creates an undeletable junk file on Windows. "
            "Pick a normal filename, or don't write a file at all if you meant to "
            "discard the output."
        )}

    exists = os.path.exists(path)
    # Small models rewrite whole files when asked for a one-line change, silently
    # dropping everything they didn't think to reproduce. Refusing the overwrite
    # and handing back the edit_file call-shape is what keeps them honest.
    if exists and guard == "on":
        return {"error": _write_refusal(params["path"])}

    try:
        if create_dirs:
            os.makedirs(os.path.dirname(path), exist_ok=True)
        _write_text(path, content)
        result = {"written": len(content), "path": params["path"],
                  "resolved": path, "created": not exists}
        if exists and guard == "soft":
            result["note"] = (
                "Overwrote an existing file. Prefer edit_file for targeted changes — "
                "a full rewrite drops anything you didn't reproduce."
            )
        return result
    except Exception as e:
        return {"error": str(e)}


def edit_file(workspace: str, params: dict) -> dict:
    try:
        path = resolve_path(workspace, params["path"])
    except SandboxError as e:
        return {"error": str(e)}
    old_text = params["old_text"]
    new_text = params["new_text"]
    replace_all = bool(params.get("replace_all", False))
    fuzz = _policy(params).get("edit_fuzz", "medium")

    try:
        content, ending, had_bom = _read_text(path)
    except FileNotFoundError:
        return {"error": f"File not found: {params['path']}"}
    except Exception as e:
        return {"error": str(e)}

    # Compare in "\n" space so a model that emits LF text can still edit a CRLF
    # file, then convert the result back to whatever the file already used.
    normalized = content.replace("\r\n", "\n")
    old_n = old_text.replace("\r\n", "\n")
    new_n = new_text.replace("\r\n", "\n")
    exact = old_n in normalized

    try:
        updated = replace(normalized, old_n, new_n, replace_all=replace_all, fuzz=fuzz)
    except EditError as e:
        return {"error": str(e)}

    if ending == "\r\n":
        updated = updated.replace("\n", "\r\n")

    try:
        _write_text(path, updated, had_bom)
    except Exception as e:
        return {"error": str(e)}

    result = {"edited": params["path"], "resolved": path}
    if not exact:
        # Say so out loud: the model's old_text didn't match byte-for-byte, and it
        # should re-read rather than assume the file looks like it imagined.
        result["note"] = ("old_text did not match exactly; a fuzzy match was applied. "
                          "Re-read the file to confirm before further edits.")
    return result


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
