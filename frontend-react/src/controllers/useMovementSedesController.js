import { useEffect, useState } from 'react';
import { fetchSedes, checkOrigenNearSede, groupSedesByRegional, filterSedes } from '../models/sedeModel';
import { getMultiRoute } from '../services/routingService';
import { getDeviceFingerprint } from '../models/deviceFingerprint';
import { saveMovementSession } from '../models/movementSessionStorage';
import { saveSedesCache, getSedesCache } from '../services/offlineDb';
import { isConnectivityFailure } from '../services/connectivity';

export function useMovementSedesController({ identificacion, location, onStarted, onBack, manualReason }) {
  const [sedes, setSedes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [route, setRoute] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [error, setError] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [checkingOrigen, setCheckingOrigen] = useState(false);
  const [originAlert, setOriginAlert] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchSedes(identificacion);
        if (cancelled) return;
        setSedes(res.sedes ?? []);
        saveSedesCache(res.sedes ?? []).catch(() => {});
      } catch (err) {
        if (cancelled) return;
        if (isConnectivityFailure(err)) {
          const cached = await getSedesCache();
          if (cancelled) return;
          setSedes(cached);
          if (!cached.length) setLoadError('No se pudieron cargar las sedes. Verifica tu conexión.');
        } else {
          setLoadError('No se pudieron cargar las sedes. Intenta de nuevo.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selected || !location) {
      setRoute(null);
      return undefined;
    }
    let cancelled = false;
    setRouteLoading(true);
    getMultiRoute([
      { lat: location.lat, lng: location.lng },
      { lat: selected.latitud, lng: selected.longitud },
    ])
      .then((r) => { if (!cancelled) setRoute(r); })
      .catch(() => { if (!cancelled) setRoute(null); })
      .finally(() => { if (!cancelled) setRouteLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, location?.lat, location?.lng]);

  const grouped = groupSedesByRegional(filterSedes(sedes, query));

  function changeQuery(value) {
    setQuery(value);
  }

  function selectSede(sede) {
    setError(null);
    setSelected(sede);
  }

  function clearSelected() {
    setSelected(null);
    setRoute(null);
  }

  async function askConfirm() {
    if (!location) {
      setError('GPS no disponible. Activa la ubicación e intenta de nuevo.');
      return;
    }
    if (!selected) return;
    setError(null);

    setCheckingOrigen(true);
    try {
      const check = await checkOrigenNearSede(location.lat, location.lng);
      if (!check.dentro_de_rango) {
        setCheckingOrigen(false);
        setOriginAlert({ distanciaKm: check.distancia_km, sedeCercana: check.sede_cercana });
        return;
      }
    } catch {}
    setCheckingOrigen(false);
    setConfirmOpen(true);
  }

  function dismissOriginAlert() {
    setOriginAlert(null);
  }

  function proceedDespiteOriginAlert() {
    setOriginAlert(null);
    setConfirmOpen(true);
  }

  function dismissConfirm() {
    setConfirmOpen(false);
  }

  function confirm() {
    setConfirmOpen(false);
    if (!location || !selected) return;
    setError(null);

    const startedAt = Date.now();
    const destinoLabel = `${selected.lugar} (${selected.regional})`;

    const startPayload = {
      identificacion,
      tipo: 'SEDE',
      lat_inicio: location.lat,
      lng_inicio: location.lng,
      lat_destino: selected.latitud,
      lng_destino: selected.longitud,
      direccion_destino: destinoLabel,
      ruta_dist_km: route?.distKm ?? null,
      ruta_tiempo_min: route?.timeMin ?? null,
      sede_destino_id: selected.id,
      device_fingerprint: getDeviceFingerprint(),
      client_timestamp: startedAt,
      es_manual: Boolean(manualReason),
      motivo: manualReason ?? null,
    };

    const movement = {
      id: `local-${startedAt}`,
      tipo: 'SEDE',
      startMs: startedAt,
      lat_inicio: location.lat,
      lng_inicio: location.lng,
      destino: {
        lat: selected.latitud,
        lng: selected.longitud,
        address: destinoLabel,
        routeCoords: route?.coords ?? null,
        paradas: [],
      },
      sedeDestino: selected,
      startPayload,
    };
    saveMovementSession(movement, identificacion);
    onStarted(movement);
  }

  return {
    loading,
    loadError,
    sedeGroups: grouped,
    location,
    query,
    changeQuery,
    selected,
    selectSede,
    clearSelected,
    route,
    routeLoading,
    error,
    confirmOpen,
    checkingOrigen,
    originAlert,
    proceedDespiteOriginAlert,
    dismissOriginAlert,
    askConfirm,
    dismissConfirm,
    confirm,
    onBack,
  };
}
