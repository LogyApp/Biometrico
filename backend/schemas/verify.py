from pydantic import BaseModel, Field
from typing import Literal, Optional


class VerifyRequest(BaseModel):
    identificacion:     int = Field(..., gt=0)
    frame:              str
    tipo:               str = "ENTRADA"
    latitud:            Optional[float] = None
    longitud:           Optional[float] = None
    precision_gps:      Optional[int]   = None
    device_fingerprint: Optional[str]  = None
    client_timestamp:   Optional[int] = None
    offline_local_score: Optional[float] = None


class VerifyResponse(BaseModel):
    status:              Literal["authorized", "not_found", "no_active_entry", "mismatch"]
    identificacion:      int
    nombre:              Optional[str] = None
    score:               float
    message:             str
    es_apoyo:            bool = False
    fuera_de_sede:       bool = False
    operacion_efectiva:  Optional[str] = None
    operacion_asignada:  Optional[str] = None
    operacion_detectada: Optional[str] = None
    distancia_m:         Optional[int] = None
    mensaje_operacion:   Optional[str] = None
    puede_rechazar_apoyo: bool = False
