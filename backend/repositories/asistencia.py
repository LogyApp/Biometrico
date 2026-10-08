import uuid
import asyncio
import logging
from datetime import date, datetime, time as _time, timezone, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

logger = logging.getLogger(__name__)

_MONTHS_ES = {
    1: "ENE", 2: "FEB", 3: "MAR", 4: "ABR", 5: "MAY", 6: "JUN",
    7: "JUL", 8: "AGO", 9: "SEP", 10: "OCT", 11: "NOV", 12: "DIC",
}

_TIPOS_ASISTENCIA = {"ENTRADA", "SALIDA"}


def _bog_now() -> datetime:
    """Retorna la hora actual en zona Colombia (UTC-5) sin tzinfo."""
    return datetime.now(timezone(timedelta(hours=-5))).replace(tzinfo=None)


def _client_ts_to_bog(client_timestamp: int | None) -> datetime | None:
    """Convierte un epoch-ms del teléfono a hora Colombia sin tzinfo.

    El teléfono es la fuente de verdad de "cuándo pasó" en modo offline —
    esto permite que un registro sincronizado horas después conserve el
    momento real en que ocurrió, no la hora de sincronización."""
    if client_timestamp is None:
        return None
    try:
        return datetime.fromtimestamp(
            client_timestamp / 1000, tz=timezone(timedelta(hours=-5))
        ).replace(tzinfo=None)
    except (OSError, OverflowError, ValueError):
        return None


def _bog_day_range() -> tuple[datetime, datetime]:
    """Colombia's current calendar day: 00:00 – 00:00 next day (Colombia time).
    facial_marcaciones.fecha_hora is stored in Colombia time, so filter against Colombia midnight."""
    today_bog = _bog_now().date()
    start = datetime.combine(today_bog, _time(0, 0, 0))
    return start, start + timedelta(days=1)


def _gen_id(dia: date) -> tuple[str, str]:
    """Genera (id_asistencia, id_registro) con prefijo BIO y hash único."""
    mes     = _MONTHS_ES[dia.month]
    dia_str = f"{dia.day:02d}.{mes}.{dia.year}"
    token   = uuid.uuid4().hex[:8]
    id_reg  = f"BIO - {dia_str} -{token}"
    return f"{id_reg}_T1", id_reg


class AsistenciaRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    # ── Punto de entrada único: decide si es ENTRADA o SALIDA ────────────
    async def sincronizar(
        self,
        tipo: str,
        identificacion: int,
        trabajador: str,
        nombre: str,
        operacion: str | None,
        area: int | None,
        marca_datetime: datetime,
        observaciones: str | None = None,
    ) -> None:
        """
        tipo = "ENTRADA" → INSERT fila con Hora Llegada.
        tipo = "SALIDA"  → UPDATE fila del mismo día llenando Hora Salida
                           y calculando Tiempo Laborado. Si no existe entrada,
                           inserta la fila solo con Hora Salida.
        Cualquier otro tipo (MOVIMIENTO_INICIO, etc.) se ignora.
        """
        if tipo not in _TIPOS_ASISTENCIA:
            return

        if tipo == "ENTRADA":
            await self._registrar_entrada(
                identificacion, trabajador, nombre, operacion, area,
                marca_datetime, observaciones,
            )
        else:
            await self._registrar_salida(
                identificacion, trabajador, nombre, operacion, area,
                marca_datetime, observaciones,
            )

    # ── Entrada ──────────────────────────────────────────────────────────
    async def _registrar_entrada(
        self,
        identificacion: int,
        trabajador: str,
        nombre: str,
        operacion: str | None,
        area: int | None,
        marca_dt: datetime,
        observaciones: str | None,
    ) -> None:
        dia               = marca_dt.date()
        hora_llegada_str  = marca_dt.strftime("%H:%M:%S")
        id_asistencia, id_registro = _gen_id(dia)
        operacion_clean   = operacion or "BIOMETRICO"
        area_str          = str(area) if area is not None else "1"

        await self._session.execute(text("""
            INSERT INTO `Dynamic_Asistencia`
                (`IdAsistencia`, `IdRegistro`,
                 `Operación`, `Novedad`, `Prefijo Novedad`,
                 `Día`, `Area`, `Trabajador`, `Cédula`, `Nombre`,
                 `Hora Llegada`, `Apoyo Otra Operación`,
                 `Observaciones`, `Origen`,
                 `Fecha Registro`, `Usuario`, `Disponible1`, `Estado`)
            VALUES
                (:id_asi, :id_reg,
                 :operacion, 'Asistencia', 'BIO',
                 :dia, :area, :trabajador, :cedula, :nombre,
                 :hora_llegada, 'NO',
                 :obs, :origen,
                 :fecha_reg, 'biometrico', :disp1, 'Yellow')
        """), {
            "id_asi":       id_asistencia,
            "id_reg":       id_registro,
            "operacion":    operacion_clean,
            "dia":          dia,
            "area":         area_str,
            "trabajador":   trabajador,
            "cedula":       identificacion,
            "nombre":       nombre,
            "hora_llegada": hora_llegada_str,
            "obs":          observaciones,
            "origen":       operacion_clean,
            "fecha_reg":    _bog_now(),
            "disp1":        area_str,
        })

    # ── Salida ───────────────────────────────────────────────────────────
    async def _registrar_salida(
        self,
        identificacion: int,
        trabajador: str,
        nombre: str,
        operacion: str | None,
        area: int | None,
        marca_dt: datetime,
        observaciones: str | None,
    ) -> None:
        dia              = marca_dt.date()
        hora_salida_str  = marca_dt.strftime("%H:%M:%S")
        now              = _bog_now()
        operacion_clean  = operacion or "BIOMETRICO"
        area_str         = str(area) if area is not None else "1"

        # Buscar la ENTRADA más reciente sin salida, sin filtrar rígidamente por día
        # para cubrir turnos nocturnos. Prioriza registros de 'biometrico' pero
        # cierra cualquier turno abierto si fue creado por supervisor u otro sistema.
        result = await self._session.execute(text("""
            UPDATE `Dynamic_Asistencia`
            SET
                `Hora Salida`   = :hora_salida,
                `Observaciones` = CASE
                    WHEN `Observaciones` IS NOT NULL
                    THEN CONCAT(`Observaciones`, ' | ', :obs)
                    ELSE :obs
                END
            WHERE `Cédula`         = :cedula
              AND `Hora Llegada`   IS NOT NULL
              AND `Hora Salida`    IS NULL
            ORDER BY (LOWER(`Usuario`) = 'biometrico') DESC, `Día` DESC, `Hora Llegada` DESC
            LIMIT 1
        """), {
            "hora_salida": hora_salida_str,
            "obs":         observaciones or "Salida registrada",
            "cedula":      identificacion,
        })

        if result.rowcount == 0:
            # No existe fila de entrada del día → insertar solo con Hora Salida
            id_asistencia, id_registro = _gen_id(dia)
            await self._session.execute(text("""
                INSERT INTO `Dynamic_Asistencia`
                    (`IdAsistencia`, `IdRegistro`,
                     `Operación`, `Novedad`, `Prefijo Novedad`,
                     `Día`, `Area`, `Trabajador`, `Cédula`, `Nombre`,
                     `Hora Salida`, `Apoyo Otra Operación`,
                     `Observaciones`, `Origen`,
                     `Fecha Registro`, `Usuario`, `Disponible1`, `Estado`)
                VALUES
                    (:id_asi, :id_reg,
                     :operacion, 'Asistencia', 'BIO',
                     :dia, :area, :trabajador, :cedula, :nombre,
                     :hora_salida, 'NO',
                     :obs, :origen,
                     :fecha_reg, 'biometrico', :disp1, 'Yellow')
            """), {
                "id_asi":      id_asistencia,
                "id_reg":      id_registro,
                "operacion":   operacion_clean,
                "dia":         dia,
                "area":        area_str,
                "trabajador":  trabajador,
                "cedula":      identificacion,
                "nombre":      nombre,
                "hora_salida": hora_salida_str,
                "obs":         observaciones,
                "origen":      operacion_clean,
                "fecha_reg":   now,
                "disp1":       area_str,
            })


# ── Background task con reintentos para contingencias ───────────────────────
async def _run_sync(
    tipo: str,
    identificacion: int,
    trabajador: str,
    nombre: str,
    operacion: str | None,
    area: int | None,
    marca_datetime: datetime,
    observaciones: str | None,
    max_retries: int = 3,
) -> None:
    from core.database import AsyncSessionFactory   # import local para evitar circular
    for attempt in range(max_retries):
        try:
            async with AsyncSessionFactory() as session:
                repo = AsistenciaRepository(session)
                await repo.sincronizar(
                    tipo=tipo,
                    identificacion=identificacion,
                    trabajador=trabajador,
                    nombre=nombre,
                    operacion=operacion,
                    area=area,
                    marca_datetime=marca_datetime,
                    observaciones=observaciones,
                )
                await session.commit()
                return
        except Exception as exc:
            if attempt < max_retries - 1:
                await asyncio.sleep(0.5 * (attempt + 1))
                continue
            logger.error("asistencia_sync error tras %d intentos: %s", max_retries, exc)


def schedule_sync(**kwargs) -> None:
    """Lanza el sync en background sin bloquear el response del request."""
    asyncio.create_task(_run_sync(**kwargs))
