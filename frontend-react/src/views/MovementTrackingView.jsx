import { useEffect, useRef } from 'react';
import { NEW_DESIGN_ENABLED } from '../config/designFlags';
import CloseIcon from './icons/CloseIcon';
import MapPinIcon from './icons/MapPinIcon';
import MaterialIcon from './icons/MaterialIcon';
import StatusBlurOverlay from './shared/StatusBlurOverlay';
import MovementResultModal from './MovementResultModal';
import { ensureGoogleMaps } from '../services/googleMapsLoader';
import { pulsingMarker } from '../services/mapMarkers';
import { INTERACTIVE_MAP_OPTIONS, dashedLineOptions, triggerResize } from '../services/mapHelpers';
import './MovementTrackingView.css';

const LEG_LABELS = {
  outbound: 'DESTINO FIJO',
  dwelling: 'EN EL DESTINO',
  return: 'DE REGRESO',
};

const LEG_LABELS_SEDE = {
  outbound: 'TRASLADO DE SEDE',
  dwelling: 'EN LA SEDE',
  return: 'DE REGRESO',
};

const LEG_LABELS_NEW = {
  outbound: 'DESTINO FIJO · EN CURSO',
  dwelling: 'EN EL DESTINO',
  return: 'DE REGRESO',
};

const LEG_LABELS_SEDE_NEW = {
  outbound: 'TRASLADO DE SEDE · EN CURSO',
  dwelling: 'EN LA SEDE',
  return: 'DE REGRESO',
};

export default function MovementTrackingView({
  tipo,
  isFijo,
  isRoundTrip,
  leg,
  destino,
  elapsedLabel,
  dwellElapsedLabel,
  currentPos,
  speedKmh,
  totalDistKm,
  distToDestKm,
  waypointCount,
  gpsError,
  retryGps,
  finishing,
  finishError,
  retryFinish,
  requestFinish,
  confirmFinishOpen,
  cancelFinish,
  confirmFinish,
  result,
  dismissResult,
  permissionPrompt,
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const traceRef = useRef(null);
  const posMarkerRef = useRef(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;
    let cancelled = false;

    ensureGoogleMaps().then((maps) => {
      if (cancelled || !mapContainerRef.current) return;
      const map = new maps.Map(mapContainerRef.current, {
        center: { lat: currentPos.lat, lng: currentPos.lng },
        zoom: 16,
        ...INTERACTIVE_MAP_OPTIONS,
      });

      traceRef.current = new maps.Polyline({ path: [], strokeColor: '#F15A22', strokeWeight: 5, strokeOpacity: 0.9 });
      traceRef.current.setMap(map);
      posMarkerRef.current = pulsingMarker(map, { lat: currentPos.lat, lng: currentPos.lng }, '#2A4A8F');

      if (isFijo && destino) {
        pulsingMarker(map, { lat: destino.lat, lng: destino.lng }, '#7A5FD1', { size: 22 });
        destino.paradas?.forEach((p, i) => {
          pulsingMarker(map, { lat: p.lat, lng: p.lng }, '#7A5FD1', { size: 22, label: i + 1 });
        });
        if (destino.routeCoords?.length) {
          const path = destino.routeCoords.map(([lat, lng]) => ({ lat, lng }));
          const routeLine = new maps.Polyline({
            path,
            ...dashedLineOptions({ color: '#1B2A5E', opacity: 0.5, weight: 5 }),
          });
          routeLine.setMap(map);
        }
      }

      mapRef.current = map;
      setTimeout(() => triggerResize(map), 50);
    }).catch(() => {});

    return () => {
      cancelled = true;
      traceRef.current?.setMap(null);
      posMarkerRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const pos = { lat: currentPos.lat, lng: currentPos.lng };
    posMarkerRef.current?.setLatLng(pos);
    traceRef.current?.getPath().push(new google.maps.LatLng(pos.lat, pos.lng));
    map.panTo(pos);
  }, [currentPos.lat, currentPos.lng]);

  if (NEW_DESIGN_ENABLED) {
    const dwelling = isFijo && isRoundTrip && leg === 'dwelling';
    const infoLabel = !isFijo ? 'RECORRIDO' : leg === 'dwelling' || leg === 'return' ? 'ESTADO' : 'DESTINO';
    const infoValue = !isFijo
      ? 'Ruta libre en curso — sin destino fijado'
      : leg === 'dwelling'
      ? 'En el destino — detectaremos tu regreso automáticamente al alejarte.'
      : leg === 'return'
      ? 'Regresando al punto de partida…'
      : destino?.address ?? 'Destino fijo';

    return (
      <div className="move-track-screen move-track-screen--new-design">
        <header className="move-track-header">
          <div className="move-track-header__circle move-track-header__circle--1" />
          <div className="move-track-header__circle move-track-header__circle--2" />
          <button type="button" className="move-track-back" onClick={requestFinish} aria-label="Finalizar movimiento">
            <MaterialIcon name="chevron_left" size={20} color="#fff" />
          </button>
          <div className="move-track-header__info">
            <div className="move-track-header__status">
              <span className="move-track-header__dot" />
              {isFijo ? (tipo === 'SEDE' ? LEG_LABELS_SEDE_NEW[leg] : LEG_LABELS_NEW[leg]) : 'NAVEGACIÓN LIBRE · EN CURSO'}
            </div>
            <div className="move-track-header__timer">{elapsedLabel}</div>
          </div>
          <div className="move-track-header__dist">
            <span className="move-track-header__dist-val">{totalDistKm.toFixed(2)}</span>
            <span className="move-track-header__dist-unit">km recorridos</span>
          </div>
        </header>

        <div className="move-track-map-wrap">
          <div ref={mapContainerRef} className="move-track-map" />
          <span className="move-track-gps-pill">
            <span className="move-track-gps-pill__dot" />
            GPS activo
          </span>
        </div>

        <div className="move-track-body">
          <div className="move-track-stats">
            <div className="move-track-stat">
              <div className="move-track-stat__label">VELOCIDAD</div>
              <div className="move-track-stat__value">{speedKmh.toFixed(0)} <span>km/h</span></div>
            </div>
            {dwelling ? (
              <div className="move-track-stat move-track-stat--highlight">
                <div className="move-track-stat__label">TIEMPO EN EL PUNTO</div>
                <div className="move-track-stat__value">{dwellElapsedLabel ?? '00:00:00'}</div>
              </div>
            ) : (
              <div className="move-track-stat move-track-stat--highlight">
                <div className="move-track-stat__label">{isFijo ? (leg === 'return' ? 'AL PUNTO DE PARTIDA' : 'AL DESTINO') : 'DISTANCIA'}</div>
                <div className="move-track-stat__value">{(isFijo ? distToDestKm ?? 0 : totalDistKm).toFixed(2)} <span>km</span></div>
              </div>
            )}
            <div className="move-track-stat">
              <div className="move-track-stat__label">PUNTOS GPS</div>
              <div className="move-track-stat__value">{waypointCount}</div>
            </div>
          </div>

          <div className="move-track-destino">
            <span className="move-track-destino__icon">
              <MaterialIcon name="place" size={16} color="rgb(0, 31, 71)" />
            </span>
            <div className="move-track-destino__text">
              <div className="move-track-destino__label">{infoLabel}</div>
              <div className="move-track-destino__value">{infoValue}</div>
            </div>
          </div>

          <button type="button" className="move-track-finish" onClick={requestFinish} disabled={finishing}>
            <MaterialIcon name="close" size={14} color="#D64545" />
            {finishing ? 'Guardando…' : 'Finalizar movimiento'}
          </button>
        </div>

        {result && <MovementResultModal result={result} onDismiss={dismissResult} />}

        {confirmFinishOpen ? (
          <StatusBlurOverlay
            icon={<MaterialIcon name="warning" size={28} fill={1} color="#D97706" />}
            title="¿Finalizar movimiento?"
            subtitle="Se guardará el recorrido completo con todos los datos de trayecto registrados hasta ahora."
            tone="warning"
            retryLabel="Finalizar"
            onRetry={confirmFinish}
            secondaryLabel="Cancelar"
            onSecondary={cancelFinish}
            secondaryVariant="button"
          />
        ) : permissionPrompt ? (
          <StatusBlurOverlay
            icon={<MaterialIcon name="location_on" size={28} fill={1} color="rgb(0, 31, 71)" />}
            title="Necesitamos tu ubicación"
            subtitle="La usamos para hacer seguimiento de tu recorrido en tiempo real."
            tone="neutral"
            retryLabel={permissionPrompt.requesting ? 'Solicitando…' : 'Permitir acceso'}
            onRetry={permissionPrompt.onAllow}
            secondaryLabel="Ahora no"
            onSecondary={permissionPrompt.onDismiss}
          />
        ) : finishError ? (
          <StatusBlurOverlay
            icon={<MaterialIcon name="warning" size={28} fill={1} color="#D64545" />}
            title="No se pudo guardar el recorrido"
            subtitle="Tus datos de trayecto siguen disponibles en el dispositivo. Intenta de nuevo."
            tone="error"
            onRetry={retryFinish}
          />
        ) : gpsError ? (
          <StatusBlurOverlay
            icon={<MaterialIcon name="location_off" size={28} fill={1} color="#D64545" />}
            title="Sin señal GPS"
            subtitle="Verifica que la ubicación esté activada e intenta de nuevo."
            tone="error"
            onRetry={retryGps}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="move-track-screen">
      <header className="move-track-header">
        <div>
          <div className="move-track-header__label">
            {isFijo ? (tipo === 'SEDE' ? LEG_LABELS_SEDE[leg] : LEG_LABELS[leg]) : 'NAVEGACIÓN LIBRE'}
          </div>
          <div className="move-track-header__timer">{elapsedLabel}</div>
        </div>
        <div className="move-track-header__dist">
          <span className="move-track-header__dist-val">{totalDistKm.toFixed(2)}</span>
          <span className="move-track-header__dist-unit"> km</span>
        </div>
      </header>

      <div ref={mapContainerRef} className="move-track-map" />

      <div className="move-track-body">
        <div className="move-track-stats">
          <div className="move-track-stat">
            <div className="move-track-stat__label">VELOCIDAD</div>
            <div className="move-track-stat__value">{speedKmh.toFixed(0)} <span>km/h</span></div>
          </div>
          {isFijo && isRoundTrip && leg === 'dwelling' ? (
            <div className="move-track-stat">
              <div className="move-track-stat__label">TIEMPO EN EL PUNTO</div>
              <div className="move-track-stat__value">{dwellElapsedLabel ?? '00:00:00'}</div>
            </div>
          ) : (
            <div className="move-track-stat">
              <div className="move-track-stat__label">{isFijo ? (leg === 'return' ? 'AL PUNTO DE PARTIDA' : 'AL DESTINO') : 'DISTANCIA'}</div>
              <div className="move-track-stat__value">{(isFijo ? distToDestKm ?? 0 : totalDistKm).toFixed(2)} <span>km</span></div>
            </div>
          )}
          <div className="move-track-stat">
            <div className="move-track-stat__label">PUNTOS GPS</div>
            <div className="move-track-stat__value">{waypointCount}</div>
          </div>
        </div>

        <div className="move-track-info">
          <MapPinIcon size={16} color="#7A5FD1" />
          <span>
            {!isFijo
              ? 'Ruta libre en curso — sin destino fijado'
              : leg === 'dwelling'
              ? 'En el destino — detectaremos tu regreso automáticamente al alejarte.'
              : leg === 'return'
              ? 'Regresando al punto de partida…'
              : destino?.address ?? 'Destino fijo'}
          </span>
        </div>

        <button type="button" className="move-track-finish" onClick={requestFinish} disabled={finishing}>
          <CloseIcon size={14} color="var(--color-danger)" />
          {finishing ? 'Guardando…' : 'Finalizar movimiento'}
        </button>
      </div>

      {result && <MovementResultModal result={result} onDismiss={dismissResult} />}

      {confirmFinishOpen ? (
        <StatusBlurOverlay
          icon={<MaterialIcon name="warning" size={28} fill={1} color="#D97706" />}
          title="¿Finalizar movimiento?"
          subtitle="Se guardará el recorrido completo con todos los datos de trayecto registrados hasta ahora."
          tone="warning"
          retryLabel="Finalizar"
          onRetry={confirmFinish}
          secondaryLabel="Cancelar"
          onSecondary={cancelFinish}
          secondaryVariant="button"
        />
      ) : permissionPrompt ? (
        <StatusBlurOverlay
          icon={<MaterialIcon name="location_on" size={28} fill={1} color="rgb(0, 31, 71)" />}
          title="Necesitamos tu ubicación"
          subtitle="La usamos para hacer seguimiento de tu recorrido en tiempo real."
          tone="neutral"
          retryLabel={permissionPrompt.requesting ? 'Solicitando…' : 'Permitir acceso'}
          onRetry={permissionPrompt.onAllow}
          secondaryLabel="Ahora no"
          onSecondary={permissionPrompt.onDismiss}
        />
      ) : finishError ? (
        <StatusBlurOverlay
          icon={<MaterialIcon name="warning" size={28} fill={1} color="#D64545" />}
          title="No se pudo guardar el recorrido"
          subtitle="Tus datos de trayecto siguen disponibles en el dispositivo. Intenta de nuevo."
          tone="error"
          onRetry={retryFinish}
        />
      ) : gpsError ? (
        <StatusBlurOverlay
          icon={<MaterialIcon name="location_off" size={28} fill={1} color="#D64545" />}
          title="Sin señal GPS"
          subtitle="Verifica que la ubicación esté activada e intenta de nuevo."
          tone="error"
          onRetry={retryGps}
        />
      ) : null}
    </div>
  );
}
