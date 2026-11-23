import math
import time
import asyncio
import logging
from dataclasses import dataclass
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

logger = logging.getLogger(__name__)

RADIO_PROXIMIDAD_KM: float = 0.300  # 300 metros por defecto
CACHE_TTL_SEGUNDOS: float = 600.0   # 10 minutos


@dataclass
class SedeGeoTarget:
    operacion: str
    nombre_punto: Optional[str]
    ciudad: Optional[str]
    latitud: float
    longitud: float
    radio_km: float = 0.300


@dataclass
class OperacionGeoResult:
    es_apoyo: bool
    fuera_de_sede: bool
    operacion_efectiva: str
    operacion_asignada: str
    operacion_detectada: Optional[str]
    distancia_m: Optional[int]
    mensaje: Optional[str]


_cache_targets: list[SedeGeoTarget] = []
_cache_timestamp: float = 0.0
_cache_lock = asyncio.Lock()


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


async def _obtener_operaciones_activas(session: AsyncSession) -> list[SedeGeoTarget]:
    """
    Retorna la lista de sedes principales y puntos satélites con coordenadas,
    usando caché en memoria de 10 minutos.
    """
    global _cache_targets, _cache_timestamp

    now = time.monotonic()
    if _cache_targets and (now - _cache_timestamp) < CACHE_TTL_SEGUNDOS:
        return _cache_targets

    async with _cache_lock:
        if _cache_targets and (time.monotonic() - _cache_timestamp) < CACHE_TTL_SEGUNDOS:
            return _cache_targets

        targets: list[SedeGeoTarget] = []

        # 1. Cargar operaciones principales desde Maestro_Operaciones
        try:
            res_ops = await session.execute(text("""
                SELECT `OPERACIÓN`, `LATITUD`, `LONGITUD`
                FROM `Maestro_Operaciones`
                WHERE `REGIONAL` != 'INACTIVO'
                  AND `LATITUD` IS NOT NULL
                  AND `LONGITUD` IS NOT NULL
            """))
            for row in res_ops.fetchall():
                nombre = str(row[0]).strip() if row[0] else ""
                if not nombre or row[1] is None or row[2] is None:
                    continue
                try:
                    targets.append(SedeGeoTarget(
                        operacion=nombre,
                        nombre_punto=None,
                        ciudad=None,
                        latitud=float(row[1]),
                        longitud=float(row[2]),
                        radio_km=RADIO_PROXIMIDAD_KM,
                    ))
                except (ValueError, TypeError):
                    continue
        except Exception as exc:
            logger.error("Error al cargar Maestro_Operaciones: %s", exc)

        # 2. Cargar puntos de operación satélites desde Maestro_Operaciones_Puntos
        try:
            res_puntos = await session.execute(text("""
                SELECT `operacion`, `nombre_punto`, `ciudad`, `latitud`, `longitud`, `radio_metros`
                FROM `Maestro_Operaciones_Puntos`
                WHERE `activo` = 1
                  AND `latitud` IS NOT NULL
                  AND `longitud` IS NOT NULL
            """))
            for row in res_puntos.fetchall():
                op_nombre = str(row[0]).strip() if row[0] else ""
                pto_nombre = str(row[1]).strip() if row[1] else ""
                ciudad = str(row[2]).strip() if row[2] else None
                if not op_nombre or row[3] is None or row[4] is None:
                    continue
                try:
                    radio_m = int(row[5]) if row[5] is not None else 300
                    radio_km = radio_m / 1000.0
                    targets.append(SedeGeoTarget(
                        operacion=op_nombre,
                        nombre_punto=pto_nombre or op_nombre,
                        ciudad=ciudad,
                        latitud=float(row[3]),
                        longitud=float(row[4]),
                        radio_km=radio_km,
                    ))
                except (ValueError, TypeError):
                    continue
        except Exception as exc:
            logger.warning("Nota: Maestro_Operaciones_Puntos no disponible o error: %s", exc)

        _cache_targets = targets
        _cache_timestamp = time.monotonic()
        logger.info("Caché de geolocalización recargada: %d destinos activos", len(_cache_targets))
        return _cache_targets


async def evaluar_operacion(
    session: AsyncSession,
    lat: Optional[float],
    lng: Optional[float],
    op_asignada: Optional[str],
) -> OperacionGeoResult:
    """
    Determina si la marcación ocurre en la operación asignada (sede principal o punto satélite),
    en otra operación distinta (apoyo), o fuera del perímetro de sedes conocidas.
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

    targets = await _obtener_operaciones_activas(session)
    if not targets:
        return OperacionGeoResult(
            es_apoyo=False,
            fuera_de_sede=False,
            operacion_efectiva=op_asignada_clean,
            operacion_asignada=op_asignada_clean,
            operacion_detectada=None,
            distancia_m=None,
            mensaje=None,
        )

    # Buscar el punto más cercano que esté dentro de su respectivo radio permitido
    min_dist = float("inf")
    best_target: Optional[SedeGeoTarget] = None

    for target in targets:
        d = haversine_km(lat, lng, target.latitud, target.longitud)
        if d <= target.radio_km and d < min_dist:
            min_dist = d
            best_target = target

    if best_target is not None:
        dist_m = int(round(min_dist * 1000))
        punto_label = best_target.nombre_punto or best_target.operacion

        # Comparación de la operación padre (insensible a mayúsculas y acentos)
        if best_target.operacion.upper() == op_asignada_clean.upper():
            return OperacionGeoResult(
                es_apoyo=False,
                fuera_de_sede=False,
                operacion_efectiva=op_asignada_clean,
                operacion_asignada=op_asignada_clean,
                operacion_detectada=punto_label,
                distancia_m=dist_m,
                mensaje=None,
            )
        else:
            return OperacionGeoResult(
                es_apoyo=True,
                fuera_de_sede=False,
                operacion_efectiva=best_target.operacion,
                operacion_asignada=op_asignada_clean,
                operacion_detectada=punto_label,
                distancia_m=dist_m,
                mensaje=(
                    f"Identificamos que te encuentras en {punto_label}, diferente a tu operación habitual ({op_asignada_clean}).\n\n"
                    f"Tu asistencia quedará registrada en {best_target.operacion} y se reportará automáticamente como apoyo desde {op_asignada_clean}."
                ),
            )
    else:
        # Fuera del perímetro de todas las sedes y puntos satélites
        nearest_d = float("inf")
        for target in targets:
            d = haversine_km(lat, lng, target.latitud, target.longitud)
            if d < nearest_d:
                nearest_d = d
        dist_m = int(round(nearest_d * 1000)) if nearest_d < float("inf") else None

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
