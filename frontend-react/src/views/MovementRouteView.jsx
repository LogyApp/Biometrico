import { useEffect, useRef } from 'react';
import ChevronLeftIcon from './icons/ChevronLeftIcon';
import NavigationIcon from './icons/NavigationIcon';
import MapPinIcon from './icons/MapPinIcon';
import { ensureGoogleMaps } from '../services/googleMapsLoader';
import { pulsingMarker } from '../services/mapMarkers';
import { INTERACTIVE_MAP_OPTIONS, buildBounds, toGooglePadding, dashedLineOptions, triggerResize } from '../services/mapHelpers';
import { hasFixedDestination, haversineKm } from '../models/movementModel';
import './MovementRouteView.css';

function fitOrCenter(map, points, { padding, maxZoom, singleZoom }) {
  if (!points.length) return;
  if (points.length === 1) {
    map.setCenter(points[0]);
    map.setZoom(singleZoom);
    return;
  }
  const bounds = buildBounds(points);
  const ne = bounds.getNorthEast();
  const sw = bounds.getSouthWest();
  const diagonalMeters = haversineKm(ne.lat(), ne.lng(), sw.lat(), sw.lng()) * 1000;
  if (diagonalMeters < 40) {
    map.setCenter(points[0]);
    map.setZoom(singleZoom);
    return;
  }
  map.fitBounds(bounds, toGooglePadding(padding));
  if (maxZoom) {
    const listener = map.addListener('idle', () => {
      if (map.getZoom() > maxZoom) map.setZoom(maxZoom);
      google.maps.event.removeListener(listener);
    });
  }
}

function InfoCard({ icon, iconBg, label, title, sub }) {
  return (
    <div className="route-card">
      <div className="route-card__icon" style={{ background: iconBg }}>{icon}</div>
      <div className="route-card__body">
        <div className="route-card__label">{label}</div>
        <div className="route-card__title">{title}</div>
        {sub && <div className="route-card__sub">{sub}</div>}
      </div>
    </div>
  );
}

export default function MovementRouteView({ rec, waypoints, loading, error, startAddress, endAddress, isActive, onBack }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const overlaysRef = useRef([]);

  useEffect(() => {
    if (!mapContainerRef.current) return;
    let cancelled = false;

    ensureGoogleMaps().then((maps) => {
      if (cancelled || !mapContainerRef.current) return;
      const map = new maps.Map(mapContainerRef.current, {
        center: { lat: 4.71, lng: -74.07 },
        zoom: 12,
        ...INTERACTIVE_MAP_OPTIONS,
        zoomControl: true,
      });
      mapRef.current = map;
      setTimeout(() => triggerResize(map), 50);
    }).catch(() => {});

    return () => {
      cancelled = true;
      overlaysRef.current.forEach((o) => o.setMap(null));
      overlaysRef.current = [];
      mapRef.current = null;
    };
  }, []);

  const hasDestino = hasFixedDestination(rec?.tipo) && rec?.lat_destino != null && rec?.lng_destino != null;
  const firstWp = waypoints[0];
  const lastWp = waypoints[waypoints.length - 1];
  const startCoords = firstWp
    ? [firstWp.lat, firstWp.lng]
    : rec?.latitud != null
    ? [rec.latitud, rec.longitud]
    : null;
  const endCoords = lastWp
    ? [lastWp.lat, lastWp.lng]
    : rec?.lat_fin != null
    ? [rec.lat_fin, rec.lng_fin]
    : null;
  const hasAnyPoint = !!(startCoords || endCoords || hasDestino);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || loading) return;

    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];
    const track = (overlay) => { overlaysRef.current.push(overlay); return overlay; };
    const toLL = ([lat, lng]) => ({ lat, lng });

    try {
      if (waypoints.length > 1) {
        const coords = waypoints.map((w) => ({ lat: w.lat, lng: w.lng }));

        track(new google.maps.Polyline({ path: coords, strokeColor: '#fff', strokeWeight: 8, strokeOpacity: 0.22 })).setMap(map);
        track(new google.maps.Polyline({ path: coords, strokeColor: '#7A5FD1', strokeWeight: 4.5, strokeOpacity: 0.9 })).setMap(map);

        const step = Math.max(1, Math.floor(coords.length / 25));
        coords.forEach((c, i) => {
          if (i === 0 || i === coords.length - 1 || i % step !== 0) return;
          track(new google.maps.Circle({
            center: c, radius: 3, strokeColor: '#7A5FD1', strokeWeight: 2, fillColor: '#fff', fillOpacity: 1,
          })).setMap(map);
        });

        track(pulsingMarker(map, coords[0], '#1E9E5A', { size: 22 }));
        track(pulsingMarker(map, coords[coords.length - 1], isActive ? '#2A4A8F' : '#D64545'));

        const boundPoints = [...coords];
        if (hasDestino) {
          const destino = { lat: rec.lat_destino, lng: rec.lng_destino };
          track(pulsingMarker(map, destino, '#7A5FD1', { size: 22 }));
          boundPoints.push(destino);
        }
        rec?.paradas?.forEach((p, i) => {
          const point = { lat: p.lat, lng: p.lng };
          track(pulsingMarker(map, point, '#7A5FD1', { size: 22, label: i + 1 }));
          boundPoints.push(point);
        });

        fitOrCenter(map, boundPoints, { padding: [32, 32], maxZoom: 17, singleZoom: 16 });
        return;
      }

      const points = [];
      if (startCoords) points.push({ coords: toLL(startCoords), color: '#1E9E5A', isEnd: false });
      if (endCoords && (!startCoords || endCoords[0] !== startCoords[0] || endCoords[1] !== startCoords[1])) {
        points.push({ coords: toLL(endCoords), color: isActive ? '#2A4A8F' : '#D64545', isEnd: true });
      }

      if (points.length > 1) {
        const line = points.map((p) => p.coords);
        track(new google.maps.Polyline({ path: line, ...dashedLineOptions({ color: '#fff', opacity: 0.25, weight: 6 }) })).setMap(map);
        track(new google.maps.Polyline({ path: line, ...dashedLineOptions({ color: '#7A5FD1', opacity: 0.8, weight: 3 }) })).setMap(map);
      }

      points.forEach(({ coords, color, isEnd }) => {
        track(pulsingMarker(map, coords, color, isEnd ? undefined : { size: 22 }));
      });

      const boundPoints = points.map((p) => p.coords);
      if (hasDestino) {
        const destino = { lat: rec.lat_destino, lng: rec.lng_destino };
        track(pulsingMarker(map, destino, '#7A5FD1', { size: 22 }));
        boundPoints.push(destino);
      }
      rec?.paradas?.forEach((p, i) => {
        const point = { lat: p.lat, lng: p.lng };
        track(pulsingMarker(map, point, '#7A5FD1', { size: 22, label: i + 1 }));
        boundPoints.push(point);
      });

      fitOrCenter(map, boundPoints, { padding: [40, 40], maxZoom: 16, singleZoom: 15 });
    } catch {
      map.setCenter({ lat: 4.71, lng: -74.07 });
      map.setZoom(12);
    } finally {
      setTimeout(() => triggerResize(map), 100);
    }
  }, [waypoints, loading, rec, isActive]);

  return (
    <div className="route-screen">
      <header className="route-header">
        <button type="button" className="route-back" onClick={onBack} aria-label="Volver">
          <ChevronLeftIcon size={20} color="var(--color-link)" />
        </button>
        <div className="route-header__title">Recorrido del movimiento</div>
      </header>

      <div className="route-stats">
        <div className="route-stat">
          <div className="route-stat__label">DURACIÓN</div>
          <div className="route-stat__value">{rec?.duracion_min != null ? `${rec.duracion_min} min` : '—'}</div>
        </div>
        <div className="route-stat">
          <div className="route-stat__label">DISTANCIA</div>
          <div className="route-stat__value">{rec?.distancia_km != null ? `${rec.distancia_km.toFixed(2)} km` : '—'}</div>
        </div>
        <div className="route-stat">
          <div className="route-stat__label">PTS GPS</div>
          <div className="route-stat__value">{rec?.total_wps ?? waypoints.length}</div>
        </div>
      </div>

      <div ref={mapContainerRef} className="route-map" />

      {loading && <div className="route-loading"><div className="route-spinner" /></div>}
      {!loading && error && <div className="route-error">No se pudieron cargar los puntos GPS</div>}
      {!loading && !error && !hasAnyPoint && (
        <div className="route-empty">Sin datos de ubicación registrados para este movimiento</div>
      )}

      {!loading && !error && hasAnyPoint && (
        <div className="route-cards">
          {startCoords && (
            <InfoCard
              icon={<NavigationIcon size={16} color="#1E9E5A" />}
              iconBg="rgba(30,158,90,0.12)"
              label="PUNTO DE INICIO"
              title={startAddress ?? `${startCoords[0].toFixed(5)}°, ${startCoords[1].toFixed(5)}°`}
            />
          )}
          {rec?.paradas?.length > 0 && (
            <InfoCard
              icon={<MapPinIcon size={16} color="#7A5FD1" />}
              iconBg="rgba(122,95,209,0.12)"
              label={rec.paradas.length === 1 ? 'PARADA INTERMEDIA' : `${rec.paradas.length} PARADAS INTERMEDIAS`}
              title={rec.paradas.map((p) => p.address ?? `${p.lat.toFixed(5)}°, ${p.lng.toFixed(5)}°`).join(' · ')}
            />
          )}
          {hasDestino && (
            <InfoCard
              icon={<MapPinIcon size={16} color="#7A5FD1" />}
              iconBg="rgba(122,95,209,0.12)"
              label="DESTINO"
              title={rec.dir_destino ?? `${rec.lat_destino.toFixed(5)}°, ${rec.lng_destino.toFixed(5)}°`}
            />
          )}
          {endCoords && (
            <InfoCard
              icon={<MapPinIcon size={16} color={isActive ? 'var(--color-link)' : 'var(--color-danger)'} />}
              iconBg={isActive ? 'rgba(42,74,143,0.1)' : 'rgba(214,69,69,0.1)'}
              label={isActive ? 'ÚLTIMA POSICIÓN REGISTRADA' : 'PUNTO FINAL'}
              title={endAddress ?? `${endCoords[0].toFixed(5)}°, ${endCoords[1].toFixed(5)}°`}
            />
          )}
        </div>
      )}
    </div>
  );
}
