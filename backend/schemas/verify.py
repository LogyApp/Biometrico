from pydantic import BaseModel, Field
from typing import Literal, Optional


class VerifyRequest(BaseModel):
    identificacion:    int = Field(..., gt=0)
    frame:             str
    tipo:              str = "ENTRADA"
    latitud:           float
    longitud:          float
    precision_gps:     Optional[int]   = None
    device_fingerprint: Optional[str]  = None
    client_timestamp: Optional[int] = None
    offline_local_score: Optional[float] = None


class VerifyResponse(BaseModel):
    status:         Literal["authorized", "not_found", "no_active_entry", "mismatch"]
    identificacion: int
    nombre:         Optional[str] = None
    score:          float
    message:        str
