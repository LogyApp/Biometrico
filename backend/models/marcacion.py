from datetime import datetime, timezone, timedelta
from decimal import Decimal

def _bog_now():
    return datetime.now(timezone(timedelta(hours=-5))).replace(tzinfo=None)
from sqlalchemy import Column, BigInteger, String, Integer, Boolean, DateTime, Numeric
from core.database import Base


class FacialMarcacion(Base):
    __tablename__ = "facial_marcaciones"

    id                 = Column(Integer, primary_key=True, autoincrement=True)
    identificacion     = Column(BigInteger, nullable=False, index=True)
    trabajador         = Column(String(255), nullable=False)
    tipo               = Column(String(30), nullable=False)
    score              = Column(Numeric(6, 4), nullable=True)
    latitud            = Column(Numeric(10, 8), nullable=True)
    longitud           = Column(Numeric(11, 8), nullable=True)
    precision_gps      = Column(Integer, nullable=True)
    es_manual          = Column(Boolean, nullable=False, default=False)
    motivo             = Column(String(512), nullable=True)
    device_fingerprint = Column(String(128), nullable=True)
    ip                 = Column(String(45), nullable=True)
    fecha_hora         = Column(DateTime, nullable=False, default=_bog_now)
    fecha_entrada      = Column(DateTime, nullable=True,  default=None)
    fecha_salida       = Column(DateTime, nullable=True,  default=None)
    es_manual_salida     = Column(Boolean, nullable=False, default=False)
    motivo_salida        = Column(String(512), nullable=True)
    latitud_salida       = Column(Numeric(10, 8), nullable=True)
    longitud_salida      = Column(Numeric(11, 8), nullable=True)
    precision_gps_salida = Column(Integer, nullable=True)
