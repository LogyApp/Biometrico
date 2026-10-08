import { httpGet, httpPost } from '../services/httpClient';
import { getDeviceFingerprint } from './deviceFingerprint';

const CHECK_ENROLLMENT_TIMEOUT_MS = 7000;
const SAVE_ENROLLMENT_TIMEOUT_MS = 30000;

export function checkEnrollment({ identificacion }) {
  return httpPost(
    '/enrollment/check',
    {
      identificacion,
      device_fingerprint: getDeviceFingerprint(),
    },
    CHECK_ENROLLMENT_TIMEOUT_MS
  );
}

export function getAccessFormError({ documentNumber, consent }) {
  const trimmed = (documentNumber ?? '').trim();
  if (!trimmed) {
    return 'Ingresa tu número de documento.';
  }
  if (!/^\d{4,15}$/.test(trimmed)) {
    return 'El número de documento debe tener entre 4 y 15 dígitos.';
  }
  if (!consent) {
    return 'Debes aceptar la Política de Privacidad para continuar.';
  }
  return null;
}

export function shouldProceedToBiometric(status) {
  return status === 'ready_to_enroll';
}

export function shouldProceedToHome(status) {
  return status === 'already_enrolled';
}

export function saveEnrollment({ identificacion, frontalFrame, livenessFrames }) {
  return httpPost(
    '/enrollment/save',
    {
      identificacion,
      device_fingerprint: getDeviceFingerprint(),
      frontal_frame: frontalFrame,
      liveness_frames: livenessFrames,
    },
    SAVE_ENROLLMENT_TIMEOUT_MS
  );
}

export function isEnrollmentSaved(status) {
  return status === 'enrolled' || status === 'updated';
}

export function fetchEmbeddingVector(identificacion) {
  const fp = encodeURIComponent(getDeviceFingerprint());
  return httpGet(`/enrollment/vector/${identificacion}?device_fingerprint=${fp}`);
}
