import logging
from sqlalchemy.ext.asyncio import AsyncSession
from repositories.marcacion import MarcacionRepository
from repositories.vinculacion import VinculacionRepository
from repositories.asistencia import _bog_now, schedule_sync, AsistenciaRepository
from core.shift_rules import auto_close_deadline, AUTO_CLOSE_MOTIVO

logger = logging.getLogger(__name__)


class AutoCloseService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._marc_repo = MarcacionRepository(session)
        self._vinc_repo = VinculacionRepository(session)

    async def run(self) -> dict:
        now = _bog_now()
        open_entries = await self._marc_repo.find_open_entries()

        closed: list[int] = []
        for entry in open_entries:
            deadline = auto_close_deadline(entry["entrada"])
            if now < deadline:
                continue

            identificacion = entry["identificacion"]
            ok = await self._marc_repo.close_entry(
                identificacion,
                fecha_hora=deadline,
                es_manual=True,
                motivo=AUTO_CLOSE_MOTIVO,
            )
            if not ok:
                continue
            closed.append(identificacion)

            worker = await self._vinc_repo.get_active_worker(identificacion)
            if not worker:
                worker = await self._vinc_repo.get_worker_any_state(identificacion)

            if worker:
                asistencia_repo = AsistenciaRepository(self._session)
                try:
                    await asistencia_repo.sincronizar(
                        tipo="SALIDA",
                        identificacion=worker.identificacion,
                        trabajador=worker.trabajador,
                        nombre=worker.nombre.upper(),
                        operacion=worker.operacion or "BIOMETRICO",
                        area=worker.area,
                        marca_datetime=deadline,
                        observaciones=AUTO_CLOSE_MOTIVO,
                    )
                except Exception as exc:
                    logger.error("Error sincronizando auto_close con Dynamic_Asistencia: %s", exc)
                    schedule_sync(
                        tipo="SALIDA",
                        identificacion=worker.identificacion,
                        trabajador=worker.trabajador,
                        nombre=worker.nombre.upper(),
                        operacion=worker.operacion or "BIOMETRICO",
                        area=worker.area,
                        marca_datetime=deadline,
                        observaciones=AUTO_CLOSE_MOTIVO,
                    )

        await self._session.commit()
        logger.info(
            "auto_close_turnos: %s cerrados de %s abiertos revisados",
            len(closed), len(open_entries),
        )
        return {"revisados": len(open_entries), "cerrados": len(closed), "identificaciones": closed}
