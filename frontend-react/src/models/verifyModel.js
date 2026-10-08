import { httpPost } from '../services/httpClient';
import { getDeviceFingerprint } from './deviceFingerprint';

export function verify({ identificacion, frame, tipo, location, clientTimestamp, offlineLocalScore }, timeoutMs) {
  return httpPost(
    '/verify',
    {
      identificacion,
      frame,
      tipo,
      latitud: location?.lat ?? null,
      longitud: location?.lng ?? null,
      precision_gps: location?.accuracy ?? null,
      device_fingerprint: getDeviceFingerprint(),
      client_timestamp: clientTimestamp ?? null,
      offline_local_score: offlineLocalScore ?? null,
    },
    timeoutMs
  );
}

export function verifySuccessMessage(tipo) {
  if (tipo === 'ENTRADA') return '¡Ingreso registrado!';
  if (tipo === 'SALIDA') return '¡Salida registrada!';
  return '¡Verificación exitosa!';
}
