import secrets
from datetime import datetime, timedelta, timezone, time as _time
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from repositories.asistencia import _bog_now  # noqa: F401


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _bog_day_range() -> tuple[datetime, datetime]:
    today_bog = _bog_now().date()
    start = datetime.combine(today_bog, _time(0, 0, 0))
    return start, start + timedelta(days=1)


class SessionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    # Las sesiones son por trabajador Y por dispositivo: un trabajador puede
    # tener sesiones activas en varios dispositivos a la vez sin bloquearse.
    async def _get_active(self, identificacion: int, device_fp: str):
        result = await self._session.execute(text("""
            SELECT id, session_token, device_fp, opened_at, expires_at
            FROM facial_sessions
            WHERE identificacion = :id
              AND device_fp = :fp
              AND closed_at IS NULL
              AND expires_at > NOW()
            ORDER BY opened_at DESC
            LIMIT 1
        """), {"id": identificacion, "fp": device_fp})
        return result.mappings().one_or_none()

    async def open(self, identificacion: int, device_fp: str) -> dict:
        active = await self._get_active(identificacion, device_fp)
        if active:
            return {"status": "resumed", "token": active["session_token"]}

        token      = secrets.token_hex(32)
        now        = _utc_now()
        expires_at = now + timedelta(minutes=30)
        await self._session.execute(text("""
            INSERT INTO facial_sessions
                (identificacion, session_token, device_fp, opened_at, expires_at)
            VALUES (:id, :token, :fp, :opened_at, :expires_at)
        """), {
            "id":         identificacion,
            "token":      token,
            "fp":         device_fp,
            "opened_at":  now,
            "expires_at": expires_at,
        })
        return {"status": "opened", "token": token}

    async def close(self, token: str) -> bool:
        result = await self._session.execute(text("""
            UPDATE facial_sessions
            SET closed_at = :now
            WHERE session_token = :token AND closed_at IS NULL
        """), {"token": token, "now": _utc_now()})
        return result.rowcount > 0

    async def renew(self, identificacion: int, device_fp: str) -> str:
        active = await self._get_active(identificacion, device_fp)
        if not active:
            return "expired"
        await self._session.execute(text("""
            UPDATE facial_sessions
            SET expires_at = :new_expiry
            WHERE id = :id
        """), {"new_expiry": _utc_now() + timedelta(minutes=30), "id": active["id"]})
        return "renewed"

    async def other_active_devices(self, identificacion: int, device_fp: str) -> list[dict]:
        """Solo lectura: otros dispositivos del trabajador con sesión abierta y
        vigente ahora mismo. `key` (id de su sesión vigente más antigua) sirve
        al cliente para no repetir la alerta por la misma sesión."""
        result = await self._session.execute(text("""
            SELECT device_fp, MIN(id) AS session_key, MAX(expires_at) AS last_expiry
            FROM facial_sessions
            WHERE identificacion = :id
              AND device_fp <> :fp
              AND closed_at IS NULL
              AND expires_at > NOW()
            GROUP BY device_fp
        """), {"id": identificacion, "fp": device_fp})
        devices = []
        for row in result.mappings().all():
            last_expiry = row["last_expiry"]
            if isinstance(last_expiry, str):  # algunos drivers devuelven MAX() como texto
                last_expiry = datetime.fromisoformat(last_expiry)
            # Cada apertura/heartbeat fija expires_at = ahora + 30 min.
            last_activity = min(last_expiry - timedelta(minutes=30), _utc_now())
            devices.append({
                "device_fp":     row["device_fp"],
                "key":           row["session_key"],
                "last_activity": last_activity,
            })
        return devices

    async def last_marking_coords(self, identificacion: int, device_fp: str) -> tuple[float, float] | None:
        """Coordenadas de la última marcación hecha DESDE ese dispositivo (la
        ENTRADA guarda device_fingerprint junto a su latitud/longitud)."""
        result = await self._session.execute(text("""
            SELECT latitud, longitud
            FROM facial_marcaciones
            WHERE identificacion = :id
              AND device_fingerprint = :fp
              AND latitud IS NOT NULL AND longitud IS NOT NULL
            ORDER BY id DESC
            LIMIT 1
        """), {"id": identificacion, "fp": device_fp})
        row = result.first()
        return (float(row[0]), float(row[1])) if row else None

    async def close_by_identificacion(self, identificacion: int, device_fp: str) -> int:
        """Cierra solo las sesiones del trabajador en ESTE dispositivo; las de
        sus otros dispositivos siguen activas."""
        result = await self._session.execute(text("""
            UPDATE facial_sessions
            SET closed_at = :now
            WHERE identificacion = :id AND device_fp = :fp AND closed_at IS NULL
        """), {"id": identificacion, "fp": device_fp, "now": _utc_now()})
        return result.rowcount

    async def check(self, identificacion: int, device_fp: str) -> dict:
        active = await self._get_active(identificacion, device_fp)
        if not active:
            return {"status": "none", "token": None}
        return {"status": "same_device", "token": active["session_token"]}

    async def get_attendance_state(self, identificacion: int) -> dict:
        result = await self._session.execute(text("""
            SELECT id, COALESCE(fecha_entrada, fecha_hora) AS ts_entrada
            FROM facial_marcaciones
            WHERE identificacion = :id
              AND tipo = 'ENTRADA'
              AND fecha_salida IS NULL
            ORDER BY COALESCE(fecha_entrada, fecha_hora) DESC
            LIMIT 1
        """), {"id": identificacion})

        row = result.mappings().one_or_none()
        if row is not None:
            ts = row["ts_entrada"]
            ms = int(ts.replace(tzinfo=timezone(timedelta(hours=-5))).timestamp() * 1000)
            return {"has_active_entry": True, "last_action": "ENTRADA", "entry_time_ms": ms}

        day_start, day_end = _bog_day_range()
        result = await self._session.execute(text("""
            SELECT COALESCE(fecha_entrada, fecha_hora) AS ts_entrada, fecha_salida
            FROM facial_marcaciones
            WHERE identificacion = :id
              AND tipo = 'ENTRADA'
              AND fecha_salida IS NOT NULL
              AND fecha_salida >= :day_start
              AND fecha_salida <  :day_end
            ORDER BY fecha_salida DESC
            LIMIT 1
        """), {"id": identificacion, "day_start": day_start, "day_end": day_end})

        row = result.mappings().one_or_none()
        if row:
            bog = timezone(timedelta(hours=-5))
            entry_ts = row["ts_entrada"]
            exit_ts  = row["fecha_salida"]
            entry_ms = int(entry_ts.replace(tzinfo=bog).timestamp() * 1000) if entry_ts else None
            exit_ms  = int(exit_ts.replace(tzinfo=bog).timestamp() * 1000)
            return {
                "has_active_entry": False,
                "last_action":      "SALIDA",
                "entry_time_ms":    entry_ms,
                "exit_time_ms":     exit_ms,
            }

        return {"has_active_entry": False, "last_action": None, "entry_time_ms": None, "exit_time_ms": None}
