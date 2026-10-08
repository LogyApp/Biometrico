from sqlalchemy.ext.asyncio import AsyncSession
from schemas.attendance import AttendanceManualRequest, AttendanceResponse
from repositories.person import PersonRepository
from repositories.access_event import AccessEventRepository
from models.enums import EventType, AccessResult, PersonStatus


class AttendanceService:
    def __init__(self, session: AsyncSession) -> None:
        self._person_repo = PersonRepository(session)
        self._event_repo  = AccessEventRepository(session)
        self._session     = session

    async def manual_record(
        self,
        payload: AttendanceManualRequest,
        device_ip: str,
    ) -> AttendanceResponse:
        person = await self._person_repo.get_by_document_id(payload.document_id)

        if not person:
            return AttendanceResponse(
                status="not_found", document_id=payload.document_id,
                event_type=payload.event_type, is_manual=True,
                message="Documento no registrado",
            )

        if person.status == PersonStatus.blocked:
            return AttendanceResponse(
                status="blocked", document_id=payload.document_id,
                full_name=person.full_name, event_type=payload.event_type,
                is_manual=True, message="Acceso bloqueado",
            )

        await self._event_repo.create(
            document_id=payload.document_id,
            result=AccessResult.authorized,
            event_type=EventType(payload.event_type),
            person_id=person.id,
            access_point_id=payload.access_point_id,
            latitude=payload.latitude,
            longitude=payload.longitude,
            geo_accuracy=payload.geo_accuracy,
            is_manual=True,
            manual_reason=payload.reason,
            device_ip=device_ip,
        )
        await self._session.commit()

        return AttendanceResponse(
            status="recorded",
            document_id=payload.document_id,
            full_name=person.full_name,
            event_type=payload.event_type,
            is_manual=True,
            latitude=payload.latitude,
            longitude=payload.longitude,
            geo_accuracy=payload.geo_accuracy,
            message="Registro manual completado",
        )
