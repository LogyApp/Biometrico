import { useEffect, useRef } from 'react';
import ChevronLeftIcon from './icons/ChevronLeftIcon';
import MapPinIcon from './icons/MapPinIcon';
import Building2Icon from './icons/Building2Icon';
import CheckCircleIcon from './icons/CheckCircleIcon';
import AlertTriangleIcon from './icons/AlertTriangleIcon';
import { ensureGoogleMaps } from '../services/googleMapsLoader';
import { pulsingMarker } from '../services/mapMarkers';
import { INTERACTIVE_MAP_OPTIONS, triggerResize, dashedLineOptions, toGooglePadding } from '../services/mapHelpers';
import './LocationDetailView.css';

export default function LocationDetailView({ mapTarget, onBack }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);

  const hasOpCoords = mapTarget?.opLat != null && mapTarget?.opLng != null;
  const distM = mapTarget?.distM;
  const enSede = mapTarget?.enSede;

  useEffect(() => {
    if (!mapContainerRef.current || !mapTarget) return;
    let cancelled = false;
    const overlays = [];
    const center = { lat: mapTarget.lat, lng: mapTarget.lng };
    const opCenter = hasOpCoords ? { lat: mapTarget.opLat, lng: mapTarget.opLng } : null;

    ensureGoogleMaps().then((maps) => {
      if (cancelled || !mapContainerRef.current) return;
      const map = new maps.Map(mapContainerRef.current, {
        center,
        zoom: 16,
        ...INTERACTIVE_MAP_OPTIONS,
        zoomControl: true,
      });

      // 1. Worker marking marker (Blue) & accuracy circle
      overlays.push(pulsingMarker(map, center, '#2A4A8F', { size: 22 }));

      const workerCircle = new maps.Circle({
        center,
        radius: 25,
        strokeColor: '#2A4A8F',
        strokeWeight: 1,
        fillColor: '#2A4A8F',
        fillOpacity: 0.12,
      });
      workerCircle.setMap(map);
      overlays.push(workerCircle);

      // 2. Operation marker & perimeter radius circle (if available)
      if (hasOpCoords && opCenter) {
        overlays.push(pulsingMarker(map, opCenter, '#C0392B', { size: 22 }));

        const opRadius = mapTarget.opRadioM || 350;
        const opCircle = new maps.Circle({
          center: opCenter,
          radius: opRadius,
          strokeColor: '#C0392B',
          strokeWeight: 1.5,
          strokeOpacity: 0.8,
          fillColor: '#C0392B',
          fillOpacity: 0.08,
        });
        opCircle.setMap(map);
        overlays.push(opCircle);

        // 3. Dashed line between worker mark and operation
        const lineColor = enSede ? '#10B981' : '#EF4444';
        const line = new maps.Polyline({
          path: [center, opCenter],
          ...dashedLineOptions({ color: lineColor, opacity: 0.85, weight: 3 }),
        });
        line.setMap(map);
        overlays.push(line);

        // 4. Frame both points
        const bounds = new maps.LatLngBounds();
        bounds.extend(center);
        bounds.extend(opCenter);
        map.fitBounds(bounds, toGooglePadding([50, 50]));

        // Limit zoom if worker and operation are close
        const listener = map.addListener('idle', () => {
          if (map.getZoom() > 16) {
            map.setZoom(16);
          }
          google.maps.event.removeListener(listener);
        });
      }

      mapRef.current = map;
      setTimeout(() => triggerResize(map), 50);
    }).catch(() => {});

    return () => {
      cancelled = true;
      overlays.forEach((o) => o.setMap(null));
      mapRef.current = null;
    };
  }, [mapTarget?.lat, mapTarget?.lng, mapTarget?.opLat, mapTarget?.opLng, hasOpCoords, enSede]);

  const formattedDist = distM != null
    ? (distM < 1000 ? `${Math.round(distM)} m` : `${(distM / 1000).toFixed(1)} km`)
    : null;

  return (
    <div className="loc-detail-screen">
      <header className="loc-detail-header">
        <button type="button" className="loc-detail-back" onClick={onBack} aria-label="Volver">
          <ChevronLeftIcon size={20} color="var(--color-link)" />
        </button>
        <div className="loc-detail-header__title">{mapTarget?.label ?? 'Ubicación del registro'}</div>
      </header>

      <div className="loc-detail-map-wrap">
        <div ref={mapContainerRef} className="loc-detail-map" />

        {/* Floating map legend */}
        <div className="loc-detail-legend">
          <span className="loc-detail-legend__item">
            <span className="loc-detail-legend__dot loc-detail-legend__dot--worker" />
            Marcación
          </span>
          {hasOpCoords && (
            <span className="loc-detail-legend__item">
              <span className="loc-detail-legend__dot loc-detail-legend__dot--op" />
              {mapTarget?.opNombre || 'Operación'}
            </span>
          )}
        </div>
      </div>

      <div className="loc-detail-cards">
        {/* Card 1: Worker location */}
        <div className="loc-detail-card">
          <div className="loc-detail-card__icon loc-detail-card__icon--worker">
            <MapPinIcon size={16} color="#2A4A8F" />
          </div>
          <div className="loc-detail-card__body">
            <div className="loc-detail-card__label">UBICACIÓN MARCADA (COLABORADOR)</div>
            <div className="loc-detail-card__title">
              {mapTarget?.addressStatus === 'ready'
                ? mapTarget.address
                : mapTarget?.addressStatus === 'error'
                ? `${mapTarget?.lat?.toFixed(5)}°, ${mapTarget?.lng?.toFixed(5)}°`
                : 'Ubicando dirección…'}
            </div>
          </div>
        </div>

        {/* Card 2: Assigned Operation */}
        {mapTarget?.opNombre && (
          <div className="loc-detail-card">
            <div className="loc-detail-card__icon loc-detail-card__icon--op">
              <Building2Icon size={16} color="#C0392B" />
            </div>
            <div className="loc-detail-card__body">
              <div className="loc-detail-card__label">OPERACIÓN ASIGNADA</div>
              <div className="loc-detail-card__title">{mapTarget.opNombre}</div>
              {hasOpCoords && mapTarget?.opRadioM && (
                <div className="loc-detail-card__sub">
                  Radio permitido: {mapTarget.opRadioM} m
                </div>
              )}
              {!hasOpCoords && (
                <div className="loc-detail-card__sub loc-detail-card__sub--warn">
                  Sin coordenadas de sede registradas
                </div>
              )}
            </div>
          </div>
        )}

        {/* Card 3: Distance and Perimeter Check */}
        {distM != null && (
          <div className={`loc-detail-card loc-detail-card--${enSede ? 'ok' : 'alert'}`}>
            <div className={`loc-detail-card__icon loc-detail-card__icon--${enSede ? 'ok' : 'alert'}`}>
              {enSede ? (
                <CheckCircleIcon size={16} color="#059669" />
              ) : (
                <AlertTriangleIcon size={16} color="#DC2626" />
              )}
            </div>
            <div className="loc-detail-card__body">
              <div className="loc-detail-card__label">DISTANCIA A LA OPERACIÓN</div>
              <div className="loc-detail-card__title">
                <span className={`loc-detail-badge loc-detail-badge--${enSede ? 'ok' : 'alert'}`}>
                  {formattedDist}
                </span>{' '}
                <span className="loc-detail-status-text">
                  {enSede ? 'En sede (dentro del perímetro)' : 'Fuera de sede (distancia lejana)'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
