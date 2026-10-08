from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from core.database import get_session
from core.limiter import limiter, real_client_ip
from schemas.verify import VerifyRequest, VerifyResponse
from services.verify import VerifyService

router = APIRouter(prefix="/api", tags=["verify"])


@router.post("/verify", response_model=VerifyResponse)
@limiter.limit("300/minute")
async def verify(
    payload: VerifyRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> VerifyResponse:
    return await VerifyService(session).execute(payload, device_ip=real_client_ip(request))
