import { useEffect, useRef } from 'react';
import { NEW_DESIGN_ENABLED } from '../config/designFlags';
import { ensureGoogleMaps } from '../services/googleMapsLoader';
import { pulsingMarker } from '../services/mapMarkers';
import { STATIC_MAP_OPTIONS, buildBounds, toGooglePadding, dashedLineOptions, triggerResize } from '../services/mapHelpers';
import ChevronLeftIcon from './icons/ChevronLeftIcon';
import ChevronRightIcon from './icons/ChevronRightIcon';
import MapPinIcon from './icons/MapPinIcon';
import NavigationIcon from './icons/NavigationIcon';
import Building2Icon from './icons/Building2Icon';
import MaterialIcon from './icons/MaterialIcon';
import './MovementChoiceView.css';

function DestinoMapDecoration() {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return undefined;
    let cancelled = false;
    ensureGoogleMaps().then((maps) => {
      if (cancelled || !containerRef.current) return;
      const center = { lat: 4.6486, lng: -74.0925 };
      const map = new maps.Map(containerRef.current, { center, zoom: 15, ...STATIC_MAP_OPTIONS });
      pulsingMarker(map, center, '#2a4a8f', { size: 16 });
      setTimeout(() => triggerResize(map), 120);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return <div ref={containerRef} className="move-choice-grid-card__map" />;
}

function LibreMapDecoration() {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return undefined;
    let cancelled = false;
    const points = [
      { lat: 4.6512, lng: -74.0955 },
      { lat: 4.6498, lng: -74.0932 },
      { lat: 4.6486, lng: -74.0925 },
      { lat: 4.6470, lng: -74.0908 },
    ];
    ensureGoogleMaps().then((maps) => {
      if (cancelled || !containerRef.current) return;
      const map = new maps.Map(containerRef.current, { center: points[2], zoom: 14, ...STATIC_MAP_OPTIONS });
      const line = new maps.Polyline({ path: points, strokeColor: '#2a4a8f', strokeWeight: 3, strokeOpacity: 0.8 });
      line.setMap(map);
      pulsingMarker(map, points[0], '#1E9E5A', { size: 8 });
      pulsingMarker(map, points[points.length - 1], '#D64545', { size: 8 });
      map.fitBounds(buildBounds(points), toGooglePadding([12, 12]));
      setTimeout(() => triggerResize(map), 120);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return <div ref={containerRef} className="move-choice-grid-card__map" />;
}

function SedesMapDecoration() {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return undefined;
    let cancelled = false;
    const sedeA = { lat: 4.6486, lng: -74.0925 };
    const sedeB = { lat: 4.6555, lng: -74.0835 };
    ensureGoogleMaps().then((maps) => {
      if (cancelled || !containerRef.current) return;
      const map = new maps.Map(containerRef.current, { center: { lat: 4.65205, lng: -74.088 }, zoom: 12, ...STATIC_MAP_OPTIONS });
      const buildingLabel = '<span class="material-symbols-rounded" style="font-size:12px;line-height:1;">apartment</span>';
      pulsingMarker(map, sedeA, '#0F1B3D', { size: 22, label: buildingLabel });
      pulsingMarker(map, sedeB, '#0F1B3D', { size: 22, label: buildingLabel });
      const line = new maps.Polyline({
        path: [sedeA, sedeB],
        ...dashedLineOptions({ color: '#8A8FA3', opacity: 0.7, weight: 2 }),
      });
      line.setMap(map);
      map.fitBounds(buildBounds([sedeA, sedeB]), toGooglePadding([16, 16]));
      setTimeout(() => triggerResize(map), 120);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return <div ref={containerRef} className="move-choice-grid-card__map" />;
}

function MoveGridCard({ icon, title, desc, tip, mapDecoration, onClick, disabled, comingSoon, fullWidth, className }) {
  return (
    <button
      type="button"
      className={`move-choice-grid-card${fullWidth ? ' move-choice-grid-card--full' : ''}${comingSoon ? ' move-choice-grid-card--muted' : ''}${className ? ` ${className}` : ''}`}
      onClick={onClick}
      disabled={disabled || comingSoon}
    >
      <div className="move-choice-grid-card__head">
        <div className="move-choice-grid-card__icon">{icon}</div>
        {comingSoon ? (
          <span className="move-choice-card__badge">Próximamente</span>
        ) : (
          <MaterialIcon name="chevron_right" size={16} color="var(--color-label)" />
        )}
      </div>
      <div className="move-choice-grid-card__title">{title}</div>
      <div className="move-choice-grid-card__desc">{desc}</div>
      {mapDecoration}
      <div className="move-choice-grid-card__tip">
        <MaterialIcon name="lightbulb" size={13} color="var(--color-link)" />
        <span className="move-choice-grid-card__tip-text">{tip}</span>
      </div>
    </button>
  );
}

function MoveOptionCard({ icon, title, desc, onClick, disabled, comingSoon }) {
  return (
    <button type="button" className="move-choice-card" onClick={onClick} disabled={disabled || comingSoon}>
      <div className={`move-choice-card__icon${comingSoon ? ' move-choice-card__icon--muted' : ''}`}>{icon}</div>
      <div className="move-choice-card__info">
        <div className="move-choice-card__title">{title}</div>
        <div className="move-choice-card__desc">{desc}</div>
      </div>
      {comingSoon ? (
        <span className="move-choice-card__badge">Próximamente</span>
      ) : (
        <ChevronRightIcon size={16} color="var(--color-label)" />
      )}
    </button>
  );
}

export default function MovementChoiceView({ starting, error, selectLibre, selectDestino, selectSedes, onCancel, onOpenTour }) {
  if (NEW_DESIGN_ENABLED) {
    return (
      <div className="move-choice-screen move-choice-screen--new-design">
        <header className="move-choice-header">
          <button type="button" className="move-choice-back" onClick={onCancel} aria-label="Cancelar">
            <MaterialIcon name="chevron_left" size={20} color="#fff" />
          </button>
          <div className="move-choice-header__title">Registrar Movimiento</div>
          <button type="button" className="move-choice-close" onClick={onOpenTour} aria-label="Ayuda">
            <MaterialIcon name="help" size={16} color="#fff" />
          </button>
        </header>

        <div className="move-choice-body">
          <p className="move-choice-sub">¿A dónde vas? Elige cómo quieres registrar tu desplazamiento.</p>

          <div className="move-choice-grid">
            <MoveGridCard
              className="move-choice-grid-card--destino"
              icon={<MaterialIcon name="location_on" size={20} color="rgb(0, 31, 71)" />}
              title="Ir a un destino"
              desc="Fija el punto exacto en el mapa. Se calcula ruta y tiempo estimado."
              tip="Ideal para entregas o diligencias con dirección conocida."
              mapDecoration={<DestinoMapDecoration />}
              onClick={selectDestino}
              disabled={starting}
            />

            <MoveGridCard
              className="move-choice-grid-card--libre"
              icon={<MaterialIcon name="near_me" size={20} color="rgb(0, 31, 71)" />}
              title="Navegación libre"
              desc="Sin destino fijo. Se registra tu recorrido completo en tiempo real."
              tip="Ideal para rutas con varias paradas o destinos variables."
              mapDecoration={<LibreMapDecoration />}
              onClick={selectLibre}
              disabled={starting}
            />
          </div>

          <MoveGridCard
            className="move-choice-grid-card--sedes"
            icon={<MaterialIcon name="apartment" size={20} color="rgb(0, 31, 71)" />}
            title="Traslado entre sedes"
            desc="Registra tu traslado permanente a otra sede o punto de trabajo."
            tip="Elige la sede a la que te trasladas de la lista de sedes."
            mapDecoration={<SedesMapDecoration />}
            onClick={selectSedes}
            disabled={starting}
            fullWidth
          />

          {starting && (
            <div className="move-choice-status">
              <div className="move-choice-spinner" />
              <span>Iniciando movimiento…</span>
            </div>
          )}

          {error && <div className="move-choice-error">{error}</div>}

          <button type="button" className="move-choice-cancel" onClick={onCancel} disabled={starting}>
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="move-choice-screen">
      <header className="move-choice-header">
        <button type="button" className="move-choice-back" onClick={onCancel} aria-label="Cancelar">
          <ChevronLeftIcon size={20} color="var(--color-link)" />
        </button>
        <div className="move-choice-header__title">Registrar Movimiento</div>
      </header>

      <div className="move-choice-body">
        <p className="move-choice-sub">¿A dónde vas? Elige cómo quieres registrar tu desplazamiento.</p>

        <MoveOptionCard
          icon={<MapPinIcon size={22} color="#7A5FD1" />}
          title="Ir a un destino"
          desc="Fija el punto exacto en el mapa. Se calcula ruta y tiempos estimados."
          onClick={selectDestino}
          disabled={starting}
        />

        <MoveOptionCard
          icon={<NavigationIcon size={22} color="#1E9E5A" />}
          title="Navegación libre"
          desc="Sin destino fijo. Se registra el recorrido completo en tiempo real."
          onClick={selectLibre}
          disabled={starting}
        />

        <MoveOptionCard
          icon={<Building2Icon size={22} color="#D97706" />}
          title="Traslado entre sedes"
          desc="Registra tu traslado permanente a otra sede o punto de trabajo."
          comingSoon
        />

        {starting && (
          <div className="move-choice-status">
            <div className="move-choice-spinner" />
            <span>Iniciando movimiento…</span>
          </div>
        )}

        {error && <div className="move-choice-error">{error}</div>}

        <button type="button" className="move-choice-cancel" onClick={onCancel} disabled={starting}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
