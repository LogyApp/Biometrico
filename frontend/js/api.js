async function _post(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    const detail = data.detail;
    let msg;
    if (typeof detail === "string") msg = detail;
    else if (Array.isArray(detail)) msg = detail.map((e) => e.msg || String(e)).join("; ");
    else if (detail) msg = JSON.stringify(detail);
    else msg = `Error ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

async function _get(path) {
  const res  = await fetch(path);
  const data = await res.json();
  if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : `Error ${res.status}`);
  return data;
}

export const API = {
  checkEnrollment: (identificacion, device_fingerprint) =>
    _post("/api/enrollment/check", { identificacion, device_fingerprint }),

  saveEnrollment: (identificacion, device_fingerprint, frames) =>
    _post("/api/enrollment/save", { identificacion, device_fingerprint, frames }),

  verify: (payload) =>
    _post("/api/verify", payload),

  manualAttendance: (payload) =>
    _post("/api/attendance/manual", payload),

  // ── Movimiento ──────────────────────────────────
  startMovement:  (payload) => _post("/api/movement/start",  payload),
  finishMovement: (payload) => _post("/api/movement/finish", payload),
  checkMovement:  (identificacion) => _get(`/api/movement/active/${identificacion}`),

  // ── Historial ────────────────────────────────────
  getHistory:      (identificacion, limit = 40) => _get(`/api/history/${identificacion}?limit=${limit}`),
  getWaypoints:    (movimiento_id) => _get(`/api/history/movement/${movimiento_id}/waypoints`),

  // ── Sesiones ─────────────────────────────────────
  openSession:      (identificacion, device_fp) => _post("/api/session/open",      { identificacion, device_fp }),
  closeSession:     (token) => _post("/api/session/close",     { token }),
  closeSessionById: (identificacion) => _post("/api/session/close-by-id", { identificacion }),
  sessionHeartbeat: (identificacion, device_fp) => _post("/api/session/heartbeat", { identificacion, device_fp }),
  checkSession:     (identificacion, fp) => _get(`/api/session/check/${identificacion}?fp=${encodeURIComponent(fp)}`),
  getSessionState:  (identificacion) => _get(`/api/session/state/${identificacion}`),

  // ── Web Push ──────────────────────────────────────
  getPushVapidKey:  () => _get("/api/push/vapid-key"),
  subscribePush:    (payload) => _post("/api/push/subscribe", payload),
  schedulePush:     (payload) => _post("/api/push/schedule",  payload),
  cancelPush:       (identificacion) => _post("/api/push/cancel", { identificacion }),
};
