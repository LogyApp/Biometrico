import { httpGet, httpPost } from '../services/httpClient';

export const ARRIVAL_DIST_KM = 0.03;
export const WP_MIN_DIST_KM = 0.03;
export const WP_MIN_TIME_MS = 12000;
export const DEPARTURE_DIST_KM = 0.08;
export const DEPARTURE_CONFIRM_UPDATES = 3;
export const MIN_GPS_ACCURACY_M = 50;
export const MIN_MOVE_M = 3;

// Tipos de movimiento que llevan un destino conocido de antemano (se calcula
// ruta, se detecta llegada, se distingue tramo de ida/vuelta) — a diferencia
// de LIBRE, que es navegación sin destino fijo.
const FIXED_DESTINATION_TYPES = new Set(['DESTINO_FIJO', 'SEDE']);

export function hasFixedDestination(tipo) {
  return FIXED_DESTINATION_TYPES.has(tipo);
}

export function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Espejo de _calc_speed_stats en el backend (services/movimiento.py) — se
// calcula localmente porque el cierre del movimiento ya no espera al servidor.
export function calcSpeedStats(waypoints) {
  const speeds = waypoints
    .map((w) => w.speed)
    .filter((s) => s !== null && s !== undefined && s >= 0);
  if (!speeds.length) return { max: 0, avg: 0 };
  let max = 0;
  let sum = 0;
  for (const s of speeds) {
    if (s > max) max = s;
    sum += s;
  }
  const avg = sum / speeds.length;
  return { max: +max.toFixed(2), avg: +avg.toFixed(2) };
}

export function shouldRecordWaypoint(lastWp, candidate) {
  if (!lastWp) return true;
  const dist = haversineKm(lastWp.lat, lastWp.lng, candidate.lat, candidate.lng);
  const elapsed = candidate.ts - lastWp.ts;
  return dist >= WP_MIN_DIST_KM || elapsed >= WP_MIN_TIME_MS;
}

export function formatMoveTimer(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function startMovement(payload) {
  return httpPost('/movement/start', payload);
}

export function finishMovement(payload) {
  return httpPost('/movement/finish', payload);
}

export function checkActiveMovement(identificacion) {
  return httpGet(`/movement/active/${identificacion}`);
}

export async function startMovementWithRecovery(payload) {
  try {
    return await startMovement(payload);
  } catch (err) {
    if (err.message !== 'ACTIVE_MOVEMENT') throw err;
    const active = await checkActiveMovement(payload.identificacion);
    if (active?.active && active.movimiento_id) {
      return { movimiento_id: active.movimiento_id, message: 'Movimiento activo reanudado.' };
    }
    throw err;
  }
}
