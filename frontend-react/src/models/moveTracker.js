import {
  MOVE_BASELINE_FRAMES,
  MOVE_THRESHOLD,
  MOVE_CONFIRM_FRAMES,
  MOVE_SETTLE_THRESHOLD,
  BLINK_CLOSED_EAR,
  BLINK_MIN_CLOSED_FRAMES,
  STILL_OPEN_EAR,
  computeYaw,
  computePitch,
  computeEAR,
} from './livenessModel';

export class MoveTracker {
  constructor() {
    this.baseYaw = null;
    this.basePitch = null;
    this.baseFrames = 0;
    this.moveFrames = 0;
    this.closedFrames = 0;
    this.blinkArmed = false;
    this.done = false;
  }

  get isComplete() {
    return this.done;
  }

  resetBaseline() {
    this.baseYaw = null;
    this.basePitch = null;
    this.baseFrames = 0;
    this.moveFrames = 0;
    this.closedFrames = 0;
    this.blinkArmed = false;
  }

  processLandmarks(landmarks) {
    if (this.done) return false;

    const yaw = computeYaw(landmarks);
    const pitch = computePitch(landmarks);
    const ear = computeEAR(landmarks);

    if (this.baseFrames < MOVE_BASELINE_FRAMES) {
      if (this.baseYaw === null) {
        this.baseYaw = yaw;
        this.basePitch = pitch;
        this.baseFrames = 1;
      } else if (
        Math.abs(yaw - this.baseYaw) > MOVE_SETTLE_THRESHOLD ||
        Math.abs(pitch - this.basePitch) > MOVE_SETTLE_THRESHOLD
      ) {
        this.baseYaw = yaw;
        this.basePitch = pitch;
        this.baseFrames = 1;
      } else {
        this.baseYaw = this.baseYaw * 0.85 + yaw * 0.15;
        this.basePitch = this.basePitch * 0.85 + pitch * 0.15;
        this.baseFrames++;
      }
      return false;
    }

    if (ear < BLINK_CLOSED_EAR) {
      this.closedFrames++;
      if (this.closedFrames >= BLINK_MIN_CLOSED_FRAMES) {
        this.blinkArmed = true;
      }
    } else {
      if (this.blinkArmed && ear >= STILL_OPEN_EAR) {
        this.done = true;
        return true;
      }
      this.closedFrames = 0;
    }

    const yawDelta = Math.abs(yaw - this.baseYaw);
    const pitchDelta = Math.abs(pitch - this.basePitch);

    if (yawDelta > MOVE_THRESHOLD || pitchDelta > MOVE_THRESHOLD) {
      this.moveFrames++;
      if (this.moveFrames >= MOVE_CONFIRM_FRAMES) {
        this.done = true;
        return true;
      }
    } else {
      this.moveFrames = Math.max(0, this.moveFrames - 1);
    }
    return false;
  }
}
