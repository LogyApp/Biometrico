const CACHE_NAME = 'logyser-react-v78';
const MAP_CACHE_NAME = 'logyser-map-cache-v1'; // persistente entre versiones de la app
const MAP_CACHE_MAX_ENTRIES = 400; // respuestas de geocoding/rutas ya consultadas
const ASSET_CACHE_NAME = 'logyser-assets-cache-v1'; // persistente entre versiones de la app

const SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
];

const ASSET_PRECACHE_URLS = [
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
  '/brand/logo-mark.png',
  '/mediapipe/face_mesh/face_mesh.binarypb',
  '/mediapipe/face_mesh/face_mesh.js',
  '/mediapipe/face_mesh/face_mesh_solution_packed_assets.data',
  '/mediapipe/face_mesh/face_mesh_solution_packed_assets_loader.js',
  '/mediapipe/face_mesh/face_mesh_solution_simd_wasm_bin.js',
  '/mediapipe/face_mesh/face_mesh_solution_simd_wasm_bin.wasm',
  '/mediapipe/face_mesh/face_mesh_solution_wasm_bin.js',
  '/mediapipe/face_mesh/face_mesh_solution_wasm_bin.wasm',
];

const NEVER_CACHE = [];

// Geocoding y rutas ya vistas por el usuario: se cachean de forma
// oportunista (reactiva, según lo que el usuario va recorriendo), NUNCA de
// forma masiva/preventiva. Solo las respuestas JSON de la API REST — las
// tiles del mapa en sí (maps.googleapis.com/maps/vt, etc.) nunca pasan por
// aquí, porque Google Maps Platform prohíbe cachearlas para uso offline.
const MAP_CACHE_PATTERNS = [
  'maps.googleapis.com/maps/api/',
];

const CACHE_FIRST_PATHS = ['/mediapipe/', '/icons/', '/brand/', '/ort/', '/models/'];
const CACHE_FIRST_DOMAINS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

function shouldBypass(url) {
  if (url.includes('/api/')) return true;
  return NEVER_CACHE.some((domain) => url.includes(domain));
}

function isCacheFirst(url) {
  return CACHE_FIRST_PATHS.some((path) => url.includes(path)) || CACHE_FIRST_DOMAINS.some((domain) => url.includes(domain));
}

function isMapCache(url) {
  return MAP_CACHE_PATTERNS.some((domain) => url.includes(domain));
}

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  const toDelete = keys.length - maxEntries;
  for (let i = 0; i < toDelete; i++) {
    await cache.delete(keys[i]);
  }
}

async function handleMapRequest(request) {
  const cache = await caches.open(MAP_CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
      trimCache(MAP_CACHE_NAME, MAP_CACHE_MAX_ENTRIES);
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)),
      caches.open(ASSET_CACHE_NAME).then((cache) => cache.addAll(ASSET_PRECACHE_URLS)),
    ])
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== MAP_CACHE_NAME && key !== ASSET_CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  if (isMapCache(request.url)) {
    event.respondWith(handleMapRequest(request));
    return;
  }

  if (shouldBypass(request.url)) return;

  if (isCacheFirst(request.url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          const contentLength = Number(response.headers.get('content-length') || 0);
          if (response.ok && contentLength > 0) {
            const clone = response.clone();
            caches.open(ASSET_CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});

const NOTIF_ICON = '/icons/icon-192.png';
const NOTIF_BADGE = '/icons/icon-192.png';

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data?.json() ?? {};
  } catch {}

  const { title = 'Logyser', body = '', id = 'push', tag = id } = data;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: NOTIF_ICON,
      badge: NOTIF_BADGE,
      tag,
      renotify: true,
      vibrate: [200, 100, 200],
    })
  );
});

const pendingNotifications = {};

function cancelPending(id) {
  if (pendingNotifications[id] !== undefined) {
    clearTimeout(pendingNotifications[id]);
    delete pendingNotifications[id];
  }
}

function cancelAllPending() {
  Object.keys(pendingNotifications).forEach(cancelPending);
}

self.addEventListener('message', (event) => {
  const msg = event.data ?? {};

  if (msg.type === 'APP_FOREGROUND') {
    cancelAllPending();
    return;
  }

  if (msg.type === 'SHOW_NOW') {
    const { id, title, body } = msg;
    cancelPending(id);
    self.registration
      .showNotification(title, {
        body,
        icon: NOTIF_ICON,
        badge: NOTIF_BADGE,
        tag: id,
        renotify: true,
        vibrate: [300, 150, 300, 150, 300],
      })
      .catch(() => {});
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow('/');
    })
  );
});
