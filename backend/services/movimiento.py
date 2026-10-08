from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from repositories.asistencia import _bog_now, _client_ts_to_bog
from schemas.movimiento import (
    MovimientoStartRequest, MovimientoStartResponse,
    MovimientoFinishRequest, MovimientoFinishResponse,
    MovimientoActiveResponse,
)
from repositories.movimiento import MovimientoRepository
from repositories.vinculacion import VinculacionRepository
from repositories.marcacion import MarcacionRepository
from repositories.sede import SedeRepository
from core.exceptions import WorkerNotFoundError, MovementStaleConflictError
from fastapi import HTTPException, status

# Umbral para auto-completar movimientos huérfanos (sin finalizar)
STALE_THRESHOLD_HOURS = 4


def _calc_speed_stats(waypoints: list[dict]) -> tuple[float, float]:
    speeds = [w.get("speed", 0) for w in waypoints if w.get("speed") is not None and w["speed"] >= 0]
    if not speeds:
        return 0.0, 0.0
    return round(max(speeds), 2), round(sum(speeds) / len(speeds), 2)


class MovimientoService:
    def __init__(self, session: AsyncSession) -> None:
        self._mov_repo  = MovimientoRepository(session)
        self._vinc_repo = VinculacionRepository(session)
        self._marc_repo = MarcacionRepository(session)
        self._sede_repo = SedeRepository(session)
        self._session   = session

    async def start(self, payload: MovimientoStartRequest, device_ip: str) -> MovimientoStartResponse:
        worker = await self._vinc_repo.get_active_worker(payload.identificacion)
        if not worker:
            raise WorkerNotFoundError()

        sede_origen = None
        sede_destino = None
        origen_fuera_de_sede = None
        origen_distancia_sede_km = None
        if payload.tipo == "SEDE":
            if not payload.sede_destino_id:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Debes elegir la sede de destino.",
                )
            sede_destino = await self._sede_repo.get_by_id(payload.sede_destino_id)
            if not sede_destino or not sede_destino.activo:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="La sede de destino seleccionada ya no está disponible.",
                )
            if payload.sede_origen_id:
                sede_origen = await self._sede_repo.get_by_id(payload.sede_origen_id)

            # Auditoría: ¿el trabajador estaba físicamente en alguna sede al
            # iniciar el traslado? No bloquea — solo queda registrado.
            _, origen_distancia_sede_km, origen_dentro_rango = await self._sede_repo.find_nearest(
                payload.lat_inicio, payload.lng_inicio
            )
            origen_fuera_de_sede = not origen_dentro_rango

        active = await self._mov_repo.get_active(payload.identificacion)
        if active:
            now = _bog_now()
            age_hours = (now - active.fecha_inicio).total_seconds() / 3600

            if age_hours > STALE_THRESHOLD_HOURS:
                # Auto-completar movimiento huérfano (iniciado pero nunca finalizado)
                active.estado         = "COMPLETADO"
                active.fecha_fin      = now
                active.duracion_min   = int((now - active.fecha_inicio).total_seconds() / 60)
                active.waypoints_json = {"auto_completed": True, "reason": "stale_over_4h"}
                await self._session.flush()
                # Continuar creando el nuevo movimiento
            else:
                # Movimiento activo reciente — detener y pedir confirmación al frontend
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="ACTIVE_MOVEMENT",
                )

        # Hora real de inicio en el teléfono — igual que en verify, así un
        # movimiento sincronizado horas después conserva el momento real
        # en que el trabajador arrancó, no la hora de sincronización.
        start_dt = _client_ts_to_bog(payload.client_timestamp) or _bog_now()

        mov = await self._mov_repo.create(
            identificacion=worker.identificacion,
            trabajador=worker.trabajador,
            tipo=payload.tipo,
            estado="ACTIVO",
            lat_inicio=payload.lat_inicio,
            lng_inicio=payload.lng_inicio,
            lat_destino=float(sede_destino.latitud) if sede_destino else payload.lat_destino,
            lng_destino=float(sede_destino.longitud) if sede_destino else payload.lng_destino,
            direccion_destino=(
                f"{sede_destino.lugar} ({sede_destino.regional})" if sede_destino else payload.direccion_destino
            ),
            ruta_dist_km=payload.ruta_dist_km,
            ruta_tiempo_min=payload.ruta_tiempo_min,
            requiere_regreso=payload.requiere_regreso,
            paradas_json=[p.model_dump() for p in payload.paradas] or None,
            fecha_inicio=start_dt,
            device_fingerprint=payload.device_fingerprint,
            ip=device_ip,
            es_manual=payload.es_manual,
            motivo=payload.motivo,
            sede_origen_id=sede_origen.id if sede_origen else None,
            sede_destino_id=sede_destino.id if sede_destino else None,
            origen_fuera_de_sede=origen_fuera_de_sede,
            origen_distancia_sede_km=origen_distancia_sede_km,
        )

        await self._marc_repo.create(
            identificacion=worker.identificacion,
            trabajador=worker.trabajador,
            tipo="MOVIMIENTO_INICIO",
            latitud=payload.lat_inicio,
            longitud=payload.lng_inicio,
            device_fingerprint=payload.device_fingerprint,
            ip=device_ip,
            fecha_hora=start_dt,
        )

        await self._session.commit()

        return MovimientoStartResponse(
            movimiento_id=mov.id,
            message="Movimiento iniciado. Seguimiento activo.",
        )

    async def finish(self, payload: MovimientoFinishRequest, device_ip: str) -> MovimientoFinishResponse:
        mov = await self._mov_repo.get_by_id(payload.movimiento_id)
        if not mov:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Movimiento no encontrado.",
            )

        if mov.estado == "COMPLETADO":
            if isinstance(mov.waypoints_json, dict) and mov.waypoints_json.get("auto_completed"):
                raise MovementStaleConflictError()

            return MovimientoFinishResponse(
                status="completed",
                duracion_min=mov.duracion_min or 0,
                distancia_real_km=float(mov.distancia_real_km or 0),
                llego_destino=bool(mov.llego_destino),
                tiempo_en_destino_min=mov.tiempo_en_destino_min,
                total_waypoints=mov.total_waypoints or 0,
                velocidad_max_kmh=float(mov.velocidad_max_kmh or 0),
                velocidad_prom_kmh=float(mov.velocidad_prom_kmh or 0),
                message="Movimiento ya estaba completado.",
            )

        # Hora real de cierre en el teléfono — así la duración calculada
        # refleja el recorrido real, no cuánto tardó en sincronizar.
        end_dt = _client_ts_to_bog(payload.client_timestamp) or _bog_now()
        duracion = max(1, int((end_dt - mov.fecha_inicio).total_seconds() / 60))

        wps_raw = [wp.model_dump() for wp in payload.waypoints]
        vel_max, vel_prom = _calc_speed_stats(wps_raw)

        if wps_raw:
            await self._mov_repo.save_waypoints(mov.id, wps_raw)

        mov.estado             = "COMPLETADO"
        mov.fecha_fin          = end_dt
        mov.duracion_min       = duracion
        mov.distancia_real_km  = payload.distancia_real_km
        mov.desvio_max_km      = payload.desvio_max_km
        mov.velocidad_max_kmh  = vel_max
        mov.velocidad_prom_kmh = vel_prom
        mov.total_waypoints    = len(wps_raw)
        mov.llego_destino      = payload.llego_destino
        mov.tiempo_en_destino_min = payload.tiempo_en_destino_min
        mov.waypoints_json     = {
            "total": len(wps_raw),
            "inicio": wps_raw[0] if wps_raw else None,
            "fin":    wps_raw[-1] if wps_raw else None,
        }

        last_wp = wps_raw[-1] if wps_raw else None
        await self._marc_repo.create(
            identificacion=mov.identificacion,
            trabajador=mov.trabajador,
            tipo="MOVIMIENTO_FIN",
            latitud=last_wp["lat"] if last_wp else None,
            longitud=last_wp["lng"] if last_wp else None,
            device_fingerprint=mov.device_fingerprint,
            ip=device_ip,
            fecha_hora=end_dt,
        )

        await self._session.commit()

        return MovimientoFinishResponse(
            status="completed",
            duracion_min=duracion,
            distancia_real_km=float(payload.distancia_real_km),
            llego_destino=payload.llego_destino,
            tiempo_en_destino_min=payload.tiempo_en_destino_min,
            total_waypoints=len(wps_raw),
            velocidad_max_kmh=vel_max,
            velocidad_prom_kmh=vel_prom,
            message=f"Movimiento completado. {duracion} min · {payload.distancia_real_km:.2f} km",
        )

    async def check_active(self, identificacion: int) -> MovimientoActiveResponse:
        mov = await self._mov_repo.get_active(identificacion)
        if not mov:
            return MovimientoActiveResponse(active=False)
        return MovimientoActiveResponse(
            active=True,
            movimiento_id=mov.id,
            tipo=mov.tipo,
            fecha_inicio=mov.fecha_inicio.isoformat(),
            lat_inicio=float(mov.lat_inicio)       if mov.lat_inicio       is not None else None,
            lng_inicio=float(mov.lng_inicio)       if mov.lng_inicio       is not None else None,
            lat_destino=float(mov.lat_destino)     if mov.lat_destino      is not None else None,
            lng_destino=float(mov.lng_destino)     if mov.lng_destino      is not None else None,
            dir_destino=mov.direccion_destino,
            ruta_dist_km=float(mov.ruta_dist_km)   if mov.ruta_dist_km     is not None else None,
            ruta_tiempo_min=mov.ruta_tiempo_min,
            requiere_regreso=mov.requiere_regreso,
            paradas=mov.paradas_json or [],
            sede_origen_id=mov.sede_origen_id,
            sede_destino_id=mov.sede_destino_id,
        )
