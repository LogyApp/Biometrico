from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from core.database import get_session
from models.access_point import AccessPoint
from schemas.access_point import AccessPointOut

router = APIRouter(prefix="/api", tags=["access-points"])


@router.get("/access-points", response_model=list[AccessPointOut])
async def list_access_points(
    session: AsyncSession = Depends(get_session),
) -> list[AccessPoint]:
    result = await session.execute(
        select(AccessPoint).where(AccessPoint.is_active == True)
    )
    return result.scalars().all()


@router.get("/document/{document_id}/exists")
async def document_exists(
    document_id: str,
    session: AsyncSession = Depends(get_session),
) -> dict:
    from sqlalchemy import select
    from models.person import Person
    result = await session.execute(
        select(Person.id).where(Person.document_id == document_id)
    )
    return {"exists": result.scalar_one_or_none() is not None, "document_id": document_id}
