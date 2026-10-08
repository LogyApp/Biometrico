from sqlalchemy import Column, Integer, BigInteger, String, Text, DateTime
from core.database import Base


class FacialPushSubscription(Base):
    __tablename__ = "facial_push_subscriptions"

    id             = Column(Integer, primary_key=True, autoincrement=True)
    identificacion = Column(BigInteger, nullable=False, index=True)
    device_fp      = Column(String(128), nullable=False)
    endpoint       = Column(Text, nullable=False)
    p256dh         = Column(String(512), nullable=False)
    auth           = Column(String(128), nullable=False)
    created_at     = Column(DateTime, nullable=False)
