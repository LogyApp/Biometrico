from pydantic import BaseModel, Field
from typing import Literal, Optional


class ManualRequest(BaseModel):
    identificacion:    int = Field(..., gt=0)
    tipo:              str = "ENTRADA"
    motivo:            str = Field(..., min_length=4, max_length=512)
    latitud:           float
    longitud:          float
    precision_gps:     Optional[int]   = None
    device_fingerprint: Optional[str]  = None
    client_timestamp:  Optional[int]   = None


class ManualResponse(BaseModel):
    status:         Literal["recorded", "not_found", "no_active_entry", "error"]
    identificacion: int
    nombre:         Optional[str] = None
    message:        str


class NovedadSalidaRequest(BaseModel):
    identificacion: int = Field(..., gt=0)
    device_fp:      str = Field(..., min_length=1, max_length=128)
    novedad:        str = Field(..., min_length=4, max_length=512)


class NovedadSalidaResponse(BaseModel):
    status:  Literal["recorded", "already_reported", "no_exit_today", "session_invalid"]
    message: str


# Mismo payload que la novedad de salida; se guarda en la columna `motivo`.
NovedadEntradaRequest = NovedadSalidaRequest


class NovedadEntradaResponse(BaseModel):
    status:  Literal["recorded", "already_reported", "no_entry_today", "session_invalid"]
    message: str
