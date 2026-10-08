export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js');
  });
}

const DEV_CLEANUP_FLAG = 'lgy_sw_dev_cleanup_v1';

export function unregisterServiceWorker() {
  if (localStorage.getItem(DEV_CLEANUP_FLAG)) return;
  localStorage.setItem(DEV_CLEANUP_FLAG, '1');

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((reg) => reg.unregister());
    });
  }
  if ('caches' in window) {
    caches.keys().then((keys) => keys.forEach((key) => caches.delete(key)));
  }
}
