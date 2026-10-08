import { useEffect, useRef, useState } from 'react';
import { watchPosition, clearWatch } from '../services/geolocationService';
import {
  haversineKm,
  shouldRecordWaypoint,
  calcSpeedStats,
  formatMoveTimer,
  hasFixedDestination,
  ARRIVAL_DIST_KM,
  DEPARTURE_DIST_KM,
  DEPARTURE_CONFIRM_UPDATES,
  MIN_GPS_ACCURACY_M,
  MIN_MOVE_M,
  MIN_SPEED_KMH,
} from '../models/movementModel';
import { enqueueOutbox } from '../services/offlineDb';
import { requestSync } from '../services/syncService';
import { usePermissionPrompt } from './usePermissionPrompt';
import { clearMovementSession, saveTrackingProgress } from '../models/movementSessionStorage';

const RESULT_AUTO_DISMISS_MS = 5000;
const SAVE_TIMEOUT_MS = 8000;

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function nearestOnRoute(routeCoords, lat, lng) {
  if (!routeCoords?.length) return null;
  let minDist = Infinity;
  let nearest = routeCoords[0];
  for (const [rLat, rLng] of routeCoords) {
    const d = haversineKm(lat, lng, rLat, rLng);
    if (d < minDist) {
      minDist = d;
      nearest = [rLat, rLng];
    }
  }
  return nearest;
}

export function useMovementTrackingController({ movement, onFinished }) {
  const geoPermission = usePermissionPrompt('geolocation');
  const isFijo = hasFixedDestination(movement.tipo);
  const isRoundTrip = isFijo && !!movement.requiereRegreso;
  const identificacion = movement.startPayload?.identificacion;
  const progress = movement.progress ?? null;
  const lastProgressWp = progress?.waypoints?.length ? progress.waypoints[progress.waypoints.length - 1] : null;

  const [now, setNow] = useState(() => Date.now());
  const [currentPos, setCurrentPos] = useState(
    lastProgressWp ? { lat: lastProgressWp.lat, lng: lastProgressWp.lng } : { lat: movement.lat_inicio, lng: movement.lng_inicio }
  );
  const [speedKmh, setSpeedKmh] = useState(0);
  const [totalDistKm, setTotalDistKm] = useState(progress?.totalDistKm ?? 0);
  const [distToDestKm, setDistToDestKm] = useState(null);
  const [leg, setLeg] = useState(progress?.leg ?? 'outbound');
  const [dwellStartMs, setDwellStartMs] = useState(progress?.dwellStartMs ?? null);
  const [gpsError, setGpsError] = useState(null);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState(null);
  const [confirmFinishOpen, setConfirmFinishOpen] = useState(false);
  const [result, setResult] = useState(null);
  const [wakeLockActive, setWakeLockActive] = useState(false);

  const wakeLockRef = useRef(null);

  const requestWakeLock = async () => {
    if ('wakeLock' in navigator && !wakeLockRef.current && document.visibilityState === 'visible') {
      try {
        const lock = await navigator.wakeLock.request('screen');
        wakeLockRef.current = lock;
        setWakeLockActive(true);
        lock.addEventListener('release', () => {
          wakeLockRef.current = null;
          setWakeLockActive(false);
        });
      } catch {
        // Ignorar si el navegador rechaza por ahorro de batería o permisos
      }
    }
  };

  const releaseWakeLock = () => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
      setWakeLockActive(false);
    }
  };

  const waypointsRef = useRef(progress?.waypoints ?? []);
  const lastRecordedRef = useRef(lastProgressWp);
  const lastRawPosRef = useRef(lastProgressWp);
  const totalDistRef = useRef(progress?.totalDistKm ?? 0);
  const maxDesvioRef = useRef(progress?.maxDesvioKm ?? 0);
  const arrivedRef = useRef(progress?.arrived ?? false);
  const legRef = useRef(progress?.leg ?? 'outbound');
  const dwellStartRef = useRef(progress?.dwellStartMs ?? null);
  const departureStreakRef = useRef(progress?.departureStreak ?? 0);
  const tiempoEnDestinoMinRef = useRef(progress?.tiempoEnDestinoMin ?? null);
  const finishingRef = useRef(false);
  const lastFinishArgRef = useRef(false);

  function persistProgress() {
    if (!identificacion) return;
    saveTrackingProgress(identificacion, {
      waypoints: waypointsRef.current,
      totalDistKm: totalDistRef.current,
      maxDesvioKm: maxDesvioRef.current,
      leg: legRef.current,
      arrived: arrivedRef.current,
      dwellStartMs: dwellStartRef.current,
      departureStreak: departureStreakRef.current,
      tiempoEnDestinoMin: tiempoEnDestinoMinRef.current,
    });
  }

  function markArrival() {
    if (arrivedRef.current || legRef.current !== 'outbound') return;
    arrivedRef.current = true;
    navigator.vibrate?.([200, 100, 200, 100, 400]);
    if (!isRoundTrip) {
      finish(true);
    } else {
      dwellStartRef.current = Date.now();
      legRef.current = 'dwelling';
      setLeg('dwelling');
      setDwellStartMs(dwellStartRef.current);
      departureStreakRef.current = 0;
      persistProgress();
    }
  }

  const finish = async (llegoDestino) => {
    if (finishingRef.current) return;
    lastFinishArgRef.current = llegoDestino;
    finishingRef.current = true;
    setFinishing(true);
    setFinishError(null);
    clearWatch(watchIdRef.current);
    releaseWakeLock();

    try {
      const finishedAt = Date.now();
      const duracionMin = Math.max(1, Math.round((finishedAt - movement.startMs) / 60000));
      const { max: velMax, avg: velProm } = calcSpeedStats(waypointsRef.current);
      const distanciaRealKm = +totalDistRef.current.toFixed(3);
      const desvioMaxKm = +maxDesvioRef.current.toFixed(3);
      const totalWaypoints = waypointsRef.current.length;
      const tiempoEnDestinoMin = tiempoEnDestinoMinRef.current;

      const finishPayload = {
        distancia_real_km: distanciaRealKm,
        desvio_max_km: desvioMaxKm,
        llego_destino: llegoDestino,
        tiempo_en_destino_min: tiempoEnDestinoMin,
        waypoints: waypointsRef.current,
        client_timestamp: finishedAt,
      };

      await withTimeout(
        enqueueOutbox('movimiento', { startPayload: movement.startPayload, finishPayload }),
        SAVE_TIMEOUT_MS,
        'Guardar el recorrido tardó demasiado. Intenta de nuevo.'
      );
      requestSync();
      clearMovementSession();

      finishingRef.current = false;
      setFinishing(false);
      setResult({
        status: 'completed',
        duracion_min: duracionMin,
        distancia_real_km: distanciaRealKm,
        desvio_max_km: desvioMaxKm,
        llego_destino: llegoDestino,
        tiempo_en_destino_min: tiempoEnDestinoMin,
        total_waypoints: totalWaypoints,
        velocidad_max_kmh: velMax,
        velocidad_prom_kmh: velProm,
        tipo: movement.tipo,
        llegoDestino,
        movement,
      });
    } catch (err) {
      finishingRef.current = false;
      setFinishing(false);
      setFinishError(err?.message || 'No se pudo guardar el recorrido en este dispositivo. Intenta de nuevo.');
    }
  };

  function dismissResult() {
    setResult(null);
    onFinished();
  }

  useEffect(() => {
    if (!result) return;
    const timer = setTimeout(dismissResult, RESULT_AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const watchIdRef = useRef(null);

  async function startWatch() {
    const permitted = await geoPermission.ensure();
    if (!permitted) {
      setGpsError('Necesitamos acceso a tu ubicación para hacer seguimiento del recorrido.');
      return;
    }
    clearWatch(watchIdRef.current);
    watchIdRef.current = watchPosition(
      (pos) => {
        setGpsError(null);
        setCurrentPos({ lat: pos.lat, lng: pos.lng });
        setSpeedKmh(pos.speed ? +(pos.speed * 3.6).toFixed(1) : 0);

        const last = lastRecordedRef.current;
        const lastRaw = lastRawPosRef.current;
        const accuracyOk = pos.accuracy == null || pos.accuracy <= MIN_GPS_ACCURACY_M;
        if (accuracyOk) {
          if (lastRaw) {
            const dist = haversineKm(lastRaw.lat, lastRaw.lng, pos.lat, pos.lng);
            const distMeters = dist * 1000;

            const sensorSpeedKmh = pos.speed != null && !isNaN(pos.speed) && pos.speed >= 0 ? +(pos.speed * 3.6) : null;
            const elapsedSec = Math.max(0.5, (pos.ts - (lastRaw.ts || pos.ts)) / 1000);
            const calcSpeedKmh = (distMeters / elapsedSec) * 3.6;
            const effectiveSpeed = sensorSpeedKmh ?? calcSpeedKmh;

            // Filtro de deriva en reposo: solo acumular distancia si supera el mínimo (5m) Y la velocidad no es de reposo (< 1.0 km/h)
            // O si es un salto claro de desplazamiento mayor a 25 metros
            if ((distMeters >= MIN_MOVE_M && effectiveSpeed >= MIN_SPEED_KMH) || distMeters >= 25) {
              totalDistRef.current += dist;
              setTotalDistKm(+totalDistRef.current.toFixed(3));
              lastRawPosRef.current = { lat: pos.lat, lng: pos.lng, ts: pos.ts };
            }
          } else {
            lastRawPosRef.current = { lat: pos.lat, lng: pos.lng, ts: pos.ts };
          }
        }

        if (isFijo && movement.destino) {
          if (movement.destino.routeCoords?.length) {
            const nearest = nearestOnRoute(movement.destino.routeCoords, pos.lat, pos.lng);
            if (nearest) {
              const desvio = haversineKm(pos.lat, pos.lng, nearest[0], nearest[1]);
              if (desvio > maxDesvioRef.current) maxDesvioRef.current = desvio;
            }
          }

          if (legRef.current === 'outbound') {
            const dToDest = haversineKm(pos.lat, pos.lng, movement.destino.lat, movement.destino.lng);
            setDistToDestKm(+dToDest.toFixed(3));

            if (!arrivedRef.current && dToDest <= ARRIVAL_DIST_KM) {
              arrivedRef.current = true;
              navigator.vibrate?.([200, 100, 200, 100, 400]);
              if (!isRoundTrip) {
                finish(true);
              } else {
                dwellStartRef.current = Date.now();
                legRef.current = 'dwelling';
                setLeg('dwelling');
                setDwellStartMs(dwellStartRef.current);
                departureStreakRef.current = 0;
                persistProgress();
              }
            }
          } else if (legRef.current === 'dwelling') {
            const dToDest = haversineKm(pos.lat, pos.lng, movement.destino.lat, movement.destino.lng);
            setDistToDestKm(+dToDest.toFixed(3));

            if (dToDest > DEPARTURE_DIST_KM) {
              departureStreakRef.current += 1;
            } else {
              departureStreakRef.current = 0;
            }

            if (departureStreakRef.current >= DEPARTURE_CONFIRM_UPDATES) {
              tiempoEnDestinoMinRef.current = Math.max(1, Math.round((Date.now() - dwellStartRef.current) / 60000));
              navigator.vibrate?.([150, 80, 150]);
              legRef.current = 'return';
              setLeg('return');
              persistProgress();
            }
          } else if (legRef.current === 'return') {
            const dToOrigin = haversineKm(pos.lat, pos.lng, movement.lat_inicio, movement.lng_inicio);
            setDistToDestKm(+dToOrigin.toFixed(3));

            if (dToOrigin <= ARRIVAL_DIST_KM) {
              navigator.vibrate?.([200, 100, 200, 100, 400]);
              finish(true);
            }
          }
        }

        const candidate = {
          lat: pos.lat,
          lng: pos.lng,
          ts: pos.ts,
          speed: pos.speed != null ? +(pos.speed * 3.6).toFixed(2) : 0,
          accuracy: pos.accuracy,
        };
        if (shouldRecordWaypoint(last, candidate)) {
          waypointsRef.current.push(candidate);
          lastRecordedRef.current = candidate;
          persistProgress();
        }
      },
      (err) => setGpsError(err.message)
    );
  }

  function retryGps() {
    setGpsError(null);
    startWatch();
  }

  function retryFinish() {
    finish(lastFinishArgRef.current);
  }

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    startWatch();
    requestWakeLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(timer);
      clearWatch(watchIdRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      releaseWakeLock();
    };
  }, []);

  function requestFinish() {
    setConfirmFinishOpen(true);
  }

  function cancelFinish() {
    setConfirmFinishOpen(false);
  }

  function confirmFinish() {
    setConfirmFinishOpen(false);
    // Si ya no está en 'outbound', ya había llegado.
    // Si aún está en 'outbound' pero a <= 80m del destino, se considera llegado con tolerancia.
    const isNearDestination = isFijo && distToDestKm != null && distToDestKm <= 0.08;
    const reached = leg !== 'outbound' || isNearDestination;
    finish(reached);
  }

  return {
    tipo: movement.tipo,
    isFijo,
    isRoundTrip,
    leg,
    destino: movement.destino,
    elapsedLabel: formatMoveTimer(now - movement.startMs),
    dwellElapsedLabel: dwellStartMs != null ? formatMoveTimer(now - dwellStartMs) : null,
    currentPos,
    speedKmh,
    totalDistKm,
    distToDestKm,
    waypointCount: waypointsRef.current.length,
    gpsError,
    retryGps,
    finishing,
    finishError,
    retryFinish,
    requestFinish,
    confirmFinishOpen,
    cancelFinish,
    confirmFinish,
    result,
    dismissResult,
    markArrival,
    wakeLockActive,
    permissionPrompt: geoPermission.visible
      ? { requesting: geoPermission.requesting, onAllow: geoPermission.allow, onDismiss: geoPermission.dismiss }
      : null,
  };
}
