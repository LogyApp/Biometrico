import { fetchEmbeddingVector } from '../models/enrollmentModel';
import { getMeta, setMeta, saveEmbeddingVector, isOfflineReady, META_KEYS } from './offlineDb';
import { ensureLocalFaceModel } from './localFaceService';

export async function syncOfflineEmbeddingIfStale(identificacion) {
  if (!identificacion || !navigator.onLine) return;

  const res = await fetchEmbeddingVector(identificacion);
  if (res.status !== 'ok' || !res.embedding || !res.updated_at) return;

  const localUpdatedAt = await getMeta(META_KEYS.EMBEDDING_UPDATED_AT);
  if (localUpdatedAt === res.updated_at) return;

  await saveEmbeddingVector(res.embedding);
  await setMeta(META_KEYS.EMBEDDING_UPDATED_AT, res.updated_at);
}

export async function ensureOfflineModelWarm() {
  if (!navigator.onLine) return;
  if (!(await isOfflineReady())) return;
  await ensureLocalFaceModel().catch(() => {});
}
