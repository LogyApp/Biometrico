from datetime import datetime
from sqlalchemy import Column, BigInteger, String, JSON, Boolean, DateTime, Integer, Date
from core.database import Base


class FaceEmbedding(Base):
    __tablename__ = "facial_embeddings"

    id                  = Column(Integer, primary_key=True, autoincrement=True)
    identificacion      = Column(BigInteger, nullable=False, unique=True, index=True)
    trabajador          = Column(String(255), nullable=False)
    cargo               = Column(String(255), nullable=True)
    operacion           = Column(String(255), nullable=True)
    regional            = Column(String(255), nullable=True)
    document_type       = Column(String(10), nullable=True)
    document_issue_date = Column(Date, nullable=True)
    device_fingerprint  = Column(String(128), nullable=True)
    embedding           = Column(JSON, nullable=False)
    model_version       = Column(String(64), nullable=False, default="buffalo_l")
    is_active           = Column(Boolean, nullable=False, default=True)
    created_at          = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at          = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
