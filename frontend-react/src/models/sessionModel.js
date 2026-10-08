import { httpGet, httpPost } from '../services/httpClient';
import { getDeviceFingerprint } from './deviceFingerprint';

export function openSession(identificacion) {
  return httpPost('/session/open', {
    identificacion,
    device_fp: getDeviceFingerprint(),
  });
}

// Timeout corto: es limpieza best-effort en el servidor, no debe hacer
// esperar al usuario para completar el logout local.
const CLOSE_SESSION_TIMEOUT_MS = 5000;

export function closeSessionByIdentificacion(identificacion) {
  return httpPost(
    '/session/close-by-id',
    { identificacion, device_fp: getDeviceFingerprint() },
    CLOSE_SESSION_TIMEOUT_MS
  );
}

export function sendHeartbeat(identificacion) {
  return httpPost('/session/heartbeat', {
    identificacion,
    device_fp: getDeviceFingerprint(),
  });
}

export function getOtherDevices(identificacion) {
  const fp = encodeURIComponent(getDeviceFingerprint());
  return httpGet(`/session/others/${identificacion}?fp=${fp}`);
}

export function getAttendanceState(identificacion) {
  return httpGet(`/session/state/${identificacion}`);
}
