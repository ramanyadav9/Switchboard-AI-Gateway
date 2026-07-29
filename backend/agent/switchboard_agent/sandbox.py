import os
import re

# Windows reserved device names. A file whose basename is one of these (with or
# without an extension, any case) resolves to a DOS device rather than a real
# file, leaving an undeletable junk entry behind. We refuse them on every OS so a
# Linux/macOS agent can't author a landmine that detonates when the repo is
# cloned on Windows — and because it is almost always a model mistaking `nul`
# for `/dev/null`.
RESERVED_DEVICE_NAMES = (
    {"con", "prn", "aux", "nul"}
    | {f"com{i}" for i in range(1, 10)}
    | {f"lpt{i}" for i in range(1, 10)}
)


class SandboxError(Exception):
    pass


def is_reserved_device_name(path: str) -> bool:
    base = os.path.basename(path.replace("\\", "/")).lower()
    stem = base.split(".", 1)[0] if "." in base else base
    return stem in RESERVED_DEVICE_NAMES


def normalize_path(path: str) -> str:
    """Rewrite a root-anchored bare filename to a workspace-relative one.

    Models given a "path" schema and no obvious directory context have a habit of
    anchoring at the filesystem root — `/notes.md` when they mean `notes.md` in
    the workspace. A genuine system path always has at least one intermediate
    directory (`/etc/x`, `/tmp/y/z`), so root + bare filename is a mistake worth
    correcting rather than a sandbox violation worth failing on.
    """
    if re.fullmatch(r"[/\\][^/\\]+", path):
        return path[1:]
    return path


def resolve_path(workspace: str, path: str) -> str:
    """Resolve path relative to workspace, block escape attempts."""
    path = normalize_path(path)
    if os.path.isabs(path):
        resolved = os.path.realpath(path)
    else:
        resolved = os.path.realpath(os.path.join(workspace, path))
    workspace_real = os.path.realpath(workspace)
    if not resolved.startswith(workspace_real + os.sep) and resolved != workspace_real:
        raise SandboxError(f"Path '{path}' escapes workspace")
    return resolved
