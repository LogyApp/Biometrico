import math
import time
import asyncio
import logging
from dataclasses import dataclass
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

logger = logging.getLogger(__name__)

RADIO_PROXIMIDAD_KM: float = 0.300  # 300 metros
CACHE_TTL_SEGUNDOS: float = 600.0   # 10 minutos

_cache_ops: list[tuple[str, float, float]] = []
_cache_timestamp: float = 0.0
_cache_lock = asyncio.Lock()


@dataclass
class OperacionGeoResult:
    es_apoyo: bool
    fuera_de_sede: bool
    operacion_efectiva: str
    operacion_asignada: str
    operacion_detectada: Optional[str]
    distancia_m: Optional[int]
    mensaje: Optional[str]


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calcula la distancia ortodrómica en kilómetros entre dos coordenadas GPS."""
    r = 6371.0  # Radio medio de la Tierra en km
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)

    a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return r * c


async def _obtener_operaciones_activas(session: AsyncSession) -> list[tuple[str, float, float]]:
    """Retorna la lista de operaciones activas con coordenadas, usando caché en memoria."""
    global _cache_ops, _cache_timestamp

    now = time.monotonic()
    if _cache_ops and (now - _cache_timestamp) < CACHE_TTL_SEGUNDOS:
        return _cache_ops

    async with _cache_lock:
        # Doble verificación tras adquirir el lock
        if _cache_ops and (time.monotonic() - _cache_timestamp) < CACHE_TTL_SEGUNDOS:
            return _cache_ops

        try:
            result = await session.execute(text("""
                SELECT `OPERACIÓN`, `LATITUD`, `LONGITUD`
                FROM `Maestro_Operaciones`
                WHERE `REGIONAL` != 'INACTIVO'
                  AND `LATITUD` IS NOT NULL
                  AND `LONGITUD` IS NOT NULL
            """))
            rows = result.fetchall()
            ops: list[tuple[str, float, float]] = []
            for row in rows:
                nombre = str(row[0]).strip() if row[0] else ""
                if not nombre or row[1] is None or row[2] is None:
                    continue
                try:
                    lat = float(row[1])
                    lon = float(row[2])
                    ops.append((nombre, lat, lon))
                except (ValueError, TypeError):
                    continue

            _cache_ops = ops
            _cache_timestamp = time.monotonic()
            logger.info("Caché de operaciones geolocalizadas recargada: %d sedes", len(_cache_ops))
            return _cache_ops
        except Exception as exc:
            logger.error("Error al cargar Maestro_Operaciones: %s", exc)
            return _cache_ops or []


async def evaluar_operacion(
    session: AsyncSession,
    lat: Optional[float],
    lng: Optional[float],
    op_asignada: Optional[str],
) -> OperacionGeoResult:
    """
    Determina si la marcación ocurre en la operación asignada, en otra operación (apoyo),
    o fuera del perímetro de sedes conocidas (radio 300 m).
    """
    op_asignada_clean = (op_asignada or "BIOMETRICO").strip()

    # Si no hay coordenadas GPS válidas
    if lat is None or lng is None or (lat == 0.0 and lng == 0.0):
        return OperacionGeoResult(
            es_apoyo=False,
            fuera_de_sede=True,
            operacion_efectiva=op_asignada_clean,
            operacion_asignada=op_asignada_clean,
            operacion_detectada=None,
            distancia_m=None,
            mensaje=(
                f"No detectamos una operación cercana a tu ubicación actual.\n\n"
                f"Tu marcación se registrará en tu operación habitual: {op_asignada_clean}."
            ),
        )

    operaciones = await _obtener_operaciones_activas(session)
    if not operaciones:
        # Fallback sin sedes cargadas
        return OperacionGeoResult(
            es_apoyo=False,
            fuera_de_sede=False,
            operacion_efectiva=op_asignada_clean,
            operacion_asignada=op_asignada_clean,
            operacion_detectada=None,
            distancia_m=None,
            mensaje=None,
        )

    min_dist = float("inf")
    min_op: Optional[str] = None

    for op_nom, op_lat, op_lon in operaciones:
        d = haversine_km(lat, lng, op_lat, op_lon)
        if d < min_dist:
            min_dist = d
            min_op = op_nom

    if min_op is not None and min_dist <= RADIO_PROXIMIDAD_KM:
        dist_m = int(round(min_dist * 1000))
        # Comparación insensible a mayúsculas y acentos normalizados
        if min_op.upper() == op_asignada_clean.upper():
            return OperacionGeoResult(
                es_apoyo=False,
                fuera_de_sede=False,
                operacion_efectiva=op_asignada_clean,
                operacion_asignada=op_asignada_clean,
                operacion_detectada=min_op,
                distancia_m=dist_m,
                mensaje=None,
            )
        else:
            return OperacionGeoResult(
                es_apoyo=True,
                fuera_de_sede=False,
                operacion_efectiva=min_op,
                operacion_asignada=op_asignada_clean,
                operacion_detectada=min_op,
                distancia_m=dist_m,
                mensaje=(
                    f"Identificamos que te encuentras en {min_op}, diferente a tu operación habitual ({op_asignada_clean}).\n\n"
                    f"Tu asistencia quedará registrada en {min_op} y se reportará automáticamente como apoyo desde {op_asignada_clean}."
                ),
            )
    else:
        dist_m = int(round(min_dist * 1000)) if min_op is not None else None
        return OperacionGeoResult(
            es_apoyo=False,
            fuera_de_sede=True,
            operacion_efectiva=op_asignada_clean,
            operacion_asignada=op_asignada_clean,
            operacion_detectada=None,
            distancia_m=dist_m,
            mensaje=(
                f"No detectamos una operación cercana a tu ubicación actual.\n\n"
                f"Tu marcación se registrará en tu operación habitual: {op_asignada_clean}."
            ),
        )
