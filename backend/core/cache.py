import time
from typing import Any, Optional
from core.config import settings


class _TTLCache:
    def __init__(self, ttl_seconds: int = 300, maxsize: int = 10_000) -> None:
        self._store: dict[Any, tuple[Any, float]] = {}
        self._ttl = ttl_seconds
        self._maxsize = maxsize

    def get(self, key: Any) -> Optional[Any]:
        entry = self._store.get(key)
        if entry is None:
            return None
        value, ts = entry
        if time.monotonic() - ts > self._ttl:
            del self._store[key]
            return None
        return value

    def set(self, key: Any, value: Any) -> None:
        if len(self._store) >= self._maxsize:
            oldest = min(self._store, key=lambda k: self._store[k][1])
            del self._store[oldest]
        self._store[key] = (value, time.monotonic())

    def delete(self, key: Any) -> None:
        self._store.pop(key, None)


embedding_cache = _TTLCache(ttl_seconds=settings.embedding_cache_ttl_seconds, maxsize=10_000)
