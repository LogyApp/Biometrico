from pydantic import BaseModel, Field
from typing import Literal


class AvatarUploadRequest(BaseModel):
    identificacion: int = Field(..., gt=0)
    photo_base64:   str = Field(..., min_length=100)


class AvatarUploadResponse(BaseModel):
    status: Literal["ok"]
    url:    str
