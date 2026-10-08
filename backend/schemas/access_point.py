from pydantic import BaseModel
from typing import Optional
from uuid import UUID


class AccessPointOut(BaseModel):
    model_config = {"from_attributes": True}

    id:        UUID
    name:      str
    location:  Optional[str]
    direction: str
    is_active: bool
