import logging
import time
import uuid
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from core.config import settings
from core.request_context import set_trace, set_request_id

logger = logging.getLogger("http")


def _build_trace(request: Request) -> str | None:
    header = request.headers.get("x-cloud-trace-context")
    if not header or not settings.gcp_project_id:
        return None
    trace_id = header.split("/", 1)[0]
    if not trace_id:
        return None
    return f"projects/{settings.gcp_project_id}/traces/{trace_id}"


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = uuid.uuid4().hex
        set_request_id(request_id)
        set_trace(_build_trace(request))

        start = time.monotonic()
        try:
            response = await call_next(request)
        except Exception:
            duration_ms = round((time.monotonic() - start) * 1000, 1)
            logger.error(
                "unhandled_exception",
                exc_info=True,
                extra={"extra_fields": {
                    "httpRequest": {
                        "requestMethod": request.method,
                        "requestUrl": str(request.url),
                        "remoteIp": request.client.host if request.client else None,
                        "latency": f"{duration_ms / 1000:.3f}s",
                    },
                }},
            )
            raise

        duration_ms = round((time.monotonic() - start) * 1000, 1)
        logger.info(
            "http_request",
            extra={"extra_fields": {
                "httpRequest": {
                    "requestMethod": request.method,
                    "requestUrl": str(request.url),
                    "status": response.status_code,
                    "latency": f"{duration_ms / 1000:.3f}s",
                    "remoteIp": request.client.host if request.client else None,
                    "userAgent": request.headers.get("user-agent"),
                },
                "duration_ms": duration_ms,
            }},
        )
        return response
