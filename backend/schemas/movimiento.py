from pydantic import BaseModel, Field
from typing import Literal, Optional


class ParadaData(BaseModel):
    lat:     float
    lng:     float
    address: Optional[str] = None


class MovimientoStartRequest(BaseModel):
    identificacion:    int = Field(..., gt=0)
    tipo:              Literal["LIBRE", "DESTINO_FIJO", "SEDE"]
    lat_inicio:        float
    lng_inicio:        float
    lat_destino:       Optional[float] = None
    lng_destino:       Optional[float] = None
    direccion_destino: Optional[str]   = None
    ruta_dist_km:      Optional[float] = None
    ruta_tiempo_min:   Optional[int]   = None
    requiere_regreso:  bool = False
    paradas:           list[ParadaData] = []
    device_fingerprint: Optional[str]  = None
    client_timestamp:  Optional[int]   = None
    es_manual:         bool = False
    motivo:            Optional[str]   = None
    # Solo aplican cuando tipo == "SEDE".
    sede_origen_id:    Optional[int]   = None
    sede_destino_id:   Optional[int]   = None


class MovimientoStartResponse(BaseModel):
    movimiento_id: int
    message: str


class WaypointData(BaseModel):
    lat:      float
    lng:      float
    ts:       int
    speed:    Optional[float] = None
    accuracy: Optional[float] = None
    alt:      Optional[float] = None
    heading:  Optional[float] = None


class MovimientoFinishRequest(BaseModel):
    movimiento_id:         int
    distancia_real_km:     float
    desvio_max_km:         Optional[float] = None
    llego_destino:         bool = False
    tiempo_en_destino_min: Optional[int]   = None
    waypoints:             list[WaypointData] = []
    client_timestamp:      Optional[int]   = None


class MovimientoFinishResponse(BaseModel):
    status:                str
    duracion_min:          int
    distancia_real_km:     float
    llego_destino:         bool
    tiempo_en_destino_min: Optional[int] = None
    total_waypoints:       int
    velocidad_max_kmh:     float
    velocidad_prom_kmh:    float
    message:               str


class MovimientoActiveResponse(BaseModel):
    active:            bool
    movimiento_id:     Optional[int]   = None
    tipo:              Optional[str]   = None
    fecha_inicio:      Optional[str]   = None
    lat_inicio:        Optional[float] = None
    lng_inicio:        Optional[float] = None
    lat_destino:       Optional[float] = None
    lng_destino:       Optional[float] = None
    dir_destino:       Optional[str]   = None
    ruta_dist_km:      Optional[float] = None
    ruta_tiempo_min:   Optional[int]   = None
    requiere_regreso:  Optional[bool]  = None
    paradas:           list[ParadaData] = []
    sede_origen_id:    Optional[int]   = None
    sede_destino_id:   Optional[int]   = None
