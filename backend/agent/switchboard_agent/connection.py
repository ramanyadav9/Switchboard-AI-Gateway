"""HTTP long-poll agent connection — no WebSocket, no persistent connection.

Flow:
  1. POST /api/agent/register → get agent_id + status
  2. If pending → poll /api/agent/poll until approved
  3. GET /api/agent/poll (long-poll, 30s) → receive tool_calls
  4. Execute tools locally
  5. POST /api/agent/result → send results back
  6. Repeat from 3
"""
import asyncio
import json
import logging
import platform
import time
from pathlib import Path
from urllib.parse import urljoin

logger = logging.getLogger("switchboard-agent")

try:
    import httpx
    HAS_HTTPX = True
except ImportError:
    HAS_HTTPX = False

try:
    from urllib.request import Request, urlopen
    from urllib.error import HTTPError, URLError
    import ssl
except ImportError:
    pass

from . import __version__
from .fingerprint import get_fingerprint
from .tools import TOOLS, TOOL_NAMES
from .permissions import check_permission, PermissionDenied


def _http_post(url: str, headers: dict, body: dict, timeout: float = 30) -> dict:
    """Simple HTTP POST using urllib (no dependencies)."""
    data = json.dumps(body).encode("utf-8")
    req = Request(url, data=data, headers={**headers, "Content-Type": "application/json"}, method="POST")
    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        with urlopen(req, timeout=timeout, context=ctx) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except HTTPError as e:
        body_text = e.read().decode("utf-8", errors="replace")
        try:
            return {"error": json.loads(body_text).get("detail", body_text)}
        except Exception:
            return {"error": f"HTTP {e.code}: {body_text[:200]}"}
    except (URLError, OSError) as e:
        return {"error": str(e)}


def _http_get(url: str, headers: dict, timeout: float = 35) -> dict:
    """Simple HTTP GET using urllib."""
    req = Request(url, headers=headers, method="GET")
    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        with urlopen(req, timeout=timeout, context=ctx) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except HTTPError as e:
        body_text = e.read().decode("utf-8", errors="replace")
        try:
            return {"error": json.loads(body_text).get("detail", body_text)}
        except Exception:
            return {"error": f"HTTP {e.code}: {body_text[:200]}"}
    except (URLError, OSError) as e:
        return {"error": str(e)}


class AgentConnection:
    def __init__(self, server_url: str, api_key: str, workspace: str, name: str | None = None):
        self.server_url = server_url.rstrip("/")
        self.api_key = api_key
        self.workspace = str(Path(workspace).resolve())
        self.name = name or platform.node()
        self.fingerprint = get_fingerprint()
        self.device_token = self._load_device_token()
        self.agent_id = None
        self._running = True

    def _config_path(self):
        return Path.home() / ".switchboard" / "config.json"

    def _load_device_token(self) -> str | None:
        try:
            data = json.loads(self._config_path().read_text())
            return data.get("device_token")
        except Exception:
            return None

    def _save_device_token(self, token: str):
        config_dir = Path.home() / ".switchboard"
        config_dir.mkdir(parents=True, exist_ok=True)
        config = {}
        try:
            config = json.loads(self._config_path().read_text())
        except Exception:
            pass
        config["device_token"] = token
        config["server_url"] = self.server_url
        config["api_key"] = self.api_key
        config["agent_name"] = self.name
        config["default_workspace"] = self.workspace
        config["fingerprint"] = self.fingerprint
        self._config_path().write_text(json.dumps(config, indent=2))

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self.api_key}"}

    def _url(self, path: str) -> str:
        return f"{self.server_url}{path}"

    async def connect(self):
        """Main loop: register → poll → execute → result → repeat."""
        backoff = 1

        while self._running:
            try:
                # Step 1: Register
                logger.info(f"Registering with {self.server_url}...")
                reg = _http_post(self._url("/api/agent/register"), self._headers(), {
                    "fingerprint": self.fingerprint,
                    "device_token": self.device_token,
                    "hostname": platform.node(),
                    "os": platform.system(),
                    "workspace": self.workspace,
                    "name": self.name,
                    "tools": TOOL_NAMES,
                    "agent_version": __version__,
                })

                if "error" in reg:
                    logger.error(f"Registration failed: {reg['error']}")
                    await asyncio.sleep(backoff)
                    backoff = min(backoff * 2, 30)
                    continue

                self.agent_id = reg["agent_id"]
                status = reg.get("status", "pending")
                backoff = 1

                if status == "pending":
                    logger.info("Waiting for approval in web UI...")

                # Step 2: If pending, poll until approved
                while self._running and status == "pending":
                    await asyncio.sleep(3)
                    resp = _http_get(
                        self._url(f"/api/agent/poll?agent_id={self.agent_id}"),
                        self._headers(), timeout=10,
                    )
                    if "error" in resp:
                        logger.warning(f"Poll error during approval: {resp['error']}")
                        continue
                    status = resp.get("status", "pending")
                    if status == "approved":
                        dt = resp.get("device_token")
                        if dt:
                            self.device_token = dt
                            self._save_device_token(dt)
                            logger.info("Approved! Device token saved.")
                        break
                    if status != "pending":
                        logger.info("Approved!")
                        break

                if not self._running:
                    break

                logger.info(f"Connected as agent {self.agent_id}")

                # Step 3: Main poll loop
                await self._poll_loop()

            except asyncio.CancelledError:
                break
            except Exception as e:
                if not self._running:
                    break
                logger.error(f"Connection error: {e}")
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30)

        logger.info("Agent stopped")

    async def _poll_loop(self):
        """Long-poll for tool calls, execute them, send results."""
        consecutive_errors = 0

        while self._running:
            try:
                resp = _http_get(
                    self._url(f"/api/agent/poll?agent_id={self.agent_id}"),
                    self._headers(), timeout=35,
                )

                if "error" in resp:
                    consecutive_errors += 1
                    if consecutive_errors > 5:
                        logger.error(f"Too many poll errors, re-registering...")
                        return  # breaks to outer loop which re-registers
                    logger.warning(f"Poll error: {resp['error']}")
                    await asyncio.sleep(2)
                    continue

                consecutive_errors = 0
                status = resp.get("status", "online")

                if status == "pending":
                    logger.info("Agent reverted to pending — waiting for approval...")
                    return

                tool_calls = resp.get("tool_calls", [])
                if not tool_calls:
                    continue  # empty poll, loop back

                # Execute tool calls
                for tc in tool_calls:
                    if not self._running:
                        break
                    await self._handle_tool_call(tc)

            except asyncio.CancelledError:
                break
            except Exception as e:
                if not self._running:
                    break
                logger.error(f"Poll loop error: {e}")
                await asyncio.sleep(2)

    async def _handle_tool_call(self, tc: dict):
        """Execute a single tool call and post the result."""
        request_id = tc["request_id"]
        tool_name = tc["tool"]
        params = tc.get("params", {})
        start = time.time()

        logger.info(f"Executing: {tool_name} {json.dumps(params)[:100]}")

        try:
            perm = check_permission(tool_name, params)
            if perm == "deny":
                raise PermissionDenied(f"Tool '{tool_name}' denied by permission rules")

            tool_fn = TOOLS.get(tool_name)
            if not tool_fn:
                raise ValueError(f"Unknown tool: {tool_name}")

            result = await asyncio.get_event_loop().run_in_executor(None, tool_fn, self.workspace, params)
            duration_ms = int((time.time() - start) * 1000)
            success = "error" not in result

            logger.info(f"Completed: {tool_name} ({duration_ms}ms, {'ok' if success else 'error'})")

            _http_post(self._url("/api/agent/result"), self._headers(), {
                "agent_id": self.agent_id,
                "request_id": request_id,
                "success": success,
                "result": result if success else None,
                "error": result.get("error") if not success else None,
                "duration_ms": duration_ms,
            })

        except Exception as e:
            duration_ms = int((time.time() - start) * 1000)
            logger.error(f"Tool error: {tool_name} — {e}")
            _http_post(self._url("/api/agent/result"), self._headers(), {
                "agent_id": self.agent_id,
                "request_id": request_id,
                "success": False,
                "error": str(e),
                "duration_ms": duration_ms,
            })

    def stop(self):
        self._running = False
