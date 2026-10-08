import {
  ENROLLMENT_STEPS,
  YAW_THRESHOLD,
  STILL_OPEN_EAR,
  STILL_FRAMES,
  STEP_COOLDOWN_MS,
  computeEAR,
  computeYaw,
} from './livenessModel';

export class GestureTracker {
  constructor(steps = ENROLLMENT_STEPS) {
    this.steps = steps;
    this.currentStep = 0;
    this.baseYaw = null;
    this.stillFrames = 0;
    this.cooldownUntil = 0;
  }

  get isComplete() {
    return this.currentStep >= this.steps.length;
  }

  get currentStepKey() {
    return this.steps[this.currentStep];
  }

  resetBaseline() {
    this.baseYaw = null;
    this.stillFrames = 0;
  }

  processLandmarks(landmarks) {
    if (this.isComplete || Date.now() < this.cooldownUntil) return false;

    const step = this.steps[this.currentStep];

    if (step === 'still') {
      const ear = computeEAR(landmarks);
      if (ear >= STILL_OPEN_EAR) {
        this.stillFrames++;
        if (this.stillFrames >= STILL_FRAMES) return this._advance();
      } else {
        this.stillFrames = 0;
      }
      return false;
    }

    const yaw = computeYaw(landmarks);
    if (this.baseYaw === null) {
      this.baseYaw = yaw;
      return false;
    }

    const delta = yaw - this.baseYaw;
    if (step === 'left' && delta > YAW_THRESHOLD) return this._advance();
    if (step === 'right' && delta < -YAW_THRESHOLD) return this._advance();
    return false;
  }

  _advance() {
    this.currentStep++;
    this.baseYaw = null;
    this.stillFrames = 0;
    this.cooldownUntil = Date.now() + STEP_COOLDOWN_MS;
    return true;
  }
}
