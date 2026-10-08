from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from core.database import get_session
from models.marcacion import FacialMarcacion
from models.movimiento import FacialMovimiento
from models.movimiento_waypoint import MovimientoWaypoint
from schemas.history import HistoryResponse, HistoryRecord, WaypointOut

router = APIRouter(prefix="/api/history", tags=["history"])

_EXCLUIR_TIPOS = {"MOVIMIENTO_INICIO", "MOVIMIENTO_FIN"}


@router.get("/{identificacion}", response_model=HistoryResponse)
async def get_history(
    identificacion: int,
    limit: int = 40,
    session: AsyncSession = Depends(get_session),
) -> HistoryResponse:

    marc_q = await session.execute(
        select(FacialMarcacion)
        .where(FacialMarcacion.identificacion == identificacion)
        .where(FacialMarcacion.tipo.notin_(list(_EXCLUIR_TIPOS)))
        .order_by(FacialMarcacion.fecha_hora.desc())
        .limit(limit)
    )
    marcaciones = marc_q.scalars().all()

    mov_q = await session.execute(
        select(FacialMovimiento)
        .where(FacialMovimiento.identificacion == identificacion)
        .order_by(FacialMovimiento.fecha_inicio.desc())
        .limit(limit)
    )
    movimientos = mov_q.scalars().all()

    records: list[HistoryRecord] = []

    for m in marcaciones:
        records.append(HistoryRecord(
            tipo_registro="marcacion",
            id=m.id,
            tipo=m.tipo,
            fecha_hora=(m.fecha_entrada or m.fecha_hora).isoformat(),
            latitud=float(m.latitud) if m.latitud else None,
            longitud=float(m.longitud) if m.longitud else None,
            score=float(m.score) if m.score is not None else None,
            es_manual=m.es_manual,
            motivo=m.motivo,
            fecha_salida=m.fecha_salida.isoformat() if m.fecha_salida else None,
        ))
        if m.tipo == "ENTRADA" and m.fecha_salida and m.fecha_entrada:
            records.append(HistoryRecord(
                tipo_registro="marcacion",
                id=m.id,
                tipo="SALIDA",
                fecha_hora=m.fecha_salida.isoformat(),
                latitud=float(m.latitud_salida) if m.latitud_salida else None,
                longitud=float(m.longitud_salida) if m.longitud_salida else None,
                score=None,
                es_manual=m.es_manual_salida,
                motivo=m.motivo_salida,
                fecha_salida=None,
            ))

    for mv in movimientos:
        fin_wp = (mv.waypoints_json or {}).get("fin") or {}
        records.append(HistoryRecord(
            tipo_registro="movimiento",
            id=mv.id,
            tipo=mv.tipo,
            fecha_hora=mv.fecha_inicio.isoformat(),
            latitud=float(mv.lat_inicio) if mv.lat_inicio else None,
            longitud=float(mv.lng_inicio) if mv.lng_inicio else None,
            estado=mv.estado,
            duracion_min=mv.duracion_min,
            distancia_km=float(mv.distancia_real_km) if mv.distancia_real_km else None,
            total_wps=mv.total_waypoints,
            vel_max=float(mv.velocidad_max_kmh) if mv.velocidad_max_kmh else None,
            vel_prom=float(mv.velocidad_prom_kmh) if mv.velocidad_prom_kmh else None,
            lat_destino=float(mv.lat_destino) if mv.lat_destino else None,
            lng_destino=float(mv.lng_destino) if mv.lng_destino else None,
            dir_destino=mv.direccion_destino,
            llego=mv.llego_destino,
            ruta_dist_km=float(mv.ruta_dist_km) if mv.ruta_dist_km else None,
            lat_fin=float(fin_wp["lat"]) if fin_wp.get("lat") is not None else None,
            lng_fin=float(fin_wp["lng"]) if fin_wp.get("lng") is not None else None,
            requiere_regreso=mv.requiere_regreso,
            tiempo_en_destino_min=mv.tiempo_en_destino_min,
            paradas=mv.paradas_json or [],
        ))

    records.sort(key=lambda r: r.fecha_hora, reverse=True)
    records = records[:limit]

    return HistoryResponse(records=records, total=len(records))


@router.get("/movement/{movimiento_id}/waypoints", response_model=list[WaypointOut])
async def get_waypoints(
    movimiento_id: int,
    session: AsyncSession = Depends(get_session),
) -> list[WaypointOut]:

    result = await session.execute(
        select(MovimientoWaypoint)
        .where(MovimientoWaypoint.movimiento_id == movimiento_id)
        .order_by(MovimientoWaypoint.secuencia)
    )
    wps = result.scalars().all()

    return [
        WaypointOut(
            secuencia=wp.secuencia,
            lat=float(wp.lat),
            lng=float(wp.lng),
            altitud_m=float(wp.altitud_m) if wp.altitud_m else None,
            velocidad_kmh=float(wp.velocidad_kmh) if wp.velocidad_kmh else None,
            precision_m=wp.precision_m,
            fecha_hora=wp.fecha_hora.isoformat(),
        )
        for wp in wps
    ]
