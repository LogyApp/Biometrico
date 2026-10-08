from fastapi import APIRouter, Request
from core.limiter import limiter
from schemas.profile import AvatarUploadRequest, AvatarUploadResponse
from services.avatar import upload_avatar

router = APIRouter(prefix="/api/profile", tags=["profile"])


@router.post("/avatar", response_model=AvatarUploadResponse)
@limiter.limit("5/minute")
async def upload_profile_avatar(
    payload: AvatarUploadRequest,
    request: Request,
) -> AvatarUploadResponse:
    url = upload_avatar(payload.identificacion, payload.photo_base64)
    return AvatarUploadResponse(status="ok", url=url)
