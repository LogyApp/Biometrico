import { openDB } from 'idb';

const DB_NAME = 'logyser-offline';
const DB_VERSION = 1;

const META = 'meta';
const OUTBOX = 'outbox';

// Claves usadas dentro del store `meta` (key-value simple).
export const META_KEYS = {
  OFFLINE_READY: 'offlineReady',
  WORKER_PROFILE: 'workerProfile',
  EMBEDDING_VECTOR: 'embeddingVector',
  EMBEDDING_SAVED_AT: 'embeddingSavedAt',
  EMBEDDING_UPDATED_AT: 'embeddingUpdatedAt',
  HISTORY_CACHE: 'historyCache',
  ATTENDANCE_CACHE: 'attendanceCache',
  SEDES_CACHE: 'sedesCache',
};

let dbPromise = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(META)) {
          db.createObjectStore(META);
        }
        if (!db.objectStoreNames.contains(OUTBOX)) {
          const store = db.createObjectStore(OUTBOX, { keyPath: 'id', autoIncrement: true });
          store.createIndex('status', 'status');
          store.createIndex('createdAt', 'createdAt');
        }
      },
      // Otra pestaña/instancia con una conexión vieja puede impedir que esta
      // abra — sin estos handlers, openDB() se queda esperando para siempre
      // y cualquier operación que dependa de getDb() (guardar un movimiento,
      // marcar asistencia, etc.) se cuelga sin ningún error visible.
      blocked() {
        console.warn('offlineDb: apertura bloqueada por otra conexión abierta.');
      },
      blocking() {
        // Esta conexión bloquea una versión más nueva en otra pestaña — la
        // cerramos para dejarla pasar, en vez de dejar todo bloqueado.
        dbPromise?.then((db) => db.close());
        dbPromise = null;
      },
      terminated() {
        dbPromise = null;
      },
    });
  }
  return dbPromise;
}

// ── meta (perfil, vector, flag de listo-para-offline) ──────────────────────

export async function setMeta(key, value) {
  const db = await getDb();
  await db.put(META, value, key);
}

export async function getMeta(key) {
  const db = await getDb();
  return db.get(META, key);
}

export async function isOfflineReady() {
  return Boolean(await getMeta(META_KEYS.OFFLINE_READY));
}

export async function setOfflineReady(ready) {
  return setMeta(META_KEYS.OFFLINE_READY, Boolean(ready));
}

export async function saveWorkerProfile(profile) {
  return setMeta(META_KEYS.WORKER_PROFILE, profile);
}

export async function getWorkerProfile() {
  return getMeta(META_KEYS.WORKER_PROFILE);
}

// vector: Float32Array de 512 posiciones (o array plano equivalente)
export async function saveEmbeddingVector(vector) {
  await setMeta(META_KEYS.EMBEDDING_VECTOR, Array.from(vector));
  await setMeta(META_KEYS.EMBEDDING_SAVED_AT, Date.now());
}

export async function getEmbeddingVector() {
  const raw = await getMeta(META_KEYS.EMBEDDING_VECTOR);
  return raw ? Float32Array.from(raw) : null;
}

export async function saveHistoryCache(records) {
  return setMeta(META_KEYS.HISTORY_CACHE, records);
}

export async function getHistoryCache() {
  return (await getMeta(META_KEYS.HISTORY_CACHE)) ?? [];
}

export async function saveAttendanceCache(state) {
  return setMeta(META_KEYS.ATTENDANCE_CACHE, state);
}

export async function getAttendanceCache() {
  return getMeta(META_KEYS.ATTENDANCE_CACHE);
}

export async function saveSedesCache(sedes) {
  return setMeta(META_KEYS.SEDES_CACHE, sedes);
}

export async function getSedesCache() {
  return (await getMeta(META_KEYS.SEDES_CACHE)) ?? [];
}

// Waypoints del recorrido de un movimiento — una entrada por movimiento
// (clave dinámica, no hace falta un store propio para esto).
export async function saveWaypointsCache(movimientoId, waypoints) {
  return setMeta(`waypoints:${movimientoId}`, waypoints);
}

export async function getWaypointsCache(movimientoId) {
  return (await getMeta(`waypoints:${movimientoId}`)) ?? null;
}

export async function clearOfflineAssets() {
  const db = await getDb();
  await db.delete(META, META_KEYS.OFFLINE_READY);
  await db.delete(META, META_KEYS.WORKER_PROFILE);
  await db.delete(META, META_KEYS.EMBEDDING_VECTOR);
  await db.delete(META, META_KEYS.EMBEDDING_SAVED_AT);
  await db.delete(META, META_KEYS.EMBEDDING_UPDATED_AT);
}

// ── outbox (cola de operaciones pendientes de sincronizar) ─────────────────
// type: 'verify' (payload: {identificacion, frame, tipo, location, clientTimestamp})
//     | 'movimiento' (payload: {startPayload, finishPayload} — se reproducen en secuencia)

export async function enqueueOutbox(type, payload) {
  const db = await getDb();
  const id = await db.add(OUTBOX, {
    type,
    payload,
    createdAt: Date.now(),
    status: 'pending',
    attempts: 0,
    lastError: null,
  });
  return id;
}

export async function getPendingOutbox() {
  const db = await getDb();
  const all = await db.getAllFromIndex(OUTBOX, 'status', 'pending');
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

export async function countPendingOutbox() {
  const db = await getDb();
  return (await db.getAllFromIndex(OUTBOX, 'status', 'pending')).length;
}

export async function getFailedOutbox() {
  const db = await getDb();
  return db.getAllFromIndex(OUTBOX, 'status', 'failed');
}

export async function getAllOutbox() {
  const db = await getDb();
  const all = await db.getAll(OUTBOX);
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function countFailedOutbox() {
  const db = await getDb();
  return (await db.getAllFromIndex(OUTBOX, 'status', 'failed')).length;
}

export async function markOutboxSyncing(id) {
  const db = await getDb();
  const item = await db.get(OUTBOX, id);
  if (!item) return;
  item.status = 'syncing';
  await db.put(OUTBOX, item);
}

export async function removeOutboxItem(id) {
  const db = await getDb();
  await db.delete(OUTBOX, id);
}

export async function updateOutboxPayload(id, payloadPatch) {
  const db = await getDb();
  const item = await db.get(OUTBOX, id);
  if (!item) return;
  item.payload = { ...item.payload, ...payloadPatch };
  await db.put(OUTBOX, item);
}

export async function markOutboxFailed(id, errorMessage, permanent = false) {
  const db = await getDb();
  const item = await db.get(OUTBOX, id);
  if (!item) return;
  item.status = permanent ? 'failed' : 'pending';
  item.attempts += 1;
  item.lastError = errorMessage;
  await db.put(OUTBOX, item);
}

export async function retryFailedOutbox() {
  const db = await getDb();
  const failed = await db.getAllFromIndex(OUTBOX, 'status', 'failed');
  for (const item of failed) {
    item.status = 'pending';
    item.attempts = 0;
    await db.put(OUTBOX, item);
  }
}
