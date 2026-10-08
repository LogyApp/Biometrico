const STORAGE_KEY = 'lgy_movement_session_v1';

export function saveMovementSession(movement, identificacion) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...movement, identificacion }));
  } catch {}
}

export function loadMovementSession(identificacion) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (saved?.identificacion !== identificacion) return null;
    return saved;
  } catch {
    return null;
  }
}

export function saveTrackingProgress(identificacion, progress) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved?.identificacion !== identificacion) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...saved, progress }));
  } catch {}
}

export function clearMovementSession() {
  localStorage.removeItem(STORAGE_KEY);
}
