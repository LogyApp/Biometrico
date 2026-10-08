from datetime import datetime, timezone, timedelta
from decimal import Decimal

def _bog_now():
    return datetime.now(timezone(timedelta(hours=-5))).replace(tzinfo=None)
from sqlalchemy import Column, BigInteger, String, Integer, Boolean, DateTime, Numeric, JSON
from core.database import Base


class FacialMovimiento(Base):
    __tablename__ = "facial_movimientos"

    id                 = Column(Integer, primary_key=True, autoincrement=True)
    identificacion     = Column(BigInteger, nullable=False, index=True)
    trabajador         = Column(String(255), nullable=False)
    tipo               = Column(String(20), nullable=False, default="LIBRE")
    estado             = Column(String(20), nullable=False, default="ACTIVO")
    lat_inicio         = Column(Numeric(10, 8), nullable=False)
    lng_inicio         = Column(Numeric(11, 8), nullable=False)
    lat_destino        = Column(Numeric(10, 8), nullable=True)
    lng_destino        = Column(Numeric(11, 8), nullable=True)
    direccion_destino  = Column(String(512), nullable=True)
    ruta_dist_km       = Column(Numeric(8, 3), nullable=True)
    ruta_tiempo_min    = Column(Integer, nullable=True)
    fecha_inicio       = Column(DateTime, nullable=False, default=_bog_now)
    fecha_fin          = Column(DateTime, nullable=True)
    duracion_min       = Column(Integer, nullable=True)
    distancia_real_km  = Column(Numeric(8, 3), nullable=True)
    desvio_max_km      = Column(Numeric(8, 3), nullable=True)
    velocidad_max_kmh  = Column(Numeric(6, 2), nullable=True)
    velocidad_prom_kmh = Column(Numeric(6, 2), nullable=True)
    total_waypoints    = Column(Integer, nullable=True)
    llego_destino      = Column(Boolean, nullable=False, default=False)
    requiere_regreso   = Column(Boolean, nullable=False, default=False)
    tiempo_en_destino_min = Column(Integer, nullable=True)
    paradas_json       = Column(JSON, nullable=True)  # paradas intermedias planeadas: [{lat,lng,address}]
    waypoints_json     = Column(JSON, nullable=True)  # resumen ligero
    device_fingerprint = Column(String(128), nullable=True)
    ip                 = Column(String(45), nullable=True)
    es_manual          = Column(Boolean, nullable=False, default=False)
    motivo             = Column(String(512), nullable=True)
    # Solo se usan cuando tipo == "SEDE" — referencian facial_sedes.id.
    sede_origen_id     = Column(Integer, nullable=True)
    sede_destino_id    = Column(Integer, nullable=True)
    # Auditoría: si al iniciar un traslado de sede el trabajador no estaba
    # físicamente cerca de ninguna sede (ver repositories/sede.py). Solo se
    # calcula cuando tipo == "SEDE" — no bloquea el traslado, solo lo marca.
    origen_fuera_de_sede    = Column(Boolean, nullable=True)
    origen_distancia_sede_km = Column(Numeric(8, 3), nullable=True)
