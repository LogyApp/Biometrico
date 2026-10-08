import { setStoredPermission } from './permissionsService';

export function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('GPS no disponible en este dispositivo.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setStoredPermission('geolocation', 'granted');
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: Math.round(position.coords.accuracy),
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setStoredPermission('geolocation', 'denied');
        reject(new Error('Ubicación no disponible.'));
      },
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 60000 }
    );
  });
}

export function watchPosition(onUpdate, onError) {
  if (!navigator.geolocation) {
    onError?.(new Error('Geolocalización no disponible en este dispositivo.'));
    return null;
  }
  return navigator.geolocation.watchPosition(
    (position) => {
      setStoredPermission('geolocation', 'granted');
      onUpdate({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        speed: position.coords.speed ?? null,
        accuracy: position.coords.accuracy ?? null,
        heading: position.coords.heading ?? null,
        altitude: position.coords.altitude ?? null,
        ts: position.timestamp,
      });
    },
    (err) => {
      if (err.code === err.PERMISSION_DENIED) setStoredPermission('geolocation', 'denied');
      onError?.(new Error(`GPS: ${err.message}`));
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 }
  );
}

export function clearWatch(watchId) {
  if (watchId != null) navigator.geolocation.clearWatch(watchId);
}
