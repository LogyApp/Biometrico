from sqlalchemy.ext.asyncio import AsyncSession
from models.liveness import LivenessAttempt


class LivenessAttemptRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(
        self,
        document_id: str,
        steps_completed: int,
        passed: bool,
        device_ip: str | None = None,
    ) -> LivenessAttempt:
        attempt = LivenessAttempt(
            document_id=document_id,
            steps_completed=steps_completed,
            passed=passed,
            device_ip=device_ip,
        )
        self._session.add(attempt)
        await self._session.flush()
        return attempt
