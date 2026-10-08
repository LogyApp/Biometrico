from sqlalchemy.ext.asyncio import AsyncSession
from schemas.register import RegisterRequest, RegisterResponse
from repositories.person import PersonRepository
from repositories.face_embedding import FaceEmbeddingRepository
from repositories.liveness import LivenessAttemptRepository
from models.enums import DocumentType
from services import face as face_svc
from core.exceptions import FaceNotDetectedError, InvalidFrameError


class RegisterService:
    def __init__(self, session: AsyncSession) -> None:
        self._person_repo    = PersonRepository(session)
        self._embedding_repo = FaceEmbeddingRepository(session)
        self._liveness_repo  = LivenessAttemptRepository(session)
        self._session        = session

    async def execute(self, payload: RegisterRequest, device_ip: str) -> RegisterResponse:
        if await self._person_repo.exists_by_document_id(payload.document_id):
            return RegisterResponse(
                status="duplicate",
                document_id=payload.document_id,
                message="Documento ya registrado",
            )

        embeddings = []
        for frame_b64 in payload.frames:
            try:
                img = face_svc.decode_frame(frame_b64)
                emb = face_svc.extract_embedding(img)
                embeddings.append(emb)
            except ValueError as exc:
                msg = str(exc)
                if "rostro" in msg:
                    raise FaceNotDetectedError(msg)
                raise InvalidFrameError()

        final_embedding = face_svc.average_embeddings(embeddings)

        person = await self._person_repo.create(
            document_type=DocumentType(payload.document_type),
            document_id=payload.document_id,
            full_name=payload.full_name,
            email=payload.email,
            phone=payload.phone,
            department=payload.department,
        )

        await self._embedding_repo.create(
            person_id=person.id,
            embedding=face_svc.to_list(final_embedding),
            model_version="buffalo_l",
        )

        await self._liveness_repo.create(
            document_id=payload.document_id,
            steps_completed=3,
            passed=True,
            device_ip=device_ip,
        )

        await self._session.commit()

        return RegisterResponse(
            status="registered",
            document_id=payload.document_id,
            message="Registro exitoso",
        )
