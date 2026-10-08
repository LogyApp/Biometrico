const STORAGE_KEY = 'lgy_app_version_v1';

export function getKnownVersion() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setKnownVersion(version) {
  try {
    localStorage.setItem(STORAGE_KEY, version);
  } catch {}
}
