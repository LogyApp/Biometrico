from slowapi import Limiter
from starlette.requests import Request


def real_client_ip(request: Request) -> str:
    fwd = request.headers.get("X-Forwarded-For")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


limiter = Limiter(key_func=real_client_ip)
