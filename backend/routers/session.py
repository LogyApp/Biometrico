from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from core.database import get_session
from schemas.session import (
    SessionOpenRequest, SessionCloseRequest, SessionCloseByIdRequest,
    SessionHeartbeatRequest, SessionCheckResponse, SessionStateResponse,
    OtherDevicesResponse, OtherDeviceOut,
)
from repositories.session import SessionRepository
from repositories.sede import SedeRepository

router = APIRouter(prefix="/api/session", tags=["session"])


@router.post("/open", response_model=SessionCheckResponse)
async def open_session(
    payload: SessionOpenRequest,
    session: AsyncSession = Depends(get_session),
) -> SessionCheckResponse:
    repo   = SessionRepository(session)
    result = await repo.open(payload.identificacion, payload.device_fp)
    await session.commit()
    return SessionCheckResponse(**result)


@router.post("/close")
async def close_session(
    payload: SessionCloseRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    repo = SessionRepository(session)
    ok   = await repo.close(payload.token)
    await session.commit()
    return {"status": "closed" if ok else "not_found"}


@router.post("/close-by-id")
async def close_session_by_id(
    payload: SessionCloseByIdRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Cierra las sesiones activas del trabajador en el dispositivo que lo pide
    (identificación + device_fp). Usado en logout y salida rápida — no afecta
    las sesiones del mismo trabajador en otros dispositivos."""
    repo  = SessionRepository(session)
    count = await repo.close_by_identificacion(payload.identificacion, payload.device_fp)
    await session.commit()
    return {"status": "closed", "sessions_closed": count}


@router.get("/check/{identificacion}", response_model=SessionCheckResponse)
async def check_session(
    identificacion: int,
    fp: str,
    session: AsyncSession = Depends(get_session),
) -> SessionCheckResponse:
    repo   = SessionRepository(session)
    result = await repo.check(identificacion, fp)
    return SessionCheckResponse(**result)


@router.post("/heartbeat")
async def session_heartbeat(
    payload: SessionHeartbeatRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Renueva la sesión activa +30 min. Llamado cada ~10 min mientras la app está en primer plano."""
    repo   = SessionRepository(session)
    status = await repo.renew(payload.identificacion, payload.device_fp)
    if status == "renewed":
        await session.commit()
    return {"status": status}


@router.get("/others/{identificacion}", response_model=OtherDevicesResponse)
async def other_devices(
    identificacion: int,
    fp: str,
    session: AsyncSession = Depends(get_session),
) -> OtherDevicesResponse:
    """Solo lectura: otros dispositivos con sesión vigente en la misma cuenta,
    para la alerta informativa de Inicio. Solo responde a un dispositivo que
    tenga sesión activa de ese trabajador."""
    repo = SessionRepository(session)
    if (await repo.check(identificacion, fp))["status"] != "same_device":
        return OtherDevicesResponse()

    sede_repo = SedeRepository(session)
    out = []
    for d in await repo.other_active_devices(identificacion, fp):
        sede_label = None
        coords = await repo.last_marking_coords(identificacion, d["device_fp"])
        if coords:
            sede, _, inside = await sede_repo.find_nearest(*coords)
            if sede and inside:
                sede_label = f"{sede.lugar} · {sede.regional}"
        out.append(OtherDeviceOut(
            key=d["key"],
            last_activity=d["last_activity"].isoformat() + "Z",
            sede=sede_label,
        ))
    return OtherDevicesResponse(devices=out)


@router.get("/state/{identificacion}", response_model=SessionStateResponse)
async def get_session_state(
    identificacion: int,
    session: AsyncSession = Depends(get_session),
) -> SessionStateResponse:
    """Returns today's attendance state derived from facial_marcaciones (source of truth)."""
    repo   = SessionRepository(session)
    result = await repo.get_attendance_state(identificacion)
    return SessionStateResponse(**result)
