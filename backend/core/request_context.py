from contextvars import ContextVar

_trace: ContextVar[str | None] = ContextVar("trace", default=None)
_request_id: ContextVar[str | None] = ContextVar("request_id", default=None)


def set_trace(value: str | None) -> None:
    _trace.set(value)


def get_trace() -> str | None:
    return _trace.get()


def set_request_id(value: str | None) -> None:
    _request_id.set(value)


def get_request_id() -> str | None:
    return _request_id.get()
