from pydantic import BaseModel
from typing import Optional


class SessionOpenRequest(BaseModel):
    identificacion: int
    device_fp: str


class SessionCloseRequest(BaseModel):
    token: str


class SessionCloseByIdRequest(BaseModel):
    identificacion: int
    device_fp: str


class SessionCheckResponse(BaseModel):
    status: str           # "none" | "same_device" | "other_device" | "opened" | "resumed"
    token: Optional[str] = None


class SessionHeartbeatRequest(BaseModel):
    identificacion: int
    device_fp: str


class SessionStateResponse(BaseModel):
    has_active_entry: bool
    last_action:      Optional[str] = None   # "ENTRADA" | "SALIDA" | None
    entry_time_ms:    Optional[int] = None   # epoch ms of ENTRADA
    exit_time_ms:     Optional[int] = None   # epoch ms of SALIDA (only when last_action == "SALIDA")


class OtherDeviceOut(BaseModel):
    key:           int
    last_activity: str             # ISO UTC
    sede:          Optional[str] = None   # sede de su última marcación, si fue en una


class OtherDevicesResponse(BaseModel):
    devices: list[OtherDeviceOut] = []
