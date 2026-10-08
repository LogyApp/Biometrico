const DRIFT_THRESHOLD_MS = 3 * 60 * 60 * 1000;
const CHECK_TIMEOUT_MS = 5000;

export async function getDeviceClockDriftMs() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  try {
    const res = await fetch('/api/health', { method: 'GET', cache: 'no-store', signal: controller.signal });
    const serverDateHeader = res.headers.get('date');
    if (!serverDateHeader) return 0;
    const serverMs = new Date(serverDateHeader).getTime();
    if (Number.isNaN(serverMs)) return 0;
    return Date.now() - serverMs;
  } catch {
    return 0;
  } finally {
    clearTimeout(timer);
  }
}

export async function isDeviceClockWrong() {
  const drift = await getDeviceClockDriftMs();
  return Math.abs(drift) > DRIFT_THRESHOLD_MS;
}
