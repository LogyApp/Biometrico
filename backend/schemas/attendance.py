from pydantic import BaseModel, Field
from typing import Literal, Optional
from uuid import UUID

EventTypeLiteral = Literal["entry", "exit", "lunch", "breakfast", "break_start", "break_end", "transfer"]


class AttendanceManualRequest(BaseModel):
    document_id:     str = Field(..., min_length=3, max_length=64)
    event_type:      EventTypeLiteral
    reason:          str = Field(..., min_length=4, max_length=512)
    latitude:        Optional[float] = None
    longitude:       Optional[float] = None
    geo_accuracy:    Optional[int]   = None
    access_point_id: Optional[UUID]  = None


class AttendanceResponse(BaseModel):
    status:      Literal["recorded", "denied", "not_found", "blocked"]
    document_id: str
    full_name:   Optional[str] = None
    event_type:  str
    is_manual:   bool
    latitude:    Optional[float] = None
    longitude:   Optional[float] = None
    geo_accuracy: Optional[int]  = None
    message:     str
