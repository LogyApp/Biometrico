import { useEffect, useRef, useState } from 'react';
import { reverseGeocode } from '../services/geocodingService';
import { getMultiRoute, searchAddress } from '../services/routingService';
import { getDeviceFingerprint } from '../models/deviceFingerprint';
import { saveMovementSession } from '../models/movementSessionStorage';

const SEARCH_DEBOUNCE_MS = 500;
export const MAX_STOPS = 4;

export function useMovementDestinoController({ identificacion, location, onStarted, onBack, manualReason }) {
  const [stops, setStops] = useState([null]);
  const [activeIndex, setActiveIndex] = useState(0);

  const [route, setRoute] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const [starting, setStarting] = useState(false);
  const [error, setError] = useState(null);
  const [requiereRegreso, setRequiereRegreso] = useState(false);
  const [originAddress, setOriginAddress] = useState(null);

  const searchTimerRef = useRef(null);
  const routeTimerRef = useRef(null);

  useEffect(() => {
    if (!location) return;
    let cancelled = false;
    reverseGeocode(location.lat, location.lng)
      .then((address) => { if (!cancelled) setOriginAddress(address); })
      .catch(() => { if (!cancelled) setOriginAddress('Tu ubicación actual'); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location?.lat, location?.lng]);

  const resolvedStops = stops.filter(Boolean);
  const canRequiereRegreso = resolvedStops.length <= 1;

  function toggleRequiereRegreso() {
    if (!canRequiereRegreso) return;
    setRequiereRegreso((prev) => !prev);
  }

  useEffect(() => {
    if (!canRequiereRegreso) setRequiereRegreso(false);
  }, [canRequiereRegreso]);

  useEffect(() => {
    clearTimeout(routeTimerRef.current);
    if (!location || resolvedStops.length === 0) {
      setRoute(null);
      return;
    }
    routeTimerRef.current = setTimeout(async () => {
      setRouteLoading(true);
      try {
        const points = [{ lat: location.lat, lng: location.lng }, ...resolvedStops.map((s) => ({ lat: s.lat, lng: s.lng }))];
        const result = await getMultiRoute(points);
        setRoute(result);
      } catch {
        setRoute(null);
      } finally {
        setRouteLoading(false);
      }
    }, 250);
    return () => clearTimeout(routeTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location?.lat, location?.lng, JSON.stringify(resolvedStops.map((s) => [s.lat, s.lng]))]);

  function focusStop(index) {
    setActiveIndex(index);
    setSearchQuery(stops[index]?.address ?? '');
    setSearchResults([]);
  }

  function addStop() {
    if (stops.length >= MAX_STOPS) return;
    setStops((prev) => [...prev, null]);
    setActiveIndex(stops.length);
    setSearchQuery('');
    setSearchResults([]);
  }

  function removeStop(index) {
    setStops((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
    setActiveIndex(0);
    setSearchQuery('');
    setSearchResults([]);
  }

  function setStopAt(index, value) {
    setStops((prev) => prev.map((s, i) => (i === index ? value : s)));
  }

  async function pickPoint(lat, lng) {
    const index = activeIndex;
    setStopAt(index, { lat, lng, address: null });
    setSearchResults([]);
    setSearchQuery('');
    try {
      const address = await reverseGeocode(lat, lng);
      setStops((prev) =>
        prev.map((s, i) => (i === index && s && s.lat === lat && s.lng === lng ? { ...s, address } : s))
      );
      setSearchQuery(address);
    } catch {
      const fallback = `${lat.toFixed(5)}°, ${lng.toFixed(5)}°`;
      setStops((prev) =>
        prev.map((s, i) => (i === index && s && s.lat === lat && s.lng === lng ? { ...s, address: fallback } : s))
      );
      setSearchQuery(fallback);
    }
  }

  function changeSearchQuery(value) {
    setSearchQuery(value);
    clearTimeout(searchTimerRef.current);
    if (value.trim().length < 3) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const results = await searchAddress(value.trim());
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);
  }

  function selectSearchResult(result) {
    pickPoint(parseFloat(result.lat), parseFloat(result.lon));
  }

  useEffect(() => () => {
    clearTimeout(searchTimerRef.current);
    clearTimeout(routeTimerRef.current);
  }, []);

  function confirm() {
    const finalStop = resolvedStops[resolvedStops.length - 1];
    if (!location || !finalStop) return;
    setError(null);

    const startedAt = Date.now();
    const paradas = resolvedStops.slice(0, -1).map((s) => ({ lat: s.lat, lng: s.lng, address: s.address }));
    const startPayload = {
      identificacion,
      tipo: 'DESTINO_FIJO',
      lat_inicio: location.lat,
      lng_inicio: location.lng,
      lat_destino: finalStop.lat,
      lng_destino: finalStop.lng,
      direccion_destino: finalStop.address,
      ruta_dist_km: route?.distKm ?? null,
      ruta_tiempo_min: route?.timeMin ?? null,
      requiere_regreso: requiereRegreso,
      paradas,
      device_fingerprint: getDeviceFingerprint(),
      client_timestamp: startedAt,
      es_manual: Boolean(manualReason),
      motivo: manualReason ?? null,
    };

    const movement = {
      id: `local-${startedAt}`,
      tipo: 'DESTINO_FIJO',
      startMs: startedAt,
      lat_inicio: location.lat,
      lng_inicio: location.lng,
      requiereRegreso,
      destino: {
        lat: finalStop.lat,
        lng: finalStop.lng,
        address: finalStop.address,
        routeCoords: route?.coords ?? null,
        paradas: resolvedStops.slice(0, -1),
      },
      startPayload,
    };
    saveMovementSession(movement, identificacion);
    onStarted(movement);
  }

  return {
    location,
    originAddress,
    stops,
    activeIndex,
    focusStop,
    addStop,
    removeStop,
    canAddStop: stops.length < MAX_STOPS && stops[stops.length - 1] !== null,
    route,
    routeLoading,
    searchQuery,
    searchResults,
    searchLoading,
    changeSearchQuery,
    selectSearchResult,
    pickPoint,
    starting,
    error,
    confirm,
    requiereRegreso,
    toggleRequiereRegreso,
    canRequiereRegreso,
    onBack,
  };
}
