from pydantic import BaseModel, Field
from typing import Literal, Optional
from datetime import date


class RegisterRequest(BaseModel):
    document_type:       Literal["CC", "CE", "TI", "PP", "NIT"] = "CC"
    document_id:         str = Field(..., min_length=3, max_length=64)
    document_issue_date: Optional[date] = None
    full_name:           str = Field(..., min_length=2, max_length=256)
    email:               Optional[str] = Field(None, max_length=256)
    phone:               Optional[str] = Field(None, max_length=20)
    department:          Optional[str] = Field(None, max_length=128)
    frames:              list[str] = Field(..., min_length=3, max_length=3)


class RegisterResponse(BaseModel):
    status:      Literal["registered", "duplicate"]
    document_id: str
    message:     str
