import { getKnownVersion, setKnownVersion } from '../models/appVersionStorage';

export async function checkForUpdate() {
  const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) return null;
  const data = await res.json();
  const known = getKnownVersion();
  if (!known) {
    setKnownVersion(data.version);
    return null;
  }
  if (known === data.version) return null;
  return data;
}

export async function applyUpdate(version) {
  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((reg) => reg.unregister()));
  }
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }
  setKnownVersion(version);
  window.location.reload();
}
