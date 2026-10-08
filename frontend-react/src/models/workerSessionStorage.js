const STORAGE_KEY = 'lgy_worker_session_v1';

export function saveWorkerSession({ identificacion }) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ identificacion, savedAt: Date.now() }));
  } catch {}
  // Pide al navegador no borrar el almacenamiento del sitio bajo presión de
  // espacio, para que la sesión sobreviva al cerrar/reabrir la app.
  try {
    navigator.storage?.persist?.().catch(() => {});
  } catch {}
}

export function loadWorkerSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (!saved?.identificacion) return null;
    return saved;
  } catch {
    clearWorkerSession();
    return null;
  }
}

export function clearWorkerSession() {
  localStorage.removeItem(STORAGE_KEY);
}

