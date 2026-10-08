import { httpPost } from '../services/httpClient';
import { getDeviceFingerprint } from './deviceFingerprint';

export function registerManual({ identificacion, tipo, motivo, location, clientTimestamp }) {
  return httpPost('/attendance/manual', {
    identificacion,
    tipo,
    motivo,
    latitud: location?.lat ?? null,
    longitud: location?.lng ?? null,
    precision_gps: location?.accuracy ?? null,
    device_fingerprint: getDeviceFingerprint(),
    client_timestamp: clientTimestamp ?? null,
  });
}

export function reportExitNovelty({ identificacion, novedad }) {
  return httpPost('/attendance/novedad-salida', {
    identificacion,
    device_fp: getDeviceFingerprint(),
    novedad,
  });
}

export function reportEntryNovelty({ identificacion, novedad }) {
  return httpPost('/attendance/novedad-entrada', {
    identificacion,
    device_fp: getDeviceFingerprint(),
    novedad,
  });
}

export function getManualMotivoError(motivo) {
  const trimmed = (motivo ?? '').trim();
  if (!trimmed) return 'El motivo es obligatorio para completar el registro.';
  if (trimmed.length < 12) return 'Describe el motivo con más detalle (mínimo 12 caracteres).';
  if (trimmed.length > 512) return 'El motivo es demasiado largo (máximo 512 caracteres).';
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length < 3) return 'Escribe una razón completa, no solo una o dos palabras.';
  const uniqueChars = new Set(trimmed.toLowerCase().replace(/\s+/g, ''));
  if (uniqueChars.size < 5) return 'El motivo no parece válido — descríbelo con tus propias palabras.';
  return null;
}
