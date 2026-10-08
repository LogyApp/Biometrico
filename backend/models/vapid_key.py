from sqlalchemy import Column, Integer, Text, DateTime
from core.database import Base


class FacialVapidKey(Base):
    __tablename__ = "facial_vapid_keys"
    id            = Column(Integer, primary_key=True, autoincrement=True)
    private_pem   = Column(Text, nullable=False)
    private_raw   = Column(Text, nullable=False)   # base64url EC d scalar — what pywebpush expects
    public_b64url = Column(Text, nullable=False)
    created_at    = Column(DateTime, nullable=False)
