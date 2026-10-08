import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, Date, Enum as PgEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from core.database import Base
from .enums import DocumentType, PersonStatus


class Person(Base):
    __tablename__ = "persons"

    id                  = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_type       = Column(PgEnum(DocumentType, name="document_type", create_type=False), nullable=False, default=DocumentType.CC)
    document_id         = Column(String(64), unique=True, nullable=False, index=True)
    document_issue_date = Column(Date, nullable=True)
    full_name           = Column(String(256), nullable=False)
    email               = Column(String(256), nullable=True)
    phone               = Column(String(20), nullable=True)
    department          = Column(String(128), nullable=True)
    status              = Column(PgEnum(PersonStatus, name="person_status", create_type=False), nullable=False, default=PersonStatus.active)
    created_at          = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at          = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    embeddings    = relationship("FaceEmbedding", back_populates="person", cascade="all, delete-orphan")
    access_events = relationship("AccessEvent", back_populates="person")
