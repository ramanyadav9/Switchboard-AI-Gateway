import json
import logging
import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

logger = logging.getLogger("switchboard")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)


class ObservabilityMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.time()
        response = await call_next(request)
        latency_ms = int((time.time() - start) * 1000)

        path = request.url.path
        method = request.method
        status = response.status_code

        if path in ("/health", "/docs", "/openapi.json", "/redoc"):
            return response

        log = {
            "method": method,
            "path": path,
            "status": status,
            "latency_ms": latency_ms,
        }

        if latency_ms > 5000:
            logger.warning(json.dumps({**log, "slow": True}))
        elif status >= 500:
            logger.error(json.dumps(log))
        elif status >= 400:
            logger.warning(json.dumps(log))
        else:
            logger.info(json.dumps(log))

        return response
