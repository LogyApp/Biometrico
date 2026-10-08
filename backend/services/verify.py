import logging
import time
from sqlalchemy.ext.asyncio import AsyncSession
from schemas.verify import VerifyRequest, VerifyResponse
from repositories.face_embedding import FaceEmbeddingRepository
from repositories.marcacion import MarcacionRepository
from repositories.vinculacion import VinculacionRepository
from repositories.asistencia import _bog_now, _client_ts_to_bog, schedule_sync
from services import face as face_svc
from core.config import settings
from core.exceptions import FaceNotDetectedError, InvalidFrameError, ModelNotReadyError, MultipleFacesError, FaceQualityError

logger = logging.getLogger(__name__)


class VerifyService:
    def __init__(self, session: AsyncSession) -> None:
        self._embedding_repo = FaceEmbeddingRepository(session)
        self._marcacion_repo = MarcacionRepository(session)
        self._vinc_repo      = VinculacionRepository(session)
        self._session        = session

    async def execute(self, payload: VerifyRequest, device_ip: str = "unknown") -> VerifyResponse:
        t0 = time.monotonic()

        def _log(status: str, score: float | None = None) -> None:
            logger.info(
                "verify_attempt",
                extra={"extra_fields": {
                    "identificacion": payload.identificacion,
                    "tipo": payload.tipo,
                    "verify_status": status,
                    "score": round(score, 4) if score is not None else None,
                    "duration_ms": round((time.monotonic() - t0) * 1000, 1),
                    "device_ip": device_ip,
                }},
            )

        face_emb = await self._embedding_repo.get_by_identificacion(payload.identificacion)

        if not face_emb:
            _log("not_found")
            return VerifyResponse(
                status="not_found",
                identificacion=payload.identificacion,
                score=0.0,
                message="No hay datos biométricos registrados para este trabajador.",
            )

        try:
            img       = face_svc.decode_frame(payload.frame)
            probe_emb = await face_svc.extract_embedding_async(img)
        except face_svc.ModelNotReady:
            _log("model_not_ready")
            raise ModelNotReadyError()
        except ValueError as exc:
            msg = str(exc)
            if "múltiples" in msg:
                _log("multiple_faces")
                raise MultipleFacesError()
            if "pequeño" in msg:
                _log("face_too_small")
                raise FaceQualityError(msg)
            _log("face_not_detected" if "rostro" in msg else "invalid_frame")
            raise FaceNotDetectedError(msg) if "rostro" in msg else InvalidFrameError()

        stored_emb = face_svc.from_list(face_emb.embedding)
        score      = face_svc.cosine_similarity(probe_emb, stored_emb)

        nombre = (
            face_emb.trabajador.split(" ** ", 1)[1].title()
            if " ** " in face_emb.trabajador
            else face_emb.trabajador.title()
        )

        offline_sync = (
            payload.offline_local_score is not None
            and payload.offline_local_score >= settings.cosine_threshold
        )
        threshold = settings.cosine_threshold
        if offline_sync:
            threshold = max(0.0, settings.cosine_threshold - settings.offline_sync_tolerance)

        if score < threshold:
            _log("mismatch", score)
            return VerifyResponse(
                status="mismatch",
                identificacion=payload.identificacion,
                nombre=nombre,
                score=round(score, 4),
                message="El rostro no coincide con el registrado para este usuario.",
            )

        tipo     = payload.tipo.upper()
        marca_dt = _client_ts_to_bog(payload.client_timestamp) or _bog_now()

        if tipo == "SALIDA":
            closed = await self._marcacion_repo.close_entry(
                payload.identificacion,
                fecha_hora=marca_dt,
                latitud=payload.latitud,
                longitud=payload.longitud,
                precision_gps=payload.precision_gps,
            )
            if not closed:
                _log("no_active_entry", score)
                return VerifyResponse(
                    status="no_active_entry",
                    identificacion=payload.identificacion,
                    nombre=nombre,
                    score=round(score, 4),
                    message="No se encontró un ingreso activo para cerrar.",
                )
        else:
            await self._marcacion_repo.create(
                identificacion=payload.identificacion,
                trabajador=face_emb.trabajador,
                tipo=tipo,
                score=score,
                latitud=payload.latitud,
                longitud=payload.longitud,
                precision_gps=payload.precision_gps,
                device_fingerprint=payload.device_fingerprint,
                ip=device_ip,
                fecha_hora=marca_dt,
            )
        await self._session.commit()

        worker = await self._vinc_repo.get_active_worker(payload.identificacion)
        if worker:
            schedule_sync(
                tipo=tipo,
                identificacion=worker.identificacion,
                trabajador=worker.trabajador,
                nombre=worker.nombre.upper(),
                operacion=worker.operacion,
                area=worker.area,
                marca_datetime=marca_dt,
                observaciones=f"Biométrico | Score: {round(score, 4)}",
            )

        _log("authorized_offline_sync" if offline_sync and score < settings.cosine_threshold else "authorized", score)
        return VerifyResponse(
            status="authorized",
            identificacion=payload.identificacion,
            nombre=nombre,
            score=round(score, 4),
            message="Identidad verificada.",
        )
