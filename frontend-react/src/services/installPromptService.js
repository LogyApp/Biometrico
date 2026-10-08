// Captura el evento `beforeinstallprompt` apenas el navegador lo dispare —
// se registra al cargar el módulo (no dentro de un componente) para no
// perderlo si llega antes de que React monte el árbol.

let deferredEvent = null;
let installed = false;
const listeners = new Set();

function notify() {
  listeners.forEach((cb) => cb());
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredEvent = event;
  notify();
});

window.addEventListener('appinstalled', () => {
  installed = true;
  deferredEvent = null;
  notify();
});

export function isInstalled() {
  if (installed) return true;
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  if (window.navigator.standalone === true) return true; // iOS Safari
  return false;
}

export function hasDeferredPrompt() {
  return deferredEvent !== null;
}

/** @returns {Promise<'accepted'|'dismissed'|'unavailable'>} */
export async function promptInstall() {
  if (!deferredEvent) return 'unavailable';
  const event = deferredEvent;
  deferredEvent = null; // el evento nativo solo se puede usar una vez
  event.prompt();
  const choice = await event.userChoice;
  notify();
  return choice.outcome;
}

export function subscribeInstallPrompt(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}
