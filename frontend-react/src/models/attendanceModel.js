export const ATTENDANCE_STATUS = {
  ACTIVE: 'active',
  COMPLETE: 'complete',
  PARTIAL: 'partial',
  INCOMPLETE: 'incomplete',
  NONE: 'none',
};

const FULL_WORKDAY_MS = 8 * 60 * 60 * 1000;
const PARTIAL_THRESHOLD_MS = 40 * 60 * 1000;

export function deriveAttendanceStatus({ hasActiveEntry, lastAction, entryTimeMs, exitTimeMs }) {
  if (hasActiveEntry) return ATTENDANCE_STATUS.ACTIVE;
  if (lastAction !== 'SALIDA') return ATTENDANCE_STATUS.NONE;
  if (entryTimeMs == null || exitTimeMs == null) return ATTENDANCE_STATUS.INCOMPLETE;

  const workedMs = exitTimeMs - entryTimeMs;
  if (workedMs >= FULL_WORKDAY_MS) return ATTENDANCE_STATUS.COMPLETE;
  if (workedMs > PARTIAL_THRESHOLD_MS) return ATTENDANCE_STATUS.PARTIAL;
  return ATTENDANCE_STATUS.INCOMPLETE;
}

export function attendanceStatusLabel(status) {
  if (status === ATTENDANCE_STATUS.ACTIVE) return 'EN CURSO';
  if (status === ATTENDANCE_STATUS.COMPLETE) return 'COMPLETA';
  if (status === ATTENDANCE_STATUS.PARTIAL) return 'PARCIAL';
  if (status === ATTENDANCE_STATUS.INCOMPLETE) return 'INCOMPLETA';
  return 'SIN REGISTROS';
}
