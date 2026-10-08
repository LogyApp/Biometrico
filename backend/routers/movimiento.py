from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from core.database import get_session
from schemas.movimiento import (
    MovimientoStartRequest, MovimientoStartResponse,
    MovimientoFinishRequest, MovimientoFinishResponse,
    MovimientoActiveResponse,
)
from services.movimiento import MovimientoService

router = APIRouter(prefix="/api/movement", tags=["movement"])


def _ip(request: Request) -> str:
    fwd = request.headers.get("X-Forwarded-For")
    return fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "unknown")


@router.post("/start", response_model=MovimientoStartResponse)
async def start_movement(
    payload: MovimientoStartRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> MovimientoStartResponse:
    return await MovimientoService(session).start(payload, device_ip=_ip(request))


@router.post("/finish", response_model=MovimientoFinishResponse)
async def finish_movement(
    payload: MovimientoFinishRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> MovimientoFinishResponse:
    return await MovimientoService(session).finish(payload, device_ip=_ip(request))


@router.get("/active/{identificacion}", response_model=MovimientoActiveResponse)
async def check_active(
    identificacion: int,
    session: AsyncSession = Depends(get_session),
) -> MovimientoActiveResponse:
    return await MovimientoService(session).check_active(identificacion)
