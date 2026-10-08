from sqlalchemy.ext.asyncio import AsyncSession
from schemas.marcacion import (
    ManualRequest, ManualResponse,
    NovedadSalidaRequest, NovedadSalidaResponse,
    NovedadEntradaRequest, NovedadEntradaResponse,
)
from repositories.vinculacion import VinculacionRepository
from repositories.marcacion import MarcacionRepository
from repositories.session import SessionRepository, _bog_day_range
from repositories.asistencia import _bog_now, _client_ts_to_bog, schedule_sync

_NOVEDAD_MESSAGES = {
    "recorded":         "Novedad registrada correctamente.",
    "already_reported": "Tu salida de hoy ya tiene una novedad o motivo registrado.",
    "no_exit_today":    "No encontramos una salida registrada hoy. Si marcaste sin conexión, espera a que se sincronice e inténtalo de nuevo.",
    "session_invalid":  "Tu sesión no está activa en este dispositivo. Vuelve a ingresar e inténtalo de nuevo.",
}


class NovedadSalidaService:
    def __init__(self, session: AsyncSession) -> None:
        self._marc_repo    = MarcacionRepository(session)
        self._session_repo = SessionRepository(session)
        self._session      = session

    async def report(self, payload: NovedadSalidaRequest) -> NovedadSalidaResponse:
        # Solo el dispositivo con la sesión activa del trabajador puede
        # reportar sobre sus propias marcaciones.
        check = await self._session_repo.check(payload.identificacion, payload.device_fp)
        if check["status"] != "same_device":
            return NovedadSalidaResponse(status="session_invalid", message=_NOVEDAD_MESSAGES["session_invalid"])

        day_start, day_end = _bog_day_range()
        status = await self._marc_repo.report_exit_novelty(
            payload.identificacion, payload.novedad.strip(), day_start, day_end,
        )
        if status == "recorded":
            await self._session.commit()
        return NovedadSalidaResponse(status=status, message=_NOVEDAD_MESSAGES[status])


_NOVEDAD_ENTRADA_MESSAGES = {
    "recorded":         "Novedad registrada correctamente.",
    "already_reported": "Tu entrada ya tiene una novedad o motivo registrado.",
    "no_entry_today":   "No encontramos una entrada registrada hoy. Si marcaste sin conexión, espera a que se sincronice e inténtalo de nuevo.",
    "session_invalid":  _NOVEDAD_MESSAGES["session_invalid"],
}


class NovedadEntradaService:
    def __init__(self, session: AsyncSession) -> None:
        self._marc_repo    = MarcacionRepository(session)
        self._session_repo = SessionRepository(session)
        self._session      = session

    async def report(self, payload: NovedadEntradaRequest) -> NovedadEntradaResponse:
        check = await self._session_repo.check(payload.identificacion, payload.device_fp)
        if check["status"] != "same_device":
            return NovedadEntradaResponse(status="session_invalid", message=_NOVEDAD_ENTRADA_MESSAGES["session_invalid"])

        day_start, day_end = _bog_day_range()
        status = await self._marc_repo.report_entry_novelty(
            payload.identificacion, payload.novedad.strip(), day_start, day_end,
        )
        if status == "recorded":
            await self._session.commit()
        return NovedadEntradaResponse(status=status, message=_NOVEDAD_ENTRADA_MESSAGES[status])


class ManualService:
    def __init__(self, session: AsyncSession) -> None:
        self._vinc_repo = VinculacionRepository(session)
        self._marc_repo = MarcacionRepository(session)
        self._session   = session

    async def register(self, payload: ManualRequest, device_ip: str = "unknown") -> ManualResponse:
        worker = await self._vinc_repo.get_active_worker(payload.identificacion)

        if not worker:
            return ManualResponse(
                status="not_found",
                identificacion=payload.identificacion,
                message="Trabajador no encontrado o no activo en el sistema.",
            )

        tipo     = payload.tipo.upper()
        marca_dt = _client_ts_to_bog(payload.client_timestamp) or _bog_now()

        if tipo == "SALIDA":
            closed = await self._marc_repo.close_entry(
                payload.identificacion,
                fecha_hora=marca_dt,
                es_manual=True,
                motivo=payload.motivo,
                latitud=payload.latitud,
                longitud=payload.longitud,
                precision_gps=payload.precision_gps,
            )
            if not closed:
                return ManualResponse(
                    status="no_active_entry",
                    identificacion=payload.identificacion,
                    nombre=worker.nombre,
                    message="No se encontró un ingreso activo para cerrar.",
                )
        else:
            await self._marc_repo.create(
                identificacion=payload.identificacion,
                trabajador=worker.trabajador,
                tipo=tipo,
                es_manual=True,
                motivo=payload.motivo,
                latitud=payload.latitud,
                longitud=payload.longitud,
                precision_gps=payload.precision_gps,
                device_fingerprint=payload.device_fingerprint,
                ip=device_ip,
                fecha_hora=marca_dt,
            )
        await self._session.commit()

        schedule_sync(
            tipo=tipo,
            identificacion=worker.identificacion,
            trabajador=worker.trabajador,
            nombre=worker.nombre.upper(),
            operacion=worker.operacion,
            area=worker.area,
            marca_datetime=marca_dt,
            observaciones=f"Manual | {payload.motivo}" if payload.motivo else "Registro manual",
        )

        return ManualResponse(
            status="recorded",
            identificacion=payload.identificacion,
            nombre=worker.nombre,
            message="Registro manual completado.",
        )
