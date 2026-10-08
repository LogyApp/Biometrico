from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from core.database import get_session
from core.config import settings
from services.auto_close import AutoCloseService

router = APIRouter(prefix="/internal", tags=["internal"])


def verify_internal_token(x_internal_token: str | None = Header(default=None)) -> None:
    """Requiere INTERNAL_TASK_TOKEN configurado y que coincida con el header.
    Falla cerrado: si el token no está configurado en el servidor, se rechaza
    toda solicitud en vez de aceptarla por accidente."""
    if not settings.internal_task_token or x_internal_token != settings.internal_task_token:
        raise HTTPException(status_code=401, detail="No autorizado.")


@router.post("/auto-cerrar-turnos")
async def auto_cerrar_turnos(
    _: None = Depends(verify_internal_token),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Cierra automáticamente los turnos abiertos que ya pasaron su hora límite
    (medianoche para turno día, mediodía siguiente para turno noche).
    Pensado para ser invocado periódicamente por Cloud Scheduler."""
    return await AutoCloseService(session).run()
