"""
Push notification repository:
  - DB CRUD for push subscriptions (facial_push_subscriptions)
  - In-memory asyncio task scheduler for delayed pushes
  - pywebpush sender (runs in thread pool to avoid blocking the event loop)
"""
import asyncio
import json
import logging
import math
import time
from datetime import datetime
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from models.push_subscription import FacialPushSubscription

logger = logging.getLogger(__name__)

# ── In-memory task registry ───────────────────────────────────────────────────
# Keys: "{identificacion}:{task_id}"  (task_id: "movement" | "entrada")
_tasks: dict[str, "asyncio.Task[None]"] = {}


def _tkey(identificacion: int, task_id: str) -> str:
    return f"{identificacion}:{task_id}"


def cancel_all_for_user(identificacion: int) -> None:
    for tid in ("movement", "entrada"):
        key = _tkey(identificacion, tid)
        t = _tasks.pop(key, None)
        if t and not t.done():
            t.cancel()


def _register_task(identificacion: int, task_id: str, coro) -> None:
    key = _tkey(identificacion, task_id)
    old = _tasks.pop(key, None)
    if old and not old.done():
        old.cancel()
    task = asyncio.create_task(coro)
    _tasks[key] = task

    def _on_done(t: "asyncio.Task[None]") -> None:
        if _tasks.get(key) is t:
            _tasks.pop(key, None)

    task.add_done_callback(_on_done)


# ── pywebpush sender ──────────────────────────────────────────────────────────

def _send_push_sync(endpoint: str, p256dh: str, auth: str, payload: dict) -> bool:
    """Send push. Returns True to continue retrying, False to permanently cancel the task."""
    from core.vapid import vapid_private_key, VAPID_EMAIL
    try:
        from pywebpush import webpush, WebPushException
        webpush(
            subscription_info={
                "endpoint": endpoint,
                "keys": {"p256dh": p256dh, "auth": auth},
            },
            data=json.dumps(payload),
            vapid_private_key=vapid_private_key(),
            vapid_claims={"sub": f"mailto:{VAPID_EMAIL}"},
        )
        logger.debug("Push sent to %s…", endpoint[:60])
        return True
    except Exception as e:
        # 400 VapidPkHashMismatch / 404 / 410 Gone = subscription permanently invalid.
        # Stop retrying so we don't spam the logs until the user re-subscribes.
        status = getattr(getattr(e, "response", None), "status_code", None)
        if status in (400, 404, 410):
            logger.warning("Push subscription invalid (%s) — task cancelled. User must re-open app.", status)
            return False
        logger.warning("Push send failed: %s", e)
        return True  # transient error — keep retrying


async def _send_push_async(endpoint: str, p256dh: str, auth: str, payload: dict) -> bool:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _send_push_sync, endpoint, p256dh, auth, payload)


# ── Scheduled push coroutines ─────────────────────────────────────────────────

async def _scheduled_push(
    endpoint: str,
    p256dh: str,
    auth: str,
    delay_s: float,
    title: str,
    body: str,
    notif_id: str,
    repeat_s: Optional[float] = None,
) -> None:
    """Sends once after delay_s; if repeat_s is set, keeps repeating at that interval."""
    try:
        await asyncio.sleep(delay_s)
        ok = await _send_push_async(endpoint, p256dh, auth, {
            "title": title, "body": body,
            "id": notif_id, "tag": notif_id, "renotify": True,
        })
        if not ok or repeat_s is None:
            return
        while True:
            await asyncio.sleep(repeat_s)
            ok = await _send_push_async(endpoint, p256dh, auth, {
                "title": title, "body": body,
                "id": notif_id, "tag": notif_id, "renotify": True,
            })
            if not ok:
                break
    except asyncio.CancelledError:
        pass


async def _scheduled_push_entry(
    endpoint: str,
    p256dh: str,
    auth: str,
    delay_s: float,
    repeat_s: float,
    entry_time_ms: int,
    worker_name: str,
) -> None:
    """Entry reminder: body recalculated at each send to show fresh elapsed time."""
    def _body() -> str:
        elapsed_ms = time.time() * 1000 - entry_time_ms
        h = math.floor(elapsed_ms / 3_600_000)
        m = math.floor((elapsed_ms % 3_600_000) / 60_000)
        time_str = f"{h}h {m}m" if h > 0 else f"{m} min"
        prefix = f"{worker_name}: " if worker_name else ""
        return f"{prefix}Llevas {time_str} de jornada activa."

    try:
        await asyncio.sleep(delay_s)
        ok = await _send_push_async(endpoint, p256dh, auth, {
            "title": "Registra tu salida", "body": _body(),
            "id": "entrada", "tag": "entrada", "renotify": True,
        })
        if not ok:
            return
        while True:
            await asyncio.sleep(repeat_s)
            ok = await _send_push_async(endpoint, p256dh, auth, {
                "title": "Registra tu salida", "body": _body(),
                "id": "entrada", "tag": "entrada", "renotify": True,
            })
            if not ok:
                break
    except asyncio.CancelledError:
        pass


# ── Repository ────────────────────────────────────────────────────────────────

class PushRepository:
    def __init__(self, session: AsyncSession):
        self._session = session

    async def upsert_subscription(
        self,
        identificacion: int,
        device_fp: str,
        endpoint: str,
        p256dh: str,
        auth: str,
    ) -> None:
        # Replace any existing subscription for this device
        await self._session.execute(
            text(
                "DELETE FROM facial_push_subscriptions "
                "WHERE identificacion = :id AND device_fp = :fp"
            ),
            {"id": identificacion, "fp": device_fp},
        )
        self._session.add(FacialPushSubscription(
            identificacion=identificacion,
            device_fp=device_fp,
            endpoint=endpoint,
            p256dh=p256dh,
            auth=auth,
            created_at=datetime.utcnow(),
        ))

    async def get_subscription(
        self, identificacion: int, device_fp: str
    ) -> Optional[dict]:
        result = await self._session.execute(
            text(
                "SELECT endpoint, p256dh, auth "
                "FROM facial_push_subscriptions "
                "WHERE identificacion = :id AND device_fp = :fp "
                "ORDER BY created_at DESC LIMIT 1"
            ),
            {"id": identificacion, "fp": device_fp},
        )
        row = result.mappings().one_or_none()
        return dict(row) if row else None

    def schedule_notifications(
        self,
        identificacion: int,
        sub: dict,
        has_movement: bool,
        has_entry: bool,
        entry_time_ms: Optional[int],
        worker_name: str,
        delay_movement_ms: int,
        repeat_movement_ms: int,
        delay_entrada_ms: int,
        repeat_entrada_ms: int,
    ) -> None:
        cancel_all_for_user(identificacion)

        endpoint, p256dh, auth = sub["endpoint"], sub["p256dh"], sub["auth"]

        if has_movement:
            name_prefix = f"{worker_name}: " if worker_name else ""
            _register_task(
                identificacion, "movement",
                _scheduled_push(
                    endpoint, p256dh, auth,
                    delay_s  = delay_movement_ms  / 1000,
                    title    = "Movimiento activo",
                    body     = f"{name_prefix}Tienes un recorrido en curso. Finalízalo antes de cerrar jornada.",
                    notif_id = "movement",
                    repeat_s = repeat_movement_ms / 1000,
                ),
            )

        if has_entry and entry_time_ms:
            _register_task(
                identificacion, "entrada",
                _scheduled_push_entry(
                    endpoint, p256dh, auth,
                    delay_s        = delay_entrada_ms  / 1000,
                    repeat_s       = repeat_entrada_ms / 1000,
                    entry_time_ms  = entry_time_ms,
                    worker_name    = worker_name,
                ),
            )
