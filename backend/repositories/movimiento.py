from decimal import Decimal
from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from repositories.asistencia import _bog_now
from sqlalchemy import select
from models.movimiento import FacialMovimiento
from models.movimiento_waypoint import MovimientoWaypoint


class MovimientoRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, **kwargs) -> FacialMovimiento:
        m = FacialMovimiento()
        float_fields = ("lat_inicio", "lng_inicio", "lat_destino", "lng_destino", "ruta_dist_km")
        for k, v in kwargs.items():
            if v is None and k not in ("lat_inicio", "lng_inicio"):
                setattr(m, k, None)
            elif k in float_fields and v is not None:
                setattr(m, k, Decimal(str(v)))
            else:
                setattr(m, k, v)
        self._session.add(m)
        await self._session.flush()
        return m

    async def get_active(self, identificacion: int) -> FacialMovimiento | None:
        result = await self._session.execute(
            select(FacialMovimiento)
            .where(FacialMovimiento.identificacion == identificacion)
            .where(FacialMovimiento.estado == "ACTIVO")
            .order_by(FacialMovimiento.fecha_inicio.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def get_by_id(self, movimiento_id: int) -> FacialMovimiento | None:
        result = await self._session.execute(
            select(FacialMovimiento).where(FacialMovimiento.id == movimiento_id)
        )
        return result.scalar_one_or_none()

    async def save_waypoints(self, movimiento_id: int, waypoints: list[dict]) -> None:
        for i, wp in enumerate(waypoints):
            ts_ms = wp.get("ts", 0)
            try:
                dt = datetime.fromtimestamp(ts_ms / 1000, tz=timezone(timedelta(hours=-5))).replace(tzinfo=None)
            except (OSError, OverflowError, ValueError):
                dt = _bog_now()

            record = MovimientoWaypoint(
                movimiento_id=movimiento_id,
                secuencia=i,
                lat=Decimal(str(wp.get("lat", 0))),
                lng=Decimal(str(wp.get("lng", 0))),
                altitud_m=Decimal(str(wp["alt"])) if wp.get("alt") is not None else None,
                velocidad_kmh=Decimal(str(round(wp.get("speed", 0), 2))) if wp.get("speed") is not None else None,
                precision_m=int(wp["accuracy"]) if wp.get("accuracy") is not None else None,
                rumbo_grados=Decimal(str(wp["heading"])) if wp.get("heading") is not None else None,
                fecha_hora=dt,
            )
            self._session.add(record)
        await self._session.flush()
