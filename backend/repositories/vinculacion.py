import logging
from datetime import date, datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from dataclasses import dataclass
from typing import Optional
from core.blocklist import is_blocked

logger = logging.getLogger(__name__)


@dataclass
class WorkerInfo:
    identificacion: int
    trabajador: str
    nombre: str
    estado: str
    cargo: Optional[str]
    operacion: Optional[str]
    regional: Optional[str]
    area: Optional[int]                  # código numérico de área de Maestro_Vinculación
    # Datos de Maestro_Segmentación (pueden ser None si no existe el registro)
    tipo_documento_db: Optional[str]    # "Cédula de Ciudadanía", "Permiso...", etc.
    cod_tipo_doc: Optional[str]         # "C", "D", etc.
    fecha_expedicion_db: Optional[date] # fecha real de expedición en el sistema


def _parse_nombre(trabajador: str) -> str:
    if " ** " in trabajador:
        return trabajador.split(" ** ", 1)[1].title()
    return trabajador.title()


def _parse_date(raw) -> Optional[date]:
    if raw is None:
        return None
    if isinstance(raw, datetime):
        return raw.date()
    if isinstance(raw, date):
        return raw

    clean = str(raw).strip().split(" ")[0].split("T")[0]
    if not clean:
        return None

    try:
        if "-" in clean:
            year, month, day = clean.split("-")
            return date(int(year), int(month), int(day))
        if "/" in clean:
            day, month, year = clean.split("/")
            return date(int(year), int(month), int(day))
    except (ValueError, TypeError):
        pass

    logger.warning(
        "fecha_expedicion_unparseable",
        extra={"extra_fields": {"raw_value": str(raw)}},
    )
    return None


# Mapeo de nuestros códigos de documento a los valores en Maestro_Segmentación
_DOC_TYPE_MAP = {
    "CC":  ["cédula de ciudadanía", "cedula de ciudadania", "cc", "c"],
    "CE":  ["cédula de extranjería", "cedula de extranjeria", "permiso de protección temporal",
            "permiso protección temporal", "ce", "d"],
    "TI":  ["tarjeta de identidad", "ti"],
    "PP":  ["pasaporte", "pp"],
    "NIT": ["nit"],
}


def _doc_type_matches(our_code: str, db_tipo: str) -> bool:
    """Verifica si el tipo de documento del usuario coincide con el de la DB."""
    if not db_tipo:
        return True
    db_lower = db_tipo.strip().lower()
    allowed = _DOC_TYPE_MAP.get(our_code.upper(), [])
    return any(a in db_lower or db_lower in a for a in allowed)


class VinculacionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_active_worker(self, identificacion: int) -> WorkerInfo | None:
        if is_blocked(identificacion):
            return None

        result = await self._session.execute(
            text("""
                SELECT
                    v.`Identificación`     AS v_id,
                    v.`Trabajador`         AS v_trabajador,
                    v.`Estado`             AS v_estado,
                    v.`Cargo`             AS v_cargo,
                    v.`Operación`          AS v_operacion,
                    v.`Regional`           AS v_regional,
                    v.`Area`               AS v_area,
                    s.`Tipo de Documento`  AS s_tipo_doc,
                    s.`Cod. Tipo Doc`      AS s_cod_tipo,
                    s.`Fecha Expedición`   AS s_fecha_exp
                FROM `Maestro_Vinculación` v
                LEFT JOIN `Maestro_Segmentación` s
                    ON v.`Identificación` = s.`Identificación`
                WHERE v.`Identificación` = :id
                  AND v.`Estado` = 'Activo'
                LIMIT 1
            """),
            {"id": identificacion},
        )
        row = result.mappings().one_or_none()
        if row is None:
            return None

        return WorkerInfo(
            identificacion=row["v_id"],
            trabajador=row["v_trabajador"],
            nombre=_parse_nombre(row["v_trabajador"]),
            estado=row["v_estado"],
            cargo=row["v_cargo"],
            operacion=row["v_operacion"],
            regional=row["v_regional"],
            area=row["v_area"],
            tipo_documento_db=row["s_tipo_doc"],
            cod_tipo_doc=row["s_cod_tipo"],
            fecha_expedicion_db=_parse_date(row["s_fecha_exp"]),
        )

    async def get_worker_any_state(self, identificacion: int) -> WorkerInfo | None:
        result = await self._session.execute(
            text("""
                SELECT
                    v.`Identificación`     AS v_id,
                    v.`Trabajador`         AS v_trabajador,
                    v.`Estado`             AS v_estado,
                    v.`Cargo`              AS v_cargo,
                    v.`Operación`          AS v_operacion,
                    v.`Regional`           AS v_regional,
                    v.`Area`               AS v_area,
                    s.`Tipo de Documento`  AS s_tipo_doc,
                    s.`Cod. Tipo Doc`      AS s_cod_tipo,
                    s.`Fecha Expedición`   AS s_fecha_exp
                FROM `Maestro_Vinculación` v
                LEFT JOIN `Maestro_Segmentación` s
                    ON v.`Identificación` = s.`Identificación`
                WHERE v.`Identificación` = :id
                ORDER BY (v.`Estado` = 'Activo') DESC
                LIMIT 1
            """),
            {"id": identificacion},
        )
        row = result.mappings().one_or_none()
        if row is None:
            return None

        return WorkerInfo(
            identificacion=row["v_id"],
            trabajador=row["v_trabajador"],
            nombre=_parse_nombre(row["v_trabajador"]),
            estado=row["v_estado"],
            cargo=row["v_cargo"],
            operacion=row["v_operacion"],
            regional=row["v_regional"],
            area=row["v_area"],
            tipo_documento_db=row["s_tipo_doc"],
            cod_tipo_doc=row["s_cod_tipo"],
            fecha_expedicion_db=_parse_date(row["s_fecha_exp"]),
        )

    async def worker_exists(self, identificacion: int) -> bool:
        if is_blocked(identificacion):
            return False

        result = await self._session.execute(
            text("""
                SELECT 1 FROM `Maestro_Vinculación`
                WHERE `Identificación` = :id AND `Estado` = 'Activo'
                LIMIT 1
            """),
            {"id": identificacion},
        )
        return result.fetchone() is not None
