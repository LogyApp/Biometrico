import { useEffect, useState } from 'react';
import { getWaypoints } from '../models/movementRouteModel';
import { reverseGeocode } from '../services/geocodingService';
import { saveWaypointsCache, getWaypointsCache } from '../services/offlineDb';
import { isConnectivityFailure } from '../services/connectivity';

export function useMovementRouteController({ rec, onBack }) {
  const [waypoints, setWaypoints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [startAddress, setStartAddress] = useState(null);
  const [endAddress, setEndAddress] = useState(null);

  useEffect(() => {
    if (!rec?.id) return;
    let mounted = true;
    setLoading(true);
    setError(null);
    setStartAddress(null);
    setEndAddress(null);

    function applyWaypoints(wps) {
      setWaypoints(wps);
      setLoading(false);

      const start = wps.length
        ? { lat: wps[0].lat, lng: wps[0].lng }
        : rec.latitud != null
        ? { lat: rec.latitud, lng: rec.longitud }
        : null;
      const end = wps.length
        ? { lat: wps[wps.length - 1].lat, lng: wps[wps.length - 1].lng }
        : rec.lat_fin != null
        ? { lat: rec.lat_fin, lng: rec.lng_fin }
        : null;

      if (start) {
        reverseGeocode(start.lat, start.lng)
          .then((address) => mounted && setStartAddress(address))
          .catch(() => {});
      }
      if (end && (!start || end.lat !== start.lat || end.lng !== start.lng)) {
        reverseGeocode(end.lat, end.lng)
          .then((address) => mounted && setEndAddress(address))
          .catch(() => {});
      }
    }

    getWaypoints(rec.id)
      .then((wps) => {
        if (!mounted) return;
        applyWaypoints(wps);
        saveWaypointsCache(rec.id, wps).catch(() => {});
      })
      .catch(async (err) => {
        if (!mounted) return;
        if (isConnectivityFailure(err)) {
          const cached = await getWaypointsCache(rec.id);
          if (!mounted) return;
          if (cached) {
            applyWaypoints(cached);
            return;
          }
        }
        setError(err.message);
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [rec?.id]);

  return {
    rec,
    waypoints,
    loading,
    error,
    startAddress,
    endAddress,
    isActive: rec?.estado === 'ACTIVO',
    onBack,
  };
}
