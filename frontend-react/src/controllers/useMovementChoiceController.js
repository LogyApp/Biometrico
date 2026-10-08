import { useState } from 'react';
import { getDeviceFingerprint } from '../models/deviceFingerprint';
import { saveMovementSession } from '../models/movementSessionStorage';

export function useMovementChoiceController({ identificacion, location, onStarted, onSelectDestino, onSelectSedes, onCancel, manualReason }) {
  const [error, setError] = useState(null);

  function selectLibre() {
    if (!location) {
      setError('GPS no disponible. Activa la ubicación e intenta de nuevo.');
      return;
    }
    setError(null);

    const startedAt = Date.now();
    const startPayload = {
      identificacion,
      tipo: 'LIBRE',
      lat_inicio: location.lat,
      lng_inicio: location.lng,
      device_fingerprint: getDeviceFingerprint(),
      client_timestamp: startedAt,
      es_manual: Boolean(manualReason),
      motivo: manualReason ?? null,
    };

    const movement = {
      id: `local-${startedAt}`,
      tipo: 'LIBRE',
      startMs: startedAt,
      lat_inicio: location.lat,
      lng_inicio: location.lng,
      destino: null,
      startPayload,
    };
    saveMovementSession(movement, identificacion);
    onStarted(movement);
  }

  function selectDestino() {
    if (!location) {
      setError('GPS no disponible. Activa la ubicación e intenta de nuevo.');
      return;
    }
    onSelectDestino();
  }

  function selectSedes() {
    if (!location) {
      setError('GPS no disponible. Activa la ubicación e intenta de nuevo.');
      return;
    }
    onSelectSedes();
  }

  return {
    starting: false,
    error,
    selectLibre,
    selectDestino,
    selectSedes,
    onCancel,
  };
}
