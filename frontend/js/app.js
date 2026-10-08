import { API }                          from "./api.js";
import { CameraManager }               from "./camera.js";
import { LivenessDetector, preloadFaceMesh } from "./liveness.js";
import { MovementManager }             from "./movement.js";
import { UI }                          from "./ui.js";

// ─── State ────────────────────────────────────────
const state = {
  worker:            null,
  pendingAction:     null,
  enrollFrames:      [],
  formData:          {},
  deviceFingerprint: null,
  // Asistencia
  lastPhoto:     null,
  lastAction:    null,
  entryTime:     null,
  exitTime:      null,
  lastLocation:  null,
  // Movimiento activo
  movement: null,   // { id, tipo, startMs, destLat, destLng, destAddress, routeDistKm, routeTimeMin }
};

let _camera           = null;
let _liveness         = null;
let _clockTimer       = null;
let _workTimer        = null;
let _tipTimer         = null;
let _tipIndex         = 0;
let _noFaceHintTimer  = null;
let _heartbeatTimer   = null;    // Session heartbeat — renueva expires_at cada 10 min
let _offlineDuringMov = false;   // Flag: se perdió red mientras había movimiento activo
let _movManager        = null;   // MovementManager instance
let _moveTimer         = null;   // Timer del movimiento activo
let _searchDebounce    = null;   // Debounce para búsqueda de dirección
let _movVerifyCallback = null;   // Callback post-verificación de movimiento
let _moveOfflineHandler = null;
let _moveOnlineHandler  = null;

// Enrollment: girarse + mirar de frente con ojos abiertos (sin parpadeo forzado)
const ENROLL_STEPS = ["left", "right", "still"];
// Verify: modo pasivo (sin pasos explícitos — se usa startPassive())

const TIPO_LABELS = {
  ENTRADA:   "Registrar Ingreso",
  SALIDA:    "Registrar Salida",
  ALMUERZO:  "Almuerzo",
  DESAYUNO:  "Desayuno",
  BREAK:     "Break",
  TRASLADO:  "Traslado",
};

const STEP_INSTRUCTIONS = {
  left:  "Gira la cabeza hacia la IZQUIERDA",
  right: "Gira la cabeza hacia la DERECHA",
  still: "Mira directo a la cámara",
};

// ─── Helpers ──────────────────────────────────────
const _el = (id) => document.getElementById(id);

/* Hora Colombia (hh:mm:ss AM/PM) */
function _colTime() {
  const d = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Bogota",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true,
  }).formatToParts(d);
  const h  = parts.find(p => p.type === "hour")?.value   ?? "00";
  const m  = parts.find(p => p.type === "minute")?.value ?? "00";
  const s  = parts.find(p => p.type === "second")?.value ?? "00";
  const ap = parts.find(p => p.type === "dayPeriod")?.value?.replace(/\./g, "").toUpperCase() ?? "";
  return `${h}:${m}:${s} ${ap}`;
}

/* Fecha Colombia */
function _colDate() {
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  }).format(new Date());
}

/* Convierte epoch ms a hora Colombia hh:mm AM/PM */
function _msToTimeShort(ms) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Bogota",
    hour: "2-digit", minute: "2-digit", hour12: true,
  }).format(new Date(ms)).replace(/\./g, "");
}

/* Hora Colombia para registros (hh:mm AM/PM) */
function _colTimeShort() {
  const d = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Bogota",
    hour: "2-digit", minute: "2-digit", hour12: true,
  }).formatToParts(d);
  const h  = parts.find(p => p.type === "hour")?.value   ?? "00";
  const m  = parts.find(p => p.type === "minute")?.value ?? "00";
  const ap = parts.find(p => p.type === "dayPeriod")?.value?.replace(/\./g, "").toUpperCase() ?? "";
  return `${h}:${m} ${ap}`;
}

/* Saludo según hora Colombia */
function _greeting() {
  const h = parseInt(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Bogota", hour: "numeric", hour12: false,
  }).format(new Date()));
  if (h >= 5  && h < 12) return "Buenos días";
  if (h >= 12 && h < 18) return "Buenas tardes";
  return "Buenas noches";
}

/* Primer nombre + primer apellido */
function _displayName(nombre = "") {
  const words = nombre.trim().split(/\s+/).filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  if (words.length >= 3) return `${words[0]} ${words[2]}`;
  if (words.length === 2) return `${words[0]} ${words[1]}`;
  return words[0] ?? "Usuario";
}

function _initials(nombre = "") {
  return nombre.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("");
}

/* Device fingerprint — determinista: mismo dispositivo = mismo hash, incluso tras limpiar caché */
function _getFingerprint() {
  const k = "lgy_fp";
  if (localStorage.getItem(k)) return localStorage.getItem(k);
  // Solo propiedades fijas del dispositivo — sin timestamp para que sea reproducible
  const raw = [
    navigator.userAgent,
    screen.width + "x" + screen.height,
    screen.colorDepth,
    navigator.language,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.hardwareConcurrency ?? 0,
    navigator.deviceMemory ?? 0,
  ].join("|");
  let h = 5381;
  for (let i = 0; i < raw.length; i++) h = ((h << 5) + h + raw.charCodeAt(i)) | 0;
  const fp = "d" + Math.abs(h).toString(36);
  localStorage.setItem(k, fp);
  return fp;
}

// ─── Overlays ─────────────────────────────────────
function _resetOverlay() {
  _el("overlay-spin")?.classList.remove("hidden");
  _el("overlay-conn-icon")?.classList.add("hidden");
  _el("overlay-sub-txt")?.classList.add("hidden");
  _el("overlay-retry-btn")?.classList.add("hidden");
}
const _showOverlay = (t) => {
  _resetOverlay();
  _el("processing-text").textContent = t;
  _el("overlay-processing").classList.remove("hidden");
};
const _hideOverlay = () => _el("overlay-processing").classList.add("hidden");

/* Muestra estado de error de conexión en el overlay con botón de reintentar */
function _showConnError(title, subtitle, onRetry) {
  _el("processing-text").textContent = title ?? "Sin conexión a internet";
  _el("overlay-sub-txt").textContent  = subtitle ?? "Verifica tu conexión a internet e intenta de nuevo.";
  _el("overlay-spin")?.classList.add("hidden");
  _el("overlay-conn-icon")?.classList.remove("hidden");
  _el("overlay-sub-txt")?.classList.remove("hidden");
  _el("overlay-processing").classList.remove("hidden");
  // Reemplazar botón para limpiar listeners anteriores
  const old = _el("overlay-retry-btn");
  const btn  = old.cloneNode(true);
  old.parentNode.replaceChild(btn, old);
  btn.classList.remove("hidden");
  btn.addEventListener("click", () => { _showOverlay("Cargando..."); onRetry(); });
}

/* Overlay de alerta con botón "Entendido" y callback personalizado */
function _showAlertOverlay(title, subtitle, onConfirm) {
  _el("processing-text").textContent = title;
  _el("overlay-sub-txt").textContent  = subtitle;
  _el("overlay-spin")?.classList.add("hidden");
  _el("overlay-conn-icon")?.classList.remove("hidden");
  _el("overlay-sub-txt")?.classList.remove("hidden");
  _el("overlay-processing").classList.remove("hidden");
  const old = _el("overlay-retry-btn");
  const btn  = old.cloneNode(true);
  old.parentNode.replaceChild(btn, old);
  btn.textContent = "Entendido";
  btn.classList.remove("hidden");
  btn.addEventListener("click", () => { _hideOverlay(); onConfirm(); });
}

/* Auto-login / splash: dispositivo vinculado a otro → ir a pantalla de datos */
function _showDeviceError() {
  _showAlertOverlay(
    "Dispositivo no autorizado",
    "Esta cuenta ya está activa en otro dispositivo. Contacta a tu supervisor.",
    () => UI.goTo("id"),
  );
}

/* Pantalla de datos: sesión abierta en otro dispositivo → bloquear, no navegar */
function _showBlockingDeviceAlert() {
  _showAlertOverlay(
    "Sesión activa en otro dispositivo",
    "Esta cuenta tiene una sesión activa en otro dispositivo. Contacta a tu supervisor para cerrarla.",
    () => { btnCont.disabled = false; },
  );
}

// ══════════════════════════════════════════════════════════
// PERMISOS — solicitar proactivamente al abrir la app
// Las flags se guardan en localStorage (persistente entre sesiones).
// Solo se piden al sistema si aún no se han concedido — o si el usuario
// los revocó (el onchange listener elimina la flag automáticamente).
// ══════════════════════════════════════════════════════════
(async function _initPermissions() {
  // ── Cámara ──────────────────────────────────────────────
  if (!localStorage.getItem("lgy_cam_ok")) {
    try {
      let alreadyGranted = false;
      if (navigator.permissions) {
        try {
          const p = await navigator.permissions.query({ name: "camera" });
          if (p.state === "granted") {
            alreadyGranted = true;
            localStorage.setItem("lgy_cam_ok", "1");
            p.onchange = () => { if (p.state !== "granted") localStorage.removeItem("lgy_cam_ok"); };
          }
        } catch { /* iOS no soporta query("camera") — ignorar */ }
      }
      if (!alreadyGranted) {
        // Pedir acceso brevemente y liberar; el SO recuerda el permiso
        const s = await navigator.mediaDevices?.getUserMedia({ video: true, audio: false });
        if (s) { s.getTracks().forEach(t => t.stop()); }
        localStorage.setItem("lgy_cam_ok", "1");
      }
    } catch { /* usuario negó — se pedirá cuando abra la cámara */ }
  }

  // ── Geolocalización ─────────────────────────────────────
  if (!localStorage.getItem("lgy_geo_ok") && navigator.permissions) {
    try {
      const perm = await navigator.permissions.query({ name: "geolocation" });
      if (perm.state === "granted") {
        localStorage.setItem("lgy_geo_ok", "1");
        perm.onchange = () => { if (perm.state !== "granted") localStorage.removeItem("lgy_geo_ok"); };
      } else if (perm.state === "prompt") {
        navigator.geolocation?.getCurrentPosition(
          () => localStorage.setItem("lgy_geo_ok", "1"),
          () => { /* denegado */ },
          { timeout: 3000, maximumAge: 60000 }
        );
      }
    } catch { /* ignore */ }
  }
})();

// ─── Sesión de dispositivo — evita re-login y doble sesión ────────────────
const LGY_SESSION_KEY    = "lgy_session_v2";
const LGY_MOVEMENT_KEY   = "lgy_active_mv_v1";
const LGY_ATTENDANCE_KEY = "lgy_attendance_v1";
const SESSION_EXPIRY_MS  = 12 * 60 * 60 * 1000; // 12 horas

// Mantener compatibilidad con clave anterior
const LGY_WORKER_KEY = "lgy_worker_v2";

// ─── Notificaciones push — tiempos de producción ─────────────────────────
// Movimiento activo: primer aviso a los 10 min, repite cada 15 min.
// Entrada sin salida: primer aviso calibrado a la marca de 8 horas de jornada,
//   mínimo 15 min de margen; repite cada 30 min.
const _NOTIF_DELAY_MOVEMENT   = 10 * 60_000;   // 10 min — primer aviso recorrido
const _NOTIF_REPEAT_MOVEMENT  = 15 * 60_000;   // 15 min — repetición recorrido
const _NOTIF_REPEAT_ENTRADA   = 30 * 60_000;   // 30 min — repetición jornada

// Calcula cuánto falta para llegar a 8 horas de jornada (mínimo 15 min)
function _calcEntradaDelay() {
  if (!state.entryTime) return 8 * 3600_000;
  const elapsed   = Date.now() - state.entryTime;
  const remaining = 8 * 3600_000 - elapsed;   // ms que faltan para 8h
  return Math.max(15 * 60_000, remaining);      // nunca menos de 15 min
}

function _notifySW(type, extra = {}) {
  const ctrl = navigator.serviceWorker?.controller;
  if (ctrl) ctrl.postMessage({ type, ...extra });
}

async function _requestNotificationPermission() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied")  return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

// ── Web Push subscription ─────────────────────────────────────────────────────
// Convierte la clave pública VAPID (base64url) al Uint8Array que espera pushManager.subscribe()
function _urlBase64ToUint8Array(b64) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function _subscribeWebPush() {
  if (!("PushManager" in window))             return;
  if (!state.worker?.identificacion)          return;
  if (Notification.permission !== "granted")  return;
  try {
    const { public_key } = await API.getPushVapidKey();
    const reg = await navigator.serviceWorker.ready;

    let sub = await reg.pushManager.getSubscription();

    // Re-suscribir si el VAPID key del servidor cambió (ej: nuevo despliegue).
    // Comparamos con la clave guardada en localStorage: si difiere, la suscripción
    // existente es inválida (VapidPkHashMismatch) y hay que reemplazarla.
    const storedKey = localStorage.getItem("lgy_vapid_pk");
    if (sub && storedKey !== public_key) {
      await sub.unsubscribe();
      sub = null;
    }

    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: _urlBase64ToUint8Array(public_key),
      });
      localStorage.setItem("lgy_vapid_pk", public_key);
    }

    const json = sub.toJSON();
    await API.subscribePush({
      identificacion: state.worker.identificacion,
      device_fp:      _getFingerprint(),
      endpoint:       json.endpoint,
      keys:           { p256dh: json.keys.p256dh, auth: json.keys.auth },
    });
  } catch (err) {
    console.warn("Web Push subscription failed:", err);
  }
}

// Programa notificaciones push en el backend (se envían aunque el app esté cerrado)
function _scheduleBackendPush() {
  if (!state.worker?.identificacion) return;
  API.schedulePush({
    identificacion:     state.worker.identificacion,
    device_fp:          _getFingerprint(),
    has_movement:       !!state.movement?.id,
    has_entry:          state.lastAction === "ENTRADA",
    entry_time_ms:      state.entryTime ?? null,
    worker_name:        state.worker?.nombre?.split(" ")[0] ?? "",
    delay_movement_ms:  _NOTIF_DELAY_MOVEMENT,
    repeat_movement_ms: _NOTIF_REPEAT_MOVEMENT,
    delay_entrada_ms:   _calcEntradaDelay(),    // dinámico: falta para llegar a 8 h
    repeat_entrada_ms:  _NOTIF_REPEAT_ENTRADA,
  }).catch(() => {});
}

// Cancela notificaciones push pendientes en el backend (app volvió al frente)
function _cancelBackendPush() {
  if (!state.worker?.identificacion) return;
  API.cancelPush(state.worker.identificacion).catch(() => {});
}

function _saveWorkerSession(formData) {
  try {
    const session = {
      identificacion:  formData.identificacion,
      device_fp:       _getFingerprint(),
      session_token:   formData.session_token ?? null,
      saved_at:        Date.now(),
    };
    localStorage.setItem(LGY_SESSION_KEY, JSON.stringify(session));
    localStorage.setItem(LGY_WORKER_KEY,  JSON.stringify(session));
  } catch { /* ignore */ }
}

function _clearWorkerSession() {
  localStorage.removeItem(LGY_SESSION_KEY);
  localStorage.removeItem(LGY_WORKER_KEY);
}

function _saveMovementSession(mv, identificacion) {
  try {
    localStorage.setItem(LGY_MOVEMENT_KEY, JSON.stringify({ ...mv, identificacion }));
  } catch {}
}

function _clearMovementSession() {
  localStorage.removeItem(LGY_MOVEMENT_KEY);
}

function _saveAttendanceSession() {
  try {
    localStorage.setItem(LGY_ATTENDANCE_KEY, JSON.stringify({
      lastAction: state.lastAction,
      entryTime:  state.entryTime,
      exitTime:   state.exitTime,
    }));
  } catch {}
}

function _clearAttendanceSession() {
  localStorage.removeItem(LGY_ATTENDANCE_KEY);
}

function _restoreAttendanceSession() {
  try {
    const raw = localStorage.getItem(LGY_ATTENDANCE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (!saved || !saved.entryTime) return;

    // Expirar por tiempo: referencia = exitTime si existe, sino entryTime
    const refTime = saved.exitTime ?? saved.entryTime;
    if (Date.now() - refTime > SESSION_EXPIRY_MS) { _clearAttendanceSession(); return; }

    state.lastAction = saved.lastAction;
    state.entryTime  = saved.entryTime;
    state.exitTime   = saved.exitTime ?? null;

    // Hora de entrada
    const entryStr = _msToTimeShort(saved.entryTime);
    const sEntryEl = document.getElementById("s-entry-time");
    if (sEntryEl) sEntryEl.textContent = entryStr;

    // Hora de salida (si existe)
    if (saved.exitTime) {
      const sExitEl = document.getElementById("s-exit-time");
      if (sExitEl) sExitEl.textContent = _msToTimeShort(saved.exitTime);
    }

    document.getElementById("status-card")?.classList.remove("hidden");
    _updateJornadaBadge();
  } catch { _clearAttendanceSession(); }
}

function _loadMovementSession(identificacion) {
  try {
    const raw = localStorage.getItem(LGY_MOVEMENT_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    return saved?.identificacion === identificacion ? saved : null;
  } catch { return null; }
}

async function _tryAutoLogin() {
  const raw = localStorage.getItem(LGY_SESSION_KEY) || localStorage.getItem(LGY_WORKER_KEY);
  if (!raw) return false;

  let saved;
  try { saved = JSON.parse(raw); } catch { _clearWorkerSession(); return false; }
  if (!saved?.identificacion) { _clearWorkerSession(); return false; }

  if (saved.saved_at && Date.now() - saved.saved_at > SESSION_EXPIRY_MS) {
    _clearWorkerSession(); return false;
  }
  if (saved.device_fp && saved.device_fp !== _getFingerprint()) {
    _clearWorkerSession(); return false;
  }

  _showOverlay("Cargando sesión...");
  _attemptAutoLogin(saved); // maneja su propia navegación + reintentos
  return "pending";         // el caller NO debe navegar — _attemptAutoLogin lo hace
}

async function _attemptAutoLogin(saved) {
  try {
    const res = await Promise.race([
      API.checkEnrollment(saved.identificacion, _getFingerprint()),
      new Promise((_, rej) => setTimeout(() => rej(new Error("NETWORK_TIMEOUT")), 9000)),
    ]);
    _hideOverlay();

    if (res.status === "wrong_device") {
      _clearWorkerSession();
      _showDeviceError();
      return;
    }
    if (res.status === "already_enrolled" && res.worker) {
      state.worker   = res.worker;
      state.formData = saved;
      _saveWorkerSession(saved);
      await _openSessionAndGo(() => { _clearWorkerSession(); _showDeviceError(); });
      return;
    }
    _clearWorkerSession();
    UI.goTo("id");
  } catch (err) {
    const isNet = err.message === "NETWORK_TIMEOUT" || !navigator.onLine || err.name === "TypeError";
    if (isNet) {
      _showConnError(
        "Sin conexión a internet",
        "Verifica tu conexión a internet e intenta de nuevo.",
        () => _attemptAutoLogin(saved)
      );
      return;
    }
    _clearWorkerSession();
    _hideOverlay();
    UI.goTo("id");
  }
}

// Mostrar splash y luego inicializar — mínimo 1.6s para que se vea la pantalla de bienvenida
setTimeout(async () => {
  const loggedIn = await _tryAutoLogin();
  // "pending" → _attemptAutoLogin maneja la navegación
  // false → no hay sesión guardada → ir al login
  if (loggedIn === false) UI.goTo("id");
}, 1600);

// ─── Cámara ───────────────────────────────────────
/**
 * Soporta dos modos:
 *   steps (array)  → modo gesture (enrollment: left, right, still)
 *   steps = null   → modo BLINK (verificación: espera parpadeo consciente)
 *
 * Modo MOVE: el usuario mueve suavemente la cabeza (asentir/girar).
 * Más fiable que parpadeo en móvil — funciona a cualquier framerate.
 */
async function _startCameraFlow({ videoId, ovalId, dotsId, progressId, instrId, alertId, steps, onComplete, onError }) {
  const isMove = !steps;  // sin steps → modo movimiento (verificación)

  UI.buildStepDots(dotsId, isMove ? 1 : steps.length);
  UI.setProgress(progressId, 0);
  UI.setFaceOval(ovalId, null);
  UI.setInstruction(instrId, "Iniciando cámara...");
  _el(alertId)?.classList.add("hidden");

  const videoEl = _el(videoId);
  _camera = new CameraManager(videoEl);

  try { await _camera.start(); }
  catch (err) { _showCamError(alertId, err.message); onError?.(); return; }

  UI.setInstruction(instrId, "Cargando detector...");
  let faceEverDetected = false;
  const captured = [];

  const livenessCfg = {
    onFaceDetected: () => {
      if (!faceEverDetected) {
        faceEverDetected = true;
        _clearNoFaceTimer();
        UI.setInstruction(
          instrId,
          isMove ? "Mueve suavemente la cabeza" : STEP_INSTRUCTIONS[steps[0]]
        );
      }
      UI.setFaceOval(ovalId, "detected");
      if (isMove) {
        // Progreso visual que pulsa suavemente mientras espera
        const pulse = Math.round(40 + 25 * Math.sin(Date.now() / 700));
        UI.setProgress(progressId, Math.min(pulse, 70));
      }
    },
    onFaceLost: () => {
      faceEverDetected = false;
      UI.setFaceOval(ovalId, "error");
      UI.setInstruction(instrId, "No te veo. Centra tu rostro en el óvalo.");
      if (isMove) UI.setProgress(progressId, 0);
      _scheduleNoFaceTip(instrId);
    },

    // ── Modo gesture (enrollment) ─────────────────────────────────
    onStepComplete: async (doneIdx, nextIdx) => {
      captured.push(_camera.captureFrame());
      UI.markDotDone(dotsId, doneIdx);
      UI.setProgress(progressId, (nextIdx / steps.length) * 100);
      if (nextIdx >= steps.length) {
        _clearNoFaceTimer();
        UI.setFaceOval(ovalId, "detected");
        UI.setInstruction(instrId, "¡Perfecto! Procesando...");
        await _stopCamera();
        onComplete(captured);
      } else {
        UI.setFaceOval(ovalId, "detected");
        setTimeout(() => UI.setInstruction(instrId, STEP_INSTRUCTIONS[steps[nextIdx]]), 350);
      }
    },

    // ── Modo MOVE (verificación) ──────────────────────────────────
    // Llamado cuando el movimiento de cabeza confirma liveness
    onMoveComplete: async () => {
      _clearNoFaceTimer();
      UI.setProgress(progressId, 100);
      UI.markDotDone(dotsId, 0);
      UI.setFaceOval(ovalId, "detected");
      UI.setInstruction(instrId, "Verificando identidad...");
      const frame = _camera.captureFrame();
      await _stopCamera();
      onComplete([frame]);
    },
  };

  _liveness = new LivenessDetector(livenessCfg);

  let faceMesh;
  try { faceMesh = await _liveness.init(); }
  catch (err) {
    await _stopCamera();
    _showCamError(alertId, `No se pudo cargar el detector: ${err.message}`);
    onError?.(); return;
  }

  if (isMove) {
    _liveness.startMove();
    UI.setInstruction(instrId, "Mira a la cámara y mueve suavemente la cabeza");
    // Tip adicional si el usuario no ha movido aún después de 5s
    _noFaceHintTimer = setTimeout(() => {
      if (document.querySelector(".oval-ring.detected")) {
        UI.setInstruction(instrId, "Asiente o gira levemente la cabeza ↕↔");
      }
    }, 5000);
  } else {
    _liveness.start(steps);
    UI.setInstruction(instrId, STEP_INSTRUCTIONS[steps[0]]);
    _scheduleNoFaceTip(instrId);
  }

  _camera.startMediaPipe(faceMesh);
}

function _showCamError(alertId, msg) {
  const el = _el(alertId);
  if (el) { el.textContent = msg; el.classList.remove("hidden"); }
}

function _scheduleNoFaceTip(instrId) {
  _clearNoFaceTimer();
  _noFaceHintTimer = setTimeout(() => {
    const ring = document.querySelector(".oval-ring.detected");
    if (ring) return;
    UI.setInstruction(instrId, "Asegúrate de tener buena iluminación y mira directo a la cámara.");
  }, 10000);
}

function _clearNoFaceTimer() {
  if (_noFaceHintTimer) { clearTimeout(_noFaceHintTimer); _noFaceHintTimer = null; }
}

async function _stopCamera() {
  _clearNoFaceTimer();
  _camera?.stop();
  _camera = null;
}


// ══════════════════════════════════════════════════
// SCREEN 1 — ENROLLMENT
// ══════════════════════════════════════════════════
const _todayISO = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Bogota" });

const chkTerms = _el("chk-terms");
const btnCont  = _el("btn-continuar");

chkTerms.addEventListener("change", () => { btnCont.disabled = !chkTerms.checked; });

_el("terms-label").addEventListener("click", (e) => {
  if (e.target.closest(".terms-link")) return;
  e.preventDefault();
  chkTerms.checked = !chkTerms.checked;
  chkTerms.dispatchEvent(new Event("change"));
});

_el("btn-terms-open").addEventListener("click", (e) => { e.stopPropagation(); _el("modal-terms").classList.remove("hidden"); });
_el("btn-terms-close").addEventListener("click", () => _el("modal-terms").classList.add("hidden"));
_el("modal-terms").addEventListener("click", (e) => { if (e.target === e.currentTarget) _el("modal-terms").classList.add("hidden"); });
_el("btn-terms-accept").addEventListener("click", () => {
  chkTerms.checked = true;
  chkTerms.dispatchEvent(new Event("change"));
  _el("modal-terms").classList.add("hidden");
});

// ─── Validación de campos — feedback visual por campo ─────────────────────
function _setFieldError(inputId, msg) {
  const input = _el(inputId);
  if (!input) return;
  const fgrp = input.closest(".fgrp");
  if (!fgrp) return;
  fgrp.classList.add("fgrp-error");
  let errEl = fgrp.querySelector(".fgrp-err-msg");
  if (!errEl) { errEl = document.createElement("div"); errEl.className = "fgrp-err-msg"; fgrp.appendChild(errEl); }
  errEl.textContent = msg;
}

function _clearFieldErrors() {
  document.querySelectorAll("#screen-id .fgrp").forEach(g => {
    g.classList.remove("fgrp-error");
    g.querySelector(".fgrp-err-msg")?.remove();
  });
}

// Limpiar error del campo cuando el usuario empieza a corregirlo
["input-identificacion"].forEach(id => {
  const el = _el(id);
  if (!el) return;
  el.addEventListener(el.tagName === "SELECT" ? "change" : "input", () => {
    const fgrp = el.closest(".fgrp");
    fgrp?.classList.remove("fgrp-error");
    fgrp?.querySelector(".fgrp-err-msg")?.remove();
    _el("id-alert")?.classList.add("hidden");
  });
});

btnCont.addEventListener("click", async () => {
  const rawId   = _el("input-identificacion").value.trim();
  const alertEl = _el("id-alert");

  _clearFieldErrors();
  alertEl.classList.add("hidden");

  let hasError = false;

  // Número de documento
  if (!rawId) {
    _setFieldError("input-identificacion", "El número de documento es requerido");
    hasError = true;
  } else if (!/^\d{4,15}$/.test(rawId)) {
    _setFieldError("input-identificacion", "Solo números (4–15 dígitos, sin espacios ni letras)");
    hasError = true;
  }

  if (hasError) return;

  state.formData          = { identificacion: parseInt(rawId, 10) };
  state.deviceFingerprint = _getFingerprint();

  btnCont.disabled = true;
  _showOverlay("Verificando datos...");
  try {
    const res = await API.checkEnrollment(parseInt(rawId, 10), _getFingerprint());
    _hideOverlay();
    if (res.status === "not_found") {
      _setFieldError("input-identificacion", "No se encontró este número de documento o el trabajador no está activo en el sistema");
      btnCont.disabled = false;
      return;
    }
    if (res.status === "invalid_credentials") {
      _setFieldError("input-identificacion", "Número de documento incorrecto o no activo en el sistema");
      btnCont.disabled = false;
      return;
    }
    if (res.status === "wrong_device") {
      _showBlockingDeviceAlert();
      return;
    }
    state.worker = res.worker;
    if (res.status === "already_enrolled") {
      await _openSessionAndGo(() => _showBlockingDeviceAlert());
    } else {
      _showNoticeScreen();
    }
  } catch (err) {
    _hideOverlay();
    btnCont.disabled = false;
    alertEl.textContent = err.message;
    alertEl.classList.remove("hidden");
  }
});


// ══════════════════════════════════════════════════
// SCREEN 2 — NOTICE
// ══════════════════════════════════════════════════
function _showNoticeScreen() {
  const firstName = state.worker.nombre.split(" ")[0];
  _el("notice-avatar").textContent   = _initials(state.worker.nombre);
  _el("notice-name").textContent     = state.worker.nombre;
  _el("notice-greeting").textContent = `¡Hola, ${firstName}!`;
  UI.goTo("notice");
}

_el("btn-notice-start").addEventListener("click", () => { UI.goTo("capture"); _startEnrollCapture(); });
_el("btn-notice-back").addEventListener("click", () => { state.worker = null; state.formData = {}; UI.goTo("id"); });


// ══════════════════════════════════════════════════
// SCREEN 3 — CAPTURA BIOMÉTRICA (enrollment)
// ══════════════════════════════════════════════════
function _startEnrollCapture() {
  state.enrollFrames = [];
  _startCameraFlow({
    videoId: "video", ovalId: "face-oval", dotsId: "step-dots",
    progressId: "progress-fill", instrId: "instr-text", alertId: "capture-alert",
    steps: ENROLL_STEPS,
    onComplete: async (frames) => { state.enrollFrames = frames; await _submitEnrollment(); },
    onError: () => UI.goTo("notice"),
  });
}

async function _submitEnrollment() {
  _showOverlay("Procesando datos biométricos...");
  try {
    const { identificacion } = state.formData;
    const res = await API.saveEnrollment(identificacion, state.deviceFingerprint, state.enrollFrames);
    _hideOverlay();
    if (res.status === "enrolled" || res.status === "updated") {
      await _openSessionAndGo(() => _showBlockingDeviceAlert());
    } else {
      UI.goTo("notice");
    }
  } catch (err) {
    _hideOverlay();
    const a = _el("capture-alert");
    if (a) { a.textContent = err.message; a.classList.remove("hidden"); }
    setTimeout(() => UI.goTo("notice"), 2800);
  }
}


// ══════════════════════════════════════════════════
// SCREEN 4 — ASISTENCIA
// ══════════════════════════════════════════════════

/* ── Tips rotativos en el header ─────────────────────────────────────── */
const _TIPS = [
  { type: "wifi",    text: "Sin conexión los registros no se guardan. Mantén WiFi o datos activos." },
  { type: "info",    text: "Registra tu entrada al llegar y tu salida antes de retirarte." },
  { type: "warning", text: "No cierres la app mientras hay un movimiento activo en curso." },
  { type: "info",    text: "Activa el GPS antes de iniciar cualquier movimiento en ruta." },
  { type: "warning", text: "No compartas tu cuenta ni tu dispositivo con otros compañeros." },
  { type: "info",    text: "Si la biometría falla, puedes usar el registro manual como alternativa." },
  { type: "check",   text: "Verifica que los permisos de cámara y ubicación estén habilitados." },
  { type: "wifi",    text: "Zonas sin señal interrumpen el seguimiento GPS del recorrido." },
  { type: "warning", text: "Cierra sesión al terminar tu jornada para proteger tu cuenta." },
  { type: "info",    text: "Para cambiar de dispositivo, solicítalo a tu supervisor." },
  { type: "check",   text: "Registros precisos facilitan el control y pago de nómina." },
  { type: "info",    text: "La foto biométrica queda guardada como respaldo del registro." },
];

function _tipIcon(type) {
  const colors = { wifi: "rgba(147,197,253,.9)", warning: "rgba(251,191,36,.9)", check: "rgba(110,231,183,.9)", info: "rgba(255,255,255,.75)" };
  const c = colors[type] ?? colors.info;
  if (type === "wifi")
    return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1.42 9A16 16 0 0 1 22.58 9"/><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="20" r="1" fill="${c}"/></svg>`;
  if (type === "warning")
    return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
  if (type === "check")
    return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
  return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
}

function _startTips() {
  if (_tipTimer) return; // ya corriendo
  const bar    = _el("tip-bar");
  const iconEl = _el("tip-bar-icon");
  const textEl = _el("tip-bar-text");
  if (!bar) return;

  // Mostrar primer tip sin fade
  const first = _TIPS[_tipIndex];
  iconEl.innerHTML  = _tipIcon(first.type);
  textEl.textContent = first.text;

  _tipTimer = setInterval(() => {
    bar.classList.add("tip-fade");
    setTimeout(() => {
      _tipIndex = (_tipIndex + 1) % _TIPS.length;
      const tip = _TIPS[_tipIndex];
      iconEl.innerHTML   = _tipIcon(tip.type);
      textEl.textContent = tip.text;
      bar.classList.remove("tip-fade");
    }, 350);
  }, 5000);
}

function _stopTips() {
  if (_tipTimer) { clearInterval(_tipTimer); _tipTimer = null; }
}

/* Abre (o reanuda) sesión en DB y navega a asistencia.
   onOtherDevice: callback si la sesión está abierta en otro dispositivo (bloquea). */
async function _openSessionAndGo(onOtherDevice) {
  try {
    const fp  = _getFingerprint();
    const res = await API.openSession(state.formData.identificacion, fp);
    if (res.status === "other_device") {
      onOtherDevice();
      return;
    }
    if (res.token) {
      state.formData = { ...state.formData, session_token: res.token };
      _saveWorkerSession(state.formData);
    }
  } catch (err) {
    // Red caída → permitir acceso (no se puede verificar sesión sin red).
    // Error de servidor → relanzar para bloquear el acceso (sesión no creada en DB).
    const isNetwork = err?.name === "TypeError" || !navigator.onLine;
    if (!isNetwork) throw err;
  }
  await _goToAttendance();
}

/* Sincroniza el estado de jornada desde la DB (fuente de verdad).
   Corre justo antes de mostrar la pantalla de asistencia — invisible para el usuario.
   Corrige localStorage si la DB dice lo contrario (ej: cache limpiado). */
async function _syncAttendanceFromDB(identificacion) {
  try {
    const s = await API.getSessionState(identificacion);

    if (s.has_active_entry && s.entry_time_ms) {
      // DB confirma entrada activa → siempre prevalece sobre localStorage
      state.lastAction = "ENTRADA";
      state.entryTime  = s.entry_time_ms;
      state.exitTime   = null;
      _saveAttendanceSession();
      const sEntryEl = document.getElementById("s-entry-time");
      if (sEntryEl) sEntryEl.textContent = _msToTimeShort(s.entry_time_ms);
      document.getElementById("s-exit-time").textContent = "—";
      document.getElementById("status-card")?.classList.remove("hidden");
      _updateJornadaBadge();

    } else if (!s.has_active_entry && s.last_action === "SALIDA") {
      // DB confirma SALIDA — mostrar tarjeta con ambas horas
      state.lastAction = "SALIDA";
      state.entryTime  = s.entry_time_ms ?? state.entryTime;
      state.exitTime   = s.exit_time_ms  ?? state.exitTime;
      _saveAttendanceSession();
      if (state.entryTime) {
        const sEntryEl = document.getElementById("s-entry-time");
        if (sEntryEl) sEntryEl.textContent = _msToTimeShort(state.entryTime);
      }
      if (state.exitTime) {
        const sExitEl = document.getElementById("s-exit-time");
        if (sExitEl) sExitEl.textContent = _msToTimeShort(state.exitTime);
      }
      document.getElementById("status-card")?.classList.remove("hidden");
      _updateJornadaBadge();
    }
  } catch { /* error de red — usar localStorage como fallback */ }
}

// ─── Heartbeat de sesión ──────────────────────────────────────────────────────
// Mantiene viva la sesión en DB (TTL 30 min) mientras la app está en primer plano.
// Si el navegador se cierra sin logout, la sesión expira sola y libera el acceso.
const _HEARTBEAT_MS = 10 * 60 * 1000; // 10 minutos

async function _sendHeartbeat() {
  if (!state.worker?.identificacion) return;
  try {
    await API.sessionHeartbeat(state.worker.identificacion, _getFingerprint());
  } catch { /* sin red — la sesión expirará por TTL */ }
}

function _scheduleHeartbeat() {
  if (_heartbeatTimer) return;
  _heartbeatTimer = setInterval(_sendHeartbeat, _HEARTBEAT_MS);
}

function _cancelHeartbeat() {
  if (_heartbeatTimer) { clearInterval(_heartbeatTimer); _heartbeatTimer = null; }
}

async function _goToAttendance() {
  // Guardar sesión para auto-login la próxima vez que abra la app
  if (state.formData?.identificacion) {
    _saveWorkerSession(state.formData);
  }
  // Paso 1: restauración rápida desde localStorage (sin red)
  if (!state.lastAction) _restoreAttendanceSession();
  // Paso 2: sincronizar desde la DB (fuente de verdad, corrige localStorage si difieren)
  if (state.worker?.identificacion) {
    await _syncAttendanceFromDB(state.worker.identificacion);
  }
  // Restaurar última foto si no está ya en memoria
  if (!state.lastPhoto) {
    const saved = localStorage.getItem("lgy_photo_v1");
    if (saved) _setLastPhoto(saved);
  }
  _updateActionButton();
  _startAttendanceClock();
  _startTips();
  _requestLocation();
  _scheduleHeartbeat();   // mantener sesión viva en DB mientras la app está abierta
  // Solicitar permiso y suscribirse al push nativo (no bloquea la navegación)
  _requestNotificationPermission().then(granted => {
    if (granted) _subscribeWebPush();
  });
  UI.goTo("attendance");
  _maybeShowTour();

  // Verificar si hay un movimiento activo y reanudar automáticamente
  setTimeout(() => _checkAndResumeMovement(), 900);
}

async function _checkAndResumeMovement() {
  if (!state.worker?.identificacion) return;
  if (state.movement?.id) return; // ya hay movimiento en memoria

  try {
    const active = await API.checkMovement(state.worker.identificacion);
    if (!active?.active || !active.movimiento_id) {
      _clearMovementSession(); // limpiar si quedó algo huérfano en localStorage
      return;
    }

    // Reconstruir state.movement desde la respuesta del backend + caché local
    const saved = _loadMovementSession(state.worker.identificacion);
    state.movement = {
      id:           active.movimiento_id,
      tipo:         active.tipo ?? "LIBRE",
      // Timestamp de inicio: fecha_inicio es UTC naive → parsear como UTC
      startMs:      active.fecha_inicio
                      ? new Date(active.fecha_inicio + "Z").getTime()
                      : (saved?.startMs ?? Date.now()),
      destLat:      active.lat_destino    ?? null,
      destLng:      active.lng_destino    ?? null,
      destAddress:  active.dir_destino    ?? null,
      routeDistKm:  active.ruta_dist_km   ?? null,
      routeTimeMin: active.ruta_tiempo_min ?? null,
      _startLat:    active.lat_inicio     ?? null,
      _startLng:    active.lng_inicio     ?? null,
    };
    _saveMovementSession(state.movement, state.worker.identificacion);

    _showToast("Movimiento activo recuperado — reanudando seguimiento", "info");

    // Esperar un momento para que el GPS llegue; si no hay ubicación usar coords de inicio
    setTimeout(() => {
      if (!state.lastLocation && state.movement._startLat) {
        state.lastLocation = { lat: state.movement._startLat, lng: state.movement._startLng };
      }
      _initActiveScreen();
    }, 1200);

  } catch {
    // Sin conexión o error transitorio: no interrumpir la sesión
  }
}

/* Reloj Colombia — HH:MM am/pm (limpio, sin segundos que generen ruido visual) */
function _colTimeCompact() {
  const d     = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Bogota",
    hour: "2-digit", minute: "2-digit", hour12: true,
  }).formatToParts(d);
  const h  = parts.find(p => p.type === "hour")?.value   ?? "00";
  const m  = parts.find(p => p.type === "minute")?.value ?? "00";
  const ap = (parts.find(p => p.type === "dayPeriod")?.value ?? "")
               .replace(/\./g, "").toLowerCase();
  return `${h}:${m} ${ap}`;
}

/* Fecha corta para la fila de info — "mié. 21 may." */
function _colDateCompact() {
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    weekday: "short", day: "numeric", month: "short",
  }).format(new Date());
}

function _startAttendanceClock() {
  if (_clockTimer) clearInterval(_clockTimer);
  const tick = () => {
    _el("attend-greeting").textContent   = _greeting() + ",";
    _el("attend-user-name").textContent  = _displayName(state.worker?.nombre ?? "");
    _el("attend-clock").textContent      = _colTimeCompact();
    _el("attend-date").textContent       = _colDateCompact();
  };
  tick();
  _clockTimer = setInterval(tick, 1000);
}

/* Botón principal entry/exit */
function _updateActionButton() {
  const btn    = _el("btn-action-main");
  const movBtn = _el("btn-movimiento");

  if (state.lastAction === "ENTRADA") {
    btn.className    = "btn-main-action exit";
    btn.textContent  = "Registrar Salida";
    btn.dataset.tipo = "SALIDA";
    _el("timer-card").classList.remove("hidden");
    _startWorkTimer();
    // Movimiento: solo disponible con ingreso activo (puede salir a diligencias)
    movBtn?.classList.remove("hidden");
  } else {
    btn.className    = "btn-main-action entry";
    btn.textContent  = "Registrar Ingreso";
    btn.dataset.tipo = "ENTRADA";
    _el("timer-card").classList.add("hidden");
    if (_workTimer) { clearInterval(_workTimer); _workTimer = null; }
    // Sin ingreso activo: ocultar movimiento biométrico (no tiene sentido salir sin ingreso)
    movBtn?.classList.add("hidden");
  }

  // ★ Modo manual: SIEMPRE visible — sirve cuando la cámara falla
  // Las opciones cambian dinámicamente según el estado de la jornada
  _el("btn-open-manual")?.classList.remove("hidden");
}

/* Timer jornada */
function _startWorkTimer() {
  if (_workTimer) clearInterval(_workTimer);
  if (!state.entryTime) return;
  const tick = () => {
    const ms = Date.now() - state.entryTime;
    const h  = Math.floor(ms / 3600000);
    const m  = Math.floor((ms % 3600000) / 60000);
    const s  = Math.floor((ms % 60000)   / 1000);
    _el("timer-value").textContent =
      `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  };
  tick();
  _workTimer = setInterval(tick, 1000);
}

/* Geolocalización — obtiene GPS y lanza reverse geocode */
function _requestLocation() {
  const locText  = _el("attend-loc-text");
  const locBadge = _el("attend-loc-badge");
  if (!navigator.geolocation) {
    if (locText)  locText.textContent  = "GPS no disponible";
    if (locBadge) { locBadge.className = "location-badge error"; locBadge.textContent = "SIN GPS"; }
    return;
  }
  if (locBadge) { locBadge.className = "location-badge loading"; locBadge.textContent = "..."; }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude: lat, longitude: lng, accuracy } = pos.coords;
      state.lastLocation = { lat, lng, accuracy: Math.round(accuracy) };
      // Lanzar geocodificación inversa → muestra dirección real en lugar de coordenadas
      _updateLocationAddress(lat, lng);
    },
    () => {
      if (locText)  locText.textContent  = "Ubicación no disponible";
      if (locBadge) { locBadge.className = "location-badge error"; locBadge.textContent = "Error"; }
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
  );
}

/* Actualizar foto en face card */
function _setLastPhoto(dataUrl) {
  state.lastPhoto = dataUrl;
  try {
    if (dataUrl) localStorage.setItem("lgy_photo_v1", dataUrl);
    else localStorage.removeItem("lgy_photo_v1");
  } catch {}
  const frameOverlay = document.querySelector(".face-frame-overlay");
  if (dataUrl) {
    _el("face-last-photo").src = dataUrl;
    _el("face-last-photo").classList.remove("hidden");
    _el("face-placeholder").classList.add("hidden");
    frameOverlay?.classList.remove("hidden");
  } else {
    _el("face-last-photo").classList.add("hidden");
    _el("face-placeholder").classList.remove("hidden");
    frameOverlay?.classList.add("hidden");
  }
}

// Logout
_el("btn-logout").addEventListener("click", async () => {
  // Bloquear salida si hay entrada activa en estado local
  if (state.lastAction === "ENTRADA") {
    await _confirmModal(
      "Ingreso activo",
      "Tienes un ingreso en curso. Debes registrar tu salida antes de cerrar sesión."
    );
    return;
  }

  // Doble verificación con DB — cubre el caso donde el estado local está desfasado
  // (cache limpiado, error de red durante la carga, etc.)
  const logoutId = state.worker?.identificacion;
  if (logoutId) {
    try {
      const dbState = await API.getSessionState(logoutId);
      if (dbState.has_active_entry) {
        // DB confirma entrada activa que el estado local no refleja — sincronizar y bloquear
        state.lastAction = "ENTRADA";
        state.entryTime  = dbState.entry_time_ms;
        _updateActionButton();
        await _confirmModal(
          "Ingreso activo",
          "Tienes un ingreso en curso. Debes registrar tu salida antes de cerrar sesión."
        );
        return;
      }
    } catch { /* sin red — permitir cierre de sesión */ }
  }

  // Confirmar si no hay entrada activa
  const confirmed = await _confirmModal("¿Cerrar sesión?", "¿Deseas salir del sistema?");
  if (!confirmed) return;

  if (_clockTimer)    { clearInterval(_clockTimer);    _clockTimer    = null; }
  if (_workTimer)     { clearInterval(_workTimer);     _workTimer     = null; }
  if (_moveTimer)     { clearInterval(_moveTimer);     _moveTimer     = null; }
  _cancelHeartbeat();
  _stopTips();
  if (_movManager) { _movManager.destroy(); _movManager = null; }
  Object.assign(state, { worker: null, formData: {}, enrollFrames: [], pendingAction: null, lastPhoto: null, lastAction: null, entryTime: null, exitTime: null, lastLocation: null, movement: null });

  // Cerrar sesión en DB por identificación (robusto: no depende del token en localStorage)
  if (logoutId) {
    try {
      await API.closeSessionById(logoutId);
    } catch {
      // Sin red: la sesión expira sola a las 12 h — no bloquear el logout
    }
  }

  _clearWorkerSession();
  _clearMovementSession();
  _clearAttendanceSession();
  localStorage.removeItem("lgy_photo_v1");
  _el("input-identificacion").value = "";
  chkTerms.checked                  = false;
  btnCont.disabled                  = true;
  _el("id-alert").classList.add("hidden");
  // Reset foto
  _el("face-last-photo").classList.add("hidden");
  _el("face-placeholder").classList.remove("hidden");
  // Reset status card
  _el("status-card").classList.add("hidden");
  _el("timer-card").classList.add("hidden");
  UI.goTo("id");
});

// Botón de acción principal
_el("btn-action-main").addEventListener("click", () => {
  const tipo = _el("btn-action-main").dataset.tipo ?? "ENTRADA";
  state.pendingAction = tipo;
  _el("verify-badge-label").textContent = tipo === "ENTRADA" ? "Registrar Ingreso" : "Registrar Salida";
  UI.goTo("verify");
  _startVerifyCapture();
});

// Modal de mapa
_el("btn-map-open").addEventListener("click", () => {
  if (!state.lastLocation) {
    _requestLocation();
    setTimeout(() => {
      if (!state.lastLocation) {
        _showToast("Ubicación no disponible. Habilita el GPS.", "error");
        return;
      }
      _openMapModal();
    }, 2000);
    return;
  }
  _openMapModal();
});

function _openMapModal() {
  const { lat, lng } = state.lastLocation;
  const coordsBar = _el("map-coords-bar");
  coordsBar.textContent = `Lat: ${lat.toFixed(6)}  ·  Lng: ${lng.toFixed(6)}`;
  const iframe = _el("map-iframe");
  _el("map-loading").style.display = "flex";
  iframe.onload = () => { _el("map-loading").style.display = "none"; };
  iframe.src = `https://maps.google.com/maps?q=${lat},${lng}&z=17&output=embed`;
  _el("map-modal").classList.add("show");
}

_el("btn-map-close").addEventListener("click", () => {
  _el("map-modal").classList.remove("show");
  setTimeout(() => { _el("map-iframe").src = ""; }, 400);
});

_el("map-modal").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) {
    _el("map-modal").classList.remove("show");
    setTimeout(() => { _el("map-iframe").src = ""; }, 400);
  }
});

/**
 * Lógica de negocio del registro manual:
 *
 * Sin ingreso activo  → solo ENTRADA manual disponible
 * Con ingreso activo  → SALIDA y MOVIMIENTO disponibles
 * Con salida registrada → igual que "sin ingreso activo" (nueva jornada)
 *
 * El modo manual siempre está disponible en caso de fallo de cámara.
 */
function _updateManualOpts() {
  const sel = _el("manual-tipo");
  const sub = _el("manual-modal")?.querySelector(".manual-sub");
  const hasActiveEntry = state.lastAction === "ENTRADA";

  if (hasActiveEntry) {
    sel.innerHTML = `
      <option value="SALIDA">Salida</option>
      <option value="MOVIMIENTO">Movimiento</option>`;
    if (sub) sub.textContent = "Tienes un ingreso activo. Elige qué tipo de registro hacer.";
  } else {
    sel.innerHTML = `<option value="ENTRADA">Entrada</option>`;
    if (sub) sub.textContent = "Registro de entrada manual en caso de problema con la cámara.";
  }
}

// Modal de registro manual
_el("btn-open-manual").addEventListener("click", () => {
  _updateManualOpts();
  _el("manual-alert").classList.add("hidden");
  _el("manual-motivo").value = "";
  _el("manual-modal").classList.add("show");
});

_el("manual-modal").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) _el("manual-modal").classList.remove("show");
});

_el("btn-manual-submit").addEventListener("click", async () => {
  const tipo    = _el("manual-tipo").value;
  const motivo  = _el("manual-motivo").value.trim();
  const alertEl = _el("manual-alert");
  alertEl.classList.add("hidden");

  if (!motivo || motivo.length < 4) {
    alertEl.textContent = "Describe el motivo (mínimo 4 caracteres).";
    alertEl.classList.remove("hidden");
    return;
  }

  _showOverlay("Guardando registro manual...");
  try {
    const loc = state.lastLocation;

    // MOVIMIENTO manual → abrir flujo completo de movimiento (sin verificación biométrica)
    // El motivo queda guardado en state para referencia durante el movimiento
    if (tipo === "MOVIMIENTO") {
      if (!state.lastLocation) {
        alertEl.textContent = "Se necesita GPS activo para registrar un movimiento.";
        alertEl.classList.remove("hidden");
        _hideOverlay();
        return;
      }
      _hideOverlay();
      _el("manual-modal").classList.remove("show");
      state._manualMovReason = motivo;
      _el("modal-move-select").classList.add("show");
      return;
    }

    // ENTRADA o SALIDA manual — flujo normal
    const res = await API.manualAttendance({
      identificacion:    state.worker.identificacion,
      tipo,
      motivo,
      latitud:           loc?.lat       ?? null,
      longitud:          loc?.lng       ?? null,
      precision_gps:     loc?.accuracy  ?? null,
      device_fingerprint: state.deviceFingerprint,
    });
    _hideOverlay();
    _el("manual-modal").classList.remove("show");

    if (res.status === "recorded") {
      // Actualizar estado de jornada
      if (tipo === "ENTRADA") {
        state.lastAction = "ENTRADA";
        state.entryTime  = Date.now();
        state.exitTime   = null;
        _saveAttendanceSession();
        _el("s-entry-time").textContent = _colTimeShort();
        _el("s-exit-time").textContent  = "—";
        _el("status-card").classList.remove("hidden");
      } else if (tipo === "SALIDA") {
        state.lastAction = "SALIDA";
        state.exitTime   = Date.now();
        _saveAttendanceSession();
        if (_workTimer) { clearInterval(_workTimer); _workTimer = null; }
        _el("s-exit-time").textContent = _colTimeShort();
        _el("status-card")?.classList.remove("hidden");
      }
      _updateActionButton();
      _updateJornadaBadge();

      _showTxnModal({
        title:    `${tipo.charAt(0) + tipo.slice(1).toLowerCase()} manual registrada`,
        subtitle: motivo,
        details:  [
          { label: "Trabajador", value: res.nombre ?? state.worker?.nombre ?? "" },
          { label: "Hora",       value: _colTimeShort() },
        ],
        onOk: () => UI.goTo("attendance"),
      });
    } else {
      alertEl.textContent = res.message;
      alertEl.classList.remove("hidden");
      _el("manual-modal").classList.add("show");
    }
  } catch (err) {
    _hideOverlay();
    alertEl.textContent = err.message;
    alertEl.classList.remove("hidden");
    _el("manual-modal").classList.add("show");
  }
});


// ══════════════════════════════════════════════════
// SCREEN 5 — VERIFICACIÓN
// ══════════════════════════════════════════════════
function _startVerifyCapture() {
  // ★ MODO PASIVO: no se pide parpadeo.
  // El liveness se detecta por micro-movimientos naturales.
  // Se captura el frame con los OJOS MÁS ABIERTOS → mejor embedding.
  _startCameraFlow({
    videoId:    "video-verify",
    ovalId:     "face-oval-verify",
    dotsId:     "verify-step-dots",
    progressId: "verify-progress-fill",
    instrId:    "verify-instr-text",
    alertId:    "verify-alert",
    steps:      null,   // null = modo pasivo
    onComplete: async (frames) => { await _submitVerify(frames[0]); },
    onError:    () => UI.goTo("attendance"),
  });
}

_el("btn-verify-back").addEventListener("click", async () => {
  await _stopCamera();
  UI.goTo("attendance");
});

async function _submitVerify(frame) {
  _showOverlay("Verificando identidad...");
  const loc = state.lastLocation;
  try {
    const res = await API.verify({
      identificacion:    state.worker.identificacion,
      frame,
      tipo:              state.pendingAction,
      latitud:           loc?.lat   ?? null,
      longitud:          loc?.lng   ?? null,
      precision_gps:     loc?.accuracy ?? null,
      device_fingerprint: state.deviceFingerprint,
    });
    _hideOverlay();

    const isAuth = res.status === "authorized";

    // ── Si es verificación de pre-movimiento ──────────
    if (_movVerifyCallback) {
      const cb = _movVerifyCallback;
      _movVerifyCallback = null;
      if (isAuth) {
        UI.goTo("attendance");
        cb(true);
      } else {
        UI.goTo("attendance");
        _showToast("Verificación fallida. Intenta de nuevo.", "error");
        cb(false);
      }
      return;
    }

    if (isAuth) {
      // Guardar foto y actualizar estado
      _setLastPhoto(frame);
      const tipo = state.pendingAction;

      if (tipo === "ENTRADA") {
        state.lastAction = "ENTRADA";
        state.entryTime  = Date.now();
        state.exitTime   = null;
        _saveAttendanceSession();
        _el("s-entry-time").textContent = _colTimeShort();
        _el("s-exit-time").textContent  = "—";
        _el("status-card").classList.remove("hidden");
        // Reverse geocode para la dirección de entrada
        if (state.lastLocation) {
          _reverseGeocode(state.lastLocation.lat, state.lastLocation.lng).then(addr => {
            const addrEl  = _el("s-address");
            const addrRow = _el("s-address-row");
            if (addrEl)  addrEl.textContent = addr;
            if (addrRow) addrRow.style.display = "flex";
          });
        }
      } else if (tipo === "SALIDA") {
        state.lastAction = "SALIDA";
        state.exitTime   = Date.now();
        _saveAttendanceSession();
        if (_workTimer) { clearInterval(_workTimer); _workTimer = null; }
        _el("s-exit-time").textContent = _colTimeShort();
        _el("status-card")?.classList.remove("hidden");
      }
      _updateActionButton();
      _updateJornadaBadge();
    }

    const tipoLabel = state.pendingAction === "ENTRADA" ? "¡Ingreso registrado!" :
                      state.pendingAction === "SALIDA"  ? "¡Salida registrada!"  :
                      `¡${state.pendingAction} registrado!`;

    const details = [
      { label: "Trabajador", value: res.nombre ?? state.worker?.nombre ?? "" },
      { label: "Hora",       value: _colTimeShort() },
    ];

    if (res.score != null) {
      const pct = Math.round(res.score * 100);
      details.push({ label: "Confianza biométrica", value: `${pct}%`, good: pct >= 65 });
    }

    if (isAuth) {
      _showTxnModal({
        title:    tipoLabel,
        subtitle: "Registro biométrico verificado correctamente",
        details,
        type:     "success",
        onOk:     () => UI.goTo("attendance"),
      });
    } else {
      _showTxnModal({
        title:    "Identidad no verificada",
        subtitle: "La comparación facial no alcanzó el nivel de seguridad requerido",
        details:  [{ label: "Trabajador", value: state.worker?.nombre ?? "" }, { label: "Hora", value: _colTimeShort() }],
        type:     "error",
        onOk:     () => UI.goTo("attendance"),
      });
    }

  } catch (err) {
    _hideOverlay();
    _showTxnModal({
      title:    "Error de verificación",
      subtitle: err.message,
      details:  [],
      type:     "error",
      onOk:     () => UI.goTo("attendance"),
    });
  }
}

_el("btn-result-ok").addEventListener("click", () => UI.goTo("attendance"));


// ══════════════════════════════════════════════════
// MOVIMIENTO — selección, destino, tracking
// ══════════════════════════════════════════════════

/* ════════════════════════════════════════════
   MODALES GLOBALES — éxito, confirmación, toast
═════════════════════════════════════════════*/

/* Toast temporal (no bloquea) */
function _showToast(msg, type = "info") {
  // Crear toast en el overlay-processing area o simplemente alert si no hay
  // Usamos el overlay de procesamiento para mensajes rápidos
  _el("processing-text").textContent = msg;
  _el("overlay-processing").classList.remove("hidden");
  setTimeout(() => _el("overlay-processing").classList.add("hidden"), 2200);
}

/* Modal de éxito/error estilo bancario — type: "success" | "error" */
function _showTxnModal({ title, subtitle, details = [], onOk, type = "success" }) {
  _el("txn-title").textContent    = title;
  _el("txn-subtitle").textContent = subtitle;

  const color   = type === "error" ? "#DC2626" : "#059669";
  const iconWrap = _el("txn-modal").querySelector(".txn-icon-wrap");
  if (iconWrap) {
    if (type === "error") {
      iconWrap.innerHTML = `<svg class="txn-svg" viewBox="0 0 80 80" fill="none">
        <circle class="txn-ring" cx="40" cy="40" r="34" stroke="${color}" stroke-width="3"/>
        <line x1="26" y1="26" x2="54" y2="54" stroke="${color}" stroke-width="4" stroke-linecap="round"/>
        <line x1="54" y1="26" x2="26" y2="54" stroke="${color}" stroke-width="4" stroke-linecap="round"/>
      </svg>`;
    } else {
      iconWrap.innerHTML = `<svg class="txn-svg" viewBox="0 0 80 80" fill="none">
        <circle class="txn-ring" cx="40" cy="40" r="34" stroke="${color}" stroke-width="3"/>
        <polyline class="txn-check" points="22,40 34,52 58,26" stroke="${color}" stroke-width="4"
          stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
    }
  }

  const detEl = _el("txn-details");
  detEl.innerHTML = details.map(({ label, value, good, warn }) =>
    `<div class="txn-detail-row">
      <span class="txn-detail-label">${label}</span>
      <span class="txn-detail-value${good ? " good" : warn ? " warn" : ""}">${value}</span>
    </div>`
  ).join("");

  _el("txn-modal").classList.remove("hidden");

  const okBtn      = _el("txn-ok");
  const cdBadge    = _el("txn-countdown");
  let   cdSecs     = 10;
  let   cdTimer    = null;

  const _close = () => {
    if (cdTimer) { clearInterval(cdTimer); cdTimer = null; }
    if (cdBadge) cdBadge.textContent = "";
    _el("txn-modal").classList.add("hidden");
    onOk?.();
  };

  // Countdown visual
  const _tick = () => {
    if (cdBadge) cdBadge.textContent = cdSecs > 0 ? `${cdSecs}` : "";
    if (cdSecs <= 0) { _close(); return; }
    cdSecs--;
  };
  _tick();
  cdTimer = setInterval(_tick, 1000);

  okBtn.addEventListener("click", _close, { once: true });
}

/* Modal de confirmación (reemplaza confirm()) */
function _confirmModal(title, msg) {
  return new Promise((resolve) => {
    _el("confirm-title").textContent = title;
    _el("confirm-msg").textContent   = msg;
    _el("confirm-modal").classList.remove("hidden");

    const yes = _el("confirm-yes");
    const no  = _el("confirm-no");

    const onYes = () => { cleanup(); resolve(true); };
    const onNo  = () => { cleanup(); resolve(false); };
    const cleanup = () => {
      _el("confirm-modal").classList.add("hidden");
      yes.removeEventListener("click", onYes);
      no.removeEventListener("click", onNo);
    };
    yes.addEventListener("click", onYes, { once: true });
    no.addEventListener("click",  onNo,  { once: true });
  });
}

/* Verificación facial rápida antes de movimiento */
function _verifyBeforeMovement() {
  return new Promise((resolve) => {
    _movVerifyCallback = resolve;
    state.pendingAction = "MOVIMIENTO";
    _el("verify-badge-label").textContent = "Verificación de seguridad";
    UI.goTo("verify");
    _startVerifyCapture();
  });
}

/* ── Modal de selección (ahora con verify previo) ── */
_el("btn-movimiento").addEventListener("click", async () => {
  if (!state.lastLocation) {
    _showToast("Se necesita GPS activo para registrar movimiento.", "error");
    return;
  }

  // ★ Verificar identidad ANTES de abrir el mapa
  const verified = await _verifyBeforeMovement();
  if (!verified) return;   // callback ya mostró el error

  _el("modal-move-select").classList.add("show");
});

_el("btn-move-cancel").addEventListener("click", () => {
  _el("modal-move-select").classList.remove("show");
});

_el("modal-move-select").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) _el("modal-move-select").classList.remove("show");
});

/* ── Modo: ir a un destino ── */
_el("btn-move-destino").addEventListener("click", () => {
  _el("modal-move-select").classList.remove("show");
  _initDestScreen();
});

/* ── Modo: navegación libre ── */
_el("btn-move-libre").addEventListener("click", async () => {
  _el("modal-move-select").classList.remove("show");
  await _beginMovement({ tipo: "LIBRE" });
});

/* ─────────────────────────────────────────────────
   SCREEN: SELECCIÓN DE DESTINO
──────────────────────────────────────────────────*/
function _initDestScreen() {
  UI.goTo("move-dest");

  // Destruir mapa anterior si existía
  if (_movManager) { _movManager.destroy(); _movManager = null; }
  _movManager = new MovementManager();

  const { lat, lng } = state.lastLocation;
  // Delay para que el screen termine la transición antes de crear el mapa
  setTimeout(() => {
    _movManager.initMap("map-dest-container", [lat, lng]);
    _movManager.setInitialPosition(lat, lng);
    _movManager.enableDestPick();
    setTimeout(() => _movManager._map?.invalidateSize(), 200);
  }, 200);

  // Reset UI
  _el("move-dest-selected").classList.add("hidden");
  _el("btn-move-confirm-dest").classList.add("hidden");
  _el("move-route-info").classList.add("hidden");
  _el("move-tap-hint").classList.remove("hidden");
  _el("move-search-input").value = "";
  _el("move-search-results").classList.add("hidden");

  // Callback cuando el usuario toca el mapa
  _movManager.onDestinationSet = async ({ lat, lng, address }) => {
    _el("move-tap-hint").classList.add("hidden");
    _el("move-dest-address").textContent = address;
    _el("move-dest-selected").classList.remove("hidden");
    _el("btn-move-confirm-dest").classList.remove("hidden");

    // Calcular ruta OSRM
    try {
      const from = state.lastLocation;
      _el("move-route-info").classList.add("hidden");
      const { distKm, timeMin } = await _movManager.loadRoute(from.lat, from.lng, lat, lng);
      _el("move-route-dist").textContent = `${distKm} km`;
      _el("move-route-time").textContent = `~${timeMin} min`;
      _el("move-route-info").classList.remove("hidden");
      // Guardar en state.movement temporalmente
      state.movement = {
        ...state.movement,
        destLat: lat, destLng: lng,
        destAddress: address,
        routeDistKm: distKm, routeTimeMin: timeMin,
      };
    } catch {
      // La ruta falló pero el destino ya está marcado — no bloquear
    }
  };
}

/* Búsqueda de dirección con debounce */
_el("move-search-input").addEventListener("input", () => {
  clearTimeout(_searchDebounce);
  const q = _el("move-search-input").value.trim();
  if (q.length < 3) { _el("move-search-results").classList.add("hidden"); return; }

  _searchDebounce = setTimeout(async () => {
    try {
      const results = await _movManager.searchAddress(q);
      _renderSearchResults(results);
    } catch { /* ignorar */ }
  }, 600);
});

function _renderSearchResults(results) {
  const container = _el("move-search-results");
  if (!results?.length) { container.classList.add("hidden"); return; }

  container.innerHTML = results.map(r =>
    `<div class="move-search-item" data-lat="${r.lat}" data-lng="${r.lon}">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">
        <circle cx="12" cy="10" r="3"/>
        <path d="M12 2a8 8 0 0 0-8 8c0 5.4 7.05 11.5 7.35 11.76a1 1 0 0 0 1.3 0C12.95 21.5 20 15.4 20 10a8 8 0 0 0-8-8z"/>
      </svg>
      <span class="move-search-item-address">${r.display_name}</span>
    </div>`
  ).join("");

  container.classList.remove("hidden");
  container.querySelectorAll(".move-search-item").forEach((item) => {
    item.addEventListener("click", async () => {
      container.classList.add("hidden");
      _el("move-search-input").value = "";
      const lat = parseFloat(item.dataset.lat);
      const lng = parseFloat(item.dataset.lng);
      await _movManager.setDestination(lat, lng);
    });
  });
}

/* Botón de volver desde pantalla de destino */
_el("btn-movedest-back").addEventListener("click", () => {
  if (_movManager) { _movManager.destroy(); _movManager = null; }
  UI.goTo("attendance");
});

/* Confirmar destino → iniciar movimiento */
_el("btn-move-confirm-dest").addEventListener("click", async () => {
  const mv = state.movement ?? {};
  await _beginMovement({
    tipo:         "DESTINO_FIJO",
    destLat:      mv.destLat,
    destLng:      mv.destLng,
    destAddress:  mv.destAddress,
    routeDistKm:  mv.routeDistKm,
    routeTimeMin: mv.routeTimeMin,
  });
});

/* ─────────────────────────────────────────────────
   INICIO EFECTIVO DEL MOVIMIENTO → backend + tracking
──────────────────────────────────────────────────*/
async function _beginMovement({ tipo, destLat = null, destLng = null,
  destAddress = null, routeDistKm = null, routeTimeMin = null }) {

  _showOverlay("Iniciando movimiento...");
  const loc = state.lastLocation;

  if (!loc) {
    _hideOverlay();
    alert("GPS no disponible. Activa la ubicación e intenta de nuevo.");
    return;
  }

  try {
    const res = await API.startMovement({
      identificacion:    state.worker.identificacion,
      tipo,
      lat_inicio:        loc.lat,
      lng_inicio:        loc.lng,
      lat_destino:       destLat,
      lng_destino:       destLng,
      direccion_destino: destAddress,
      ruta_dist_km:      routeDistKm,
      ruta_tiempo_min:   routeTimeMin,
      device_fingerprint: state.deviceFingerprint,
    });
    _hideOverlay();

    state.movement = {
      id:           res.movimiento_id,
      tipo,
      startMs:      Date.now(),
      destLat,
      destLng,
      destAddress,
      routeDistKm,
      routeTimeMin,
    };
    _saveMovementSession(state.movement, state.worker.identificacion);

    _initActiveScreen();

  } catch (err) {
    _hideOverlay();

    // ★ Recuperación automática de movimiento activo huérfano
    if (err.message.includes("ACTIVE_MOVEMENT")) {
      const ok = await _confirmModal(
        "Movimiento sin finalizar",
        "Tienes un movimiento anterior que no fue cerrado correctamente. ¿Deseas cancelarlo y comenzar uno nuevo?"
      );
      if (ok) {
        _showOverlay("Cancelando movimiento anterior...");
        try {
          const active = await API.checkMovement(state.worker.identificacion);
          if (active?.active && active.movimiento_id) {
            await API.finishMovement({
              movimiento_id:     active.movimiento_id,
              distancia_real_km: 0,
              llego_destino:     false,
              waypoints:         [],
            });
            _clearMovementSession();
          }
          _hideOverlay();
          // Reintentar con los mismos parámetros
          await _beginMovement({ tipo, destLat, destLng, destAddress, routeDistKm, routeTimeMin });
        } catch {
          _hideOverlay();
          _showToast("No se pudo recuperar. Intenta de nuevo.", "error");
          UI.goTo("attendance");
        }
      } else {
        UI.goTo("attendance");
      }
    } else {
      _showToast(`Error al iniciar: ${err.message}`, "error");
      UI.goTo("attendance");
    }
  }
}

/* ─────────────────────────────────────────────────
   SCREEN: MOVIMIENTO ACTIVO
──────────────────────────────────────────────────*/
function _initActiveScreen() {
  UI.goTo("move-active");

  if (!_movManager) _movManager = new MovementManager();
  // Si el GPS aún no está disponible, usar coords de inicio guardadas como fallback
  const mv   = state.movement;
  const loc  = state.lastLocation
    ?? (mv?._startLat ? { lat: mv._startLat, lng: mv._startLng } : null)
    ?? { lat: 4.71, lng: -74.07 };

  // UI-only: mostrar/ocultar elementos sin necesitar el mapa
  if (mv.tipo === "DESTINO_FIJO" && mv.destLat) {
    _el("move-active-dest-bar").classList.remove("hidden");
    _el("move-active-dest-address").textContent = mv.destAddress ?? "Destino";
    _el("move-stat-dest-box").classList.remove("hidden");
    _el("move-active-mode").textContent = "Destino fijo";
  } else {
    _el("move-active-dest-bar").classList.add("hidden");
    _el("move-stat-dest-box").classList.add("hidden");
    _el("move-active-mode").textContent = "Navegación libre";
  }

  // Callbacks: asignar antes de iniciar el mapa (no requieren el mapa)
  _movManager.onPositionUpdate = ({ lat, lng, speed, accuracy, totalDist, distToDestKm }) => {
    _el("move-active-dist-val").textContent = totalDist.toFixed(2);
    _el("move-stat-speed").textContent      = speed.toFixed(0);
    _el("move-stat-wps").textContent        = _movManager._waypoints.length;
    if (distToDestKm !== null) {
      _el("move-stat-dest").textContent = distToDestKm.toFixed(2);
    }
    state.lastLocation = { lat, lng, accuracy };
  };

  _movManager.onArrival = () => {
    navigator.vibrate?.([200, 100, 200, 100, 400]);
    // Finalizar automáticamente al llegar al destino
    _autoFinishMovement(true);
  };

  _movManager.onError = (msg) => {
    _el("move-desvio-badge").classList.remove("hidden");
    setTimeout(() => _el("move-desvio-badge").classList.add("hidden"), 4000);
    console.warn("GPS:", msg);
  };

  // Timer del movimiento (no requiere mapa)
  _startMoveTimer();

  // Detectar pérdida de conexión en pantalla de mapa
  _attachMoveOfflineListeners();
  if (!navigator.onLine) _showMoveOfflineError();

  // Iniciar mapa DESPUÉS de que el screen esté visible (evita dimensiones 0)
  // Todo lo que llama addTo(map) va aquí dentro — nunca antes
  setTimeout(() => {
    _movManager.initMap("map-active-container", [loc.lat, loc.lng]);
    _movManager.setInitialPosition(loc.lat, loc.lng);

    // Iniciar GPS tracking AHORA que el mapa existe
    _movManager.startTracking();

    // Ruta + destino (DESTINO_FIJO) — también necesitan el mapa inicializado
    if (mv.tipo === "DESTINO_FIJO" && mv.destLat) {
      _movManager._destLat = mv.destLat;
      _movManager._destLng = mv.destLng;
      _movManager.setDestination(mv.destLat, mv.destLng).catch(() => {});
      _movManager.loadRoute(loc.lat, loc.lng, mv.destLat, mv.destLng).catch(() => {});
    }

    setTimeout(() => _movManager._map?.invalidateSize(), 200);
  }, 150);
}

function _showMoveOfflineError() {
  _showConnError(
    "Sin conexión a internet",
    "El recorrido sigue activo. Cuando vuelva la señal se restablecerá automáticamente.",
    () => { if (navigator.onLine) _hideOverlay(); else _showMoveOfflineError(); }
  );
}

function _attachMoveOfflineListeners() {
  _detachMoveOfflineListeners();
  _moveOfflineHandler = () => { if (state.movement?.id) _showMoveOfflineError(); };
  _moveOnlineHandler  = () => { if (state.movement?.id) _hideOverlay(); };
  window.addEventListener("offline", _moveOfflineHandler);
  window.addEventListener("online",  _moveOnlineHandler);
}

function _detachMoveOfflineListeners() {
  if (_moveOfflineHandler) { window.removeEventListener("offline", _moveOfflineHandler); _moveOfflineHandler = null; }
  if (_moveOnlineHandler)  { window.removeEventListener("online",  _moveOnlineHandler);  _moveOnlineHandler  = null; }
}

/* Finalización automática (al llegar al destino o desde el botón) */
let _autoFinishInProgress = false;
async function _autoFinishMovement(llegoDestino = false) {
  if (_autoFinishInProgress || !state.movement?.id) return;
  _autoFinishInProgress = true;
  _detachMoveOfflineListeners();

  if (_moveTimer) { clearInterval(_moveTimer); _moveTimer = null; }

  const tracking = _movManager?.stopTracking() ?? { waypoints: [], totalDist: 0, maxDesvio: 0 };
  if (_movManager) { _movManager.destroy(); _movManager = null; }

  const mv      = state.movement;
  const payload = {
    movimiento_id:     mv.id,
    distancia_real_km: +tracking.totalDist.toFixed(3),
    desvio_max_km:     +(tracking.maxDesvio ?? 0).toFixed(3),
    llego_destino:     llegoDestino,
    waypoints:         tracking.waypoints,
  };

  await _attemptFinishMovement(payload, mv, llegoDestino);
}

async function _attemptFinishMovement(payload, mv, llegoDestino) {
  _showOverlay("Guardando movimiento...");
  try {
    const res = await Promise.race([
      API.finishMovement(payload),
      new Promise((_, rej) => setTimeout(() => rej(new Error("NETWORK_TIMEOUT")), 15000)),
    ]);
    _hideOverlay();

    const durMin  = res.duracion_min ?? 0;
    const distKm  = res.distancia_real_km ?? 0;
    const wps     = res.total_waypoints ?? payload.waypoints.length;
    const velMax  = res.velocidad_max_kmh ?? 0;
    const velProm = res.velocidad_prom_kmh ?? 0;

    state.movement = null;
    _clearMovementSession();
    _autoFinishInProgress = false;

    _showTxnModal({
      title:    llegoDestino ? "¡Destino alcanzado!" : "Movimiento completado",
      subtitle: llegoDestino
        ? "Llegaste al punto de destino exitosamente"
        : `${mv.tipo === "DESTINO_FIJO" ? "Destino fijo" : "Navegación libre"} registrado exitosamente`,
      details: [
        { label: "Duración",           value: `${durMin} min` },
        { label: "Distancia recorrida", value: `${distKm} km`, good: true },
        { label: "Puntos GPS",          value: wps.toString() },
        { label: "Vel. máxima",         value: `${velMax} km/h` },
        { label: "Vel. promedio",       value: `${velProm} km/h` },
        ...(mv.tipo === "DESTINO_FIJO"
          ? [{ label: "Ruta planeada", value: `${mv.routeDistKm ?? "—"} km (${mv.routeTimeMin ?? "—"} min)` }]
          : []),
      ],
      onOk: () => UI.goTo("attendance"),
    });
  } catch (err) {
    const isNet = err.message === "NETWORK_TIMEOUT" || !navigator.onLine || err.name === "TypeError";
    if (isNet) {
      // Sin conexión: NO redirigir al home — solo mostrar error + reintentar en bucle
      _showConnError(
        "Sin conexión a internet",
        "El movimiento no se pudo guardar. Cuando vuelva la señal, presiona reintentar.",
        () => _attemptFinishMovement(payload, mv, llegoDestino)
      );
      return; // _autoFinishInProgress sigue true — bloquea nuevos intentos hasta el retry
    }
    // Error real del servidor (no de red)
    _hideOverlay();
    _autoFinishInProgress = false;
    _showTxnModal({
      title: "Error al guardar",
      subtitle: err.message,
      details: [],
      type: "error",
      onOk: () => UI.goTo("attendance"),
    });
  }
}

function _startMoveTimer() {
  if (_moveTimer) clearInterval(_moveTimer);
  const startMs = state.movement?.startMs ?? Date.now();
  const tick = () => {
    const ms = Date.now() - startMs;
    const h  = Math.floor(ms / 3600000);
    const m  = Math.floor((ms % 3600000) / 60000);
    const s  = Math.floor((ms % 60000)   / 1000);
    const el = _el("move-active-timer");
    if (el) el.textContent = `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  };
  tick();
  _moveTimer = setInterval(tick, 1000);
}

/* Finalizar movimiento (manual) */
_el("btn-move-end").addEventListener("click", async () => {
  if (!state.movement?.id) { UI.goTo("attendance"); return; }

  const ok = await _confirmModal(
    "¿Finalizar movimiento?",
    "Se guardará el recorrido completo con todos los datos de trayecto."
  );
  if (!ok) return;

  await _autoFinishMovement(false);
});


// ══════════════════════════════════════════════════
// REVERSE GEOCODING — coordenadas → dirección real
// ══════════════════════════════════════════════════
async function _reverseGeocode(lat, lng) {
  try {
    const res  = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
      { headers: { "Accept-Language": "es" } }
    );
    const data = await res.json();
    const parts = (data.display_name ?? "").split(",");
    // Mostrar calle + ciudad (primeras 3 partes)
    return parts.slice(0, 3).map(s => s.trim()).filter(Boolean).join(", ") || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  } catch {
    return `${lat.toFixed(5)}°, ${lng.toFixed(5)}°`;
  }
}

/* Actualiza la dirección en el geo pill de asistencia */
async function _updateLocationAddress(lat, lng) {
  const addr = await _reverseGeocode(lat, lng);
  const locText = _el("attend-loc-text");
  if (locText) locText.textContent = addr;
  const badge = _el("attend-loc-badge");
  if (badge) { badge.className = "location-badge"; badge.textContent = "GPS"; }
  // Guardar para la status card
  if (state._lastAddress !== addr) {
    state._lastAddress = addr;
    const addrEl = _el("s-address");
    const addrRow = _el("s-address-row");
    if (addrEl) addrEl.textContent = addr;
    if (addrRow) addrRow.style.display = "flex";
  }
}

// ══════════════════════════════════════════════════
// ESTADO DE JORNADA — lógica de negocio
// ══════════════════════════════════════════════════
function _updateJornadaBadge() {
  const badge    = _el("jornada-badge");
  if (!badge) return;
  const entryMs  = state.entryTime;
  const exitMs   = state.exitTime;
  const hasEntry = !!entryMs;
  const hasExit  = !!exitMs;

  if (!hasEntry) {
    badge.className   = "status-jornada-badge sjb-incompleta";
    badge.textContent = "Sin ingreso";
    return;
  }
  if (!hasExit) {
    badge.className   = "status-jornada-badge sjb-activa";
    badge.textContent = "Activa";
    return;
  }

  // Duración real: exitTime − entryTime (correcto para turnos nocturnos)
  const durHrs = (exitMs - entryMs) / 3600000;

  if (durHrs >= 8) {
    badge.className   = "status-jornada-badge sjb-completa";
    badge.textContent = "Completa";
  } else if (durHrs >= 4) {
    badge.className   = "status-jornada-badge sjb-parcial";
    badge.textContent = "Parcial";
  } else {
    badge.className   = "status-jornada-badge sjb-incompleta";
    badge.textContent = "Incompleta";
  }
}

// ══════════════════════════════════════════════════
// HISTORIAL DE REGISTROS
// ══════════════════════════════════════════════════
// Íconos: todos con paths SVG válidos y simples
const TYPE_META = {
  ENTRADA:           { label: "Entrada",                 cls: "htd-entry",   color: "#059669" },
  SALIDA:            { label: "Salida",                  cls: "htd-exit",    color: "#DC2626" },
  MOVIMIENTO_INICIO: { label: "Inició movimiento",       cls: "htd-move",    color: "#7C3AED" },
  MOVIMIENTO_FIN:    { label: "Finalizó movimiento",     cls: "htd-move",    color: "#7C3AED" },
  DESTINO_FIJO:      { label: "Movimiento destino fijo", cls: "htd-move",    color: "#7C3AED" },
  LIBRE:             { label: "Navegación libre",        cls: "htd-move",    color: "#7C3AED" },
  MOVIMIENTO:        { label: "Navegación libre",        cls: "htd-move",    color: "#7C3AED" },
  ALMUERZO:          { label: "Almuerzo",                cls: "htd-manual",  color: "#D97706" },
  DESAYUNO:          { label: "Desayuno",                cls: "htd-manual",  color: "#D97706" },
  BREAK:             { label: "Break",                   cls: "htd-manual",  color: "#7C3AED" },
  MANUAL:            { label: "Registro manual",         cls: "htd-manual",  color: "#D97706" },
};

// SVG paths por grupo
function _typeIcon(tipo, color) {
  const paths = {
    ENTRADA:           `<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" stroke="${color}"/><polyline points="10 17 15 12 10 7" stroke="${color}"/><line x1="15" y1="12" x2="3" y2="12" stroke="${color}"/>`,
    SALIDA:            `<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="${color}"/><polyline points="16 17 21 12 16 7" stroke="${color}"/><line x1="21" y1="12" x2="9" y2="12" stroke="${color}"/>`,
    MOVIMIENTO_INICIO: `<circle cx="12" cy="10" r="3" stroke="${color}"/><path d="M12 2a8 8 0 0 0-8 8c0 5.4 7.05 11.5 7.35 11.76a1 1 0 0 0 1.3 0C12.95 21.5 20 15.4 20 10a8 8 0 0 0-8-8z" stroke="${color}"/>`,
    MOVIMIENTO_FIN:    `<circle cx="12" cy="10" r="3" stroke="${color}"/><path d="M12 2a8 8 0 0 0-8 8c0 5.4 7.05 11.5 7.35 11.76a1 1 0 0 0 1.3 0C12.95 21.5 20 15.4 20 10a8 8 0 0 0-8-8z" stroke="${color}"/><polyline points="9 17 12 20 15 17" stroke="${color}"/>`,
    DESTINO_FIJO:      `<circle cx="12" cy="10" r="3" stroke="${color}"/><path d="M12 2a8 8 0 0 0-8 8c0 5.4 7.05 11.5 7.35 11.76a1 1 0 0 0 1.3 0C12.95 21.5 20 15.4 20 10a8 8 0 0 0-8-8z" stroke="${color}"/>`,
    LIBRE:             `<polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" stroke="${color}"/><line x1="8" y1="2" x2="8" y2="18" stroke="${color}"/><line x1="16" y1="6" x2="16" y2="22" stroke="${color}"/>`,
    MOVIMIENTO:        `<polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" stroke="${color}"/><line x1="8" y1="2" x2="8" y2="18" stroke="${color}"/><line x1="16" y1="6" x2="16" y2="22" stroke="${color}"/>`,
    ALMUERZO:          `<path d="M18 8h1a4 4 0 0 1 0 8h-1" stroke="${color}"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" stroke="${color}"/>`,
    DESAYUNO:          `<path d="M18 8h1a4 4 0 0 1 0 8h-1" stroke="${color}"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" stroke="${color}"/>`,
    BREAK:             `<circle cx="12" cy="12" r="10" stroke="${color}"/><line x1="10" y1="15" x2="10" y2="9" stroke="${color}"/><line x1="14" y1="15" x2="14" y2="9" stroke="${color}"/>`,
    MANUAL:            `<path d="M12 20h9" stroke="${color}"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" stroke="${color}"/>`,
  };
  const p = paths[tipo] ?? `<circle cx="12" cy="12" r="10" stroke="${color}"/>`;
  return `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
}

function _getTypeMeta(tipo) {
  return TYPE_META[tipo] ?? { label: tipo, cls: "htd-generic", color: "#1B2A5E" };
}

function _fmtDateTime(isoStr) {
  try {
    const d = new Date(isoStr);
    return d.toLocaleString("es-CO", {
      timeZone:  "America/Bogota",
      weekday:   "short", day: "2-digit", month: "short",
      hour:      "2-digit", minute: "2-digit", hour12: true,
    });
  } catch { return isoStr; }
}

function _buildHistItem(rec) {
  const isMove = rec.tipo_registro === "movimiento";
  const tipoKey = isMove ? (rec.tipo ?? "LIBRE") : (rec.tipo ?? "MANUAL");
  const meta    = _getTypeMeta(tipoKey);
  const time    = _fmtDateTime(rec.fecha_hora);

  // Badge de estado
  let badge = "";
  if (!isMove && !rec.es_manual) badge = `<span class="hist-item-badge hib-auth">Biométrico</span>`;
  else if (!isMove && rec.es_manual) badge = `<span class="hist-item-badge hib-manual">Manual</span>`;
  else if (isMove && rec.estado === "ACTIVO")     badge = `<span class="hist-item-badge hib-active">Activo</span>`;
  else if (isMove && rec.estado === "COMPLETADO") badge = `<span class="hist-item-badge hib-done">Completado</span>`;

  // ── Celdas de detalle ─────────────────────────────────────────────
  const cells = [];

  if (!isMove) {
    // Tiempo laborado — solo para ENTRADA (tiene fecha_salida o está activa)
    if (rec.tipo === "ENTRADA") {
      if (rec.fecha_salida) {
        const exitStr = new Intl.DateTimeFormat("en-US", {
          timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: true,
        }).format(new Date(rec.fecha_salida)).replace(/\./g, "");
        cells.push(`<div class="hist-detail-cell"><div class="hdc-label">Hora salida</div><div class="hdc-value" style="color:var(--red)">${exitStr}</div></div>`);
        cells.push(`<div class="hist-detail-cell"><div class="hdc-label">Tiempo laborado</div><div class="hdc-value">${_fmtDuration(rec.fecha_hora, rec.fecha_salida)}</div></div>`);
      } else {
        const entryMs = new Date(rec.fecha_hora).getTime();
        cells.push(`<div class="hist-detail-cell hdc-full"><div class="hdc-label">En curso — tiempo transcurrido</div><div class="hdc-value" style="color:var(--green);font-variant-numeric:tabular-nums"><span class="hist-live-elapsed" data-entry="${entryMs}">--:--:--</span></div></div>`);
      }
    }
    // Marcaciones
    if (rec.score != null) {
      const pct = (rec.score * 100).toFixed(1);
      cells.push(`<div class="hist-detail-cell"><div class="hdc-label">Confianza biométrica</div><div class="hdc-value" style="color:${parseFloat(pct) >= 65 ? 'var(--green)' : 'var(--red)'}">${pct}%</div></div>`);
    }
    if (rec.es_manual && rec.motivo) {
      cells.push(`<div class="hist-detail-cell hdc-full"><div class="hdc-label">Motivo del registro</div><div class="hdc-value">${rec.motivo}</div></div>`);
    }
    if (rec.latitud && rec.longitud) {
      cells.push(`<div class="hist-detail-cell"><div class="hdc-label">Latitud</div><div class="hdc-value">${rec.latitud.toFixed(6)}°</div></div>`);
      cells.push(`<div class="hist-detail-cell"><div class="hdc-label">Longitud</div><div class="hdc-value">${rec.longitud.toFixed(6)}°</div></div>`);
    }
  } else {
    // Movimientos
    if (rec.duracion_min != null) cells.push(`<div class="hist-detail-cell"><div class="hdc-label">Duración</div><div class="hdc-value">${rec.duracion_min} min</div></div>`);
    if (rec.distancia_km != null) cells.push(`<div class="hist-detail-cell"><div class="hdc-label">Distancia real</div><div class="hdc-value">${rec.distancia_km.toFixed(2)} km</div></div>`);
    if (rec.vel_max  != null) cells.push(`<div class="hist-detail-cell"><div class="hdc-label">Vel. máxima</div><div class="hdc-value">${rec.vel_max} km/h</div></div>`);
    if (rec.vel_prom != null) cells.push(`<div class="hist-detail-cell"><div class="hdc-label">Vel. promedio</div><div class="hdc-value">${rec.vel_prom} km/h</div></div>`);
    if (rec.total_wps != null) cells.push(`<div class="hist-detail-cell"><div class="hdc-label">Puntos GPS</div><div class="hdc-value">${rec.total_wps}</div></div>`);
    if (rec.ruta_dist_km != null) cells.push(`<div class="hist-detail-cell"><div class="hdc-label">Ruta planeada</div><div class="hdc-value">${rec.ruta_dist_km.toFixed(2)} km</div></div>`);
    if (rec.tipo === "DESTINO_FIJO" && rec.llego != null) {
      cells.push(`<div class="hist-detail-cell"><div class="hdc-label">Llegó al destino</div><div class="hdc-value" style="color:${rec.llego ? 'var(--green)' : 'var(--amber)'}">${rec.llego ? "Sí" : "No"}</div></div>`);
    }
    if (rec.dir_destino) {
      cells.push(`<div class="hist-detail-cell hdc-full"><div class="hdc-label">Destino</div><div class="hdc-value">${rec.dir_destino}</div></div>`);
    }
    if (rec.latitud && rec.longitud) {
      cells.push(`<div class="hist-detail-cell"><div class="hdc-label">Inicio lat/lng</div><div class="hdc-value">${rec.latitud.toFixed(5)}°, ${rec.longitud.toFixed(5)}°</div></div>`);
    }
  }

  // ── Botón mapa: para movimientos con waypoints O marcaciones con coords ─
  let mapBtn = "";
  if (isMove && (rec.estado === "COMPLETADO" || rec.estado === "ACTIVO")) {
    mapBtn = `<button class="btn-hist-map" data-movid="${rec.id}" data-dur="${rec.duracion_min ?? 0}" data-dist="${rec.distancia_km ?? 0}" data-wps="${rec.total_wps ?? 0}" data-tipo="${rec.tipo ?? ''}" data-estado="${rec.estado ?? ''}" data-lat-inicio="${rec.latitud ?? ''}" data-lng-inicio="${rec.longitud ?? ''}" data-dest-lat="${rec.lat_destino ?? ''}" data-dest-lng="${rec.lng_destino ?? ''}" data-dest-addr="${(rec.dir_destino ?? '').replace(/"/g, '&quot;')}">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
        <line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>
      </svg>
      Ver recorrido en mapa
    </button>`;
  } else if (!isMove && rec.latitud && rec.longitud) {
    // Marcaciones con coords → mapa interno con pin de ubicación
    mapBtn = `<button class="btn-hist-map btn-hist-loc"
               data-lat="${rec.latitud}" data-lng="${rec.longitud}" data-tipo="${rec.tipo}">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="10" r="3"/>
        <path d="M12 2a8 8 0 0 0-8 8c0 5.4 7.05 11.5 7.35 11.76a1 1 0 0 0 1.3 0C12.95 21.5 20 15.4 20 10a8 8 0 0 0-8-8z"/>
      </svg>
      Ver ubicación en mapa
    </button>`;
  }

  return `
    <div class="hist-item" data-id="${rec.id}" data-type="${rec.tipo_registro}">
      <div class="hist-item-head">
        <div class="hist-type-dot ${meta.cls}">
          ${_typeIcon(tipoKey, meta.color)}
        </div>
        <div style="flex:1;min-width:0;">
          <div class="hist-item-title">${meta.label}</div>
          <div class="hist-item-time">${time}</div>
        </div>
        ${badge}
      </div>
      <div class="hist-item-detail">
        ${cells.length ? `<div class="hist-detail-grid">${cells.join("")}</div>` : ""}
        ${mapBtn}
      </div>
    </div>`;
}

// ── Estado de filtros del historial ────────────────────────
let _histRawRecords  = [];
let _histLiveTimer   = null;
let _histActiveTab   = "marcaciones";
const _histFilters   = { tipo: "all", desde: null, hasta: null };

function _fmtDuration(entryIso, exitIso) {
  const ms = new Date(exitIso).getTime() - new Date(entryIso).getTime();
  if (ms <= 0) return "—";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m} min`;
}

/* Formatea un epoch ms como fecha larga Colombia */
function _msToDateLong(ms) {
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota", weekday: "short", day: "2-digit", month: "short", year: "numeric",
  }).format(new Date(ms));
}

/* Formatea un epoch ms como fecha corta Colombia (sin año) */
function _msToDateShort(ms) {
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota", weekday: "short", day: "2-digit", month: "short",
  }).format(new Date(ms));
}

/* Construye tarjeta de jornada — compacta, expandible al clic */
function _buildJornadaItem(rec) {
  const entryMs = new Date(rec.fecha_hora).getTime();
  const exitMs  = rec.fecha_salida ? new Date(rec.fecha_salida).getTime() : null;

  // ── Badge de estado ────────────────────────────────
  let badgeCls = "sjb-activa", badgeTxt = "Activa";
  if (exitMs) {
    const h = (exitMs - entryMs) / 3600000;
    if      (h >= 8) { badgeCls = "sjb-completa";  badgeTxt = "Completa"; }
    else if (h >= 4) { badgeCls = "sjb-parcial";   badgeTxt = "Parcial"; }
    else             { badgeCls = "sjb-incompleta"; badgeTxt = "Incompleta"; }
  }
  const badge = `<span class="hist-item-badge ${badgeCls}">${badgeTxt}</span>`;

  // ── Línea de resumen (cabecera compacta) ───────────
  const entryTimeStr = _msToTimeShort(entryMs);
  const exitTimeStr  = exitMs ? _msToTimeShort(exitMs) : null;
  const summaryTime  = exitMs
    ? `${entryTimeStr} → ${exitTimeStr}`
    : `${entryTimeStr} → <span style="color:var(--green);font-weight:700">En curso</span>`;

  // ── Icono de reloj ─────────────────────────────────
  const icon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--navy)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;

  // ── Detalle: fechas completas ──────────────────────
  const entryDateStr = _msToDateLong(entryMs);
  const exitDateStr  = exitMs ? _msToDateLong(exitMs) : "—";

  // ── Tiempo laborado ────────────────────────────────
  let durCell;
  if (exitMs) {
    durCell = `
      <div class="hist-detail-cell hdc-full">
        <div class="hdc-label">Tiempo laborado</div>
        <div class="hdc-value hdc-value-lg">${_fmtDuration(rec.fecha_hora, rec.fecha_salida)}</div>
      </div>`;
  } else {
    durCell = `
      <div class="hist-detail-cell hdc-full">
        <div class="hdc-label">Tiempo en jornada — en curso</div>
        <div class="hdc-value hdc-value-lg jornada-live">
          <span class="hist-live-elapsed" data-entry="${entryMs}">--:--:--</span>
          <span style="font-size:11px;font-weight:600;color:var(--green);margin-left:6px">● En curso</span>
        </div>
      </div>`;
  }

  return `
    <div class="hist-item">
      <div class="hist-item-head">
        <div class="hist-type-dot htd-jornada">${icon}</div>
        <div style="flex:1;min-width:0">
          <div class="hist-item-title">${_msToDateShort(entryMs)}</div>
          <div class="hist-item-time">${summaryTime}</div>
        </div>
        ${badge}
      </div>
      <div class="hist-item-detail">
        <div class="hist-detail-grid">
          <div class="hist-detail-cell">
            <div class="hdc-label">Fecha entrada</div>
            <div class="hdc-value">${entryDateStr}</div>
          </div>
          <div class="hist-detail-cell">
            <div class="hdc-label">Hora entrada</div>
            <div class="hdc-value" style="color:var(--green)">${entryTimeStr}</div>
          </div>
          <div class="hist-detail-cell">
            <div class="hdc-label">Fecha salida</div>
            <div class="hdc-value">${exitDateStr}</div>
          </div>
          <div class="hist-detail-cell">
            <div class="hdc-label">Hora salida</div>
            <div class="hdc-value" style="color:${exitMs ? 'var(--red)' : 'var(--text-dim)'}">${exitTimeStr ?? '—'}</div>
          </div>
          ${durCell}
        </div>
      </div>
    </div>`;
}

/* Renderiza la pestaña activa */
function _renderHistTab() {
  const isMarcaciones = _histActiveTab === "marcaciones";
  _el("hist-list")?.classList.toggle("hidden", !isMarcaciones);
  _el("jornadas-list")?.classList.toggle("hidden", isMarcaciones);
  document.querySelectorAll(".hist-tab-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.tab === _histActiveTab);
  });

  if (!isMarcaciones) {
    const jornadasEl = _el("jornadas-list");
    if (!jornadasEl) return;

    // Solo registros de ENTRADA filtrados por rango de fechas
    const entradas = _histRawRecords.filter(r =>
      r.tipo_registro === "marcacion" &&
      r.tipo === "ENTRADA" &&
      _inDateRange(r.fecha_hora)
    );

    _stopHistLiveCounters();

    if (!entradas.length) {
      jornadasEl.innerHTML = `<div class="hist-empty"><span>Sin jornadas en el período seleccionado</span></div>`;
      return;
    }

    jornadasEl.innerHTML = entradas.map(_buildJornadaItem).join("");

    // Expand/collapse igual que las marcaciones
    jornadasEl.querySelectorAll(".hist-item").forEach(item => {
      item.querySelector(".hist-item-head").addEventListener("click", () => {
        item.classList.toggle("expanded");
      });
    });

    if (jornadasEl.querySelector(".hist-live-elapsed")) _startHistLiveCounters();
  }
}

function _inDateRange(isoStr) {
  if (!_histFilters.desde && !_histFilters.hasta) return true;
  const d = new Date(isoStr);
  if (_histFilters.desde && d < _histFilters.desde) return false;
  if (_histFilters.hasta && d > _histFilters.hasta) return false;
  return true;
}

function _startHistLiveCounters() {
  if (_histLiveTimer) clearInterval(_histLiveTimer);
  _histLiveTimer = setInterval(() => {
    document.querySelectorAll(".hist-live-elapsed").forEach(el => {
      const entry = parseInt(el.dataset.entry, 10);
      if (!entry) return;
      const ms = Date.now() - entry;
      const h  = Math.floor(ms / 3600000);
      const m  = Math.floor((ms % 3600000) / 60000);
      const s  = Math.floor((ms % 60000) / 1000);
      el.textContent = `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
    });
  }, 1000);
}

function _stopHistLiveCounters() {
  if (_histLiveTimer) { clearInterval(_histLiveTimer); _histLiveTimer = null; }
}


/* Aplica atajos de período → actualiza _histFilters.desde y hasta */
function _applyPeriodShortcut(period) {
  const now   = new Date();
  const today = new Date(now.toLocaleString("en-US", { timeZone: "America/Bogota" }));
  today.setHours(0, 0, 0, 0);

  switch (period) {
    case "today":
      _histFilters.desde = new Date(today);
      _histFilters.hasta = new Date(today); _histFilters.hasta.setHours(23, 59, 59, 999);
      break;
    case "week": {
      const ws = new Date(today); ws.setDate(today.getDate() - today.getDay());
      _histFilters.desde = ws; _histFilters.hasta = null;
      break;
    }
    case "month":
      _histFilters.desde = new Date(today.getFullYear(), today.getMonth(), 1);
      _histFilters.hasta = null;
      break;
    default:
      _histFilters.desde = null; _histFilters.hasta = null;
  }

  const toVal = d => d ? d.toISOString().split("T")[0] : "";
  const d = _el("hf-desde"); const h = _el("hf-hasta");
  if (d) d.value = toVal(_histFilters.desde);
  if (h) h.value = toVal(_histFilters.hasta);
}

/* Aplica todos los filtros activos */
function _applyHistFilters() {
  return _histRawRecords.filter(rec => {
    if (_histFilters.tipo !== "all") {
      if (_histFilters.tipo === "entrada"    && rec.tipo !== "ENTRADA")             return false;
      if (_histFilters.tipo === "salida"     && rec.tipo !== "SALIDA")              return false;
      if (_histFilters.tipo === "movimiento" && rec.tipo_registro !== "movimiento") return false;
      if (_histFilters.tipo === "manual"     && rec.es_manual !== true)             return false;
    }
    if (_histFilters.desde || _histFilters.hasta) {
      const rd = new Date(rec.fecha_hora);
      if (_histFilters.desde && rd < _histFilters.desde) return false;
      if (_histFilters.hasta && rd > _histFilters.hasta) return false;
    }
    return true;
  });
}

/* Renderiza la lista filtrada y adjunta event listeners */
function _renderHistList(records) {
  const list = _el("hist-list");
  const info = _el("hist-filter-info");

  if (!records.length) {
    list.innerHTML = `<div class="hist-empty">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--border-dk)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <span>Sin registros con los filtros seleccionados</span>
    </div>`;
    if (info) info.textContent = `0 de ${_histRawRecords.length} registros`;
    return;
  }

  if (info) info.textContent = `${records.length} de ${_histRawRecords.length} registros`;
  list.innerHTML = records.map(_buildHistItem).join("");

  // Contadores en vivo para entradas activas
  _stopHistLiveCounters();
  if (list.querySelector(".hist-live-elapsed")) _startHistLiveCounters();

  // Toggle detalle
  list.querySelectorAll(".hist-item").forEach(item => {
    item.querySelector(".hist-item-head").addEventListener("click", () => {
      item.classList.toggle("expanded");
    });
  });

  // Mapa de recorrido (movimientos)
  list.querySelectorAll("button.btn-hist-map[data-movid]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const movId = parseInt(btn.dataset.movid);
      if (isNaN(movId)) return;
      await _openMovementMap(movId, {
        duracion:  parseInt(btn.dataset.dur)    || 0,
        distancia: parseFloat(btn.dataset.dist) || 0,
        wps:       parseInt(btn.dataset.wps)    || 0,
        tipo:      btn.dataset.tipo    || "",
        estado:    btn.dataset.estado  || "",
        latInicio: parseFloat(btn.dataset.latInicio) || null,
        lngInicio: parseFloat(btn.dataset.lngInicio) || null,
        destLat:   parseFloat(btn.dataset.destLat) || null,
        destLng:   parseFloat(btn.dataset.destLng) || null,
        destAddr:  btn.dataset.destAddr || "",
      });
    });
  });

  // Mapa de ubicación puntual (marcaciones)
  list.querySelectorAll(".btn-hist-loc").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const lat  = parseFloat(btn.dataset.lat);
      const lng  = parseFloat(btn.dataset.lng);
      const tipo = btn.dataset.tipo ?? "Registro";
      if (!isNaN(lat) && !isNaN(lng)) _openLocationMap(lat, lng, tipo);
    });
  });
}

/* Listeners del select de tipo */
_el("hf-tipo")?.addEventListener("change", () => {
  _histFilters.tipo = _el("hf-tipo").value;
  _renderHistList(_applyHistFilters());
});

/* Listeners de los date inputs */
_el("hf-desde")?.addEventListener("change", () => {
  const v = _el("hf-desde").value;
  _histFilters.desde = v ? new Date(v + "T00:00:00") : null;
  document.querySelectorAll(".hf-sc").forEach(c => c.classList.remove("active"));
  _renderHistList(_applyHistFilters());
});
_el("hf-hasta")?.addEventListener("change", () => {
  const v = _el("hf-hasta").value;
  _histFilters.hasta = v ? new Date(v + "T23:59:59") : null;
  document.querySelectorAll(".hf-sc").forEach(c => c.classList.remove("active"));
  _renderHistList(_applyHistFilters());
});

/* Listeners de atajos de período */
document.querySelectorAll(".hf-sc").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".hf-sc").forEach(c => c.classList.remove("active"));
    btn.classList.add("active");
    _applyPeriodShortcut(btn.dataset.period);
    _renderHistList(_applyHistFilters());
    _renderHistTab();
  });
});

_el("btn-history").addEventListener("click", async () => {
  // Abrir historial con filtro de hoy por defecto, siempre en pestaña Marcaciones
  _histActiveTab = "marcaciones";
  const todayCol = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Bogota" });
  const t = _el("hf-tipo"); if (t) t.value = "all";
  const d = _el("hf-desde"); if (d) d.value = todayCol;
  const h = _el("hf-hasta"); if (h) h.value = todayCol;
  document.querySelectorAll(".hf-sc").forEach(c =>
    c.classList.toggle("active", c.dataset.period === "today")
  );
  _applyPeriodShortcut("today");
  UI.goTo("history");
  _loadHistory();
});

_el("btn-history-back").addEventListener("click", () => { _stopHistLiveCounters(); UI.goTo("attendance"); });

// Cambio de pestaña
document.querySelectorAll(".hist-tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    _histActiveTab = btn.dataset.tab;
    _renderHistTab();
  });
});

async function _loadHistory() {
  const list = _el("hist-list");
  list.innerHTML = `<div class="hist-empty"><div class="spin-ring" style="border-top-color:var(--navy);border-color:var(--border);"></div><span>Cargando...</span></div>`;
  _el("hist-count").textContent       = "";
  const info = _el("hist-filter-info");
  if (info) info.textContent = "";

  try {
    // Cargar más registros (60) para que el filtrado sea significativo
    const res = await API.getHistory(state.worker.identificacion, 60);
    _histRawRecords = res.records;
    _el("hist-count").textContent = `${res.total} registros`;

    if (!_histRawRecords.length) {
      list.innerHTML = `<div class="hist-empty"><span>Aún no hay registros</span></div>`;
      _renderHistTab();
      return;
    }

    _renderHistList(_applyHistFilters());
    _renderHistTab();

  } catch (err) {
    list.innerHTML = `<div class="hist-empty"><span>Error: ${err.message}</span></div>`;
  }
}

// ═════════════════════════════════════════════════════════════════
// MAPA DE HISTORIAL — pantalla completa (screen-map-view)
// Abandonamos el enfoque de modal/sheet que causaba problemas de
// dimensiones en Leaflet. Una pantalla dedicada siempre funciona.
// ═════════════════════════════════════════════════════════════════

let _histMap     = null;
let _mapViewBack = "history";  // pantalla a la que volver desde el mapa

// Botón volver desde la pantalla de mapa
_el("btn-map-view-back").addEventListener("click", () => {
  if (_histMap) { try { _histMap.remove(); } catch {} _histMap = null; }
  const cardsEl = _el("map-view-cards");
  cardsEl.innerHTML = "";
  cardsEl.classList.add("hidden");
  UI.goTo(_mapViewBack);
});

/**
 * Crea un mapa Leaflet en un contenedor limpiando instancias previas.
 */
function _createLeafletMap(containerId, center, zoom) {
  const container = _el(containerId);
  if (!container) return null;

  // Destruir instancia previa para evitar "already initialized"
  if (container._leaflet_id) {
    try { container._leafletMap?.remove(); } catch { /* ignore */ }
    // Limpiar el atributo que Leaflet establece en el DOM
    delete container._leaflet_id;
  }

  const map = L.map(container, {
    zoomControl:      true,
    attributionControl: false,
    // Sin preferCanvas — el SVG renderer es más compatible en móvil
    tap:              true,
    tapTolerance:     15,
  }).setView(center, zoom);

  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    { subdomains: "abc", maxZoom: 19, crossOrigin: "anonymous" }
  ).addTo(map);

  // Guardar referencia en el DOM para poder destruirla luego
  container._leafletMap = map;
  return map;
}

/**
 * Inicializa el mapa en la pantalla completa screen-map-view.
 * Sin modales, sin flexbox complejo, sin animaciones que interfieran.
 */
function _initFullscreenMap(center, zoom) {
  // Destruir instancia anterior
  if (_histMap) { try { _histMap.remove(); } catch {} _histMap = null; }
  const container = _el("map-view-container");
  if (!container) return null;
  // Limpiar estado previo de Leaflet
  if (container._leaflet_id) delete container._leaflet_id;

  _histMap = L.map(container, {
    zoomControl: true, attributionControl: false, tap: true,
  }).setView(center, zoom);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    subdomains: "abc", maxZoom: 19, crossOrigin: "anonymous",
  }).addTo(_histMap);

  return _histMap;
}

/* ── Icono SVG para cards de trayecto ─────────────────────────────────── */
function _micIcon(type) {
  if (type === "start") return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg>`;
  if (type === "dest")  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`;
  if (type === "end")   return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>`;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
}

/* ── Construye una card de info de trayecto ─────────────────────────── */
function _buildMicCard(type, label, title, sub) {
  const dotClass = type === "dest" ? "dest" : type === "end" ? "end" : type === "last" ? "last" : "start";
  return `<div class="map-info-card">
    <div class="mic-dot ${dotClass}">${_micIcon(type === "last" ? "end" : type)}</div>
    <div class="mic-body">
      <div class="mic-label">${label}</div>
      <div class="mic-title">${title}</div>
      ${sub ? `<div class="mic-sub">${sub}</div>` : ""}
    </div>
  </div>`;
}

/* ── Recorrido completo de un movimiento (pantalla completa) ─────────── */
async function _openMovementMap(movId, stats) {
  _mapViewBack = "history";
  _el("map-view-title").textContent = "Recorrido del movimiento";

  // Limpiar cards previas
  const cardsEl = _el("map-view-cards");
  cardsEl.innerHTML = "";
  cardsEl.classList.add("hidden");

  const statsEl = _el("map-view-stats");
  statsEl.classList.remove("hidden");
  statsEl.innerHTML = `<div class="hmstat-row">
    <div class="hist-map-stat"><div class="hmstat-lbl">Duración</div><div class="hmstat-val">${stats.duracion} min</div></div>
    <div class="hist-map-stat"><div class="hmstat-lbl">Distancia</div><div class="hmstat-val">${stats.distancia.toFixed(2)} km</div></div>
    <div class="hist-map-stat"><div class="hmstat-lbl">Pts GPS</div><div class="hmstat-val">${stats.wps}</div></div>
  </div>`;

  // Navegar a la pantalla del mapa
  UI.goTo("map-view");

  // Esperar dos frames para que el screen esté pintado con dimensiones reales
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  const map = _initFullscreenMap([4.71, -74.07], 13);
  if (!map) return;
  map.invalidateSize({ animate: false });

  try {
    const wps = await API.getWaypoints(movId);
    const isActive = stats.estado === "ACTIVO";

    if (!wps.length) {
      // Sin waypoints: mostrar solo destino en mapa + cards con lo que tengamos
      if (stats.tipo === "DESTINO_FIJO" && stats.destLat && stats.destLng) {
        const destIcon = L.divIcon({
          className: "",
          html: `<div style="width:22px;height:28px;background:#7C3AED;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 3px 10px rgba(124,58,237,.35);"><div style="width:10px;height:10px;background:#fff;border-radius:50%;position:absolute;top:4px;left:4px;transform:rotate(45deg);"></div></div>`,
          iconSize: [22, 28], iconAnchor: [11, 28],
        });
        L.marker([stats.destLat, stats.destLng], { icon: destIcon })
          .bindPopup(`<b>Destino</b><br>${stats.destAddr || "Destino fijo"}`)
          .openPopup()
          .addTo(map);
        map.setView([stats.destLat, stats.destLng], 15);
      } else {
        map.setView([4.71, -74.07], 12);
      }
      // Cards: inicio (si tenemos coords) + destino (DESTINO_FIJO)
      const cards = [];
      if (stats.latInicio && stats.lngInicio) {
        const startAddr = await _reverseGeocode(stats.latInicio, stats.lngInicio).catch(() => null);
        cards.push(_buildMicCard("start", "Punto de inicio",
          startAddr || `${stats.latInicio.toFixed(5)}°, ${stats.lngInicio.toFixed(5)}°`, "Sin datos GPS registrados"));
      }
      if (stats.tipo === "DESTINO_FIJO" && stats.destLat && stats.destLng) {
        cards.push(_buildMicCard("dest", "Destino",
          stats.destAddr || `${stats.destLat.toFixed(5)}°, ${stats.destLng.toFixed(5)}°`, null));
      }
      if (cards.length) { cardsEl.innerHTML = cards.join(""); cardsEl.classList.remove("hidden"); }
      setTimeout(() => map.invalidateSize(), 200);
      return;
    }

    const coords = wps.map(w => [w.lat, w.lng]);

    // Ajustar el recorrido a calles reales usando OSRM map matching
    let routeCoords = coords;
    if (coords.length >= 2) {
      try {
        const MAX_PTS = 100;
        const sample = coords.length > MAX_PTS
          ? [coords[0],
             ...coords.slice(1, -1).filter((_, i, a) => i % Math.ceil(a.length / (MAX_PTS - 2)) === 0),
             coords[coords.length - 1]]
          : coords;
        const cStr = sample.map(([la, ln]) => `${ln},${la}`).join(";");
        const rStr = sample.map(() => "25").join(";");
        const resp = await Promise.race([
          fetch(`https://router.project-osrm.org/match/v1/driving/${cStr}?overview=full&geometries=geojson&radiuses=${rStr}&tidy=true`),
          new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 6000)),
        ]);
        const data = await resp.json();
        if (data.code === "Ok" && data.matchings?.length) {
          routeCoords = data.matchings.flatMap(m => m.geometry.coordinates.map(([ln, la]) => [la, ln]));
        }
      } catch { /* sin conexión o error OSRM → usar coords GPS directas */ }
    }

    L.polyline(routeCoords, { color: "#fff",    weight: 8,   opacity: .22 }).addTo(map);
    L.polyline(routeCoords, { color: "#F15A22", weight: 4.5, opacity: .9  }).addTo(map);

    const step = Math.max(1, Math.floor(coords.length / 25));
    coords.forEach((c, i) => {
      if (i === 0 || i === coords.length - 1 || i % step !== 0) return;
      L.circleMarker(c, { radius: 3.5, color: "#F15A22", fillColor: "#fff", fillOpacity: 1, weight: 2 }).addTo(map);
    });

    const startIcon = L.divIcon({
      className: "",
      html: `<div style="width:20px;height:20px;background:#059669;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,.35);"></div>`,
      iconSize: [20, 20], iconAnchor: [10, 10],
    });
    L.marker(coords[0], { icon: startIcon }).bindPopup(`<b>Inicio</b><br>${_fmtDateTime(wps[0].fecha_hora)}`).addTo(map);

    const endIcon = L.divIcon({
      className: "",
      html: `<div style="width:22px;height:28px;background:#DC2626;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 3px 10px rgba(0,0,0,.3);"><div style="width:10px;height:10px;background:#fff;border-radius:50%;position:absolute;top:4px;left:4px;transform:rotate(45deg);"></div></div>`,
      iconSize: [22, 28], iconAnchor: [11, 28],
    });
    L.marker(coords[coords.length - 1], { icon: endIcon }).bindPopup(`<b>Fin</b><br>${_fmtDateTime(wps[wps.length - 1].fecha_hora)}`).addTo(map);

    const bounds = L.latLngBounds(coords);
    if (stats.tipo === "DESTINO_FIJO" && stats.destLat && stats.destLng) {
      const destIcon = L.divIcon({
        className: "",
        html: `<div style="width:22px;height:28px;background:#7C3AED;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 3px 10px rgba(124,58,237,.35);"><div style="width:10px;height:10px;background:#fff;border-radius:50%;position:absolute;top:4px;left:4px;transform:rotate(45deg);"></div></div>`,
        iconSize: [22, 28], iconAnchor: [11, 28],
      });
      L.marker([stats.destLat, stats.destLng], { icon: destIcon })
        .bindPopup(`<b>Destino</b><br>${stats.destAddr || "Destino fijo"}`)
        .addTo(map);
      bounds.extend([stats.destLat, stats.destLng]);
    }
    // Calcular cuántas cards se mostrarán para ajustar padding inferior
    const cardCount = stats.tipo === "DESTINO_FIJO" ? 3 : 2;
    map.fitBounds(bounds, { paddingTopLeft: [32, 80], paddingBottomRight: [32, 80 + cardCount * 78], maxZoom: 17 });
    setTimeout(() => map.invalidateSize(), 200);

    // ── Construir cards pre-abiertas (geocodificar inicio y fin) ─────────
    const startCoordsFallback = `${wps[0].lat.toFixed(5)}°, ${wps[0].lng.toFixed(5)}°`;
    const endCoordsFallback   = `${wps[wps.length-1].lat.toFixed(5)}°, ${wps[wps.length-1].lng.toFixed(5)}°`;

    const [startAddr, endAddr] = await Promise.allSettled([
      _reverseGeocode(wps[0].lat, wps[0].lng),
      _reverseGeocode(wps[wps.length-1].lat, wps[wps.length-1].lng),
    ]).then(rs => rs.map(r => r.status === "fulfilled" ? r.value : null));

    const cards = [];
    cards.push(_buildMicCard("start", "Punto de inicio",
      startAddr || startCoordsFallback, _fmtDateTime(wps[0].fecha_hora)));

    if (stats.tipo === "DESTINO_FIJO" && stats.destLat && stats.destLng) {
      cards.push(_buildMicCard("dest", "Destino",
        stats.destAddr || `${stats.destLat.toFixed(5)}°, ${stats.destLng.toFixed(5)}°`, null));
      if (isActive) {
        cards.push(_buildMicCard("last", "Última posición registrada",
          endAddr || endCoordsFallback, _fmtDateTime(wps[wps.length-1].fecha_hora)));
      } else {
        cards.push(_buildMicCard("end", "Punto final",
          endAddr || endCoordsFallback, _fmtDateTime(wps[wps.length-1].fecha_hora)));
      }
    } else {
      cards.push(_buildMicCard(isActive ? "last" : "end",
        isActive ? "Última posición registrada" : "Punto final",
        endAddr || endCoordsFallback, _fmtDateTime(wps[wps.length-1].fecha_hora)));
    }

    cardsEl.innerHTML = cards.join("");
    cardsEl.classList.remove("hidden");

  } catch (err) {
    _el("map-view-stats").innerHTML += `<div style="padding:8px 16px;color:var(--red);font-size:12px;">Error cargando datos GPS</div>`;
  }
}

/* ── Ubicación puntual de una marcación (pantalla completa) ─────────── */
async function _openLocationMap(lat, lng, tipo) {
  _mapViewBack = "history";
  _el("map-view-title").textContent = "Ubicación del registro";

  const statsEl = _el("map-view-stats");
  statsEl.classList.remove("hidden");
  statsEl.innerHTML = `<div class="hmstat-row">
    <div class="hist-map-stat"><div class="hmstat-lbl">Tipo</div><div class="hmstat-val">${tipo}</div></div>
    <div class="hist-map-stat"><div class="hmstat-lbl">Lat</div><div class="hmstat-val">${lat.toFixed(5)}°</div></div>
    <div class="hist-map-stat"><div class="hmstat-lbl">Lng</div><div class="hmstat-val">${lng.toFixed(5)}°</div></div>
  </div>`;

  UI.goTo("map-view");
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  const map = _initFullscreenMap([lat, lng], 16);
  if (!map) return;
  map.invalidateSize({ animate: false });

  const icon = L.divIcon({
    className: "",
    html: `<div style="width:22px;height:28px;background:#1B2A5E;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 3px 10px rgba(27,42,94,.4);"><div style="width:10px;height:10px;background:#fff;border-radius:50%;position:absolute;top:4px;left:4px;transform:rotate(45deg);"></div></div>`,
    iconSize: [22, 28], iconAnchor: [11, 28],
  });
  L.marker([lat, lng], { icon }).bindPopup(`<b>${tipo}</b>`).openPopup().addTo(map);
  L.circle([lat, lng], { radius: 30, color: "#1B2A5E", fillOpacity: .08, weight: 1.5, dashArray: "4 3" }).addTo(map);

  setTimeout(() => map.invalidateSize(), 200);
}


// ══════════════════════════════════════════════════════════════
// TOUR INTERACTIVO — Driver.js
// Primera vez: auto-inicia al llegar al home
// Siguientes veces: solo desde el botón de ayuda
// Siempre omitible con "Saltar guía"
// ══════════════════════════════════════════════════════════════

const TOUR_KEY = "lgy_tour_done_v1";
let _currentTour = null;

/** Crea y retorna la instancia del tour con todos los pasos */
// ── Iconos SVG inline para los títulos del tour (sin emojis) ──────────
const _ti = {
  welcome:  `<svg style="vertical-align:middle;margin-right:7px" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1B2A5E" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  photo:    `<svg style="vertical-align:middle;margin-right:7px" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1B2A5E" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`,
  location: `<svg style="vertical-align:middle;margin-right:7px" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1B2A5E" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10" r="3"/><path d="M12 2a8 8 0 0 0-8 8c0 5.4 7.05 11.5 7.35 11.76a1 1 0 0 0 1.3 0C12.95 21.5 20 15.4 20 10a8 8 0 0 0-8-8z"/></svg>`,
  check:    `<svg style="vertical-align:middle;margin-right:7px" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>`,
  move:     `<svg style="vertical-align:middle;margin-right:7px" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>`,
  manual:   `<svg style="vertical-align:middle;margin-right:7px" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D97706" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`,
  history:  `<svg style="vertical-align:middle;margin-right:7px" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1B2A5E" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  help:     `<svg style="vertical-align:middle;margin-right:7px" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F15A22" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
};

// Limpia todos los estilos inline que Driver.js inyecta en elementos del DOM.
// Debe llamarse antes de iniciar un nuevo tour y al destruir el actual.
function _cleanTourResiduals() {
  const selectors = [
    ".main-hdr", "#screen-attendance", ".main-body", ".face-card",
    "#face-preview-area", ".face-footer", "#btn-action-main",
    "#btn-movimiento", "#btn-open-manual", "#btn-history", "#btn-help",
    ".hdr",
  ];
  const props = ["z-index", "position", "pointer-events", "overflow"];
  selectors.forEach(sel => {
    const el = document.querySelector(sel);
    if (!el) return;
    props.forEach(p => el.style.removeProperty(p));
  });
  document.body.classList.remove("driver-active");
  document.body.style.removeProperty("overflow");
}

function _createTour() {
  const driverFn = window.driver?.js?.driver ?? window.driver;
  if (typeof driverFn !== "function") {
    console.warn("Driver.js no disponible");
    return null;
  }

  return driverFn({
    showProgress:   true,
    progressText:   "Paso {{current}} de {{total}}",
    nextBtnText:    "Siguiente",
    prevBtnText:    "Atrás",
    doneBtnText:    "¡Listo!",
    // ★ FIX: showButtons con "close" muestra el botón de omitir en cada paso
    // NO usar onDestroyStarted (causaba loop infinito llamando destroy() dentro de sí mismo)
    showButtons:    ["next", "previous", "close"],
    closeBtnText:   "Omitir guía",
    allowClose:     true,
    overlayOpacity: 0.45,
    smoothScroll:   false,
    onDestroyed: () => {
      localStorage.setItem(TOUR_KEY, "1");
      _currentTour = null;
      _cleanTourResiduals();
    },
    steps: [
      {
        popover: {
          title:       `${_ti.welcome}Bienvenido a Logyser Acceso`,
          description: "Esta guía te explica cada función en 8 pasos. Puedes omitirla en cualquier momento tocando <strong>Omitir guía</strong>.",
          side:        "over",
          align:       "center",
        },
      },
      {
        element: "#face-preview-area",
        popover: {
          title:       `${_ti.photo}Foto del último registro`,
          description: "Aquí aparece la foto capturada en tu último registro biométrico. Antes del primer registro verás el ícono de espera.",
          side:        "bottom",
          align:       "center",
        },
      },
      {
        element: ".face-footer",
        popover: {
          title:       `${_ti.location}Ubicación GPS`,
          description: "El sistema captura tu ubicación en cada registro para auditoría. Toca el ícono del mapa para ver el punto exacto en el mapa.",
          side:        "top",
          align:       "center",
        },
      },
      {
        element: "#btn-action-main",
        popover: {
          title:       `${_ti.check}Registrar Ingreso / Salida`,
          description: "Este botón cambia automáticamente: <strong>Ingreso</strong> al llegar, <strong>Salida</strong> al irte. Verifica tu identidad moviendo la cabeza frente a la cámara.",
          side:        "top",
          align:       "center",
        },
      },
      {
        element: "#btn-movimiento",
        popover: {
          title:       `${_ti.move}Registrar Movimiento`,
          description: "Para salidas temporales (cajero, diligencias, etc.). Puedes fijar un destino en el mapa o activar navegación libre. El sistema registra todo el recorrido GPS.",
          side:        "top",
          align:       "center",
        },
      },
      {
        element: "#btn-open-manual",
        popover: {
          title:       `${_ti.manual}Registro Manual`,
          description: "Si la cámara falla o necesitas registrar un movimiento sin verificación biométrica, usa esta opción. Siempre debes indicar el motivo.",
          side:        "top",
          align:       "center",
        },
      },
      {
        element: "#btn-history",
        popover: {
          title:       `${_ti.history}Historial de registros`,
          description: "Consulta todas tus marcaciones: entradas, salidas y movimientos. Para los movimientos puedes ver el recorrido exacto en el mapa.",
          side:        "bottom",
          align:       "end",
        },
      },
      {
        element: "#btn-help",
        popover: {
          title:       `${_ti.help}Centro de ayuda`,
          description: "Aquí encuentras información sobre cada función y puedes volver a ver esta guía cuando quieras. ¡Ya conoces todo el sistema!",
          side:        "bottom",
          align:       "end",
        },
      },
    ],
  });
}

/** Inicia el tour — omite pasos con elementos no visibles */
function _startTour() {
  _el("help-modal")?.classList.remove("show");

  // Destruir instancia previa y limpiar TODOS los estilos residuales de Driver.js
  if (_currentTour) {
    try { _currentTour.destroy(); } catch {}
    _currentTour = null;
  }
  _cleanTourResiduals();

  _currentTour = _createTour();
  if (!_currentTour) {
    _showToast("El tour no está disponible en este momento.", "info");
    return;
  }
  _currentTour.drive();
}

/** Muestra el tour automáticamente la primera vez que el usuario llega al home */
function _maybeShowTour() {
  if (localStorage.getItem(TOUR_KEY)) return; // ya lo vio

  // Pequeña demora para que la pantalla de asistencia esté completamente pintada
  setTimeout(() => {
    if (document.getElementById("screen-attendance")?.classList.contains("active")) {
      _startTour();
    }
  }, 1200);
}

// ── Panel de ayuda ─────────────────────────────────────────────
_el("btn-help")?.addEventListener("click", () => {
  _el("help-modal").classList.add("show");
});

_el("btn-help-close")?.addEventListener("click", () => {
  _el("help-modal").classList.remove("show");
});

_el("help-modal")?.addEventListener("click", (e) => {
  if (e.target === e.currentTarget) _el("help-modal").classList.remove("show");
});

_el("btn-start-tour")?.addEventListener("click", () => {
  _startTour();
});

// ── Service Worker + Precarga de MediaPipe ────────────────
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js");
    setTimeout(() => preloadFaceMesh().catch(() => {}), 1500);
  });
}

// ══════════════════════════════════════════════════
// PWA INSTALL — Android (beforeinstallprompt) + iOS
// ══════════════════════════════════════════════════

let _pwaPrompt = null;

// Android / Chrome: capturar el evento de instalación
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  _pwaPrompt = e;

  // Mostrar banner solo si no está instalado
  if (!_isPWAInstalled()) {
    _el("pwa-banner")?.classList.remove("hidden");
  }
});

window.addEventListener("appinstalled", () => {
  _el("pwa-banner")?.classList.add("hidden");
  _pwaPrompt = null;
});

_el("btn-pwa-install")?.addEventListener("click", async () => {
  if (!_pwaPrompt) return;
  _pwaPrompt.prompt();
  const { outcome } = await _pwaPrompt.userChoice;
  if (outcome === "accepted") {
    _el("pwa-banner")?.classList.add("hidden");
    _pwaPrompt = null;
  }
});

_el("btn-pwa-dismiss")?.addEventListener("click", () => {
  _el("pwa-banner")?.classList.add("hidden");
  // No volver a mostrar en esta sesión
  sessionStorage.setItem("pwa_dismissed", "1");
});

_el("btn-pwa-ios-close")?.addEventListener("click", () => {
  _el("pwa-ios-modal")?.classList.add("hidden");
});

function _isPWAInstalled() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

function _isIOS() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

// iOS: mostrar modal con instrucciones si NO está instalada
if (_isIOS() && !_isPWAInstalled() && !sessionStorage.getItem("pwa_ios_shown")) {
  // Esperar 5 segundos para no interrumpir la carga inicial
  setTimeout(() => {
    _el("pwa-ios-modal")?.classList.remove("hidden");
    sessionStorage.setItem("pwa_ios_shown", "1");
  }, 5000);
}


// ══════════════════════════════════════════════════
// GESTIÓN DE CICLO DE VIDA — SESIÓN + NOTIFICACIONES
// ══════════════════════════════════════════════════

// Capa 2 — visibilitychange
// · Pausa/reanuda heartbeat de sesión
// · Programa/cancela notificaciones vía Web Push en el backend
document.addEventListener("visibilitychange", () => {
  if (!state.worker?.identificacion) return;

  if (document.visibilityState === "visible") {
    // App volvió al primer plano
    _sendHeartbeat();
    _scheduleHeartbeat();
    _notifySW("APP_FOREGROUND");  // cancela SHOW_NOW pendientes en SW
    _cancelBackendPush();         // cancela tareas push en el backend
  } else {
    // App pasa a segundo plano
    _cancelHeartbeat();
    _scheduleBackendPush();       // backend enviará Web Push cuando corresponda
  }
});

// Capa 3 — beforeunload: cierre de pestaña o navegador en web
// sendBeacon garantiza que la petición se envía aunque la página se esté descargando
window.addEventListener("beforeunload", () => {
  const id = state.worker?.identificacion;
  if (!id) return;
  navigator.sendBeacon?.(
    "/api/session/close-by-id",
    new Blob([JSON.stringify({ identificacion: id })], { type: "application/json" }),
  );
});

// ── Detección de red — notificación inmediata al perder/recuperar conexión ──
// Solo relevante cuando hay un movimiento activo en curso.
window.addEventListener("offline", () => {
  if (!state.worker?.identificacion || !state.movement?.id) return;
  _offlineDuringMov = true;
  _notifySW("SHOW_NOW", {
    id:    "offline-movement",
    title: "Sin conexión",
    body:  "GPS pausado. Movimiento activo en espera hasta recuperar señal.",
  });
});

window.addEventListener("online", () => {
  if (!_offlineDuringMov) return;
  _offlineDuringMov = false;
  _notifySW("SHOW_NOW", {
    id:    "online-movement",
    title: "Conexión restaurada",
    body:  "Movimiento activo sincronizándose.",
  });
});
