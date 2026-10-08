import {
  getPendingOutbox,
  markOutboxSyncing,
  markOutboxFailed,
  removeOutboxItem,
  updateOutboxPayload,
  getWorkerProfile,
} from './offlineDb';
import { verify } from '../models/verifyModel';
import { startMovementWithRecovery, finishMovement } from '../models/movementModel';
import { registerManual } from '../models/manualModel';
import { syncOfflineEmbeddingIfStale, ensureOfflineModelWarm } from './offlineEmbeddingSync';

const MAX_SYNC_ATTEMPTS = 8;

let syncing = false;
let listenersAttached = false;

async function syncItem(item) {
  switch (item.type) {
    case 'verify': {
      const res = await verify({ ...item.payload, offlineLocalScore: item.payload.localScore });
      if (res.status !== 'authorized') {
        throw new Error(res.message || `No se pudo sincronizar la marcación (${res.status}).`);
      }
      return;
    }
    case 'movimiento': {
      const { startPayload, finishPayload, movimientoId } = item.payload;

      let resolvedId = movimientoId;
      if (!resolvedId) {
        const res = await startMovementWithRecovery(startPayload);
        resolvedId = res.movimiento_id;
        await updateOutboxPayload(item.id, { movimientoId: resolvedId });
      }

      try {
        await finishMovement({ ...finishPayload, movimiento_id: resolvedId });
      } catch (err) {
        if (err.message === 'MOVEMENT_STALE_AUTO_COMPLETED') {
          const conflictErr = new Error('El recorrido no se pudo confirmar: se cerró automáticamente en el servidor antes de sincronizar. Contacta a soporte.');
          conflictErr.permanent = true;
          throw conflictErr;
        }
        throw err;
      }
      return;
    }
    case 'manual': {
      const res = await registerManual(item.payload);
      if (res.status !== 'recorded') {
        throw new Error(res.message || `No se pudo sincronizar el registro manual (${res.status}).`);
      }
      return;
    }
    default:
      throw new Error(`Tipo de sincronización desconocido: ${item.type}`);
  }
}

export async function syncOutbox() {
  if (syncing || !navigator.onLine) return;
  syncing = true;
  try {
    const pending = await getPendingOutbox();
    for (const item of pending) {
      try {
        await markOutboxSyncing(item.id);
        await syncItem(item);
        await removeOutboxItem(item.id);
      } catch (err) {
        const permanent = err.permanent || (!(err instanceof TypeError) && item.attempts + 1 >= MAX_SYNC_ATTEMPTS);
        await markOutboxFailed(item.id, err.message, permanent);
        if (err instanceof TypeError) break;
      }
    }

    const profile = await getWorkerProfile();
    if (profile?.identificacion) {
      await syncOfflineEmbeddingIfStale(profile.identificacion).catch(() => {});
    }
    await ensureOfflineModelWarm();
  } finally {
    syncing = false;
  }
}

export function requestSync() {
  syncOutbox().catch(() => {});
}

export function initSyncEngine() {
  if (listenersAttached) return;
  listenersAttached = true;
  window.addEventListener('online', requestSync);
  setInterval(requestSync, 60000);
  requestSync();
}
