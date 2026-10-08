import { useCallback, useEffect, useRef, useState } from 'react';
import { CameraService } from '../services/cameraService';
import { ensureFaceMesh } from '../services/faceMeshService';
import { extractEmbeddingLocal, cosineSimilarityLocal } from '../services/localFaceService';
import { isOfflineReady, getEmbeddingVector, getWorkerProfile, enqueueOutbox } from '../services/offlineDb';
import { requestSync } from '../services/syncService';
import { verify } from '../models/verifyModel';
import { getManualMotivoError } from '../models/manualModel';
import { MoveTracker } from '../models/moveTracker';
import { LOST_DEBOUNCE_FRAMES, LOST_RESET_FRAMES } from '../models/livenessModel';
import { usePermissionPrompt } from './usePermissionPrompt';

const START_INSTRUCTION = 'Activando la cámara…';
const DETECT_INSTRUCTION = 'Mira al frente y mantén tu rostro dentro del óvalo';
const MOVE_HINT_INSTRUCTION = 'Parpadea o mueve un poco la cabeza para continuar';
const MOVE_HINT_TIMEOUT_MS = 4500;
const SUCCESS_DISPLAY_MS = 1100;
const LOCAL_COSINE_THRESHOLD = 0.65;
const ONLINE_VERIFY_TIMEOUT_MS = 6000;
const SERVER_UNAVAILABLE_STATUSES = new Set([429, 503]);

function isServerUnreachable(err) {
  return err.status === undefined || SERVER_UNAVAILABLE_STATUSES.has(err.status);
}

export function useVerifyController({ identificacion, tipo, location, onDone, onCancel }) {
  const cameraPermission = usePermissionPrompt('camera');
  const videoRef = useRef(null);
  const cameraRef = useRef(null);
  const cameraReadyRef = useRef(false);
  const trackerRef = useRef(null);
  const lostFramesRef = useRef(0);
  const detectedAtRef = useRef(null);
  const mountedRef = useRef(true);
  const runIdRef = useRef(0);
  const manualSheetOpenRef = useRef(false);

  const [status, setStatus] = useState('starting');
  const [errorMessage, setErrorMessage] = useState(null);
  const [faceState, setFaceState] = useState('idle');
  const [instruction, setInstruction] = useState(START_INSTRUCTION);
  const [manualSheetOpen, setManualSheetOpen] = useState(false);
  const [manualMotivo, setManualMotivo] = useState('');
  const [manualError, setManualError] = useState(null);

  const stop = useCallback(() => {
    runIdRef.current++;
    cameraRef.current?.stop();
    cameraRef.current = null;
    cameraReadyRef.current = false;
  }, []);

  const finishAuthorized = useCallback((response, frame) => {
    setStatus('authorized');
    setTimeout(() => {
      if (!mountedRef.current) return;
      stop();
      onDone({ ...response, tipo, frame });
    }, SUCCESS_DISPLAY_MS);
  }, [onDone, tipo, stop]);

  const submitLocal = useCallback(async (frame, landmarks, capturedAt) => {
    try {
      const ready = await isOfflineReady();
      if (!ready) {
        throw new Error('Este dispositivo aún no tiene preparado el acceso — completa la descarga inicial.');
      }
      const profile = await getWorkerProfile();
      if (!profile || Number(profile.identificacion) !== Number(identificacion)) {
        throw new Error('No se encontraron datos biométricos guardados para esta cédula en este dispositivo.');
      }

      const storedVector = await getEmbeddingVector();
      if (!storedVector) {
        throw new Error('No se encontró tu vector biométrico guardado en este dispositivo.');
      }

      const video = videoRef.current;
      const localEmbedding = await extractEmbeddingLocal(video, landmarks, video.videoWidth, video.videoHeight);
      const score = cosineSimilarityLocal(localEmbedding, storedVector);
      const authorized = score >= LOCAL_COSINE_THRESHOLD;

      if (!mountedRef.current) return;

      if (!authorized) {
        setStatus('denied');
        return;
      }

      await enqueueOutbox('verify', { identificacion, frame, tipo, location, clientTimestamp: capturedAt, localScore: score });
      requestSync();

      finishAuthorized(
        {
          status: 'authorized',
          identificacion,
          nombre: profile?.nombre,
          score,
          clientTimestamp: capturedAt,
        },
        frame
      );
    } catch (err) {
      if (!mountedRef.current) return;
      setStatus('error');
      setErrorMessage(err.message);
    }
  }, [identificacion, tipo, location, finishAuthorized]);

  const submit = useCallback(async (frame, landmarks) => {
    const capturedAt = Date.now();

    if (!mountedRef.current) return;
    setStatus('processing');

    try {
      const res = await verify(
        { identificacion, frame, tipo, location, clientTimestamp: capturedAt },
        ONLINE_VERIFY_TIMEOUT_MS
      );
      if (!mountedRef.current) return;

      if (res.status === 'authorized') {
        finishAuthorized({ ...res, clientTimestamp: capturedAt }, frame);
        return;
      }
      if (res.status === 'mismatch') {
        setStatus('denied');
        return;
      }
      setStatus('error');
      setErrorMessage(res.message || 'No se pudo completar la verificación.');
      return;
    } catch (err) {
      if (!mountedRef.current) return;
      if (!isServerUnreachable(err)) {
        setStatus('error');
        setErrorMessage(err.message || 'No se pudo completar la verificación.');
        return;
      }
    }

    await submitLocal(frame, landmarks, capturedAt);
  }, [identificacion, tipo, location, finishAuthorized, submitLocal]);

  const start = useCallback(async () => {
    const myRun = ++runIdRef.current;
    const stale = () => myRun !== runIdRef.current || !mountedRef.current;

    setStatus('starting');
    setErrorMessage(null);
    setFaceState('idle');
    setInstruction(START_INSTRUCTION);
    lostFramesRef.current = 0;
    detectedAtRef.current = null;
    trackerRef.current = new MoveTracker();

    const permitted = await cameraPermission.ensure();
    if (stale()) return;
    if (!permitted) {
      setStatus('error');
      setErrorMessage('Necesitamos acceso a tu cámara para verificar tu identidad.');
      return;
    }

    const camera = new CameraService(videoRef.current);

    try {
      await camera.start(stale);
    } catch (err) {
      if (stale()) { camera.stop(); return; }
      setStatus('error');
      setErrorMessage(err.message);
      return;
    }

    if (stale()) { camera.stop(); return; }
    cameraRef.current = camera;
    cameraReadyRef.current = true;
    setInstruction('Preparando el reconocimiento facial…');

    let faceMesh;
    try {
      faceMesh = await ensureFaceMesh();
    } catch (err) {
      camera.stop();
      if (cameraRef.current === camera) {
        cameraRef.current = null;
        cameraReadyRef.current = false;
      }
      if (stale()) return;
      setStatus('error');
      setErrorMessage(`No se pudo cargar el detector: ${err.message}`);
      return;
    }

    if (stale()) { camera.stop(); return; }

    faceMesh.onResults((results) => {
      if (stale()) return;
      const landmarks = results.multiFaceLandmarks?.[0];

      if (!landmarks) {
        lostFramesRef.current++;
        if (lostFramesRef.current === LOST_DEBOUNCE_FRAMES) {
          setFaceState('lost');
          setInstruction('No detectamos tu rostro. Céntralo dentro del óvalo.');
        }
        if (lostFramesRef.current > LOST_RESET_FRAMES) {
          trackerRef.current.resetBaseline();
          detectedAtRef.current = null;
        }
        return;
      }

      lostFramesRef.current = 0;
      setFaceState('detected');
      if (detectedAtRef.current === null) {
        detectedAtRef.current = Date.now();
      }

      if (manualSheetOpenRef.current) return;

      const confirmed = trackerRef.current.processLandmarks(landmarks);
      if (confirmed) {
        const frame = cameraRef.current.captureFrame();
        submit(frame, landmarks);
        return;
      }

      if (Date.now() - detectedAtRef.current > MOVE_HINT_TIMEOUT_MS) {
        setInstruction(MOVE_HINT_INSTRUCTION);
      }
    });

    setStatus('detecting');
    setInstruction(DETECT_INSTRUCTION);
    camera.startDetectionLoop(faceMesh);
  }, [submit, cameraPermission.ensure]);

  const openManualSheet = useCallback(() => {
    setManualMotivo('');
    setManualError(null);
    manualSheetOpenRef.current = true;
    setManualSheetOpen(true);
  }, []);

  const closeManualSheet = useCallback(() => {
    manualSheetOpenRef.current = false;
    setManualSheetOpen(false);
    lostFramesRef.current = 0;
    detectedAtRef.current = null;
    trackerRef.current = new MoveTracker();
    setFaceState('idle');
    setInstruction(DETECT_INSTRUCTION);
    setStatus('detecting');
  }, []);

  const dismissManualError = useCallback(() => setManualError(null), []);

  const updateManualMotivo = useCallback((value) => setManualMotivo(value.slice(0, 512)), []);

  const submitManualMovement = useCallback(() => {
    const formError = getManualMotivoError(manualMotivo);
    if (formError) {
      setManualError(formError);
      return;
    }
    manualSheetOpenRef.current = false;
    setManualSheetOpen(false);
    stop();
    onDone({
      status: 'authorized',
      tipo,
      manual: true,
      motivo: manualMotivo.trim(),
      clientTimestamp: Date.now(),
    });
  }, [manualMotivo, tipo, onDone, stop]);

  const retry = useCallback(() => {
    if (cameraReadyRef.current) {
      setErrorMessage(null);
      setFaceState('idle');
      setInstruction(DETECT_INSTRUCTION);
      lostFramesRef.current = 0;
      detectedAtRef.current = null;
      trackerRef.current = new MoveTracker();
      setStatus('detecting');
      return;
    }
    start();
  }, [start]);

  useEffect(() => {
    mountedRef.current = true;
    start();
    return () => {
      mountedRef.current = false;
      stop();
    };
  }, []);

  return {
    videoRef,
    status,
    errorMessage,
    faceState,
    instruction,
    retry,
    onCancel,
    manualSheetOpen,
    openManualSheet,
    closeManualSheet,
    manualMotivo,
    updateManualMotivo,
    manualError,
    dismissManualError,
    submitManualMovement,
    permissionPrompt: cameraPermission.visible
      ? { requesting: cameraPermission.requesting, onAllow: cameraPermission.allow, onDismiss: cameraPermission.dismiss }
      : null,
  };
}
