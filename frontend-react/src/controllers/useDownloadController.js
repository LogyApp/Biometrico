import { useCallback, useEffect, useRef, useState } from 'react';
import { downloadModelWithProgress, ensureLocalFaceModel } from '../services/localFaceService';
import { fetchEmbeddingVector } from '../models/enrollmentModel';
import { getHistory } from '../models/historyModel';
import { saveWorkerProfile, saveEmbeddingVector, saveHistoryCache, setOfflineReady, setMeta, META_KEYS } from '../services/offlineDb';
import { isRateLimited, RATE_LIMIT_MESSAGE } from '../services/connectivity';

// Peso relativo de cada recurso dentro del progreso total mostrado al usuario.
// El módulo de reconocimiento facial (el modelo ONNX, ~167MB) domina el tiempo real.
export const DOWNLOAD_RESOURCES = [
  { key: 'facial', label: 'Módulo de reconocimiento facial', weight: 0.85 },
  { key: 'profile', label: 'Perfiles y credenciales de acceso', weight: 0.1 },
  { key: 'sync', label: 'Sincronización de registros', weight: 0.05 },
];

const TOTAL_MB = 167.5;
const COMPLETE_HOLD_MS = 900;

function formatRemaining(ms) {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function useDownloadController({ worker, onDone }) {
  const [progress, setProgress] = useState(() =>
    DOWNLOAD_RESOURCES.reduce((acc, r) => ({ ...acc, [r.key]: 0 }), {})
  );
  const [elapsedMs, setElapsedMs] = useState(0);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState(null);
  const startedAtRef = useRef(Date.now());
  const runIdRef = useRef(0);

  const run = useCallback(() => {
    const myRun = ++runIdRef.current;
    const stale = () => myRun !== runIdRef.current;

    setError(null);
    setComplete(false);
    startedAtRef.current = Date.now();
    setProgress(DOWNLOAD_RESOURCES.reduce((acc, r) => ({ ...acc, [r.key]: 0 }), {}));

    const setStep = (key, fraction) => {
      if (stale()) return;
      setProgress((prev) => ({ ...prev, [key]: fraction }));
    };

    (async () => {
      try {
        // 1. Módulo de reconocimiento facial — el recurso pesado.
        await downloadModelWithProgress((fraction) => setStep('facial', fraction));
        await ensureLocalFaceModel();
        if (stale()) return;
        setStep('facial', 1);

        // 2. Vector biométrico propio + perfil del trabajador.
        const vectorRes = await fetchEmbeddingVector(worker.identificacion);
        if (vectorRes.status !== 'ok') {
          throw new Error(vectorRes.message || 'No se pudo obtener tu vector biométrico.');
        }
        await saveEmbeddingVector(vectorRes.embedding);
        if (vectorRes.updated_at) await setMeta(META_KEYS.EMBEDDING_UPDATED_AT, vectorRes.updated_at);
        await saveWorkerProfile(worker);
        if (stale()) return;
        setStep('profile', 1);

        // 3. Historial reciente, para poder ver "Registros" sin conexión.
        try {
          const history = await getHistory(worker.identificacion);
          await saveHistoryCache(history.records ?? []);
        } catch {
          // No crítico: si falla, el trabajador simplemente no verá historial
          // offline hasta la próxima sincronización — no bloquea el proceso.
        }
        if (stale()) return;
        setStep('sync', 1);

        await setOfflineReady(true);
        if (stale()) return;

        setComplete(true);
        await new Promise((resolve) => setTimeout(resolve, COMPLETE_HOLD_MS));
        if (!stale()) onDone();
      } catch (err) {
        if (!stale()) setError(isRateLimited(err) ? RATE_LIMIT_MESSAGE : (err.message || 'No se pudo preparar el modo sin conexión.'));
      }
    })();
  }, [worker, onDone]);

  useEffect(() => {
    run();
    return () => {
      runIdRef.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (complete || error) return;
    const tick = setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 200);
    return () => clearInterval(tick);
  }, [complete, error]);

  const overallFraction = DOWNLOAD_RESOURCES.reduce((sum, r) => sum + progress[r.key] * r.weight, 0);
  const overallPct = Math.round(overallFraction * 100);
  const downloadedMb = +(overallFraction * TOTAL_MB).toFixed(1);
  const estimatedTotalMs = overallFraction > 0.02 ? elapsedMs / overallFraction : null;
  const remainingLabel = complete
    ? '00:00'
    : estimatedTotalMs
    ? formatRemaining(estimatedTotalMs - elapsedMs)
    : '--:--';

  return {
    resources: DOWNLOAD_RESOURCES.map((r) => ({ ...r, done: progress[r.key] >= 1 })),
    overallPct,
    downloadedMb,
    totalMb: TOTAL_MB,
    remainingLabel,
    complete,
    error,
    retry: run,
  };
}
