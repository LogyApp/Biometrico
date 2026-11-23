const STORAGE_KEYS = {
  camera: 'lgy_perm_camera',
  geolocation: 'lgy_perm_geolocation',
};

export function getStoredPermission(name) {
  return localStorage.getItem(STORAGE_KEYS[name]);
}

export function setStoredPermission(name, value) {
  if (value === 'granted') {
    localStorage.setItem(STORAGE_KEYS[name], value);
  } else {
    // No almacenar 'denied' permanentemente en localStorage;
    // así, si el usuario denegó por error y luego lo activa en Ajustes,
    // la app no queda bloqueada para siempre hasta desinstalar.
    localStorage.removeItem(STORAGE_KEYS[name]);
  }
}

export async function queryLivePermission(name) {
  if (!navigator.permissions?.query) return null;
  try {
    const status = await navigator.permissions.query({ name });
    return status.state;
  } catch {
    return null;
  }
}

export async function isGeolocationBlocked() {
  const live = await queryLivePermission('geolocation');
  return live === 'denied';
}

export async function resolvePermissionStatus(name) {
  const live = await queryLivePermission(name);
  if (live === 'granted') {
    setStoredPermission(name, 'granted');
    return 'granted';
  }
  if (live === 'denied') {
    return 'denied';
  }
  return getStoredPermission(name) ?? 'unknown';
}

export async function probeCameraPermission() {
  return true;
}

export function probeGeolocationPermission() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => {
        setStoredPermission('geolocation', 'granted');
        resolve(true);
      },
      () => {
        resolve(false);
      },
      { timeout: 15000, maximumAge: 60000 }
    );
  });
}
