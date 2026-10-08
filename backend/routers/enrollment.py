from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from core.database import get_session
from core.limiter import limiter
from schemas.enrollment import (
    EnrollmentCheckRequest, EnrollmentCheckResponse,
    EnrollmentSaveRequest, EnrollmentSaveResponse,
    EmbeddingVectorResponse,
)
from services.enrollment import EnrollmentService

router = APIRouter(prefix="/api/enrollment", tags=["enrollment"])


@router.post("/check", response_model=EnrollmentCheckResponse)
@limiter.limit("60/minute")
async def check_enrollment(
    request: Request,
    payload: EnrollmentCheckRequest,
    session: AsyncSession = Depends(get_session),
) -> EnrollmentCheckResponse:
    return await EnrollmentService(session).check(payload)


@router.post("/save", response_model=EnrollmentSaveResponse)
@limiter.limit("20/minute")
async def save_enrollment(
    request: Request,
    payload: EnrollmentSaveRequest,
    session: AsyncSession = Depends(get_session),
) -> EnrollmentSaveResponse:
    return await EnrollmentService(session).save(payload)


@router.get("/vector/{identificacion}", response_model=EmbeddingVectorResponse)
@limiter.limit("30/minute")
async def get_embedding_vector(
    request: Request,
    identificacion: int,
    device_fingerprint: str | None = None,
    session: AsyncSession = Depends(get_session),
) -> EmbeddingVectorResponse:
    return await EnrollmentService(session).get_vector(identificacion, device_fingerprint)
