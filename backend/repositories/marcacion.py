from decimal import Decimal
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from models.marcacion import FacialMarcacion
from repositories.asistencia import _bog_now
from core.shift_rules import auto_close_deadline, AUTO_CLOSE_MOTIVO

# Ventana (en minutos) alrededor de una SALIDA ya registrada dentro de la
# cual una nueva solicitud de cierre para la misma identificación se
# considera "lo mismo, ya resuelto" en vez de un error. Cubre el caso de un
# dispositivo offline que sincroniza tarde una SALIDA que ya fue cerrada
# mientras tanto por otro dispositivo o por el cierre automático.
CLOSE_ALREADY_DONE_WINDOW_MIN = 360


class MarcacionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(
        self,
        identificacion: int,
        trabajador: str,
        tipo: str,
        score: float | None = None,
        latitud: float | None = None,
        longitud: float | None = None,
        precision_gps: int | None = None,
        es_manual: bool = False,
        motivo: str | None = None,
        device_fingerprint: str | None = None,
        ip: str | None = None,
        fecha_hora: datetime | None = None,
    ) -> FacialMarcacion:
        now = fecha_hora or _bog_now()

        dup = await self._session.execute(
            text("SELECT id FROM facial_marcaciones WHERE identificacion = :id AND tipo = :tipo AND fecha_hora = :fecha_hora LIMIT 1"),
            {"id": identificacion, "tipo": tipo, "fecha_hora": now},
        )
        dup_row = dup.first()
        if dup_row:
            return await self._session.get(FacialMarcacion, dup_row[0])

        if tipo == "ENTRADA":
            open_result = await self._session.execute(
                text("""
                    SELECT id, COALESCE(fecha_entrada, fecha_hora) AS ts_entrada
                    FROM facial_marcaciones
                    WHERE identificacion = :id AND tipo = 'ENTRADA' AND fecha_salida IS NULL
                    ORDER BY COALESCE(fecha_entrada, fecha_hora) DESC
                    LIMIT 1
                """),
                {"id": identificacion},
            )
            open_row = open_result.first()
            if open_row is not None:
                existing_id, existing_entrada = open_row
                if now < auto_close_deadline(existing_entrada):
                    # Todavía dentro de la ventana normal de ese turno — esto
                    # es un reintento del mismo check-in (fallo de cámara,
                    # doble tap, o un intento offline que se cruzó con uno
                    # online que sí llegó), no un turno nuevo. Se devuelve la
                    # entrada ya existente en vez de crear una duplicada.
                    return await self._session.get(FacialMarcacion, existing_id)

                # El turno anterior nunca se cerró y ya pasó su ventana
                # normal — quedó abandonado. Se cierra administrativamente
                # antes de abrir el nuevo, para no dejarlo huérfano ni
                # mezclarlo con el registro de hoy.
                deadline = auto_close_deadline(existing_entrada)
                await self._session.execute(
                    text("""
                        UPDATE facial_marcaciones
                        SET fecha_salida = :deadline,
                            es_manual_salida = 1,
                            motivo_salida = :motivo
                        WHERE id = :id
                    """),
                    {"deadline": deadline, "motivo": AUTO_CLOSE_MOTIVO, "id": existing_id},
                )

        record = FacialMarcacion(
            identificacion=identificacion,
            trabajador=trabajador,
            tipo=tipo,
            score=Decimal(str(round(score, 4))) if score is not None else None,
            latitud=Decimal(str(latitud)) if latitud is not None else None,
            longitud=Decimal(str(longitud)) if longitud is not None else None,
            precision_gps=precision_gps,
            es_manual=es_manual,
            motivo=motivo,
            device_fingerprint=device_fingerprint,
            ip=ip,
            fecha_hora=now,
            fecha_entrada=now if tipo == "ENTRADA" else None,
        )
        self._session.add(record)
        await self._session.flush()
        return record

    async def find_open_entries(self) -> list[dict]:
        """Todas las ENTRADAs sin SALIDA registrada, sin importar el día."""
        result = await self._session.execute(
            text("""
                SELECT identificacion, COALESCE(fecha_entrada, fecha_hora) AS entrada
                FROM facial_marcaciones
                WHERE tipo = 'ENTRADA' AND fecha_salida IS NULL
            """)
        )
        return [dict(row) for row in result.mappings().all()]

    async def close_entry(
        self,
        identificacion: int,
        fecha_hora: datetime | None = None,
        es_manual: bool = False,
        motivo: str | None = None,
        latitud: float | None = None,
        longitud: float | None = None,
        precision_gps: int | None = None,
    ) -> bool:
        salida_dt = fecha_hora or _bog_now()
        result = await self._session.execute(
            text("""
                UPDATE facial_marcaciones
                SET fecha_salida = :salida_dt,
                    es_manual_salida = :es_manual,
                    motivo_salida = :motivo,
                    latitud_salida = :latitud,
                    longitud_salida = :longitud,
                    precision_gps_salida = :precision_gps
                WHERE id = (
                    SELECT id FROM (
                        SELECT id
                        FROM facial_marcaciones
                        WHERE identificacion = :id
                          AND tipo = 'ENTRADA'
                          AND fecha_salida IS NULL
                        ORDER BY COALESCE(fecha_entrada, fecha_hora) DESC
                        LIMIT 1
                    ) AS t
                )
            """),
            {
                "salida_dt": salida_dt, "id": identificacion,
                "es_manual": es_manual, "motivo": motivo,
                "latitud": latitud, "longitud": longitud, "precision_gps": precision_gps,
            },
        )
        if result.rowcount > 0:
            return True

        dup = await self._session.execute(
            text("SELECT id FROM facial_marcaciones WHERE identificacion = :id AND tipo = 'ENTRADA' AND fecha_salida = :salida_dt LIMIT 1"),
            {"id": identificacion, "salida_dt": salida_dt},
        )
        if dup.first() is not None:
            return True

        # No hay entrada abierta y no hay una salida con el mismo instante
        # exacto — pero puede que esta solicitud sea una sincronización
        # offline tardía de una salida que otro dispositivo (o el cierre
        # automático) ya resolvió con una hora distinta mientras tanto. Si
        # hay una salida reciente para este trabajador, se considera resuelta
        # en vez de fallar — evita que la cola offline reintente para
        # siempre algo que ya no aplica.
        resolved = await self._session.execute(
            text("""
                SELECT id FROM facial_marcaciones
                WHERE identificacion = :id AND tipo = 'ENTRADA' AND fecha_salida IS NOT NULL
                  AND ABS(TIMESTAMPDIFF(MINUTE, fecha_salida, :salida_dt)) <= :window_min
                ORDER BY fecha_salida DESC
                LIMIT 1
            """),
            {"id": identificacion, "salida_dt": salida_dt, "window_min": CLOSE_ALREADY_DONE_WINDOW_MIN},
        )
        return resolved.first() is not None

    async def report_exit_novelty(
        self,
        identificacion: int,
        novedad: str,
        day_start: datetime,
        day_end: datetime,
    ) -> str:
        """Guarda una novedad en motivo_salida de la última salida cerrada del
        día del trabajador, SOLO si ese campo está vacío. Nunca sobrescribe."""
        result = await self._session.execute(
            text("""
                SELECT id, motivo_salida
                FROM facial_marcaciones
                WHERE identificacion = :id
                  AND tipo = 'ENTRADA'
                  AND fecha_salida IS NOT NULL
                  AND fecha_salida >= :day_start
                  AND fecha_salida <  :day_end
                ORDER BY fecha_salida DESC
                LIMIT 1
            """),
            {"id": identificacion, "day_start": day_start, "day_end": day_end},
        )
        row = result.first()
        if row is None:
            return "no_exit_today"

        record_id, motivo_actual = row
        if motivo_actual is not None and motivo_actual.strip():
            return "already_reported"

        # La condición sobre motivo_salida va también en el UPDATE para que
        # dos envíos simultáneos no puedan sobrescribirse entre sí.
        updated = await self._session.execute(
            text("""
                UPDATE facial_marcaciones
                SET motivo_salida = :novedad
                WHERE id = :record_id
                  AND identificacion = :id
                  AND (motivo_salida IS NULL OR TRIM(motivo_salida) = '')
            """),
            {"novedad": novedad, "record_id": record_id, "id": identificacion},
        )
        return "recorded" if updated.rowcount > 0 else "already_reported"

    async def report_entry_novelty(
        self,
        identificacion: int,
        novedad: str,
        day_start: datetime,
        day_end: datetime,
    ) -> str:
        """Guarda una novedad en `motivo` de la ENTRADA que muestra la tarjeta
        de hoy (la abierta, o si no la cerrada hoy — mismo criterio que
        SessionRepository.get_attendance_state), SOLO si está vacío."""
        result = await self._session.execute(
            text("""
                SELECT id, motivo
                FROM facial_marcaciones
                WHERE identificacion = :id
                  AND tipo = 'ENTRADA'
                  AND fecha_salida IS NULL
                ORDER BY COALESCE(fecha_entrada, fecha_hora) DESC
                LIMIT 1
            """),
            {"id": identificacion},
        )
        row = result.first()
        if row is None:
            result = await self._session.execute(
                text("""
                    SELECT id, motivo
                    FROM facial_marcaciones
                    WHERE identificacion = :id
                      AND tipo = 'ENTRADA'
                      AND fecha_salida IS NOT NULL
                      AND fecha_salida >= :day_start
                      AND fecha_salida <  :day_end
                    ORDER BY fecha_salida DESC
                    LIMIT 1
                """),
                {"id": identificacion, "day_start": day_start, "day_end": day_end},
            )
            row = result.first()
        if row is None:
            return "no_entry_today"

        record_id, motivo_actual = row
        if motivo_actual is not None and motivo_actual.strip():
            return "already_reported"

        updated = await self._session.execute(
            text("""
                UPDATE facial_marcaciones
                SET motivo = :novedad
                WHERE id = :record_id
                  AND identificacion = :id
                  AND (motivo IS NULL OR TRIM(motivo) = '')
            """),
            {"novedad": novedad, "record_id": record_id, "id": identificacion},
        )
        return "recorded" if updated.rowcount > 0 else "already_reported"
