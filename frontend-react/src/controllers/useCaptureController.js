import { useCallback, useEffect, useRef, useState } from 'react';
import { CameraService } from '../services/cameraService';
import { ensureFaceMesh } from '../services/faceMeshService';
import { GestureTracker } from '../models/gestureTracker';
import {
  ENROLLMENT_STEPS,
  STEP_INSTRUCTIONS,
  LOST_DEBOUNCE_FRAMES,
  LOST_RESET_FRAMES,
} from '../models/livenessModel';
import { saveEnrollment, isEnrollmentSaved } from '../models/enrollmentModel';
import { usePermissionPrompt } from './usePermissionPrompt';
import { isRateLimited, RATE_LIMIT_MESSAGE } from '../services/connectivity';

export function useCaptureController({ identificacion, onEnrolled, onCancel }) {
  const cameraPermission = usePermissionPrompt('camera');
  const videoRef = useRef(null);
  const cameraRef = useRef(null);
  const trackerRef = useRef(null);
  const livenessFramesRef = useRef([]);
  const frontalFrameRef = useRef(null);
  const lostFramesRef = useRef(0);
  const mountedRef = useRef(true);
  const runIdRef = useRef(0);

  const [status, setStatus] = useState('starting');
  const [errorMessage, setErrorMessage] = useState(null);
  const [faceState, setFaceState] = useState('idle');
  const [instruction, setInstruction] = useState('Iniciando cámara...');
  const [stepIndex, setStepIndex] = useState(0);
  const [stepDone, setStepDone] = useState(() => ENROLLMENT_STEPS.map(() => false));

  const stop = useCallback(() => {
    runIdRef.current++;
    cameraRef.current?.stop();
    cameraRef.current = null;
  }, []);

  const finish = useCallback(async () => {
    stop();
    if (!mountedRef.current) return;
    setStatus('saving');
    try {
      const response = await saveEnrollment({
        identificacion,
        frontalFrame: frontalFrameRef.current,
        livenessFrames: livenessFramesRef.current,
      });
      if (!mountedRef.current) return;
      if (isEnrollmentSaved(response.status)) {
        onEnrolled(response);
      } else {
        setStatus('error');
        setErrorMessage(response.message || 'No se pudo completar el registro biométrico.');
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setStatus('error');
      setErrorMessage(isRateLimited(err) ? RATE_LIMIT_MESSAGE : err.message);
    }
  }, [identificacion, onEnrolled, stop]);

  const start = useCallback(async () => {
    const myRun = ++runIdRef.current;
    const stale = () => myRun !== runIdRef.current || !mountedRef.current;

    setStatus('starting');
    setErrorMessage(null);
    setFaceState('idle');
    setInstruction('Iniciando cámara...');
    setStepIndex(0);
    setStepDone(ENROLLMENT_STEPS.map(() => false));
    livenessFramesRef.current = [];
    frontalFrameRef.current = null;
    lostFramesRef.current = 0;
    trackerRef.current = new GestureTracker(ENROLLMENT_STEPS);

    const permitted = await cameraPermission.ensure();
    if (stale()) return;
    if (!permitted) {
      setStatus('error');
      setErrorMessage('Necesitamos acceso a tu cámara para continuar con el registro biométrico.');
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
    setInstruction('Cargando detector...');

    let faceMesh;
    try {
      faceMesh = await ensureFaceMesh();
    } catch (err) {
      camera.stop();
      if (cameraRef.current === camera) cameraRef.current = null;
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
          setInstruction('No te veo. Centra tu rostro en el óvalo.');
        }
        if (lostFramesRef.current > LOST_RESET_FRAMES) {
          trackerRef.current.resetBaseline();
        }
        return;
      }

      lostFramesRef.current = 0;
      setFaceState('detected');

      const tracker = trackerRef.current;
      const stepBefore = tracker.currentStep;
      const advanced = tracker.processLandmarks(landmarks);

      if (advanced) {
        const completedStep = ENROLLMENT_STEPS[stepBefore];
        const frame = camera.captureFrame();
        if (completedStep === 'still') {
          frontalFrameRef.current = frame;
        } else {
          livenessFramesRef.current = [...livenessFramesRef.current, frame];
        }
        setStepDone((prev) => prev.map((done, i) => (i === stepBefore ? true : done)));

        if (tracker.isComplete) {
          setInstruction('¡Perfecto! Procesando...');
          setStepIndex(ENROLLMENT_STEPS.length);
          finish();
        } else {
          setStepIndex(tracker.currentStep);
          setInstruction(STEP_INSTRUCTIONS[tracker.currentStepKey]);
        }
      }
    });

    setStatus('detecting');
    setInstruction(STEP_INSTRUCTIONS[ENROLLMENT_STEPS[0]]);
    camera.startDetectionLoop(faceMesh);
  }, [stop, finish, cameraPermission.ensure]);

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
    stepIndex,
    stepsTotal: ENROLLMENT_STEPS.length,
    stepDone,
    retry: start,
    onCancel,
    permissionPrompt: cameraPermission.visible
      ? { requesting: cameraPermission.requesting, onAllow: cameraPermission.allow, onDismiss: cameraPermission.dismiss }
      : null,
  };
}
