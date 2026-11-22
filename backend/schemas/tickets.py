from typing import Optional
from pydantic import BaseModel, Field


class CalificarTicketRequest(BaseModel):
    identificacion: str = Field(..., description="Identificación del trabajador solicitante")
    satisfaccion: int = Field(..., ge=1, le=5, description="Calificación de 1 a 5 estrellas")
    sugerencia: Optional[str] = Field(None, max_length=2000, description="Comentario o sugerencia adicional")


class CalificarTicketResponse(BaseModel):
    ok: bool
    ticket: str
    message: str
