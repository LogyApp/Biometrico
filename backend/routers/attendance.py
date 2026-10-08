from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from core.database import get_session
from schemas.attendance import AttendanceManualRequest, AttendanceResponse
from services.attendance import AttendanceService

router = APIRouter(prefix="/api/attendance", tags=["attendance"])


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@router.post("/manual", response_model=AttendanceResponse)
async def manual_attendance(
    payload: AttendanceManualRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> AttendanceResponse:
    return await AttendanceService(session).manual_record(payload, device_ip=_client_ip(request))
