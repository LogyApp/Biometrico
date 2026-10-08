from datetime import datetime, timezone, timedelta

def _bog_now():
    return datetime.now(timezone(timedelta(hours=-5))).replace(tzinfo=None)
from sqlalchemy import Column, Integer, String, Numeric, Boolean, DateTime, UniqueConstraint
from core.database import Base


class FacialSede(Base):
    __tablename__ = "facial_sedes"
    __table_args__ = (UniqueConstraint("regional", "lugar", name="uq_facial_sedes_regional_lugar"),)

    id         = Column(Integer, primary_key=True, autoincrement=True)
    regional   = Column(String(64), nullable=False, index=True)
    lugar      = Column(String(128), nullable=False)
    latitud    = Column(Numeric(10, 8), nullable=True)
    longitud   = Column(Numeric(11, 8), nullable=True)
    activo     = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=_bog_now)
