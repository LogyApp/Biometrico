from pydantic import BaseModel
from typing import Optional


class SedeOut(BaseModel):
    id:       int
    regional: str
    lugar:    str
    latitud:  float
    longitud: float


class SedeListResponse(BaseModel):
    sedes: list[SedeOut]


class OrigenCheckResponse(BaseModel):
    dentro_de_rango: bool
    distancia_km:    Optional[float] = None
    sede_cercana:    Optional[str]   = None
