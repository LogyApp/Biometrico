from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from core.database import get_session
from core.limiter import limiter, real_client_ip
from schemas.marcacion import (
    ManualRequest, ManualResponse,
    NovedadSalidaRequest, NovedadSalidaResponse,
    NovedadEntradaRequest, NovedadEntradaResponse,
)
from services.marcacion import ManualService, NovedadSalidaService, NovedadEntradaService

router = APIRouter(prefix="/api/attendance", tags=["attendance"])


@router.post("/manual", response_model=ManualResponse)
@limiter.limit("300/minute")
async def manual_attendance(
    payload: ManualRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> ManualResponse:
    return await ManualService(session).register(payload, device_ip=real_client_ip(request))


@router.post("/novedad-salida", response_model=NovedadSalidaResponse)
@limiter.limit("30/minute")
async def report_exit_novelty(
    payload: NovedadSalidaRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> NovedadSalidaResponse:
    return await NovedadSalidaService(session).report(payload)


@router.post("/novedad-entrada", response_model=NovedadEntradaResponse)
@limiter.limit("30/minute")
async def report_entry_novelty(
    payload: NovedadEntradaRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> NovedadEntradaResponse:
    return await NovedadEntradaService(session).report(payload)
