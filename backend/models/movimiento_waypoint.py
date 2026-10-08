from datetime import datetime
from decimal import Decimal
from sqlalchemy import Column, Integer, Numeric, DateTime
from core.database import Base


class MovimientoWaypoint(Base):
    __tablename__ = "facial_movimientos_waypoints"

    id            = Column(Integer, primary_key=True, autoincrement=True)
    movimiento_id = Column(Integer, nullable=False, index=True)
    secuencia     = Column(Integer, nullable=False, default=0)
    lat           = Column(Numeric(10, 8), nullable=False)
    lng           = Column(Numeric(11, 8), nullable=False)
    altitud_m     = Column(Numeric(8, 2), nullable=True)
    velocidad_kmh = Column(Numeric(6, 2), nullable=True)
    precision_m   = Column(Integer, nullable=True)
    rumbo_grados  = Column(Numeric(5, 2), nullable=True)
    fecha_hora    = Column(DateTime(timezone=False), nullable=False)
