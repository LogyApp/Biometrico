from pydantic import BaseModel, Field
from typing import Literal, Optional
from datetime import date


class EnrollmentCheckRequest(BaseModel):
    document_type:       Optional[Literal["CC", "CE", "TI", "PP", "NIT"]] = None
    identificacion:      int = Field(..., gt=0)
    document_issue_date: Optional[date] = None
    device_fingerprint:  Optional[str] = None


class WorkerStatus(BaseModel):
    identificacion: int
    nombre: str
    cargo: Optional[str] = None
    operacion: Optional[str] = None
    regional: Optional[str] = None
    has_biometrics: bool


class EnrollmentCheckResponse(BaseModel):
    status: Literal["ready_to_enroll", "already_enrolled", "not_found", "invalid_credentials", "wrong_device"]
    worker: Optional[WorkerStatus] = None
    message: str


class EnrollmentSaveRequest(BaseModel):
    identificacion:      int = Field(..., gt=0)
    document_type:       Optional[Literal["CC", "CE", "TI", "PP", "NIT"]] = None
    document_issue_date: Optional[date] = None
    device_fingerprint:  Optional[str] = None
    frontal_frame:       str
    liveness_frames:     list[str] = Field(..., min_length=2, max_length=2)


class EnrollmentSaveResponse(BaseModel):
    status: Literal["enrolled", "updated", "error"]
    identificacion: int
    nombre: str
    message: str


class EmbeddingVectorResponse(BaseModel):
    status: Literal["ok", "not_found", "wrong_device"]
    identificacion: Optional[int] = None
    nombre: Optional[str] = None
    embedding: Optional[list[float]] = None
    model_version: Optional[str] = None
    updated_at: Optional[str] = None
    message: str
