from pydantic import BaseModel
from typing import Literal, Optional
from datetime import datetime
from schemas.movimiento import ParadaData


class HistoryRecord(BaseModel):
    tipo_registro: Literal["marcacion", "movimiento"]
    id:            int
    tipo:          str               # ENTRADA, SALIDA, MOVIMIENTO_INICIO, etc.
    fecha_hora:    str               # ISO string
    latitud:       Optional[float]   = None
    longitud:      Optional[float]   = None
    # Solo marcaciones biométricas
    score:         Optional[float]   = None
    es_manual:     Optional[bool]    = None
    motivo:        Optional[str]     = None
    fecha_salida:  Optional[str]     = None  # ISO — solo en tipo ENTRADA (jornada cerrada)
    # Solo movimientos
    estado:        Optional[str]     = None
    duracion_min:  Optional[int]     = None
    distancia_km:  Optional[float]   = None
    total_wps:     Optional[int]     = None
    vel_max:       Optional[float]   = None
    vel_prom:      Optional[float]   = None
    lat_destino:   Optional[float]   = None
    lng_destino:   Optional[float]   = None
    dir_destino:   Optional[str]     = None
    llego:         Optional[bool]    = None
    ruta_dist_km:  Optional[float]   = None
    lat_fin:       Optional[float]   = None
    lng_fin:       Optional[float]   = None
    requiere_regreso: Optional[bool] = None
    tiempo_en_destino_min: Optional[int] = None
    paradas:       list[ParadaData]  = []


class HistoryResponse(BaseModel):
    records: list[HistoryRecord]
    total:   int


class WaypointOut(BaseModel):
    secuencia:     int
    lat:           float
    lng:           float
    altitud_m:     Optional[float] = None
    velocidad_kmh: Optional[float] = None
    precision_m:   Optional[int]   = None
    fecha_hora:    str
