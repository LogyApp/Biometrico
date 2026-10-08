from pydantic import BaseModel
from typing import Optional


class PushKeys(BaseModel):
    p256dh: str
    auth: str


class PushSubscribeRequest(BaseModel):
    identificacion: int
    device_fp: str
    endpoint: str
    keys: PushKeys


class PushScheduleRequest(BaseModel):
    identificacion: int
    device_fp: str
    has_movement: bool = False
    has_entry: bool = False
    entry_time_ms: Optional[int] = None
    worker_name: str = ""
    delay_movement_ms:  int = 600_000    # 10 min
    repeat_movement_ms: int = 900_000    # 15 min
    delay_entrada_ms:   int = 28_800_000 # 8 h (frontend calcula dinámico)
    repeat_entrada_ms:  int = 1_800_000  # 30 min


class PushCancelRequest(BaseModel):
    identificacion: int
