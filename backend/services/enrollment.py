from sqlalchemy.ext.asyncio import AsyncSession
from core.cache import embedding_cache
from schemas.enrollment import (
    EnrollmentCheckRequest, EnrollmentCheckResponse,
    EnrollmentSaveRequest, EnrollmentSaveResponse,
    EmbeddingVectorResponse,
    WorkerStatus,
)
from repositories.vinculacion import VinculacionRepository
from repositories.face_embedding import FaceEmbeddingRepository
from repositories.session import SessionRepository
from services import face as face_svc
from core.exceptions import (
    WorkerNotFoundError, FaceNotDetectedError, InvalidFrameError,
    ModelNotReadyError,
)


class EnrollmentService:
    def __init__(self, session: AsyncSession) -> None:
        self._vinc_repo      = VinculacionRepository(session)
        self._embedding_repo = FaceEmbeddingRepository(session)
        self._session_repo   = SessionRepository(session)
        self._session        = session

    async def check(self, payload: EnrollmentCheckRequest) -> EnrollmentCheckResponse:
        worker = await self._vinc_repo.get_active_worker(payload.identificacion)

        if not worker:
            return EnrollmentCheckResponse(
                status="not_found",
                message="Trabajador no encontrado o no activo en el sistema.",
            )

        existing = await self._embedding_repo.get_by_identificacion(payload.identificacion)

        if existing:
            stored_fp = existing.device_fingerprint
            sent_fp   = payload.device_fingerprint
            stored_is_new = bool(stored_fp and "-" not in stored_fp)
            sent_is_new   = bool(sent_fp   and "-" not in sent_fp)
            if (
                stored_is_new
                and sent_is_new
                and stored_fp != sent_fp
            ):
                session_state = await self._session_repo.check(
                    payload.identificacion, sent_fp
                )
                if session_state["status"] == "other_device":
                    return EnrollmentCheckResponse(
                        status="wrong_device",
                        message=(
                            "Esta cuenta ya está activa en otro dispositivo. "
                            "Contacta a tu supervisor para reasignar el dispositivo."
                        ),
                    )

            return EnrollmentCheckResponse(
                status="already_enrolled",
                worker=WorkerStatus(
                    identificacion=worker.identificacion,
                    nombre=worker.nombre,
                    cargo=worker.cargo,
                    operacion=worker.operacion,
                    regional=worker.regional,
                    has_biometrics=True,
                ),
                message="Trabajador identificado.",
            )

        return EnrollmentCheckResponse(
            status="ready_to_enroll",
            worker=WorkerStatus(
                identificacion=worker.identificacion,
                nombre=worker.nombre,
                cargo=worker.cargo,
                operacion=worker.operacion,
                regional=worker.regional,
                has_biometrics=False,
            ),
            message="Trabajador identificado. Procede con el registro biométrico.",
        )

    async def save(self, payload: EnrollmentSaveRequest) -> EnrollmentSaveResponse:
        worker = await self._vinc_repo.get_active_worker(payload.identificacion)
        if not worker:
            raise WorkerNotFoundError()

        for frame_b64 in payload.liveness_frames:
            try:
                img = face_svc.decode_frame(frame_b64)
                await face_svc.extract_embedding_async(img)
            except face_svc.ModelNotReady:
                raise ModelNotReadyError()
            except ValueError as exc:
                msg = str(exc)
                raise FaceNotDetectedError(msg) if "rostro" in msg else InvalidFrameError()

        try:
            frontal_img = face_svc.decode_frame(payload.frontal_frame)
            frontal_embedding = await face_svc.extract_embedding_async(frontal_img)
        except face_svc.ModelNotReady:
            raise ModelNotReadyError()
        except ValueError as exc:
            msg = str(exc)
            raise FaceNotDetectedError(msg) if "rostro" in msg else InvalidFrameError()

        final_embedding = face_svc.average_embeddings([frontal_embedding])

        existing = await self._embedding_repo.get_by_identificacion(payload.identificacion)
        if existing:
            existing.embedding           = face_svc.to_list(final_embedding)
            existing.trabajador          = worker.trabajador
            existing.cargo               = worker.cargo
            existing.operacion           = worker.operacion
            existing.regional            = worker.regional
            existing.document_type       = payload.document_type
            existing.document_issue_date = payload.document_issue_date
            existing.device_fingerprint  = payload.device_fingerprint
            await self._session.flush()
            status = "updated"
        else:
            await self._embedding_repo.create(
                identificacion=worker.identificacion,
                trabajador=worker.trabajador,
                cargo=worker.cargo,
                operacion=worker.operacion,
                regional=worker.regional,
                document_type=payload.document_type,
                document_issue_date=payload.document_issue_date,
                device_fingerprint=payload.device_fingerprint,
                embedding=face_svc.to_list(final_embedding),
            )
            status = "enrolled"

        await self._session.commit()
        embedding_cache.delete(worker.identificacion)

        return EnrollmentSaveResponse(
            status=status,
            identificacion=worker.identificacion,
            nombre=worker.nombre,
            message="Datos biométricos registrados exitosamente.",
        )

    async def get_vector(self, identificacion: int, device_fingerprint: str | None) -> EmbeddingVectorResponse:
        existing = await self._embedding_repo.get_by_identificacion(identificacion)
        if not existing:
            return EmbeddingVectorResponse(status="not_found", message="No hay datos biométricos registrados.")

        stored_fp = existing.device_fingerprint
        stored_is_new = bool(stored_fp and "-" not in stored_fp)
        sent_is_new = bool(device_fingerprint and "-" not in device_fingerprint)
        if stored_is_new and sent_is_new and stored_fp != device_fingerprint:
            session_state = await self._session_repo.check(identificacion, device_fingerprint)
            if session_state["status"] == "other_device":
                return EmbeddingVectorResponse(
                    status="wrong_device",
                    message="El vector biométrico solo se puede descargar desde el dispositivo enrolado.",
                )
            existing.device_fingerprint = device_fingerprint
            await self._session.commit()

        return EmbeddingVectorResponse(
            status="ok",
            identificacion=existing.identificacion,
            nombre=existing.trabajador,
            embedding=existing.embedding,
            model_version=existing.model_version,
            updated_at=existing.updated_at.isoformat(),
            message="Vector biométrico disponible.",
        )
