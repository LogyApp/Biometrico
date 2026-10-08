import { useEffect, useState } from 'react';
import { ensureFaceMesh } from '../services/faceMeshService';
import { ensureLocalFaceModel } from '../services/localFaceService';
import { isOfflineReady } from '../services/offlineDb';
import { usePermissionPrompt } from './usePermissionPrompt';
import { checkForUpdate } from '../services/appUpdateService';

const MIN_DISPLAY_MS = 1200;

function statusForProgress(fraction) {
  if (fraction < 0.34) return 'Verificando entorno seguro…';
  if (fraction < 0.7) return 'Cargando reconocimiento facial…';
  if (fraction < 1) return 'Preparando cámara…';
  return 'Listo';
}

export function useSplashController({ onReady }) {
  const cameraPermission = usePermissionPrompt('camera');
  const [progress, setProgress] = useState(0);
  const [updateInfo, setUpdateInfo] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();

    async function preload() {
      const offlineReady = await isOfflineReady();
      const tasks = [
        () => ensureFaceMesh(),
        () => cameraPermission.ensure(),
        ...(offlineReady ? [() => ensureLocalFaceModel()] : []),
      ];

      let done = 0;
      await Promise.allSettled(
        tasks.map((task) =>
          task().catch(() => {}).then(() => {
            done += 1;
            if (!cancelled) setProgress(done / tasks.length);
          })
        )
      );

      if (cancelled) return;

      const update = await checkForUpdate().catch(() => null);
      if (cancelled) return;
      if (update) {
        setUpdateInfo(update);
        return;
      }

      const remaining = Math.max(0, MIN_DISPLAY_MS - (Date.now() - startedAt));
      setTimeout(() => {
        if (!cancelled) onReady();
      }, remaining);
    }

    preload();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    progress,
    statusText: statusForProgress(progress),
    permissionPrompt: cameraPermission.visible
      ? { requesting: cameraPermission.requesting, onAllow: cameraPermission.allow, onDismiss: cameraPermission.dismiss }
      : null,
    updateInfo,
  };
}
