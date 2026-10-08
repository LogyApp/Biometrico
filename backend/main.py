import os
import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from core.limiter import limiter

from core.config import settings
from core.logging_config import configure_logging
from core.logging_middleware import RequestLoggingMiddleware
from core.database import init_db
from core.vapid import init_vapid 
from core import model_state
from services.face import get_analyzer
from routers import (
    health_router, enrollment_router, verify_router,
    marcacion_router, movimiento_router, history_router,
    session_router, push_router, profile_router, internal_router,
    sede_router,
)

configure_logging(settings.log_level)
logger = logging.getLogger("startup")

_react_dist = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend-react", "dist")
_legacy_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend")
FRONTEND_DIR = os.environ.get(
    "FRONTEND_DIR",
    _react_dist if os.path.isdir(_react_dist) else _legacy_dir,
)

INSIGHTFACE_MODEL_DIR = os.path.join(
    os.path.expanduser("~"), ".insightface", "models", settings.insightface_model
)

_db_ready    = False
_db_error:   str | None = None


async def _load_model_background() -> None:
    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, get_analyzer)
        model_state.set_ready()
        logger.info("✅ InsightFace listo.")
    except Exception as exc:
        model_state.set_error(str(exc))
        logger.error("❌ InsightFace falló: %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _db_ready, _db_error

    try:
        await init_db()
        _db_ready = True
        logger.info("✅ Base de datos lista.")
    except Exception as exc:
        _db_error = str(exc)
        logger.error("❌ DB init falló (no crítico): %s", exc)

    init_vapid()

    asyncio.create_task(_load_model_background())
    logger.info("🚀 Servidor listo en puerto %s", os.environ.get("PORT", "8080"))

    yield


app = FastAPI(
    title="Logyser Facial Access API",
    version="2.0.0",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "https://0sg7q0df-8080.use2.devtunnels.ms",
        "http://localhost:5173",
        "http://192.168.1.55:5173"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RequestLoggingMiddleware)


@app.middleware("http")
async def no_cache_html(request, call_next):
    response = await call_next(request)
    content_type = response.headers.get("content-type", "")
    if content_type.startswith("text/html"):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return response


app.include_router(health_router)
app.include_router(enrollment_router)
app.include_router(verify_router)
app.include_router(marcacion_router)
app.include_router(movimiento_router)
app.include_router(history_router)
app.include_router(session_router)
app.include_router(push_router)
app.include_router(profile_router)
app.include_router(internal_router)
app.include_router(sede_router)

app.state.get_status = lambda: {
    "model_ready": model_state.ready,
    "model_error": model_state.error,
    "db_ready":    _db_ready,
    "db_error":    _db_error,
}

@app.get("/models/{filename}")
async def serve_model_file(filename: str):
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Nombre de archivo inválido.")
    file_path = os.path.join(INSIGHTFACE_MODEL_DIR, filename)
    if not os.path.isfile(file_path):
        raise HTTPException(
            status_code=503,
            detail="El modelo biométrico todavía se está preparando en el servidor. Intenta de nuevo en unos segundos.",
        )
    return FileResponse(file_path)

@app.get("/sw.js")
async def serve_service_worker():
    file_path = os.path.join(FRONTEND_DIR, "sw.js")
    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="Service worker no encontrado.")
    return FileResponse(
        file_path,
        media_type="application/javascript",
        headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
    )

if os.path.isdir(FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
    logger.info("Frontend montado desde: %s", FRONTEND_DIR)
else:
    logger.error("⚠️  Directorio frontend NO encontrado: %s", FRONTEND_DIR)

    @app.get("/")
    async def root_fallback():
        return JSONResponse(
            {"error": "Frontend no disponible", "frontend_dir": FRONTEND_DIR},
            status_code=503,
        )
