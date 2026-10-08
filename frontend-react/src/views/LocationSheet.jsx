import { useEffect, useRef } from 'react';
import CloseIcon from './icons/CloseIcon';
import { ensureGoogleMaps } from '../services/googleMapsLoader';
import { pulsingMarker } from '../services/mapMarkers';
import { INTERACTIVE_MAP_OPTIONS, triggerResize } from '../services/mapHelpers';
import './LocationSheet.css';

export default function LocationSheet({ open, location, address, title = 'Tu ubicación actual', onClose }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    if (!open || !location || !mapContainerRef.current) return;
    let cancelled = false;
    const overlays = [];
    const center = { lat: location.lat, lng: location.lng };

    ensureGoogleMaps().then((maps) => {
      if (cancelled || !mapContainerRef.current) return;
      const map = new maps.Map(mapContainerRef.current, { center, zoom: 16, ...INTERACTIVE_MAP_OPTIONS });

      overlays.push(pulsingMarker(map, center, '#2a4a8f'));

      const circle = new maps.Circle({
        center,
        radius: location.accuracy ?? 30,
        strokeColor: '#2a4a8f',
        strokeWeight: 1,
        fillColor: '#2a4a8f',
        fillOpacity: 0.12,
      });
      circle.setMap(map);
      overlays.push(circle);

      mapRef.current = map;
      setTimeout(() => triggerResize(map), 260);
    }).catch(() => {});

    return () => {
      cancelled = true;
      overlays.forEach((o) => o.setMap(null));
      mapRef.current = null;
    };
  }, [open, location?.lat, location?.lng, location?.accuracy]);

  if (!open) return null;

  return (
    <div
      className="location-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="location-sheet">
        <div className="location-sheet__handle" />
        <div className="location-sheet__header">
          <h2 className="location-sheet__title">{title}</h2>
          <button type="button" className="location-sheet__close" onClick={onClose} aria-label="Cerrar">
            <CloseIcon size={14} />
          </button>
        </div>
        <div ref={mapContainerRef} className="location-sheet__map" />
        <div className="location-sheet__address">{address}</div>
      </div>
    </div>
  );
}
