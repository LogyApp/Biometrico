const API_BASE = import.meta.env.VITE_API_URL || '/api';
const DEFAULT_TIMEOUT_MS = 15000;

async function request(path, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      ...options,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const err = new Error(data?.detail || data?.error || `Error ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

export function httpGet(path, timeoutMs) {
  return request(path, { method: 'GET' }, timeoutMs);
}

export function httpPost(path, body, timeoutMs) {
  return request(
    path,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
    timeoutMs
  );
}
