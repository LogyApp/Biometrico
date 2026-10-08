from uuid import UUID
from decimal import Decimal
from sqlalchemy.ext.asyncio import AsyncSession
from models.access_event import AccessEvent
from models.enums import EventType, AccessResult


class AccessEventRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(
        self,
        document_id: str,
        result: AccessResult,
        event_type: EventType = EventType.entry,
        person_id: UUID | None = None,
        access_point_id: UUID | None = None,
        score: float | None = None,
        latitude: float | None = None,
        longitude: float | None = None,
        geo_accuracy: int | None = None,
        is_manual: bool = False,
        manual_reason: str | None = None,
        device_ip: str | None = None,
    ) -> AccessEvent:
        event = AccessEvent(
            person_id=person_id,
            document_id=document_id,
            access_point_id=access_point_id,
            event_type=event_type,
            result=result,
            score=Decimal(str(round(score, 4))) if score is not None else None,
            latitude=Decimal(str(latitude)) if latitude is not None else None,
            longitude=Decimal(str(longitude)) if longitude is not None else None,
            geo_accuracy=geo_accuracy,
            is_manual=is_manual,
            manual_reason=manual_reason,
            device_ip=device_ip,
        )
        self._session.add(event)
        await self._session.flush()
        return event
