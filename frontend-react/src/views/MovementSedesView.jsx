import { useEffect, useRef } from 'react';
import { ensureGoogleMaps } from '../services/googleMapsLoader';
import { pulsingMarker } from '../services/mapMarkers';
import { STATIC_MAP_OPTIONS, buildBounds, toGooglePadding, dashedLineOptions, triggerResize } from '../services/mapHelpers';
import MaterialIcon from './icons/MaterialIcon';
import StatusBlurOverlay from './shared/StatusBlurOverlay';
import './MovementSedesView.css';

function SedeRow({ sede, selected, onClick }) {
  return (
    <button
      type="button"
      className={`move-sedes-row${selected ? ' move-sedes-row--selected' : ''}`}
      onClick={onClick}
    >
      <span className="move-sedes-row__icon">
        <MaterialIcon name="apartment" size={18} color={selected ? '#fff' : 'rgb(0, 31, 71)'} />
      </span>
      <span className="move-sedes-row__text">
        <span className="move-sedes-row__lugar">{sede.lugar}</span>
        <span className="move-sedes-row__regional">{sede.regional}</span>
      </span>
      <MaterialIcon name="chevron_right" size={16} color="var(--color-label)" />
    </button>
  );
}

function RouteMapPreview({ location, selected, route }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || !location || !selected) return undefined;
    let cancelled = false;
    const overlays = [];

    ensureGoogleMaps().then((maps) => {
      if (cancelled || !containerRef.current) return;
      const map = new maps.Map(containerRef.current, STATIC_MAP_OPTIONS);

      const origin = { lat: location.lat, lng: location.lng };
      const destino = { lat: selected.latitud, lng: selected.longitud };
      overlays.push(pulsingMarker(map, origin, '#1E9E5A', { size: 16 }));
      overlays.push(pulsingMarker(map, destino, '#0F1B3D', {
        size: 22,
        label: '<span class="material-symbols-rounded" style="font-size:12px;line-height:1;">apartment</span>',
      }));

      if (route?.coords?.length) {
        const path = route.coords.map(([lat, lng]) => ({ lat, lng }));
        const line = new maps.Polyline({
          path,
          strokeColor: '#1B2A5E',
          ...dashedLineOptions({ color: '#1B2A5E', opacity: 0.7, weight: 4 }),
        });
        line.setMap(map);
        overlays.push(line);
        map.fitBounds(buildBounds(path), toGooglePadding([24, 24]));
      } else {
        map.fitBounds(buildBounds([origin, destino]), toGooglePadding([24, 24]));
      }

      mapRef.current = map;
      setTimeout(() => triggerResize(map), 80);
    }).catch(() => {});

    return () => {
      cancelled = true;
      overlays.forEach((o) => o.setMap(null));
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location?.lat, location?.lng, selected?.id, route]);

  return <div ref={containerRef} className="move-sedes-map" />;
}

export default function MovementSedesView({
  loading,
  loadError,
  sedeGroups,
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
}) {
  return (
    <div className="move-sedes-screen">
      <header className="move-sedes-header">
        <div className="move-sedes-header__circle move-sedes-header__circle--1" />
        <div className="move-sedes-header__circle move-sedes-header__circle--2" />
        <button
          type="button"
          className="move-sedes-back"
          onClick={selected ? clearSelected : onBack}
          aria-label="Volver"
        >
          <MaterialIcon name="chevron_left" size={20} color="#fff" />
        </button>
        <div className="move-sedes-header__title">Traslado entre sedes</div>
        <span className="move-sedes-header__badge">
          <MaterialIcon name="apartment" size={14} color="#fff" />
        </span>
      </header>

      {!selected && (
        <div className="move-sedes-search-wrap">
          <div className="move-sedes-search">
            <MaterialIcon name="search" size={16} color="var(--color-subtext)" />
            <input
              type="text"
              className="move-sedes-search__input"
              placeholder="Buscar sede o regional…"
              value={query}
              onChange={(e) => changeQuery(e.target.value)}
            />
          </div>
        </div>
      )}

      {!selected && (
        <div className="move-sedes-list">
          {loading && <div className="move-sedes-status">Cargando sedes…</div>}

          {!loading && loadError && <div className="move-sedes-status move-sedes-status--error">{loadError}</div>}

          {!loading && !loadError && sedeGroups.length === 0 && (
            <div className="move-sedes-status">
              {query.trim()
                ? 'No se encontraron sedes con ese criterio.'
                : 'Aún no hay sedes disponibles para tu regional. Contacta a tu supervisor.'}
            </div>
          )}

          {!loading && sedeGroups.map((group) => (
            <div key={group.regional} className="move-sedes-group">
              <div className="move-sedes-group__label">{group.regional}</div>
              {group.sedes.map((sede) => (
                <SedeRow key={sede.id} sede={sede} selected={selected?.id === sede.id} onClick={() => selectSede(sede)} />
              ))}
            </div>
          ))}
        </div>
      )}

      {selected && (
        <div className="move-sedes-confirm">
          <div className="move-sedes-selected-card">
            <span className="move-sedes-selected-card__icon">
              <MaterialIcon name="apartment" size={22} color="#fff" />
            </span>
            <div className="move-sedes-selected-card__text">
              <div className="move-sedes-selected-card__lugar">{selected.lugar}</div>
              <div className="move-sedes-selected-card__regional">{selected.regional}</div>
            </div>
          </div>

          <div className="move-sedes-route-row">
            <div className="move-sedes-route-box">
              <MaterialIcon name="near_me" size={16} color="rgb(0, 31, 71)" />
              <span className="move-sedes-route-box__value">{routeLoading ? '—' : route ? `${route.distKm} km` : '—'}</span>
              <span className="move-sedes-route-box__label">Distancia</span>
            </div>
            <div className="move-sedes-route-box">
              <MaterialIcon name="schedule" size={16} color="rgb(0, 31, 71)" />
              <span className="move-sedes-route-box__value">{routeLoading ? '—' : route ? `~${route.timeMin} min` : '—'}</span>
              <span className="move-sedes-route-box__label">Tiempo est.</span>
            </div>
          </div>

          <RouteMapPreview location={location} selected={selected} route={route} />

          <div className="move-sedes-notice">
            <MaterialIcon name="info" size={14} color="#D97706" />
            <span>Este traslado quedará registrado como un cambio de sede de trabajo.</span>
          </div>

          {error && <div className="move-sedes-error">{error}</div>}

          <button type="button" className="move-sedes-confirm-btn" onClick={askConfirm} disabled={checkingOrigen}>
            {checkingOrigen ? 'Verificando ubicación…' : `Iniciar traslado a ${selected.lugar}`}
            {!checkingOrigen && <MaterialIcon name="chevron_right" size={16} color="#fff" />}
          </button>
        </div>
      )}

      {originAlert && (
        <StatusBlurOverlay
          icon={<MaterialIcon name="location_off" size={28} fill={1} color="#D97706" />}
          title="No pareces estar en una sede"
          subtitle={
            originAlert.distanciaKm != null
              ? `Estás a ${originAlert.distanciaKm.toFixed(2)} km de ${originAlert.sedeCercana ?? 'la sede más cercana'}. Puedes continuar, pero esto quedará registrado junto con el traslado.`
              : 'No pudimos confirmar que estés en una sede. Puedes continuar, pero esto quedará registrado junto con el traslado.'
          }
          tone="warning"
          retryLabel="Sí, continuar"
          onRetry={proceedDespiteOriginAlert}
          secondaryLabel="Cancelar"
          onSecondary={dismissOriginAlert}
          secondaryVariant="button"
        />
      )}

      {confirmOpen && (
        <StatusBlurOverlay
          icon={<MaterialIcon name="apartment" size={28} fill={1} color="#D97706" />}
          title="¿Confirmas tu traslado?"
          subtitle={`Vas a registrar tu traslado a ${selected?.lugar} (${selected?.regional}). Este movimiento queda marcado como un cambio de sede.`}
          tone="warning"
          retryLabel="Confirmar"
          onRetry={confirm}
          secondaryLabel="Cancelar"
          onSecondary={dismissConfirm}
          secondaryVariant="button"
        />
      )}
    </div>
  );
}
