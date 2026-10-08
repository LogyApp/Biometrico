from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health")
async def health(request: Request):
    """
    Cloud Run usa este endpoint para saber si el servicio está vivo.
    Siempre responde 200 para no forzar reinicios mientras el modelo carga.
    """
    status = {}
    get_status = getattr(request.app.state, "get_status", None)
    if callable(get_status):
        status = get_status()

    return JSONResponse({
        "status":       "ok",
        "model_loaded": status.get("model_ready", False),
        "model_error":  status.get("model_error"),
        "db_ready":     status.get("db_ready", False),
        "db_error":     status.get("db_error"),
    })
