import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, Boolean, SmallInteger
from sqlalchemy.dialects.postgresql import UUID
from core.database import Base


class LivenessAttempt(Base):
    __tablename__ = "liveness_attempts"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id     = Column(String(64), nullable=False, index=True)
    steps_completed = Column(SmallInteger, nullable=False, default=0)
    passed          = Column(Boolean, nullable=False)
    device_ip       = Column(String(45), nullable=True)
    created_at      = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
