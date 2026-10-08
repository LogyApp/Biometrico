export const ENROLLMENT_STEPS = ['left', 'right', 'still'];

export const STEP_INSTRUCTIONS = {
  left: 'Gira la cabeza hacia la IZQUIERDA',
  right: 'Gira la cabeza hacia la DERECHA',
  still: 'Mira directo a la cámara',
};

export const YAW_THRESHOLD = 0.12;
export const STILL_OPEN_EAR = 0.18;
export const STILL_FRAMES = 4;
export const STEP_COOLDOWN_MS = 500;
export const LOST_DEBOUNCE_FRAMES = 4;
export const LOST_RESET_FRAMES = 20;

export const MOVE_BASELINE_FRAMES = 6;
export const MOVE_THRESHOLD = 0.035;
export const MOVE_CONFIRM_FRAMES = 3;
export const MOVE_SETTLE_THRESHOLD = 0.07;

export const BLINK_CLOSED_EAR = 0.15;
export const BLINK_MIN_CLOSED_FRAMES = 1;

const LEFT_EYE = [362, 385, 387, 263, 373, 380];
const RIGHT_EYE = [33, 160, 158, 133, 153, 144];

function eyeAspectRatio(landmarks, indices) {
  const [p1, p2, p3, p4, p5, p6] = indices.map((i) => landmarks[i]);
  const v1 = Math.hypot(p2.x - p6.x, p2.y - p6.y);
  const v2 = Math.hypot(p3.x - p5.x, p3.y - p5.y);
  const h = Math.hypot(p1.x - p4.x, p1.y - p4.y);
  return h > 0 ? (v1 + v2) / (2 * h) : 1;
}

export function computeEAR(landmarks) {
  return (eyeAspectRatio(landmarks, LEFT_EYE) + eyeAspectRatio(landmarks, RIGHT_EYE)) / 2;
}

export function computeYaw(landmarks) {
  const nose = landmarks[1];
  const left = landmarks[234];
  const right = landmarks[454];
  const width = Math.abs(right.x - left.x);
  return width > 0.01 ? (nose.x - (left.x + right.x) / 2) / width : 0;
}

export function computePitch(landmarks) {
  const noseTip = landmarks[1];
  const forehead = landmarks[10];
  const chin = landmarks[152];
  const faceHeight = Math.abs(chin.y - forehead.y);
  return faceHeight > 0.01 ? (noseTip.y - forehead.y) / faceHeight : 0.5;
}
