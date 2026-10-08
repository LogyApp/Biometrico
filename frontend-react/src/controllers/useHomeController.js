import { useEffect, useRef, useState } from 'react';
import { NEW_DESIGN_ENABLED } from '../config/designFlags';
import { openSession, closeSessionByIdentificacion, sendHeartbeat, getAttendanceState, getOtherDevices } from '../models/sessionModel';
import { getHistory } from '../models/historyModel';
import { deriveAttendanceStatus, ATTENDANCE_STATUS } from '../models/attendanceModel';
import { getCurrentPosition } from '../services/geolocationService';
import { reverseGeocode } from '../services/geocodingService';
import { getStoredPhoto, setStoredPhoto } from '../models/lastPhotoStorage';
import { hasRegisteredToday, markRegisteredToday } from '../models/dailyRegistrationStorage';
import { getManualMotivoError, reportExitNovelty, reportEntryNovelty } from '../models/manualModel';
import { enqueueOutbox, getAllOutbox, retryFailedOutbox } from '../services/offlineDb';
import { outboxToPseudoRecords } from '../models/outboxRecordsModel';
import { getDeviceFingerprint } from '../models/deviceFingerprint';
import { requestSync } from '../services/syncService';
import { usePermissionPrompt } from './usePermissionPrompt';
import { loadMovementSession } from '../models/movementSessionStorage';
import { saveAttendanceCache, getAttendanceCache, saveHistoryCache, getHistoryCache } from '../services/offlineDb';
import { isConnectivityFailure } from '../services/connectivity';
import { getAvatarUrl } from '../services/avatarService';
import { formatMoveTimer } from '../models/movementModel';

const HEARTBEAT_MS = 10 * 60 * 1000;
const CLOCK_TICK_MS = 30 * 1000;
const WORK_TIMER_TICK_MS = 1000;
const LONG_SHIFT_WARNING_MS = 14 * 60 * 60 * 1000;
const LONG_SHIFT_REMIND_MS = 30 * 60 * 1000;
const COMPLETE_RESET_MS = 10 * 60 * 1000;
const FINISHED_STATUSES = [ATTENDANCE_STATUS.COMPLETE, ATTENDANCE_STATUS.PARTIAL, ATTENDANCE_STATUS.INCOMPLETE];
// Sesiones de otros dispositivos ya avisadas en esta apertura de la app, para
// no repetir la alerta por la misma sesión.
const OTHER_DEVICES_SEEN_KEY = 'lgy_other_devices_seen_v1';

function readSeenDeviceKeys() {
  try {
    return JSON.parse(sessionStorage.getItem(OTHER_DEVICES_SEEN_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeSeenDeviceKeys(keys) {
  try {
    sessionStorage.setItem(OTHER_DEVICES_SEEN_KEY, JSON.stringify(keys));
  } catch {}
}

export function useHomeController({ worker, onLogout, onFastExit, onStartVerify, onOpenRecords, onOpenHelp, onStartMovement, onOpenProfile }) {
  const identificacion = worker?.identificacion;
  const geoPermission = usePermissionPrompt('geolocation');

  const [now, setNow] = useState(() => new Date());
  const [sessionBlocked, setSessionBlocked] = useState(false);
  const [attendanceStatus, setAttendanceStatus] = useState(ATTENDANCE_STATUS.NONE);
  const [entryTimeMs, setEntryTimeMs] = useState(null);
  const [exitTimeMs, setExitTimeMs] = useState(null);
  const [attendanceLoading, setAttendanceLoading] = useState(true);
  const [location, setLocation] = useState(null);
  const [locationStatus, setLocationStatus] = useState('loading');
  const [address, setAddress] = useState(null);
  const [addressStatus, setAddressStatus] = useState('idle');
  const [mapSheetOpen, setMapSheetOpen] = useState(false);
  const [logoutError, setLogoutError] = useState(null);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [locationRetryAlert, setLocationRetryAlert] = useState(null);
  const [locationRetrying, setLocationRetrying] = useState(false);
  const [locationPendingFor, setLocationPendingFor] = useState(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [lastPhoto, setLastPhoto] = useState(() => getStoredPhoto());
  const [manualSheetOpen, setManualSheetOpen] = useState(false);
  const [manualMotivo, setManualMotivo] = useState('');
  const [manualError, setManualError] = useState(null);
  const [registeredToday, setRegisteredToday] = useState(() => hasRegisteredToday());
  const [movementAlert, setMovementAlert] = useState(null);
  const [resumedMovement, setResumedMovement] = useState(() => (identificacion ? loadMovementSession(identificacion) : null));
  const [brokenAvatarUrl, setBrokenAvatarUrl] = useState(null);
  const [workElapsedMs, setWorkElapsedMs] = useState(0);
  const [longShiftAlert, setLongShiftAlert] = useState(false);
  const [recentRecords, setRecentRecords] = useState([]);
  const [recentRecordsLoading, setRecentRecordsLoading] = useState(false);
  const [lastAttendanceRecord, setLastAttendanceRecord] = useState(null);
  const [failedSyncCount, setFailedSyncCount] = useState(0);
  const [retryingFailedSync, setRetryingFailedSync] = useState(false);
  const [pendingRecords, setPendingRecords] = useState([]);
  const [otherDevices, setOtherDevices] = useState(null);
  // Solo para el enlace a Google Maps de la tarjeta "HOY": coordenadas de las
  // marcaciones ENTRADA/SALIDA (historial del servidor + las marcadas en esta sesión).
  const [attendanceHistory, setAttendanceHistory] = useState([]);
  const [localMarkCoords, setLocalMarkCoords] = useState({});
  const [noveltySheetOpen, setNoveltySheetOpen] = useState(false);
  const [noveltyTipo, setNoveltyTipo] = useState('SALIDA');
  const [noveltyText, setNoveltyText] = useState('');
  const [noveltySubmitting, setNoveltySubmitting] = useState(false);
  const [noveltyResult, setNoveltyResult] = useState(null);

  const mountedRef = useRef(true);
  const attendanceStatusRef = useRef(attendanceStatus);
  const longShiftTimerRef = useRef(null);
  const pendingLocationActionRef = useRef(null);

  function applyAttendanceState(state) {
    setAttendanceStatus(deriveAttendanceStatus({
      hasActiveEntry: state.has_active_entry,
      lastAction: state.last_action,
      entryTimeMs: state.entry_time_ms ?? null,
      exitTimeMs: state.exit_time_ms ?? null,
    }));
    setEntryTimeMs(state.entry_time_ms ?? null);
    setExitTimeMs(state.exit_time_ms ?? null);
    if (state.has_active_entry || state.last_action) {
      markRegisteredToday();
      setRegisteredToday(true);
    }
    if (state.has_active_entry && state.entry_time_ms && Date.now() - state.entry_time_ms > LONG_SHIFT_WARNING_MS) {
      setLongShiftAlert(true);
    }
  }

  async function refreshAttendance(silent = false) {
    if (!identificacion) return;
    if (!silent) setAttendanceLoading(true);
    try {
      const state = await getAttendanceState(identificacion);
      if (!mountedRef.current) return;
      applyAttendanceState(state);
      saveAttendanceCache(state).catch(() => {});
    } catch (err) {
      if (!mountedRef.current) return;
      if (isConnectivityFailure(err)) {
        const cached = await getAttendanceCache();
        if (mountedRef.current && cached) applyAttendanceState(cached);
      }
    } finally {
      if (mountedRef.current && !silent) setAttendanceLoading(false);
    }
  }

  function clearLastPhoto() {
    setStoredPhoto(null);
    setLastPhoto(null);
  }

  function applyLocalMarcacion(tipo, timestampMs) {
    if (location) {
      setLocalMarkCoords((prev) => ({ ...prev, [tipo]: { lat: location.lat, lng: location.lng, timeMs: timestampMs } }));
    }
    markRegisteredToday();
    setRegisteredToday(true);
    if (tipo === 'SALIDA') {
      setAttendanceStatus(deriveAttendanceStatus({
        hasActiveEntry: false,
        lastAction: 'SALIDA',
        entryTimeMs,
        exitTimeMs: timestampMs,
      }));
      setExitTimeMs(timestampMs);
      saveAttendanceCache({
        has_active_entry: false,
        last_action: 'SALIDA',
        entry_time_ms: entryTimeMs,
        exit_time_ms: timestampMs,
      }).catch(() => {});
    } else {
      setAttendanceStatus(ATTENDANCE_STATUS.ACTIVE);
      setEntryTimeMs(timestampMs);
      setExitTimeMs(null);
      saveAttendanceCache({
        has_active_entry: true,
        last_action: 'ENTRADA',
        entry_time_ms: timestampMs,
        exit_time_ms: null,
      }).catch(() => {});
    }
    setAttendanceLoading(false);
  }

  function resetCompletedCycle() {
    setAttendanceStatus(ATTENDANCE_STATUS.NONE);
    setEntryTimeMs(null);
    setExitTimeMs(null);
    clearLastPhoto();
  }

  useEffect(() => {
    if (!FINISHED_STATUSES.includes(attendanceStatus) || !exitTimeMs) return;
    const remaining = COMPLETE_RESET_MS - (Date.now() - exitTimeMs);
    if (remaining <= 0) {
      resetCompletedCycle();
      return;
    }
    const timer = setTimeout(resetCompletedCycle, remaining);
    return () => clearTimeout(timer);
  }, [attendanceStatus, exitTimeMs]);

  useEffect(() => {
    attendanceStatusRef.current = attendanceStatus;
    if (attendanceStatus !== ATTENDANCE_STATUS.ACTIVE) {
      setLongShiftAlert(false);
      if (longShiftTimerRef.current) {
        clearTimeout(longShiftTimerRef.current);
        longShiftTimerRef.current = null;
      }
    }
  }, [attendanceStatus]);

  useEffect(() => {
    return () => {
      if (longShiftTimerRef.current) clearTimeout(longShiftTimerRef.current);
    };
  }, []);

  function dismissLongShiftAlert() {
    setLongShiftAlert(false);
    if (longShiftTimerRef.current) clearTimeout(longShiftTimerRef.current);
    longShiftTimerRef.current = setTimeout(() => {
      if (attendanceStatusRef.current === ATTENDANCE_STATUS.ACTIVE) setLongShiftAlert(true);
    }, LONG_SHIFT_REMIND_MS);
  }

  useEffect(() => {
    if (attendanceStatus !== ATTENDANCE_STATUS.ACTIVE || !entryTimeMs) {
      setWorkElapsedMs(0);
      return;
    }
    const tick = () => setWorkElapsedMs(Date.now() - entryTimeMs);
    tick();
    const timer = setInterval(tick, WORK_TIMER_TICK_MS);
    return () => clearInterval(timer);
  }, [attendanceStatus, entryTimeMs]);

  async function refreshLocation() {
    setLocationStatus('loading');
    setAddress(null);
    setAddressStatus('idle');
    const permitted = await geoPermission.ensure();
    if (!mountedRef.current) return { position: null, permitted };
    if (!permitted) {
      setLocationStatus('error');
      return { position: null, permitted };
    }
    try {
      const position = await getCurrentPosition();
      if (!mountedRef.current) return { position: null, permitted };
      setLocation(position);
      setLocationStatus('ready');
      setAddressStatus('loading');
      try {
        const resolved = await reverseGeocode(position.lat, position.lng);
        if (!mountedRef.current) return { position, permitted };
        setAddress(resolved);
        setAddressStatus('ready');
      } catch {
        if (!mountedRef.current) return { position, permitted };
        setAddressStatus('error');
      }
      return { position, permitted };
    } catch {
      if (!mountedRef.current) return { position: null, permitted };
      setLocation(null);
      setLocationStatus('error');
      return { position: null, permitted };
    }
  }

  useEffect(() => {
    if (!NEW_DESIGN_ENABLED || !identificacion) return;
    let cancelled = false;

    function applyRecentRecords(records) {
      const attendanceRecords = records
        .filter((rec) => rec.tipo_registro === 'marcacion' && (rec.tipo === 'ENTRADA' || rec.tipo === 'SALIDA'))
        .sort((a, b) => new Date(b.fecha_hora) - new Date(a.fecha_hora));
      setLastAttendanceRecord(attendanceRecords[0] ?? null);
      setAttendanceHistory(attendanceRecords);

      const recent = [...attendanceRecords, ...records.filter((rec) => rec.tipo_registro === 'movimiento')]
        .sort((a, b) => new Date(b.fecha_hora) - new Date(a.fecha_hora))
        .slice(0, 5);
      setRecentRecords(recent);
    }

    setRecentRecordsLoading(true);
    getHistory(identificacion, 200)
      .then((res) => {
        if (cancelled) return;
        const records = res.records ?? [];
        applyRecentRecords(records);
        saveHistoryCache(records).catch(() => {});
      })
      .catch(async (err) => {
        if (cancelled || !isConnectivityFailure(err)) return;
        const cached = await getHistoryCache();
        if (!cancelled && cached.length) applyRecentRecords(cached);
      })
      .finally(() => {
        if (!cancelled) setRecentRecordsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [identificacion]);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      const items = await getAllOutbox();
      if (cancelled) return;
      setFailedSyncCount(items.filter((item) => item.status === 'failed').length);
      setPendingRecords(outboxToPseudoRecords(items));
    }
    poll();
    const timer = setInterval(poll, 8000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  async function retryFailedSync() {
    setRetryingFailedSync(true);
    await retryFailedOutbox();
    requestSync();
    const items = await getAllOutbox();
    setFailedSyncCount(items.filter((item) => item.status === 'failed').length);
    setPendingRecords(outboxToPseudoRecords(items));
    if (mountedRef.current) setRetryingFailedSync(false);
  }

  // Alerta informativa: solo si hay OTRO dispositivo con sesión vigente en la
  // misma cuenta y aún no se avisó por esa sesión.
  async function checkOtherDevices() {
    if (!identificacion) return;
    try {
      const res = await getOtherDevices(identificacion);
      if (!mountedRef.current) return;
      const devices = res?.devices ?? [];
      const seen = readSeenDeviceKeys();
      if (!devices.some((d) => !seen.includes(d.key))) return;
      writeSeenDeviceKeys([...new Set([...seen, ...devices.map((d) => d.key)])]);
      setOtherDevices(devices);
    } catch {
      // Informativo: si falla, no se muestra nada.
    }
  }

  function dismissOtherDevices() {
    setOtherDevices(null);
  }

  useEffect(() => {
    mountedRef.current = true;

    const clockTimer = setInterval(() => setNow(new Date()), CLOCK_TICK_MS);

    let heartbeatTimer = null;

    function startHeartbeat() {
      if (heartbeatTimer || !identificacion) return;
      heartbeatTimer = setInterval(() => {
        sendHeartbeat(identificacion).catch(() => {});
      }, HEARTBEAT_MS);
    }

    function stopHeartbeat() {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
    }

    (async () => {
      if (!identificacion) return;
      try {
        const result = await openSession(identificacion);
        if (!mountedRef.current) return;
        if (result.status === 'other_device') {
          setSessionBlocked(true);
          return;
        }
      } catch {
        if (!mountedRef.current) return;
      }
      startHeartbeat();
      checkOtherDevices();
    })();

    function handleVisibility() {
      if (!identificacion) return;
      if (document.visibilityState === 'visible') {
        sendHeartbeat(identificacion).catch(() => {});
        startHeartbeat();
        refreshAttendance(true);
        checkOtherDevices();
      } else {
        stopHeartbeat();
      }
    }
    document.addEventListener('visibilitychange', handleVisibility);

    function handleBeforeUnload() {
      if (!identificacion) return;
      navigator.sendBeacon?.(
        '/api/session/close-by-id',
        new Blob(
          [JSON.stringify({ identificacion, device_fp: getDeviceFingerprint() })],
          { type: 'application/json' }
        )
      );
    }
    window.addEventListener('beforeunload', handleBeforeUnload);

    refreshAttendance();
    refreshLocation();

    return () => {
      mountedRef.current = false;
      clearInterval(clockTimer);
      stopHeartbeat();
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [identificacion]);

  function dismissSessionBlock() {
    setSessionBlocked(false);
    onLogout();
  }

  function handleLocationAction() {
    if (addressStatus === 'ready') {
      setMapSheetOpen(true);
      return;
    }
    refreshLocation();
  }

  function closeMapSheet() {
    setMapSheetOpen(false);
  }

  function handleLogout() {
    if (attendanceStatus === ATTENDANCE_STATUS.ACTIVE) {
      setLogoutError('Tienes un ingreso en curso. Debes registrar tu salida antes de cerrar sesión.');
      return;
    }
    setLogoutConfirmOpen(true);
  }

  function dismissLogoutConfirm() {
    setLogoutConfirmOpen(false);
  }

  async function confirmLogout() {
    setLogoutConfirmOpen(false);
    setLoggingOut(true);
    try {
      if (identificacion) await closeSessionByIdentificacion(identificacion);
    } catch {
      // Cerrar la sesión en el servidor es un esfuerzo best-effort — el
      // logout local (onLogout) debe continuar sí o sí, con o sin red.
    } finally {
      if (mountedRef.current) setLoggingOut(false);
    }
    onLogout();
  }

  async function handleFastExit() {
    try {
      if (identificacion) await closeSessionByIdentificacion(identificacion);
    } catch {
      // Best-effort session close
    }
    clearLastPhoto();
    if (onFastExit) {
      onFastExit();
    } else {
      onLogout();
    }
  }

  function dismissLogoutError() {
    setLogoutError(null);
  }

  function dismissLocationRetryAlert() {
    setLocationRetryAlert(null);
  }

  async function ensureLocationThen(action, kind) {
    if (location && locationStatus === 'ready') {
      action();
      return;
    }
    pendingLocationActionRef.current = action;
    setLocationPendingFor(kind);
    setLocationRetrying(true);
    const { position, permitted } = await refreshLocation();
    if (!mountedRef.current) return;
    setLocationRetrying(false);
    setLocationPendingFor(null);
    if (position) {
      setLocationRetryAlert(null);
      pendingLocationActionRef.current = null;
      action();
    } else {
      setLocationRetryAlert({ permitted });
    }
  }

  async function retryLocationAndContinue() {
    setLocationRetrying(true);
    const { position, permitted } = await refreshLocation();
    if (!mountedRef.current) return;
    setLocationRetrying(false);
    if (position) {
      setLocationRetryAlert(null);
      const action = pendingLocationActionRef.current;
      pendingLocationActionRef.current = null;
      action?.();
    } else {
      setLocationRetryAlert({ permitted });
    }
  }

  function recordPhoto(dataUrl) {
    setStoredPhoto(dataUrl);
    setLastPhoto(dataUrl);
  }

  const actionTipo = attendanceStatus === ATTENDANCE_STATUS.ACTIVE ? 'SALIDA' : 'ENTRADA';

  function handleActionButton() {
    ensureLocationThen(() => onStartVerify(actionTipo), 'verify');
  }

  function openManualSheet() {
    ensureLocationThen(() => {
      setManualMotivo('');
      setManualError(null);
      setManualSheetOpen(true);
    }, 'manual');
  }

  function closeManualSheet() {
    setManualSheetOpen(false);
  }

  function dismissManualError() {
    setManualError(null);
  }

  function updateManualMotivo(value) {
    setManualMotivo(value.slice(0, 512));
  }

  async function submitManual() {
    const formError = getManualMotivoError(manualMotivo);
    if (formError) {
      setManualError(formError);
      return;
    }
    if (!location) {
      setManualError('No se pudo obtener tu ubicación. Cierra este formulario e intenta de nuevo.');
      return;
    }
    const timestampMs = Date.now();
    await enqueueOutbox('manual', {
      identificacion,
      tipo: actionTipo,
      motivo: manualMotivo.trim(),
      location,
      clientTimestamp: timestampMs,
    });
    requestSync();
    clearLastPhoto();
    applyLocalMarcacion(actionTipo, timestampMs);
    setManualSheetOpen(false);
  }

  function openNoveltySheet(tipo) {
    setNoveltyTipo(tipo === 'ENTRADA' ? 'ENTRADA' : 'SALIDA');
    setNoveltyText('');
    setNoveltyResult(null);
    setNoveltySheetOpen(true);
  }

  function closeNoveltySheet() {
    setNoveltySheetOpen(false);
  }

  function updateNoveltyText(value) {
    setNoveltyText(value.slice(0, 512));
  }

  function dismissNoveltyResult() {
    setNoveltyResult(null);
  }

  async function submitNovelty() {
    if (noveltySubmitting) return;
    const formError = getManualMotivoError(noveltyText);
    if (formError) {
      setNoveltyResult({ ok: false, message: formError });
      return;
    }
    setNoveltySubmitting(true);
    try {
      // Reanuda la sesión de este dispositivo (igual que al abrir Inicio) por
      // si expiró mientras la app estaba en segundo plano.
      await openSession(identificacion).catch(() => {});
      const report = noveltyTipo === 'ENTRADA' ? reportEntryNovelty : reportExitNovelty;
      const res = await report({ identificacion, novedad: noveltyText.trim() });
      if (!mountedRef.current) return;
      const ok = res?.status === 'recorded';
      setNoveltyResult({ ok, message: res?.message ?? 'No se pudo registrar la novedad.' });
      if (ok || res?.status === 'already_reported') setNoveltySheetOpen(false);
    } catch (err) {
      if (!mountedRef.current) return;
      setNoveltyResult({
        ok: false,
        message: isConnectivityFailure(err)
          ? 'Sin conexión. Conéctate a internet para reportar la novedad.'
          : 'No se pudo registrar la novedad. Inténtalo de nuevo.',
      });
    } finally {
      if (mountedRef.current) setNoveltySubmitting(false);
    }
  }

  function handleTabRegistros() {
    onOpenRecords();
  }
  function dismissMovementAlert() {
    setMovementAlert(null);
  }

  function clearResumedMovement() {
    setResumedMovement(null);
  }

  async function handleTabMovimiento() {
    if (attendanceStatus === ATTENDANCE_STATUS.NONE) {
      setMovementAlert('Primero debes registrar tu ingreso para poder registrar un movimiento.');
      return;
    }
    if (FINISHED_STATUSES.includes(attendanceStatus)) {
      setMovementAlert('Ya completaste tu jornada de hoy. Registra un nuevo ingreso para poder registrar un movimiento.');
      return;
    }
    await ensureLocationThen(() => onStartMovement(), 'movement');
  }

  function handleTabAyuda() {
    onOpenHelp();
  }

  // Coordenadas reales con las que se guardó la marcación mostrada en la
  // tarjeta. Si no se encuentra una que coincida en hora, no se muestra enlace.
  function markCoords(tipo, timeMs) {
    if (!timeMs) return null;
    const local = localMarkCoords[tipo];
    if (local && local.timeMs === timeMs) return { lat: local.lat, lng: local.lng };
    const rec = attendanceHistory.find((r) =>
      r.tipo === tipo &&
      r.latitud != null && r.longitud != null &&
      Math.abs(new Date(r.fecha_hora).getTime() - timeMs) < 60 * 1000
    );
    return rec ? { lat: rec.latitud, lng: rec.longitud } : null;
  }

  return {
    now,
    worker,
    sessionBlocked,
    dismissSessionBlock,
    otherDevices,
    dismissOtherDevices,
    attendanceStatus,
    actionTipo,
    entryTimeMs,
    exitTimeMs,
    entryCoords: markCoords('ENTRADA', entryTimeMs),
    exitCoords: markCoords('SALIDA', exitTimeMs),
    attendanceLoading,
    registeredToday,
    refreshAttendance,
    applyLocalMarcacion,
    lastPhoto,
    recordPhoto,
    location,
    locationStatus,
    address,
    addressStatus,
    handleLocationAction,
    mapSheetOpen,
    closeMapSheet,
    logoutError,
    dismissLogoutError,
    logoutConfirmOpen,
    dismissLogoutConfirm,
    confirmLogout,
    locationRetryAlert,
    locationRetrying,
    locationPendingFor,
    dismissLocationRetryAlert,
    retryLocationAndContinue,
    longShiftAlert,
    dismissLongShiftAlert,
    loggingOut,
    handleLogout,
    handleFastExit,
    handleActionButton,
    manualSheetOpen,
    openManualSheet,
    closeManualSheet,
    manualMotivo,
    updateManualMotivo,
    manualError,
    dismissManualError,
    submitManual,
    noveltySheetOpen,
    noveltyTipo,
    openNoveltySheet,
    closeNoveltySheet,
    noveltyText,
    updateNoveltyText,
    noveltySubmitting,
    submitNovelty,
    noveltyResult,
    dismissNoveltyResult,
    handleTabRegistros,
    handleTabMovimiento,
    movementAlert,
    dismissMovementAlert,
    resumedMovement,
    clearResumedMovement,
    handleTabAyuda,
    onOpenProfile,
    recentRecords: [...pendingRecords, ...recentRecords].slice(0, 5),
    recentRecordsLoading,
    lastAttendanceRecord,
    failedSyncCount,
    retryFailedSync,
    retryingFailedSync,
    workTimer: attendanceStatus === ATTENDANCE_STATUS.ACTIVE ? formatMoveTimer(workElapsedMs) : null,
    elapsedDisplayMs: attendanceStatus === ATTENDANCE_STATUS.ACTIVE
      ? workElapsedMs
      : (entryTimeMs && exitTimeMs ? Math.max(0, exitTimeMs - entryTimeMs) : null),
    avatarUrl: (() => {
      const url = getAvatarUrl(identificacion);
      return url === brokenAvatarUrl ? null : url;
    })(),
    onAvatarError: () => setBrokenAvatarUrl(getAvatarUrl(identificacion)),
    permissionPrompt: geoPermission.visible
      ? { requesting: geoPermission.requesting, onAllow: geoPermission.allow, onDismiss: geoPermission.dismiss }
      : null,
  };
}
