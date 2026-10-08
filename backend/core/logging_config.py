import json
import logging
import sys
from datetime import datetime, timezone
from core.request_context import get_trace, get_request_id

_SEVERITY_MAP = {
    "DEBUG": "DEBUG",
    "INFO": "INFO",
    "WARNING": "WARNING",
    "ERROR": "ERROR",
    "CRITICAL": "CRITICAL",
}


class CloudLoggingFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "severity": _SEVERITY_MAP.get(record.levelname, "DEFAULT"),
            "message": record.getMessage(),
            "time": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "logging.googleapis.com/labels": {"component": record.name},
        }

        trace = get_trace()
        if trace:
            payload["logging.googleapis.com/trace"] = trace
        request_id = get_request_id()
        if request_id:
            payload["request_id"] = request_id

        extra_fields = getattr(record, "extra_fields", None)
        if extra_fields:
            payload.update(extra_fields)

        if record.exc_info:
            payload["message"] = payload["message"] + "\n" + self.formatException(record.exc_info)
            payload["severity"] = "ERROR"

        return json.dumps(payload, default=str, ensure_ascii=False)


def configure_logging(level: str = "INFO") -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(CloudLoggingFormatter())

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level)

    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        uv_logger = logging.getLogger(name)
        uv_logger.handlers = [handler]
        uv_logger.propagate = False
