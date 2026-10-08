from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from models.face_embedding import FaceEmbedding
from core.cache import embedding_cache
from core.blocklist import is_blocked


class FaceEmbeddingRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_identificacion(self, identificacion: int) -> FaceEmbedding | None:
        if is_blocked(identificacion):
            return None

        cached = embedding_cache.get(identificacion)
        if cached is not None:
            return cached

        result = await self._session.execute(
            select(FaceEmbedding).where(
                FaceEmbedding.identificacion == identificacion,
                FaceEmbedding.is_active == True,
            )
        )
        record = result.scalar_one_or_none()
        if record is not None:
            embedding_cache.set(identificacion, record)
        return record

    async def has_embedding(self, identificacion: int) -> bool:
        if is_blocked(identificacion):
            return False

        result = await self._session.execute(
            select(FaceEmbedding.id).where(
                FaceEmbedding.identificacion == identificacion,
                FaceEmbedding.is_active == True,
            )
        )
        return result.scalar_one_or_none() is not None

    async def create(
        self,
        identificacion: int,
        trabajador: str,
        cargo: str | None,
        operacion: str | None,
        regional: str | None,
        document_type: str | None,
        document_issue_date: date | None,
        device_fingerprint: str | None,
        embedding: list[float],
        model_version: str = "buffalo_l",
    ) -> FaceEmbedding:
        record = FaceEmbedding(
            identificacion=identificacion,
            trabajador=trabajador,
            cargo=cargo,
            operacion=operacion,
            regional=regional,
            document_type=document_type,
            document_issue_date=document_issue_date,
            device_fingerprint=device_fingerprint,
            embedding=embedding,
            model_version=model_version,
            is_active=True,
        )
        self._session.add(record)
        await self._session.flush()
        return record
