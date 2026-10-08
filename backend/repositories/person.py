from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from models.person import Person
from models.enums import DocumentType, PersonStatus


class PersonRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_document_id(self, document_id: str) -> Person | None:
        result = await self._session.execute(
            select(Person).where(Person.document_id == document_id)
        )
        return result.scalar_one_or_none()

    async def exists_by_document_id(self, document_id: str) -> bool:
        result = await self._session.execute(
            select(Person.id).where(Person.document_id == document_id)
        )
        return result.scalar_one_or_none() is not None

    async def create(
        self,
        document_type: DocumentType,
        document_id: str,
        full_name: str,
        email: str | None,
        phone: str | None,
        department: str | None,
        document_issue_date: date | None = None,
    ) -> Person:
        person = Person(
            document_type=document_type,
            document_id=document_id,
            document_issue_date=document_issue_date,
            full_name=full_name,
            email=email,
            phone=phone,
            department=department,
            status=PersonStatus.active,
        )
        self._session.add(person)
        await self._session.flush()
        return person
