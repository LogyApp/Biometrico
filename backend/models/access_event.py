import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, Numeric, Integer, Boolean, ForeignKey, Enum as PgEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from core.database import Base
from .enums import EventType, AccessResult


class AccessEvent(Base):
    __tablename__ = "access_events"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    person_id       = Column(UUID(as_uuid=True), ForeignKey("persons.id", ondelete="SET NULL"), nullable=True)
    document_id     = Column(String(64), nullable=False, index=True)
    access_point_id = Column(UUID(as_uuid=True), ForeignKey("access_points.id", ondelete="SET NULL"), nullable=True)
    event_type      = Column(PgEnum(EventType, name="event_type", create_type=False), nullable=False, default=EventType.entry)
    result          = Column(PgEnum(AccessResult, name="access_result", create_type=False), nullable=False)
    score           = Column(Numeric(6, 4), nullable=True)
    latitude        = Column(Numeric(10, 7), nullable=True)
    longitude       = Column(Numeric(10, 7), nullable=True)
    geo_accuracy    = Column(Integer, nullable=True)
    is_manual       = Column(Boolean, nullable=False, default=False)
    manual_reason   = Column(String(512), nullable=True)
    device_ip       = Column(String(45), nullable=True)
    created_at      = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    person       = relationship("Person", back_populates="access_events")
    access_point = relationship("AccessPoint", back_populates="access_events")
