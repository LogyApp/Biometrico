import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

logger = logging.getLogger(__name__)


class CleanupService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def purge_old_sessions(self, dias: int = 90) -> int:
        """Elimina sesiones cerradas o expiradas con más de `dias` días de antigüedad.
        Evita el crecimiento desmedido de la tabla facial_sessions manteniendo la tabla ligera."""
        result = await self._session.execute(
            text("""
                DELETE FROM `facial_sessions`
                WHERE (closed_at IS NOT NULL AND closed_at < NOW() - INTERVAL :dias DAY)
                   OR (closed_at IS NULL AND expires_at < NOW() - INTERVAL :dias DAY)
            """),
            {"dias": dias},
        )
        count = result.rowcount
        logger.info("Purga de sesiones completada: %s sesiones antiguas eliminadas.", count)
        return count

    async def run_cleanup(self) -> dict:
        deleted_sessions = await self.purge_old_sessions(dias=90)
        await self._session.commit()
        return {
            "ok": True,
            "sesiones_eliminadas": deleted_sessions,
        }
