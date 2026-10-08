import { useEffect, useRef } from 'react';
import ChevronLeftIcon from './icons/ChevronLeftIcon';
import ChevronRightIcon from './icons/ChevronRightIcon';
import MapPinIcon from './icons/MapPinIcon';
import ClockIcon from './icons/ClockIcon';
import NavigationIcon from './icons/NavigationIcon';
import PlusIcon from './icons/PlusIcon';
import CloseIcon from './icons/CloseIcon';
import { ensureGoogleMaps } from '../services/googleMapsLoader';
import { pulsingMarker } from '../services/mapMarkers';
import { INTERACTIVE_MAP_OPTIONS, buildBounds, toGooglePadding, dashedLineOptions, triggerResize } from '../services/mapHelpers';
import './MovementDestinoView.css';

function splitAddress(displayName) {
  if (!displayName) return { primary: '', secondary: '' };
  const parts = displayName.split(',').map((p) => p.trim()).filter(Boolean);
  return {
    primary: parts[0] ?? displayName,
    secondary: parts.slice(1, 4).join(', '),
  };
}

function StopRow({ index, isLast, isActive, stop, searchQuery, onFocus, onChange, onRemove, canRemove, placeholder }) {
  return (
    <div className={`move-dest-stoprow${isActive ? ' move-dest-stoprow--active' : ''}`}>
      <div className="move-dest-stoprow__marker">
        {isLast ? (
          <MapPinIcon size={16} color="#7A5FD1" strokeWidth={2.2} />
        ) : (
          <span className="move-dest-stoprow__num">{index + 1}</span>
        )}
      </div>
      <input
        type="text"
        className="move-dest-stoprow__input"
        placeholder={placeholder}
        value={isActive ? searchQuery : stop?.address ?? ''}
        onFocus={onFocus}
        onChange={onChange}
      />
      {canRemove && (
        <button type="button" className="move-dest-stoprow__remove" onClick={onRemove} aria-label="Quitar parada">
          <CloseIcon size={11} color="var(--color-subtext)" />
        </button>
      )}
    </div>
  );
}

export default function MovementDestinoView({
  location,
  originAddress,
  stops,
  activeIndex,
  focusStop,
  addStop,
  removeStop,
  canAddStop,
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
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const stopMarkersRef = useRef([]);
  const routeLineRef = useRef(null);

  useEffect(() => {
    if (!mapContainerRef.current || !location) return;
    let cancelled = false;

    ensureGoogleMaps().then((maps) => {
      if (cancelled || !mapContainerRef.current) return;
      const map = new maps.Map(mapContainerRef.current, {
        center: { lat: location.lat, lng: location.lng },
        zoom: 15,
        ...INTERACTIVE_MAP_OPTIONS,
      });

      pulsingMarker(map, { lat: location.lat, lng: location.lng }, '#2A4A8F');
      map.addListener('click', (e) => pickPoint(e.latLng.lat(), e.latLng.lng()));

      mapRef.current = map;
      setTimeout(() => triggerResize(map), 50);
    }).catch(() => {});

    return () => {
      cancelled = true;
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location?.lat, location?.lng]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    stopMarkersRef.current.forEach((m) => m.remove());
    stopMarkersRef.current = [];

    const resolved = stops.filter(Boolean);
    resolved.forEach((s, i) => {
      const isFinal = i === resolved.length - 1;
      const marker = pulsingMarker(map, { lat: s.lat, lng: s.lng }, '#7A5FD1', isFinal ? { size: 22 } : { size: 22, label: i + 1 });
      stopMarkersRef.current.push(marker);
    });
  }, [stops]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (routeLineRef.current) {
      routeLineRef.current.setMap(null);
      routeLineRef.current = null;
    }
    if (route?.coords?.length) {
      const path = route.coords.map(([lat, lng]) => ({ lat, lng }));
      routeLineRef.current = new google.maps.Polyline({
        path,
        ...dashedLineOptions({ color: '#1B2A5E', opacity: 0.65, weight: 5 }),
      });
      routeLineRef.current.setMap(map);
      map.fitBounds(buildBounds(path), toGooglePadding([90, 40]));
    }
  }, [route]);

  const hasAnyStop = stops.some(Boolean);
  const showResults = searchQuery.trim().length >= 3;

  return (
    <div className="move-dest-screen">
      <header className="move-dest-header">
        <button type="button" className="move-dest-back" onClick={onBack} aria-label="Volver">
          <ChevronLeftIcon size={20} color="var(--color-link)" />
        </button>
        <div className="move-dest-header__title">Seleccionar destino</div>
        <div className="move-dest-header__badge">
          <MapPinIcon size={13} color="var(--color-link)" />
          <span>Destino fijo</span>
        </div>
      </header>

      <div className="move-dest-map-wrap">
        <div ref={mapContainerRef} className="move-dest-map" />

        <div className="move-dest-search-card">
          <div className="move-dest-origin-row">
            <span className="move-dest-origin-row__dot" />
            <span className="move-dest-origin-row__text">{originAddress ?? 'Obteniendo tu ubicación…'}</span>
          </div>

          <div className="move-dest-stoprow-list">
            {stops.map((stop, i) => (
              <StopRow
                key={i}
                index={i}
                isLast={i === stops.length - 1}
                isActive={i === activeIndex}
                stop={stop}
                searchQuery={searchQuery}
                onFocus={() => focusStop(i)}
                onChange={(e) => changeSearchQuery(e.target.value)}
                onRemove={() => removeStop(i)}
                canRemove={stops.length > 1}
                placeholder={i === stops.length - 1 ? 'Buscar destino…' : `Parada ${i + 1}`}
              />
            ))}
          </div>

          {canAddStop && (
            <button type="button" className="move-dest-add-stop" onClick={addStop}>
              <PlusIcon size={14} color="var(--color-link)" strokeWidth={2.4} />
              Agregar parada
            </button>
          )}

          {showResults && (
            <div className="move-dest-results">
              {searchLoading ? (
                <div className="move-dest-results__status">Buscando…</div>
              ) : searchResults.length > 0 ? (
                searchResults.map((r, i) => {
                  const { primary, secondary } = splitAddress(r.display_name);
                  return (
                    <button type="button" key={i} className="move-dest-result" onClick={() => selectSearchResult(r)}>
                      <span className="move-dest-result__icon"><MapPinIcon size={14} color="#7A5FD1" /></span>
                      <span className="move-dest-result__text">
                        <span className="move-dest-result__primary">{primary}</span>
                        {secondary && <span className="move-dest-result__secondary">{secondary}</span>}
                      </span>
                    </button>
                  );
                })
              ) : (
                <div className="move-dest-results__status">Sin resultados</div>
              )}
            </div>
          )}
        </div>

        {!hasAnyStop && (
          <div className="move-dest-hint">
            <MapPinIcon size={14} color="#fff" />
            <span>Toca el mapa para fijar el destino</span>
          </div>
        )}
      </div>

      <div className="move-dest-body">
        {hasAnyStop && (
          <div className="move-dest-route-row">
            <div className="move-dest-route-box">
              <NavigationIcon size={14} color="var(--color-link)" />
              <span>{routeLoading ? '—' : route ? `${route.distKm} km` : '—'}</span>
            </div>
            <div className="move-dest-route-box">
              <ClockIcon size={14} color="var(--color-link)" />
              <span>{routeLoading ? '—' : route ? `~${route.timeMin} min` : '—'}</span>
            </div>
          </div>
        )}

        {hasAnyStop && (
          <button
            type="button"
            className={`move-dest-toggle${!canRequiereRegreso ? ' move-dest-toggle--disabled' : ''}`}
            onClick={toggleRequiereRegreso}
            disabled={!canRequiereRegreso}
            aria-pressed={requiereRegreso}
          >
            <span className="move-dest-toggle__label">
              {canRequiereRegreso
                ? '¿Regresarás a este mismo punto?'
                : 'Regreso disponible solo con un destino único'}
            </span>
            <span className={`move-dest-toggle__switch${requiereRegreso ? ' move-dest-toggle__switch--on' : ''}`}>
              <span className="move-dest-toggle__knob" />
            </span>
          </button>
        )}

        {error && <div className="move-dest-error">{error}</div>}

        {hasAnyStop ? (
          <button
            type="button"
            className="move-dest-confirm"
            onClick={confirm}
            disabled={starting || !stops[stops.length - 1]}
          >
            {starting ? 'Iniciando…' : requiereRegreso ? 'Iniciar ida y vuelta' : 'Iniciar con este destino'}
            <ChevronRightIcon size={16} color="#fff" />
          </button>
        ) : (
          <p className="move-dest-empty-hint">Toca el mapa para seleccionar un punto o busca una dirección</p>
        )}
      </div>
    </div>
  );
}
