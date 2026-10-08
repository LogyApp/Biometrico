const STORAGE_KEY = 'lgy_fp';

function stableUserAgent() {
  return navigator.userAgent.replace(/[\d._]+/g, '');
}

function computeFingerprint() {
  const raw = [
    stableUserAgent(),
    `${screen.width}x${screen.height}`,
    screen.colorDepth,
    navigator.language,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.hardwareConcurrency ?? 0,
    navigator.deviceMemory ?? 0,
  ].join('|');

  let hash = 5381;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) + hash + raw.charCodeAt(i)) | 0;
  }
  return 'd' + Math.abs(hash).toString(36);
}

export function getDeviceFingerprint() {
  const cached = localStorage.getItem(STORAGE_KEY);
  if (cached) return cached;
  const fingerprint = computeFingerprint();
  localStorage.setItem(STORAGE_KEY, fingerprint);
  return fingerprint;
}
