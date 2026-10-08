from datetime import datetime
from sqlalchemy import Column, BigInteger, String, DateTime, Integer
from core.database import Base


class FacialSession(Base):
    __tablename__ = "facial_sessions"

    id             = Column(Integer, primary_key=True, autoincrement=True)
    identificacion = Column(BigInteger, nullable=False, index=True)
    session_token  = Column(String(64), nullable=False, unique=True, index=True)
    device_fp      = Column(String(128), nullable=False)
    opened_at      = Column(DateTime, nullable=False)
    expires_at     = Column(DateTime, nullable=False)
    closed_at      = Column(DateTime, nullable=True, default=None)
