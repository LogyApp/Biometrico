const STORAGE_KEYS = {
  camera: 'lgy_perm_camera',
  geolocation: 'lgy_perm_geolocation',
};

export function getStoredPermission(name) {
  return localStorage.getItem(STORAGE_KEYS[name]);
}

export function setStoredPermission(name, value) {
  localStorage.setItem(STORAGE_KEYS[name], value);
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

export async function resolvePermissionStatus(name) {
  const live = await queryLivePermission(name);
  if (live === 'granted') {
    setStoredPermission(name, 'granted');
    return 'granted';
  }
  if (live === 'denied') {
    setStoredPermission(name, 'denied');
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
      setStoredPermission('geolocation', 'denied');
      resolve(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => {
        setStoredPermission('geolocation', 'granted');
        resolve(true);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setStoredPermission('geolocation', 'denied');
        }
        resolve(false);
      },
      { timeout: 10000, maximumAge: 60000 }
    );
  });
}
