import { useEffect, useRef } from 'react';
import ChevronLeftIcon from './icons/ChevronLeftIcon';
import MapPinIcon from './icons/MapPinIcon';
import { ensureGoogleMaps } from '../services/googleMapsLoader';
import { pulsingMarker } from '../services/mapMarkers';
import { INTERACTIVE_MAP_OPTIONS, triggerResize } from '../services/mapHelpers';
import './LocationDetailView.css';

export default function LocationDetailView({ mapTarget, onBack }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    if (!mapContainerRef.current || !mapTarget) return;
    let cancelled = false;
    const overlays = [];
    const center = { lat: mapTarget.lat, lng: mapTarget.lng };

    ensureGoogleMaps().then((maps) => {
      if (cancelled || !mapContainerRef.current) return;
      const map = new maps.Map(mapContainerRef.current, {
        center,
        zoom: 16,
        ...INTERACTIVE_MAP_OPTIONS,
        zoomControl: true,
      });

      overlays.push(pulsingMarker(map, center, '#2A4A8F', { size: 22 }));

      const circle = new maps.Circle({
        center,
        radius: 30,
        strokeColor: '#2A4A8F',
        strokeWeight: 1,
        fillColor: '#2A4A8F',
        fillOpacity: 0.12,
      });
      circle.setMap(map);
      overlays.push(circle);

      mapRef.current = map;
      setTimeout(() => triggerResize(map), 50);
    }).catch(() => {});

    return () => {
      cancelled = true;
      overlays.forEach((o) => o.setMap(null));
      mapRef.current = null;
    };
  }, [mapTarget?.lat, mapTarget?.lng]);

  return (
    <div className="loc-detail-screen">
      <header className="loc-detail-header">
        <button type="button" className="loc-detail-back" onClick={onBack} aria-label="Volver">
          <ChevronLeftIcon size={20} color="var(--color-link)" />
        </button>
        <div className="loc-detail-header__title">{mapTarget?.label ?? 'Ubicación del registro'}</div>
      </header>

      <div ref={mapContainerRef} className="loc-detail-map" />

      <div className="loc-detail-cards">
        <div className="loc-detail-card">
          <div className="loc-detail-card__icon">
            <MapPinIcon size={16} color="#2A4A8F" />
          </div>
          <div className="loc-detail-card__body">
            <div className="loc-detail-card__label">DIRECCIÓN</div>
            <div className="loc-detail-card__title">
              {mapTarget?.addressStatus === 'ready'
                ? mapTarget.address
                : mapTarget?.addressStatus === 'error'
                ? 'Dirección no disponible'
                : 'Ubicando dirección…'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
