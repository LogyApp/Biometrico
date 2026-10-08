const CACHE_NAME = "logyser-facial-v18";

const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/styles.css",
  "/manifest.json",
  "/js/api.js",
  "/js/camera.js",
  "/js/liveness.js",
  "/js/movement.js",
  "/js/ui.js",
  "/js/app.js",
];

// URLs externas que NUNCA deben ser cacheadas
const NEVER_CACHE = [
  "tile.openstreetmap.org",
  "cartocdn.com",
  "basemaps.cartocdn.com",
  "unpkg.com",
  "nominatim.openstreetmap.org",
  "router.project-osrm.org",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "storage.googleapis.com",
];

function shouldBypass(url) {
  if (url.includes("/api/")) return true;
  return NEVER_CACHE.some(domain => url.includes(domain));
}

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  if (shouldBypass(e.request.url)) return;
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});


// ══════════════════════════════════════════════════════════════════════════
// WEB PUSH — el backend envía el push directamente al dispositivo.
// Este evento despierta el SW aunque haya sido eliminado por el OS.
// Es el único mecanismo fiable para notificaciones fuera del App.
// ══════════════════════════════════════════════════════════════════════════

const _NOTIF_ICON  = "/icons/icon-192.png";
const _NOTIF_BADGE = "/icons/icon-192.png";

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data?.json() ?? {}; } catch { /* payload malformado */ }

  const { title = "Logyser", body = "", id = "push", tag = id } = data;

  // event.waitUntil es obligatorio: mantiene el SW vivo hasta mostrar la notificación
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon:     _NOTIF_ICON,
      badge:    _NOTIF_BADGE,
      tag,
      renotify: true,
      vibrate:  [200, 100, 200],
    })
  );
});


// ══════════════════════════════════════════════════════════════════════════
// NOTIFICACIONES INMEDIATAS — desde app.js via postMessage (SHOW_NOW)
// Usado para eventos síncronos que ocurren mientras el app aún está vivo:
//   · Pérdida de conexión con movimiento activo
//   · Reconexión tras offline
// El SW puede estar vivo en este punto (el evento acaba de ocurrir en la página).
// ══════════════════════════════════════════════════════════════════════════

// Mapa id → timeoutId para poder cancelar notificaciones SHOW_NOW pendientes
const _pending = {};

function _cancelPending(id) {
  if (_pending[id] !== undefined) {
    clearTimeout(_pending[id]);
    delete _pending[id];
  }
}

function _cancelAll() {
  Object.keys(_pending).forEach(_cancelPending);
}

// Mensajes desde app.js
self.addEventListener("message", (event) => {
  const msg = event.data ?? {};

  // App volvió al primer plano — cancelar notificaciones SHOW_NOW pendientes
  if (msg.type === "APP_FOREGROUND") {
    _cancelAll();
    return;
  }

  // Notificación inmediata (pérdida/recuperación de red con movimiento activo)
  if (msg.type === "SHOW_NOW") {
    const { id, title, body } = msg;
    _cancelPending(id);
    self.registration.showNotification(title, {
      body,
      icon:     _NOTIF_ICON,
      badge:    _NOTIF_BADGE,
      tag:      id,
      renotify: true,
      vibrate:  [300, 150, 300, 150, 300],
    }).catch(() => {});
    return;
  }
});


// ── Click en notificación → traer la app al frente ────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) return client.focus();
      }
      return self.clients.openWindow("/");
    }),
  );
});
