import os


class SandboxError(Exception):
    pass


def resolve_path(workspace: str, path: str) -> str:
    """Resolve path relative to workspace, block escape attempts."""
    if os.path.isabs(path):
        resolved = os.path.realpath(path)
    else:
        resolved = os.path.realpath(os.path.join(workspace, path))
    workspace_real = os.path.realpath(workspace)
    if not resolved.startswith(workspace_real + os.sep) and resolved != workspace_real:
        raise SandboxError(f"Path '{path}' escapes workspace")
    return resolved
