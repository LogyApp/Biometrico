import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, Boolean, Enum as PgEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from core.database import Base
from .enums import AccessDirection


class AccessPoint(Base):
    __tablename__ = "access_points"

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name       = Column(String(128), nullable=False)
    location   = Column(String(256), nullable=True)
    direction  = Column(PgEnum(AccessDirection, name="access_direction", create_type=False), nullable=False, default=AccessDirection.both)
    is_active  = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    access_events = relationship("AccessEvent", back_populates="access_point")
