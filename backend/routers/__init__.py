from .health import router as health_router
from .enrollment import router as enrollment_router
from .verify import router as verify_router
from .marcacion import router as marcacion_router
from .movimiento import router as movimiento_router
from .history import router as history_router
from .session import router as session_router
from .push import router as push_router
from .profile import router as profile_router
from .internal import router as internal_router
from .sede import router as sede_router

__all__ = [
    "health_router", "enrollment_router", "verify_router",
    "marcacion_router", "movimiento_router", "history_router",
    "session_router", "push_router", "profile_router", "internal_router",
    "sede_router",
]
