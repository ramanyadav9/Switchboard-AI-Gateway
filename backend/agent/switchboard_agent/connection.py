import asyncio
import json
import logging
import platform
import time
from pathlib import Path

import websockets

from . import __version__
from .fingerprint import get_fingerprint
from .tools import TOOLS, TOOL_NAMES
from .permissions import check_permission, PermissionDenied

logger = logging.getLogger("switchboard-agent")


class AgentConnection:
    def __init__(self, server_url: str, api_key: str, workspace: str, name: str | None = None):
        self.server_url = server_url.rstrip("/")
        self.api_key = api_key
        self.workspace = str(Path(workspace).resolve())
        self.name = name or platform.node()
        self.fingerprint = get_fingerprint()
        self.device_token = self._load_device_token()
        self.ws = None
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

    def _build_ws_url(self) -> str:
        base = self.server_url.replace("https://", "wss://").replace("http://", "ws://")
        url = f"{base}/ws/agent?token={self.api_key}&fingerprint={self.fingerprint}"
        if self.device_token:
            url += f"&device_token={self.device_token}"
        return url

    async def connect(self):
        backoff = 1
        while self._running:
            try:
                url = self._build_ws_url()
                logger.info(f"Connecting to {self.server_url}...")
                async with websockets.connect(url, ping_interval=30, ping_timeout=10) as ws:
                    self.ws = ws
                    backoff = 1
                    logger.info("Connected. Registering...")
                    await self._register()
                    await self._message_loop()
            except asyncio.CancelledError:
                logger.info("Connection cancelled")
                break
            except websockets.ConnectionClosed as e:
                if not self._running:
                    break
                logger.warning(f"Connection closed: {e}")
            except Exception as e:
                if not self._running:
                    break
                logger.error(f"Connection error: {e}")
            finally:
                self.ws = None

            if not self._running:
                break
            logger.info(f"Reconnecting in {backoff}s...")
            try:
                await asyncio.sleep(backoff)
            except asyncio.CancelledError:
                break
            backoff = min(backoff * 2, 30)

        logger.info("Agent stopped")

    async def _register(self):
        await self.ws.send(json.dumps({
            "type": "register",
            "hostname": platform.node(),
            "os": platform.system(),
            "workspace": self.workspace,
            "tools": TOOL_NAMES,
            "name": self.name,
            "agent_version": __version__,
        }))

    async def _message_loop(self):
        heartbeat_task = asyncio.create_task(self._heartbeat_loop())
        try:
            async for raw in self.ws:
                if not self._running:
                    break
                msg = json.loads(raw)
                msg_type = msg.get("type")
                if msg_type == "registered":
                    self.agent_id = msg.get("agent_id")
                    dt = msg.get("device_token")
                    if dt:
                        self.device_token = dt
                        self._save_device_token(dt)
                    logger.info(f"Registered as agent {self.agent_id}")
                elif msg_type == "tool_call":
                    asyncio.create_task(self._handle_tool_call(msg))
                elif msg_type == "ping":
                    await self.ws.send(json.dumps({"type": "heartbeat", "timestamp": time.time()}))
                elif msg_type == "disconnect":
                    logger.info(f"Server disconnected: {msg.get('reason', 'unknown')}")
                    break
                elif msg_type == "pending_approval":
                    logger.info("Waiting for approval in web UI...")
                elif msg_type == "registered_ack":
                    pass
                elif msg_type == "timeout":
                    logger.info(f"Server timeout: {msg.get('text', '')}")
                    break
        except websockets.ConnectionClosed:
            pass
        except asyncio.CancelledError:
            pass
        finally:
            heartbeat_task.cancel()
            try:
                await heartbeat_task
            except asyncio.CancelledError:
                pass

    async def _heartbeat_loop(self):
        try:
            while self._running:
                await asyncio.sleep(15)
                if self.ws and not self.ws.closed:
                    await self.ws.send(json.dumps({"type": "heartbeat", "timestamp": time.time()}))
        except (asyncio.CancelledError, websockets.ConnectionClosed):
            pass

    async def _handle_tool_call(self, msg: dict):
        request_id = msg["request_id"]
        tool_name = msg["tool"]
        params = msg.get("params", {})
        start = time.time()
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
            await self.ws.send(json.dumps({
                "type": "tool_result",
                "request_id": request_id,
                "success": success,
                "result": result if success else None,
                "error": result.get("error") if not success else None,
                "duration_ms": duration_ms,
            }))
        except Exception as e:
            duration_ms = int((time.time() - start) * 1000)
            try:
                await self.ws.send(json.dumps({
                    "type": "tool_result",
                    "request_id": request_id,
                    "success": False,
                    "error": str(e),
                    "duration_ms": duration_ms,
                }))
            except Exception:
                pass

    def stop(self):
        self._running = False
        if self.ws and not self.ws.closed:
            asyncio.ensure_future(self._close_ws())

    async def _close_ws(self):
        try:
            await self.ws.close()
        except Exception:
            pass
