from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from core.database import get_session
from models.marcacion import FacialMarcacion
from models.movimiento import FacialMovimiento
from models.movimiento_waypoint import MovimientoWaypoint
from repositories.vinculacion import VinculacionRepository
from services.operacion_geo import _obtener_operaciones_activas, haversine_km
from schemas.history import HistoryResponse, HistoryRecord, WaypointOut

router = APIRouter(prefix="/api/history", tags=["history"])

_EXCLUIR_TIPOS = {"MOVIMIENTO_INICIO", "MOVIMIENTO_FIN"}


@router.get("/{identificacion}", response_model=HistoryResponse)
async def get_history(
    identificacion: int,
    limit: int = 40,
    session: AsyncSession = Depends(get_session),
) -> HistoryResponse:

    # 1. Obtener operacion asignada y sedes activas para calculo de distancia
    vinc_repo = VinculacionRepository(session)
    worker = await vinc_repo.get_active_worker(identificacion)
    if not worker:
        worker = await vinc_repo.get_worker_any_state(identificacion)
    op_asignada = worker.operacion if worker else None

    geo_targets = await _obtener_operaciones_activas(session)
    op_clean = (op_asignada or "").strip().upper()
    matching_targets = [t for t in geo_targets if t.operacion.upper() == op_clean] if op_clean else []

    def _calc_dist(lat_val: float | None, lng_val: float | None):
        if lat_val is None or lng_val is None or (lat_val == 0.0 and lng_val == 0.0) or not matching_targets:
            return None, None, None, None, None, None
        min_d = float("inf")
        best = None
        for t in matching_targets:
            d = haversine_km(lat_val, lng_val, t.latitud, t.longitud)
            if d < min_d:
                min_d = d
                best = t
        if best is None or min_d == float("inf"):
            return None, None, None, None, None, None
        dist_m = int(round(min_d * 1000))
        en_sede = min_d <= best.radio_km
        radio_m = int(round(best.radio_km * 1000))
        return dist_m, en_sede, best.nombre_punto or best.operacion, best.latitud, best.longitud, radio_m

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
        lat_in = float(m.latitud) if m.latitud else None
        lng_in = float(m.longitud) if m.longitud else None
        dist_in, en_sede_in, pto_in, op_lat_in, op_lng_in, radio_in = _calc_dist(lat_in, lng_in)

        records.append(HistoryRecord(
            tipo_registro="marcacion",
            id=m.id,
            tipo=m.tipo,
            fecha_hora=(m.fecha_entrada or m.fecha_hora).isoformat(),
            latitud=lat_in,
            longitud=lng_in,
            score=float(m.score) if m.score is not None else None,
            es_manual=m.es_manual,
            motivo=m.motivo,
            fecha_salida=m.fecha_salida.isoformat() if m.fecha_salida else None,
            distancia_m=dist_in,
            en_sede=en_sede_in,
            operacion_asignada=op_asignada,
            punto_nombre=pto_in,
            op_lat=op_lat_in,
            op_lng=op_lng_in,
            op_radio_m=radio_in,
        ))
        if m.tipo == "ENTRADA" and m.fecha_salida and m.fecha_entrada:
            lat_out = float(m.latitud_salida) if m.latitud_salida else None
            lng_out = float(m.longitud_salida) if m.longitud_salida else None
            dist_out, en_sede_out, pto_out, op_lat_out, op_lng_out, radio_out = _calc_dist(lat_out, lng_out)

            records.append(HistoryRecord(
                tipo_registro="marcacion",
                id=m.id,
                tipo="SALIDA",
                fecha_hora=m.fecha_salida.isoformat(),
                latitud=lat_out,
                longitud=lng_out,
                score=None,
                es_manual=m.es_manual_salida,
                motivo=m.motivo_salida,
                fecha_salida=None,
                distancia_m=dist_out,
                en_sede=en_sede_out,
                operacion_asignada=op_asignada,
                punto_nombre=pto_out,
                op_lat=op_lat_out,
                op_lng=op_lng_out,
                op_radio_m=radio_out,
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
