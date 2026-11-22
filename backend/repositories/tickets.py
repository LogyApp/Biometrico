import logging
import secrets
import uuid
from datetime import datetime, date, timezone, timedelta
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

logger = logging.getLogger(__name__)

BOGOTA_TZ = timezone(timedelta(hours=-5))

SQL_POR_CALIFICAR = "(t.token_calificacion IS NOT NULL AND t.satisfaccion IS NULL AND t.Estado IN ('Resuelto', 'Rechazado'))"

MOTIVOS_BIOMETRICO = [
    "Modificar Hora",
    "Agregar Asistencia",
    "Reiniciar lectura de rostro",
    "Otro",
]


def now_bogota() -> str:
    """Devuelve la fecha y hora actual en la zona horaria de Bogotá (UTC-5) en formato YYYY-MM-DD HH:MM:SS."""
    return datetime.now(BOGOTA_TZ).strftime("%Y-%m-%d %H:%M:%S")


class TicketRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_worker_phone(self, identificacion: str | int) -> Optional[str]:
        """Obtiene el Celular registrado en Maestro_Segmentación para una identificación dada."""
        try:
            clean_digits = "".join(c for c in str(identificacion) if c.isdigit())
            if not clean_digits:
                return None
            result = await self._session.execute(
                text("SELECT `Celular` FROM `Maestro_Segmentación` WHERE `Identificación` = :id LIMIT 1"),
                {"id": int(clean_digits)},
            )
            row = result.mappings().one_or_none()
            if row and row.get("Celular"):
                return str(row["Celular"]).strip()
        except Exception as exc:
            logger.warning("No se pudo obtener celular de Maestro_Segmentación para %s: %s", identificacion, exc)
        return None

    async def get_modulos(self) -> list[str]:
        return ["Biometrico"]

    async def get_motivos(self, modulo: str = "Biometrico") -> list[str]:
        if modulo == "Biometrico" or not modulo:
            return MOTIVOS_BIOMETRICO
        try:
            result = await self._session.execute(
                text("SELECT Motivo FROM Config_motivo_tickets WHERE Modulo = :modulo AND Motivo IS NOT NULL ORDER BY Motivo ASC"),
                {"modulo": modulo},
            )
            rows = [row[0] for row in result.fetchall() if row[0]]
            return rows if rows else MOTIVOS_BIOMETRICO
        except Exception as exc:
            logger.warning("No se pudo consultar motivos para modulo '%s': %s", modulo, exc)
            return MOTIVOS_BIOMETRICO

    async def _quincena_actual(self) -> dict:
        today = datetime.now(BOGOTA_TZ).date()
        try:
            res = await self._session.execute(
                text("SELECT `Quincena` AS quincena, `Año` AS anio FROM Maestro_Fechas WHERE Fecha = :fecha LIMIT 1"),
                {"fecha": today},
            )
            row = res.mappings().one_or_none()
            if row and row["quincena"] and row["anio"]:
                q_res = await self._session.execute(
                    text("""
                        SELECT DATE_FORMAT(MIN(Fecha), '%Y-%m-%d') AS desde,
                               DATE_FORMAT(MAX(Fecha), '%Y-%m-%d') AS hasta
                        FROM Maestro_Fechas
                        WHERE `Quincena` = :quincena AND `Año` = :anio
                    """),
                    {"quincena": row["quincena"], "anio": row["anio"]},
                )
                q_row = q_res.mappings().one_or_none()
                if q_row and q_row["desde"]:
                    return {
                        "nombre": row["quincena"],
                        "desde": q_row["desde"],
                        "hasta": q_row["hasta"],
                    }
        except Exception as exc:
            logger.debug("Maestro_Fechas no disponible para quincena: %s", exc)

        # Fallback a cálculo del calendario
        y = today.year
        m = today.month
        d = today.day
        mm = f"{m:02d}"
        if d <= 15:
            return {
                "nombre": f"Quincena 1 de {mm}/{y}",
                "desde": f"{y}-{mm}-01",
                "hasta": f"{y}-{mm}-15",
            }
        else:
            import calendar
            last_day = calendar.monthrange(y, m)[1]
            return {
                "nombre": f"Quincena 2 de {mm}/{y}",
                "desde": f"{y}-{mm}-16",
                "hasta": f"{y}-{mm}-{last_day:02d}",
            }

    async def create_ticket(
        self,
        operacion: str,
        solicitante: str,
        modulo: str = "Biometrico",
        motivo: str = "Otro",
        descripcion: str = "",
        telefono: Optional[str] = None,
        evidencia_url: Optional[str] = None,
    ) -> str:
        ticket = uuid.uuid4().hex[:8]
        token_calificacion = secrets.token_hex(24)
        fecha_reg = now_bogota()
        solicitante_clean = str(solicitante).strip()

        tel_val = None
        if telefono:
            clean_digits = "".join(c for c in str(telefono) if c.isdigit())
            if clean_digits:
                try:
                    tel_val = int(clean_digits)
                except ValueError:
                    tel_val = None

        await self._session.execute(
            text("""
                INSERT INTO Dynamic_Tickets
                (Ticket, fecha_registro, `Operación`, solicitante, modulo, motivo, idrecibo, descripcion, Evidencia, telefono, Estado, token_calificacion, identificaciones)
                VALUES
                (:ticket, :fecha_registro, :operacion, :solicitante, :modulo, :motivo, NULL, :descripcion, :evidencia, :telefono, 'En Proceso', :token_calificacion, :identificaciones)
            """),
            {
                "ticket": ticket,
                "fecha_registro": fecha_reg,
                "operacion": operacion,
                "solicitante": solicitante_clean,
                "modulo": (modulo or "Biometrico").strip(),
                "motivo": motivo.strip(),
                "descripcion": descripcion.strip(),
                "evidencia": evidencia_url,
                "telefono": tel_val,
                "token_calificacion": token_calificacion,
                "identificaciones": solicitante_clean,
            },
        )
        return ticket

    async def get_mis_tickets(self, solicitante: str) -> dict:
        solicitante_str = str(solicitante).strip()
        quincena = await self._quincena_actual()

        sql = f"""
            SELECT
                t.Ticket AS ticket,
                DATE_FORMAT(t.fecha_registro, '%Y-%m-%d %H:%i') AS fechaRegistro,
                t.`Operación` AS operacion,
                t.solicitante AS solicitante,
                COALESCE(NULLIF(t.modulo, ''), 'Biometrico') AS modulo,
                t.motivo AS motivo,
                t.descripcion AS descripcion,
                t.Evidencia AS evidencia,
                t.telefono AS telefono,
                t.Estado AS estado,
                t.Observaciones AS observaciones,
                DATE_FORMAT(t.fecha_finalizacion, '%Y-%m-%d %H:%i') AS fechaFinalizacion,
                t.satisfaccion AS satisfaccion,
                t.sugerencia AS sugerencia,
                DATE_FORMAT(t.fecha_calificacion, '%Y-%m-%d %H:%i') AS fechaCalificacion,
                {SQL_POR_CALIFICAR} AS porCalificar
            FROM Dynamic_Tickets t
            WHERE t.solicitante = :solicitante
              AND (
                  (t.fecha_registro >= :desde AND t.fecha_registro < DATE_ADD(:hasta, INTERVAL 1 DAY))
                  OR t.Estado IN ('En Proceso', 'Pendiente')
                  OR {SQL_POR_CALIFICAR}
              )
            ORDER BY t.fecha_registro DESC
        """

        result = await self._session.execute(
            text(sql),
            {
                "solicitante": solicitante_str,
                "desde": quincena["desde"],
                "hasta": quincena["hasta"],
            },
        )

        rows = []
        por_estado = {}
        por_calificar_count = 0

        for r in result.mappings().all():
            item = dict(r)
            item["porCalificar"] = bool(item.get("porCalificar"))
            if item["porCalificar"]:
                por_calificar_count += 1

            estado = item.get("estado") or "Sin estado"
            por_estado[estado] = por_estado.get(estado, 0) + 1
            rows.append(item)

        return {
            "ok": True,
            "quincena": quincena,
            "total": len(rows),
            "porEstado": por_estado,
            "porCalificar": por_calificar_count,
            "tickets": rows,
        }

    async def calificar_ticket(
        self,
        ticket: str,
        solicitante: str,
        satisfaccion: int,
        sugerencia: Optional[str] = None,
    ) -> bool:
        if not (1 <= satisfaccion <= 5):
            raise ValueError("La calificación debe estar entre 1 y 5 estrellas.")

        solicitante_str = str(solicitante).strip()
        sug_val = (sugerencia.strip()[:2000] if sugerencia else None)
        fecha_calif = now_bogota()

        sql = f"""
            UPDATE Dynamic_Tickets t
            SET t.satisfaccion = :satisfaccion,
                t.sugerencia = :sugerencia,
                t.fecha_calificacion = :fecha_calificacion
            WHERE t.Ticket = :ticket
              AND t.solicitante = :solicitante
              AND {SQL_POR_CALIFICAR}
        """

        result = await self._session.execute(
            text(sql),
            {
                "satisfaccion": satisfaccion,
                "sugerencia": sug_val,
                "fecha_calificacion": fecha_calif,
                "ticket": ticket.strip(),
                "solicitante": solicitante_str,
            },
        )
        return result.rowcount > 0
