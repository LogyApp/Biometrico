import MaterialIcon from './icons/MaterialIcon';
import StatusBlurOverlay from './shared/StatusBlurOverlay';
import { hasFixedDestination } from '../models/movementModel';
import './MovementResultModal.css';

function StatRow({ label, value, valueColor }) {
  return (
    <div className="movement-result__row">
      <span className="movement-result__row-label">{label}</span>
      <span className="movement-result__row-value" style={valueColor ? { color: valueColor } : undefined}>
        {value}
      </span>
    </div>
  );
}

export default function MovementResultModal({ result, onDismiss }) {
  const isFijo = hasFixedDestination(result.tipo);
  const isRoundTrip = isFijo && !!result.movement?.requiereRegreso;

  const title = isRoundTrip
    ? '¡Ida y vuelta completada!'
    : result.llegoDestino
    ? '¡Destino alcanzado!'
    : 'Movimiento completado';

  const tipoLabel = result.tipo === 'SEDE' ? 'Traslado de sede' : isFijo ? 'Destino fijo' : 'Navegación libre';

  const subtitle = isRoundTrip
    ? 'Regresaste al punto de partida exitosamente'
    : result.llegoDestino
    ? result.tipo === 'SEDE'
      ? 'Llegaste a tu nueva sede exitosamente'
      : 'Llegaste al punto de destino exitosamente'
    : `${tipoLabel} registrado exitosamente`;

  return (
    <StatusBlurOverlay
      icon={<MaterialIcon name="check_circle" size={30} fill={1} color="#1E9E5A" />}
      title={title}
      subtitle={subtitle}
      tone="success"
      retryLabel="Entendido"
      onRetry={onDismiss}
    >
      <div className="movement-result__stats">
        <StatRow label="Duración" value={`${result.duracion_min} min`} />
        <StatRow label="Distancia recorrida" value={`${result.distancia_real_km} km`} valueColor="#1E9E5A" />
        <StatRow label="Puntos GPS" value={`${result.total_waypoints}`} />
        <StatRow label="Vel. máxima" value={`${result.velocidad_max_kmh} km/h`} />
        <StatRow label="Vel. promedio" value={`${result.velocidad_prom_kmh} km/h`} />
        {result.tiempo_en_destino_min != null && (
          <StatRow label="Tiempo en destino" value={`${result.tiempo_en_destino_min} min`} />
        )}
        {isFijo && result.movement?.destino?.routeCoords && (
          <StatRow label="Ruta planeada" value="Calculada con OSRM" />
        )}
      </div>
    </StatusBlurOverlay>
  );
}
