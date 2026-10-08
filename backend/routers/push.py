from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_session
from core.vapid import vapid_public_key
from schemas.push import PushSubscribeRequest, PushScheduleRequest, PushCancelRequest
from repositories.push import PushRepository, cancel_all_for_user

router = APIRouter(prefix="/api/push", tags=["push"])


@router.get("/vapid-key")
async def get_vapid_key() -> dict:
    """Returns the VAPID public key for the frontend pushManager.subscribe() call."""
    return {"public_key": vapid_public_key()}


@router.post("/subscribe")
async def subscribe(
    payload: PushSubscribeRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Stores (or updates) the Web Push subscription for this device."""
    repo = PushRepository(session)
    await repo.upsert_subscription(
        payload.identificacion,
        payload.device_fp,
        payload.endpoint,
        payload.keys.p256dh,
        payload.keys.auth,
    )
    await session.commit()
    return {"status": "subscribed"}


@router.post("/schedule")
async def schedule_push(
    payload: PushScheduleRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """
    Called when the app goes to background.
    Schedules asyncio tasks that send a Web Push after the configured delay.
    """
    repo = PushRepository(session)
    sub  = await repo.get_subscription(payload.identificacion, payload.device_fp)
    if not sub:
        return {"status": "no_subscription"}

    repo.schedule_notifications(
        identificacion     = payload.identificacion,
        sub                = sub,
        has_movement       = payload.has_movement,
        has_entry          = payload.has_entry,
        entry_time_ms      = payload.entry_time_ms,
        worker_name        = payload.worker_name,
        delay_movement_ms  = payload.delay_movement_ms,
        repeat_movement_ms = payload.repeat_movement_ms,
        delay_entrada_ms   = payload.delay_entrada_ms,
        repeat_entrada_ms  = payload.repeat_entrada_ms,
    )
    return {"status": "scheduled"}


@router.post("/cancel")
async def cancel_push(payload: PushCancelRequest) -> dict:
    """Called when the app returns to foreground — cancels all pending push tasks."""
    cancel_all_for_user(payload.identificacion)
    return {"status": "cancelled"}
