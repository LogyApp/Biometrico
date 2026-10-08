from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from core.database import get_session
from schemas.register import RegisterRequest, RegisterResponse
from services.register import RegisterService

router = APIRouter(prefix="/api", tags=["register"])


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@router.post("/register", response_model=RegisterResponse, status_code=200)
async def register(
    payload: RegisterRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> RegisterResponse:
    service = RegisterService(session)
    return await service.execute(payload, device_ip=_client_ip(request))
