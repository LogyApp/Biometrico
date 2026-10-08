/**
 * LivenessDetector — Detección de vida mediante movimiento de cabeza.
 *
 * MODOS:
 *   GESTURE  → enrollment: giros izquierda/derecha + frente con ojos abiertos
 *   MOVE     → verificación: detecta cualquier movimiento natural de cabeza
 *              (asentir, girar, inclinar) — el gesto más natural y fiable
 *
 * ¿Por qué movimiento en vez de parpadeo?
 *   El parpadeo es muy rápido (150-400ms) y en algunos dispositivos móviles
 *   la frecuencia de frames es baja (~12fps), haciendo que se pierda el evento.
 *   El movimiento de cabeza es lento, fácil de detectar, y no requiere
 *   precisión milimétrica de la cámara.
 *
 * Seguridad:
 *   - Una foto estática no puede mover la cabeza → rechazada.
 *   - ArcFace 512d + threshold 0.65 → FAR < 0.01%.
 *   - El movimiento se detecta en la VARIACIÓN de posición, no en un valor absoluto,
 *     por lo que funciona en cualquier posición inicial.
 */

const LEFT_EYE  = [362, 385, 387, 263, 373, 380];
const RIGHT_EYE = [33,  160, 158, 133, 153, 144];

// ── Umbrales para gestos de enrollment ────────────────────────
const YAW_THRESHOLD   = 0.12;
const MIN_DETECT_CONF = 0.60;
const LOST_DEBOUNCE   = 4;
const STILL_OPEN_EAR  = 0.18;
const STILL_FRAMES    = 4;

// ── Umbrales para detección de movimiento (verificación) ──────
const MOVE_BASELINE_FRAMES = 6;    // frames para establecer posición base
const MOVE_THRESHOLD       = 0.05; // delta mínimo en yaw O pitch para confirmar movimiento
const MOVE_CONFIRM_FRAMES  = 3;    // frames consecutivos con movimiento para confirmar liveness


function _ear(lm, idx) {
  const [p1, p2, p3, p4, p5, p6] = idx.map(i => lm[i]);
  const v1 = Math.hypot(p2.x - p6.x, p2.y - p6.y);
  const v2 = Math.hypot(p3.x - p5.x, p3.y - p5.y);
  const h  = Math.hypot(p1.x - p4.x, p1.y - p4.y);
  return h > 0 ? (v1 + v2) / (2 * h) : 1;
}

function _computeEAR(lm) {
  return (_ear(lm, LEFT_EYE) + _ear(lm, RIGHT_EYE)) / 2;
}

function _getYaw(lm) {
  const nose  = lm[1], left = lm[234], right = lm[454];
  const w = Math.abs(right.x - left.x);
  return w > 0.01 ? (nose.x - (left.x + right.x) / 2) / w : 0;
}

function _getPitch(lm) {
  // Posición vertical de la nariz normalizada dentro del alto facial
  const noseTip  = lm[1];
  const forehead = lm[10];
  const chin     = lm[152];
  const faceH    = Math.abs(chin.y - forehead.y);
  return faceH > 0.01 ? (noseTip.y - forehead.y) / faceH : 0.5;
}


// ═════════════════════════════════════════════════
//  SINGLETON — precarga del modelo MediaPipe
// ═════════════════════════════════════════════════
let   _sharedFaceMesh = null;
let   _initPromise    = null;
const FACE_MESH_URL   = "https://unpkg.com/@mediapipe/face_mesh@0.4.1633559619/";

async function _ensureFaceMesh() {
  if (_sharedFaceMesh) return _sharedFaceMesh;
  if (_initPromise)    return _initPromise;
  _initPromise = (async () => {
    const fm = new FaceMesh({ locateFile: f => FACE_MESH_URL + f });
    fm.setOptions({
      maxNumFaces:            1,
      refineLandmarks:        false,
      minDetectionConfidence: MIN_DETECT_CONF,
      minTrackingConfidence:  0.5,
    });
    fm.onResults(() => {});
    await fm.initialize();
    _sharedFaceMesh = fm;
    return fm;
  })();
  return _initPromise;
}

export async function preloadFaceMesh() {
  return _ensureFaceMesh();
}


// ═════════════════════════════════════════════════
export class LivenessDetector {
  constructor({ onStepComplete, onFaceDetected, onFaceLost, onMoveComplete }) {
    this._onStepComplete = onStepComplete;
    this._onFaceDetected = onFaceDetected;
    this._onFaceLost     = onFaceLost;
    // Callback del modo MOVE: llamado cuando el movimiento confirma liveness
    this._onMoveComplete = onMoveComplete;

    this._faceMesh  = null;
    this._mode      = "gesture";
    this._lostFrames = 0;

    // Estado gesture (enrollment)
    this._steps       = [];
    this._currentStep = 0;
    this._completing  = false;
    this._baseYaw     = null;
    this._stillFrames = 0;

    // Estado move (verificación)
    this._moveBaseYaw    = null;
    this._moveBasePitch  = null;
    this._moveBaseFrames = 0;
    this._moveFrames     = 0;
    this._moveDone       = false;
  }

  async init() {
    this._faceMesh = await _ensureFaceMesh();
    this._faceMesh.onResults(r => this._onResults(r));
    return this._faceMesh;
  }

  // Modo gesture — enrollment (left, right, still)
  start(steps) {
    this._mode        = "gesture";
    this._steps       = steps;
    this._currentStep = 0;
    this._completing  = false;
    this._baseYaw     = null;
    this._stillFrames = 0;
    this._lostFrames  = 0;
  }

  // Modo movimiento — verificación (cualquier movimiento de cabeza)
  startMove() {
    this._mode           = "move";
    this._moveBaseYaw    = null;
    this._moveBasePitch  = null;
    this._moveBaseFrames = 0;
    this._moveFrames     = 0;
    this._moveDone       = false;
    this._lostFrames     = 0;
  }

  get isComplete() {
    return this._currentStep >= this._steps.length;
  }

  _onResults(results) {
    if (!results.multiFaceLandmarks?.length) {
      this._lostFrames++;
      if (this._lostFrames === LOST_DEBOUNCE) {
        this._onFaceLost?.();
        // Reset baseline al perder la cara
        this._moveBaseFrames = 0;
        this._moveBaseYaw    = null;
        this._moveBasePitch  = null;
        this._moveFrames     = 0;
      }
      if (this._lostFrames > 20) this._baseYaw = null;
      return;
    }

    this._lostFrames = 0;
    const lm = results.multiFaceLandmarks[0];
    this._onFaceDetected?.();

    if (this._mode === "move") {
      this._handleMove(lm);
    } else {
      this._handleGesture(lm);
    }
  }

  // ── Detector de movimiento de cabeza ─────────────────────────────────────
  _handleMove(lm) {
    if (this._moveDone) return;

    const yaw   = _getYaw(lm);
    const pitch = _getPitch(lm);

    // Fase 1: establecer posición base durante N frames
    if (this._moveBaseFrames < MOVE_BASELINE_FRAMES) {
      if (this._moveBaseYaw === null) {
        this._moveBaseYaw   = yaw;
        this._moveBasePitch = pitch;
      } else {
        // Promedio suavizado para baseline más estable
        this._moveBaseYaw   = this._moveBaseYaw   * 0.85 + yaw   * 0.15;
        this._moveBasePitch = this._moveBasePitch * 0.85 + pitch * 0.15;
      }
      this._moveBaseFrames++;
      return;
    }

    // Fase 2: detectar desviación respecto al baseline
    const yawDelta   = Math.abs(yaw   - this._moveBaseYaw);
    const pitchDelta = Math.abs(pitch - this._moveBasePitch);

    if (yawDelta > MOVE_THRESHOLD || pitchDelta > MOVE_THRESHOLD) {
      this._moveFrames++;
      if (this._moveFrames >= MOVE_CONFIRM_FRAMES) {
        this._moveDone = true;
        this._onMoveComplete?.();
      }
    } else {
      // Sin movimiento suficiente — ir reduciendo el contador (no es todo-o-nada)
      this._moveFrames = Math.max(0, this._moveFrames - 1);
    }
  }

  // ── Gestos de enrollment ──────────────────────────────────────────────────
  _handleGesture(lm) {
    if (this.isComplete || this._completing) return;

    const step = this._steps[this._currentStep];

    if (step === "still") {
      const ear = _computeEAR(lm);
      if (ear >= STILL_OPEN_EAR) {
        this._stillFrames++;
        if (this._stillFrames >= STILL_FRAMES) this._triggerStep();
      } else {
        this._stillFrames = 0;
      }
    } else {
      const yaw = _getYaw(lm);
      if (this._baseYaw === null) { this._baseYaw = yaw; return; }
      const delta = yaw - this._baseYaw;
      if (step === "left"  && delta >  YAW_THRESHOLD) this._triggerStep();
      if (step === "right" && delta < -YAW_THRESHOLD) this._triggerStep();
    }
  }

  _triggerStep() {
    if (this._completing) return;
    this._completing  = true;
    const completed   = this._currentStep;
    this._currentStep++;
    this._baseYaw     = null;
    this._stillFrames = 0;
    this._onStepComplete?.(completed, this._currentStep);
    setTimeout(() => { this._completing = false; }, 500);
  }
}
