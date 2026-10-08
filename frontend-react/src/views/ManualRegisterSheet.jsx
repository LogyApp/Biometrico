import { useEffect, useRef } from 'react';
import { NEW_DESIGN_ENABLED } from '../config/designFlags';
import { ensureGoogleMaps } from '../services/googleMapsLoader';
import { pulsingMarker } from '../services/mapMarkers';
import { STATIC_MAP_OPTIONS, triggerResize } from '../services/mapHelpers';
import CloseIcon from './icons/CloseIcon';
import SquarePenIcon from './icons/SquarePenIcon';
import MapPinIcon from './icons/MapPinIcon';
import CalendarIcon from './icons/CalendarIcon';
import MaterialIcon from './icons/MaterialIcon';
import { formatDateTime } from '../models/dateUtils';
import './ManualRegisterSheet.css';

const TIPO_LABEL = { ENTRADA: 'Entrada', SALIDA: 'Salida', MOVIMIENTO: 'Movimiento' };

function addressLabel(locationStatus, addressStatus, address) {
  if (locationStatus === 'error') return 'Ubicación no disponible';
  if (locationStatus === 'loading') return 'Obteniendo ubicación…';
  if (addressStatus === 'loading') return 'Ubicando dirección…';
  if (addressStatus === 'ready') return address;
  return 'Dirección no disponible';
}

function ManualLocationMap({ location }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!location || !containerRef.current) return undefined;
    let cancelled = false;
    const center = { lat: location.lat, lng: location.lng };

    ensureGoogleMaps().then((maps) => {
      if (cancelled || !containerRef.current) return;
      const map = new maps.Map(containerRef.current, { center, zoom: 16, ...STATIC_MAP_OPTIONS });
      pulsingMarker(map, center, '#2a4a8f', { size: 16 });
      setTimeout(() => triggerResize(map), 120);
    }).catch(() => {});

    return () => { cancelled = true; };
  }, [location?.lat, location?.lng]);

  if (!location) {
    return (
      <div className="manual-register-map manual-register-map--empty">
        <MaterialIcon name="location_off" size={22} color="var(--color-subtext)" />
        <span>Ubicación no disponible</span>
      </div>
    );
  }

  return (
    <div className="manual-register-map-wrap">
      <div ref={containerRef} className="manual-register-map" />
      {location.accuracy != null && (
        <span className="manual-register-map__gps">GPS ±{location.accuracy}m</span>
      )}
    </div>
  );
}

export default function ManualRegisterSheet({
  open,
  actionTipo,
  title = 'Registro manual',
  subtitle = 'Se registrará sin verificación biométrica',
  submitLabel = 'Confirmar registro',
  motivo,
  updateMotivo,
  onSubmit,
  onClose,
  locationStatus,
  address,
  addressStatus,
  location,
  now,
}) {
  if (!open) return null;

  const tipoClass = actionTipo === 'SALIDA' ? 'manual-register-tipo--danger' : 'manual-register-tipo--success';

  if (NEW_DESIGN_ENABLED) {
    return (
      <div className="manual-register-screen">
        <header className="manual-register-header">
          <div className="manual-register-header__brand">
            <span className="manual-register-header__mark"><SquarePenIcon size={17} color="#D97706" /></span>
            <div>
              <div className="manual-register-header__title">{title}</div>
              <div className="manual-register-header__subtitle">Requiere motivo · queda marcado para auditoría</div>
            </div>
          </div>
          <button type="button" className="manual-register-header__close" onClick={onClose} aria-label="Cerrar">
            <MaterialIcon name="close" size={16} color="var(--color-subtext)" />
          </button>
        </header>

        <div className="manual-register-body">
          {(actionTipo === 'ENTRADA' || actionTipo === 'SALIDA') && (
            <div className="manual-register-segmented">
              <span className={`manual-register-segmented__btn${actionTipo === 'ENTRADA' ? ' manual-register-segmented__btn--active' : ''}`}>
                Entrada
              </span>
              <span className={`manual-register-segmented__btn${actionTipo === 'SALIDA' ? ' manual-register-segmented__btn--active' : ''}`}>
                Salida
              </span>
            </div>
          )}

          <div className="manual-register-card">
            <span className="manual-register-card__icon"><MapPinIcon size={16} color="var(--color-link)" strokeWidth={1.8} /></span>
            <div className="manual-register-card__text">
              <span className="manual-register-card__label">DIRECCIÓN DETECTADA</span>
              <span className="manual-register-card__value">{addressLabel(locationStatus, addressStatus, address)}</span>
            </div>
          </div>

          <div className="manual-register-card">
            <span className="manual-register-card__icon"><CalendarIcon /></span>
            <div className="manual-register-card__text">
              <span className="manual-register-card__label">FECHA Y HORA</span>
              <span className="manual-register-card__value">{formatDateTime(now)}</span>
            </div>
          </div>

          <ManualLocationMap location={location} />

          <div className="manual-register-field">
            <label className="manual-register-field__label" htmlFor="manual-motivo">Motivo (obligatorio)</label>
            <textarea
              id="manual-motivo"
              className="manual-register-textarea"
              placeholder="Ej: Falla en cámara del dispositivo. Solicito registro manual."
              maxLength={512}
              value={motivo}
              onChange={(e) => updateMotivo(e.target.value)}
            />
            <span className="manual-register-field__counter">{motivo.length}/512</span>
          </div>

          <div className="manual-register-warning">
            <MaterialIcon name="info" size={16} color="#D97706" />
            <span className="manual-register-warning__text">
              El registro manual no debe ser tu forma habitual de marcar. Úsalo solo cuando exista una falla real con la cámara o el dispositivo.
              Si estas fallas se repiten seguido, contacta al equipo de soporte.
            </span>
          </div>
        </div>

        <div className="manual-register-footer">
          <button type="button" className="manual-register-submit" onClick={onSubmit}>
            {submitLabel}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="manual-register-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="manual-register-sheet">
        <div className="manual-register-sheet__handle" />
        <div className="manual-register-sheet__header">
          <div className="manual-register-sheet__brand">
            <span className="manual-register-sheet__brand-mark"><SquarePenIcon size={17} color="var(--color-link)" /></span>
            <div>
              <div className="manual-register-sheet__title">{title}</div>
              <div className="manual-register-sheet__subtitle">{subtitle}</div>
            </div>
          </div>
          <button type="button" className="manual-register-sheet__close" onClick={onClose} aria-label="Cerrar">
            <CloseIcon size={13} />
          </button>
        </div>

        <div className="manual-register-sheet__body">
          <div className={`manual-register-tipo ${tipoClass}`}>
            <span>Vas a registrar</span>
            <strong>{TIPO_LABEL[actionTipo] ?? actionTipo}</strong>
          </div>

          <div className="manual-register-info">
            <span className="manual-register-info__icon"><MapPinIcon size={16} color="var(--color-link)" strokeWidth={1.8} /></span>
            <div className="manual-register-info__text">
              <span className="manual-register-info__label">Dirección</span>
              <span className="manual-register-info__value">{addressLabel(locationStatus, addressStatus, address)}</span>
            </div>
          </div>

          <div className="manual-register-info">
            <span className="manual-register-info__icon"><CalendarIcon /></span>
            <div className="manual-register-info__text">
              <span className="manual-register-info__label">Fecha y hora</span>
              <span className="manual-register-info__value">{formatDateTime(now)}</span>
            </div>
          </div>

          <div className="manual-register-field">
            <label className="manual-register-field__label" htmlFor="manual-motivo">Motivo</label>
            <textarea
              id="manual-motivo"
              className="manual-register-textarea"
              placeholder="Ej: Falla en cámara del dispositivo. Solicito registro manual."
              maxLength={512}
              value={motivo}
              onChange={(e) => updateMotivo(e.target.value)}
            />
            <span className="manual-register-field__counter">{motivo.length}/512</span>
          </div>

          <button type="button" className="manual-register-submit" onClick={onSubmit}>
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
