import { httpGet } from '../services/httpClient';

export function getHistory(identificacion, limit = 60) {
  return httpGet(`/history/${identificacion}?limit=${limit}`);
}

export const TYPE_META = {
  ENTRADA: { label: 'Entrada', role: 'success' },
  SALIDA: { label: 'Salida', role: 'danger' },
  MOVIMIENTO_INICIO: { label: 'Inició movimiento', role: 'move' },
  MOVIMIENTO_FIN: { label: 'Finalizó movimiento', role: 'move' },
  DESTINO_FIJO: { label: 'Movimiento destino fijo', role: 'move' },
  LIBRE: { label: 'Navegación libre', role: 'move' },
  SEDE: { label: 'Traslado entre sedes', role: 'move' },
  MOVIMIENTO: { label: 'Navegación libre', role: 'move' },
  ALMUERZO: { label: 'Almuerzo', role: 'manual' },
  DESAYUNO: { label: 'Desayuno', role: 'manual' },
  BREAK: { label: 'Break', role: 'manual' },
  MANUAL: { label: 'Registro manual', role: 'manual' },
};

export function getTypeMeta(tipo) {
  return TYPE_META[tipo] ?? { label: tipo, role: 'generic' };
}

export function recordBadge(rec) {
  if (rec._failed) return { label: 'No confirmado', role: 'incomplete' };
  if (rec._pending) return { label: 'Sincronizando', role: 'active' };

  const isMove = rec.tipo_registro === 'movimiento';
  if (!isMove) {
    return rec.es_manual
      ? { label: 'Manual', role: 'manual' }
      : { label: 'Biométrico', role: 'success' };
  }
  if (rec.estado === 'ACTIVO') return { label: 'Activo', role: 'active' };
  if (rec.estado === 'COMPLETADO') return { label: 'Completado', role: 'success' };
  return null;
}

export function filterRecords(records, { tipo, desde, hasta }) {
  return records.filter((rec) => {
    if (tipo !== 'all') {
      if (tipo === 'entrada' && rec.tipo !== 'ENTRADA') return false;
      if (tipo === 'salida' && rec.tipo !== 'SALIDA') return false;
      if (tipo === 'movimiento' && rec.tipo_registro !== 'movimiento') return false;
      if (tipo === 'manual' && rec.es_manual !== true) return false;
    }
    return inDateRange(rec.fecha_hora, desde, hasta);
  });
}

export function deriveJornadas(records, { desde, hasta }) {
  return records.filter(
    (rec) => rec.tipo_registro === 'marcacion' && rec.tipo === 'ENTRADA' && inDateRange(rec.fecha_hora, desde, hasta)
  );
}

function inDateRange(isoStr, desde, hasta) {
  if (!desde && !hasta) return true;
  const d = new Date(isoStr);
  if (desde && d < desde) return false;
  if (hasta && d > hasta) return false;
  return true;
}

export function periodShortcutRange(period) {
  const now = new Date();
  const todayCol = new Date(now.toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  todayCol.setHours(0, 0, 0, 0);

  if (period === 'today') {
    const hasta = new Date(todayCol);
    hasta.setHours(23, 59, 59, 999);
    return { desde: new Date(todayCol), hasta };
  }
  if (period === 'week') {
    const desde = new Date(todayCol);
    desde.setDate(todayCol.getDate() - todayCol.getDay());
    return { desde, hasta: null };
  }
  if (period === 'month') {
    return { desde: new Date(todayCol.getFullYear(), todayCol.getMonth(), 1), hasta: null };
  }
  return { desde: null, hasta: null };
}

export function jornadaStatus(entryMs, exitMs) {
  if (!exitMs) return { label: 'Activa', role: 'active' };
  const hours = (exitMs - entryMs) / 3600000;
  if (hours >= 8) return { label: 'Completa', role: 'complete' };
  if (hours >= 4) return { label: 'Parcial', role: 'partial' };
  return { label: 'Incompleta', role: 'incomplete' };
}

export function formatDuration(entryIso, exitIso) {
  const ms = new Date(exitIso).getTime() - new Date(entryIso).getTime();
  if (ms <= 0) return '—';
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes} min`;
}

export function formatElapsed(entryMs, nowMs) {
  const ms = nowMs - entryMs;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
