from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from models.sede import FacialSede
from core.geo import haversine_km

# Radio dentro del cual se considera que alguien está físicamente "en" una
# sede — usado tanto para la alerta interactiva antes de iniciar un traslado
# como para lo que queda guardado en el registro (ver services/movimiento.py).
ORIGEN_SEDE_RADIUS_KM = 0.2


class SedeRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_usable(self, regional: str | None = None) -> list[FacialSede]:
        """Sedes activas y con coordenadas — las únicas que se pueden
        ofrecer como destino de un traslado (las que aún no tienen
        coordenadas no son seleccionables hasta que se completen).

        Si se pasa `regional`, solo se devuelven las sedes de esa regional
        (comparación sin distinguir mayúsculas/espacios, ya que el valor
        viene de dos fuentes distintas: el Excel de sedes y Maestro_Vinculación)."""
        query = (
            select(FacialSede)
            .where(FacialSede.activo.is_(True))
            .where(FacialSede.latitud.is_not(None))
            .where(FacialSede.longitud.is_not(None))
        )
        if regional is not None:
            query = query.where(func.upper(func.trim(FacialSede.regional)) == regional.strip().upper())
        query = query.order_by(FacialSede.regional, FacialSede.lugar)

        result = await self._session.execute(query)
        return list(result.scalars().all())

    async def get_by_id(self, sede_id: int) -> FacialSede | None:
        return await self._session.get(FacialSede, sede_id)

    async def find_nearest(self, lat: float, lng: float) -> tuple[FacialSede | None, float | None, bool]:
        """Sede activa más cercana a (lat, lng) — sin filtrar por regional,
        ya que esto valida presencia física en CUALQUIER sede de la empresa,
        no a cuáles puede ir el trabajador. Devuelve (sede, distancia_km,
        dentro_del_radio)."""
        sedes = await self.list_usable()
        if not sedes:
            return None, None, False

        nearest = min(sedes, key=lambda s: haversine_km(lat, lng, float(s.latitud), float(s.longitud)))
        distancia_km = round(haversine_km(lat, lng, float(nearest.latitud), float(nearest.longitud)), 3)
        return nearest, distancia_km, distancia_km <= ORIGEN_SEDE_RADIUS_KM
