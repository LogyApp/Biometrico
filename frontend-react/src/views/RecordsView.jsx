import { useEffect, useRef } from 'react';
import { NEW_DESIGN_ENABLED } from '../config/designFlags';
import { getTypeMeta, recordBadge, jornadaStatus, formatDuration, formatElapsed } from '../models/historyModel';
import { formatDateTime, formatDateShort, formatDateLong, formatTimeShort } from '../models/dateUtils';
import { ensureGoogleMaps } from '../services/googleMapsLoader';
import { pulsingMarker } from '../services/mapMarkers';
import { STATIC_MAP_OPTIONS, buildBounds, toGooglePadding, triggerResize } from '../services/mapHelpers';
import ChevronLeftIcon from './icons/ChevronLeftIcon';
import ChevronDownIcon from './icons/ChevronDownIcon';
import LogInIcon from './icons/LogInIcon';
import LogOutIcon from './icons/LogOutIcon';
import NavigationIcon from './icons/NavigationIcon';
import UtensilsIcon from './icons/UtensilsIcon';
import CoffeeIcon from './icons/CoffeeIcon';
import PauseCircleIcon from './icons/PauseCircleIcon';
import SquarePenIcon from './icons/SquarePenIcon';
import ClockIcon from './icons/ClockIcon';
import MapPinIcon from './icons/MapPinIcon';
import SearchIcon from './icons/SearchIcon';
import Building2Icon from './icons/Building2Icon';
import MaterialIcon from './icons/MaterialIcon';
import './RecordsView.css';

const ROLE_COLORS = {
  success: { color: 'var(--color-success)', bg: 'rgba(30,158,90,0.1)' },
  danger: { color: 'var(--color-danger)', bg: 'rgba(214,69,69,0.1)' },
  move: { color: '#7A5FD1', bg: 'rgba(122,95,209,0.12)' },
  manual: { color: '#D97706', bg: 'rgba(217,119,6,0.12)' },
  active: { color: 'var(--color-link)', bg: 'rgba(42,74,143,0.1)' },
  generic: { color: 'var(--color-link)', bg: 'var(--color-card-bg)' },
};

function roleColors(role) {
  return ROLE_COLORS[role] ?? ROLE_COLORS.generic;
}

const TYPE_ICONS = {
  ENTRADA: LogInIcon,
  SALIDA: LogOutIcon,
  MOVIMIENTO_INICIO: NavigationIcon,
  MOVIMIENTO_FIN: NavigationIcon,
  DESTINO_FIJO: NavigationIcon,
  LIBRE: NavigationIcon,
  SEDE: Building2Icon,
  MOVIMIENTO: NavigationIcon,
  ALMUERZO: UtensilsIcon,
  DESAYUNO: CoffeeIcon,
  BREAK: PauseCircleIcon,
  MANUAL: SquarePenIcon,
};

function typeIconFor(tipo) {
  return TYPE_ICONS[tipo] ?? NavigationIcon;
}

function Badge({ label, role }) {
  const { color, bg } = roleColors(role);
  return (
    <span className="records-badge" style={{ color, background: bg }}>
      {label}
    </span>
  );
}

function StatBox({ label, value, color }) {
  return (
    <div className="records-stat">
      <div className="records-stat__label">{label}</div>
      <div className="records-stat__value" style={color ? { color } : undefined}>{value}</div>
    </div>
  );
}

function MarkRow({ rec, expanded, onToggle, onOpenMap, onOpenRoute }) {
  const isMove = rec.tipo_registro === 'movimiento';
  const tipoKey = isMove ? (rec.tipo ?? 'LIBRE') : (rec.tipo ?? 'MANUAL');
  const meta = getTypeMeta(tipoKey);
  const badge = recordBadge(rec);
  const Icon = typeIconFor(tipoKey);
  const time = formatDateTime(rec.fecha_hora);

  return (
    <div className="records-card">
      <button type="button" className="records-card__head" onClick={onToggle}>
        <div className="records-card__icon">
          <Icon color="var(--color-link)" />
        </div>
        <div className="records-card__heading">
          <div className="records-card__title">{meta.label}</div>
          <div className="records-card__time">{time}</div>
        </div>
        {badge && <Badge label={badge.label} role={badge.role} />}
      </button>

      {expanded && (
        <div className="records-card__body">
          {!isMove && rec.tipo === 'ENTRADA' && (
            rec.fecha_salida ? (
              <div className="records-stat-row">
                <StatBox label="HORA SALIDA" value={formatTimeShort(new Date(rec.fecha_salida))} color="var(--color-danger)" />
                <StatBox label="TIEMPO LABORADO" value={formatDuration(rec.fecha_hora, rec.fecha_salida)} />
              </div>
            ) : (
              <StatBox label="EN CURSO — TIEMPO TRANSCURRIDO" value="En curso" color="var(--color-success)" />
            )
          )}

          {!isMove && rec.score != null && (
            <div className="records-stat-row">
              <StatBox
                label="CONFIANZA BIOMÉTRICA"
                value={`${(rec.score * 100).toFixed(1)}%`}
                color={rec.score >= 0.65 ? 'var(--color-success)' : 'var(--color-danger)'}
              />
              {rec.latitud != null && rec.longitud != null && (
                <StatBox label="LATITUD" value={`${rec.latitud.toFixed(6)}°`} />
              )}
            </div>
          )}

          {!isMove && rec.latitud != null && rec.longitud != null && (
            <div className="records-stat-row">
              {rec.score == null && <StatBox label="LATITUD" value={`${rec.latitud.toFixed(6)}°`} />}
              <StatBox label="LONGITUD" value={`${rec.longitud.toFixed(6)}°`} />
            </div>
          )}

          {!isMove && rec.es_manual && rec.motivo && (
            <StatBox label="MOTIVO DEL REGISTRO" value={rec.motivo} />
          )}

          {isMove && (
            <div className="records-stat-row records-stat-row--wrap">
              {rec.duracion_min != null && <StatBox label="DURACIÓN" value={`${rec.duracion_min} min`} />}
              {rec.distancia_km != null && <StatBox label="DISTANCIA REAL" value={`${rec.distancia_km.toFixed(2)} km`} />}
              {rec.vel_max != null && <StatBox label="VEL. MÁXIMA" value={`${rec.vel_max} km/h`} />}
              {rec.vel_prom != null && <StatBox label="VEL. PROMEDIO" value={`${rec.vel_prom} km/h`} />}
            </div>
          )}

          {isMove && rec.dir_destino && (
            <StatBox label="DESTINO PROGRAMADO" value={rec.dir_destino} />
          )}

          {isMove && rec.estado === 'COMPLETADO' && (
            <StatBox label="LLEGÓ AL DESTINO" value={rec.llego ? 'Sí' : 'No'} color={rec.llego ? 'var(--color-success)' : 'var(--color-danger)'} />
          )}

          {!isMove && rec.latitud != null && rec.longitud != null && (
            <button
              type="button"
              className="records-map-btn"
              onClick={() => onOpenMap(rec.latitud, rec.longitud, `Ubicación — ${meta.label}`)}
            >
              <MapPinIcon size={14} color="var(--color-link)" />
              Ver ubicación en mapa
            </button>
          )}

          {isMove && (rec.latitud != null || rec.lat_fin != null) && (
            <button
              type="button"
              className="records-map-btn"
              onClick={() => onOpenRoute(rec)}
            >
              <NavigationIcon size={14} color="var(--color-link)" />
              Ver recorrido en mapa
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function TimeRow({ rec, now, expanded, onToggle }) {
  const entryMs = new Date(rec.fecha_hora).getTime();
  const exitMs = rec.fecha_salida ? new Date(rec.fecha_salida).getTime() : null;
  const status = jornadaStatus(entryMs, exitMs);
  const entryTimeStr = formatTimeShort(new Date(entryMs));
  const exitTimeStr = exitMs ? formatTimeShort(new Date(exitMs)) : null;

  return (
    <div className="records-card">
      <button type="button" className="records-card__head" onClick={onToggle}>
        <div className="records-card__icon">
          <ClockIcon size={16} color="var(--color-link)" />
        </div>
        <div className="records-card__heading">
          <div className="records-card__title">{formatDateShort(new Date(entryMs))}</div>
          <div className="records-card__time">
            {entryTimeStr} → {exitTimeStr ?? <span className="records-card__live">En curso</span>}
          </div>
        </div>
        <Badge label={status.label} role={status.role === 'complete' ? 'success' : status.role === 'partial' ? 'manual' : status.role === 'active' ? 'active' : 'danger'} />
      </button>

      {expanded && (
        <div className="records-card__body">
          <div className="records-stat-row">
            <StatBox label="FECHA ENTRADA" value={formatDateLong(new Date(entryMs))} />
            <StatBox label="HORA ENTRADA" value={entryTimeStr} color="var(--color-success)" />
          </div>
          <div className="records-stat-row">
            <StatBox label="FECHA SALIDA" value={exitMs ? formatDateLong(new Date(exitMs)) : '—'} />
            <StatBox label="HORA SALIDA" value={exitTimeStr ?? '—'} color={exitMs ? 'var(--color-danger)' : undefined} />
          </div>
          {exitMs ? (
            <StatBox label="TIEMPO LABORADO" value={formatDuration(rec.fecha_hora, rec.fecha_salida)} />
          ) : (
            <StatBox label="TIEMPO EN JORNADA — EN CURSO" value={formatElapsed(entryMs, now)} color="var(--color-success)" />
          )}
        </div>
      )}
    </div>
  );
}

const WEEKDAY_SHORT = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatDurationMs(ms) {
  if (!ms || ms <= 0) return '0m';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

function complianceColor(ratio) {
  if (ratio >= 0.9) return 'var(--color-success)';
  if (ratio >= 0.7) return '#D97706';
  return 'var(--color-danger)';
}

function dayHeading(date, today) {
  const weekday = new Intl.DateTimeFormat('es-CO', { weekday: 'long' }).format(date);
  const longDate = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long' }).format(date);
  if (isSameDay(date, today)) return `Hoy · ${weekday} ${longDate}`;
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} · ${longDate}`;
}

function recordVisual(rec, isMove) {
  if (isMove) return { bg: '#fff', border: '#1E9E5A', color: '#1E9E5A', icon: 'near_me' };
  if (rec.tipo === 'ENTRADA') return { bg: '#1E9E5A', border: '#1E9E5A', color: '#fff', icon: 'check' };
  return { bg: '#D97706', border: '#D97706', color: '#fff', icon: 'arrow_upward' };
}

function recordTitle(rec, isMove) {
  if (isMove) return getTypeMeta(rec.tipo ?? 'LIBRE').label;
  if (rec.tipo === 'ENTRADA') return rec.es_manual ? 'Entrada registrada manualmente' : 'Entrada registrada';
  return rec.es_manual ? 'Salida registrada manualmente' : 'Salida registrada';
}

function recordTimeLabel(rec, isMove) {
  const start = formatTimeShort(new Date(rec.fecha_hora));
  if (!isMove) return start;
  if (rec.estado === 'COMPLETADO' && rec.duracion_min != null) {
    const end = new Date(new Date(rec.fecha_hora).getTime() + rec.duracion_min * 60000);
    return `${start} – ${formatTimeShort(end)}`;
  }
  return start;
}

function WeekStrip({ days, selectedDate, onSelect }) {
  return (
    <div className="records-week-strip">
      {days.map((day) => {
        const active = isSameDay(day, selectedDate);
        return (
          <button
            key={day.toISOString()}
            type="button"
            className={`records-week-day${active ? ' records-week-day--active' : ''}`}
            onClick={() => onSelect(day)}
          >
            <span className="records-week-day__label">{WEEKDAY_SHORT[day.getDay()]}</span>
            <span className="records-week-day__num">{day.getDate()}</span>
          </button>
        );
      })}
    </div>
  );
}

function RouteMiniMap({ rec, onOpen }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return undefined;
    const start = rec.latitud != null && rec.longitud != null ? { lat: rec.latitud, lng: rec.longitud } : null;
    const end = rec.lat_fin != null && rec.lng_fin != null ? { lat: rec.lat_fin, lng: rec.lng_fin } : null;
    const points = [start, end].filter(Boolean);
    if (!points.length) return undefined;
    let cancelled = false;

    ensureGoogleMaps().then((maps) => {
      if (cancelled || !containerRef.current) return;
      const map = new maps.Map(containerRef.current, { center: points[0], zoom: 15, ...STATIC_MAP_OPTIONS });

      if (start) pulsingMarker(map, start, '#1E9E5A', { size: 14 });
      if (end) pulsingMarker(map, end, '#D64545', { size: 14 });
      if (points.length > 1) {
        const line = new maps.Polyline({ path: points, strokeColor: '#2a4a8f', strokeWeight: 3, strokeOpacity: 0.7 });
        line.setMap(map);
        map.fitBounds(buildBounds(points), toGooglePadding([18, 18]));
      }

      setTimeout(() => triggerResize(map), 120);
    }).catch(() => {});

    return () => { cancelled = true; };
  }, [rec.latitud, rec.longitud, rec.lat_fin, rec.lng_fin]);

  const hasPoint = rec.latitud != null || rec.lat_fin != null;
  if (!hasPoint) {
    return <div className="records-route-map records-route-map--empty">Sin datos de ubicación</div>;
  }

  return (
    <div className="records-route-map-wrap" onClick={onOpen}>
      <div ref={containerRef} className="records-route-map" />
    </div>
  );
}

function RecordCardNew({ rec, expanded, onToggle, onOpenMap, onOpenRoute }) {
  const isMove = rec.tipo_registro === 'movimiento';
  const visual = recordVisual(rec, isMove);
  const paradas = isMove ? (rec.paradas?.length ?? 0) : 0;

  return (
    <div className="records-card records-card--new">
      <button type="button" className="records-card__head records-card__head--new" onClick={onToggle}>
        <div
          className="records-card__icon records-card__icon--new"
          style={{ background: visual.bg, border: `1.5px solid ${visual.border}` }}
        >
          <MaterialIcon name={visual.icon} size={18} weight={600} color={visual.color} />
        </div>
        <div className="records-card__heading">
          <div className="records-card__time records-card__time--new">{recordTimeLabel(rec, isMove)}</div>
          <div className="records-card__title records-card__title--new">{recordTitle(rec, isMove)}</div>
        </div>
        <span className={`records-card__chevron${expanded ? ' records-card__chevron--open' : ''}`}>
          <ChevronDownIcon size={16} color="var(--color-label)" />
        </span>
      </button>

      {expanded && (
        <div className="records-card__body records-card__body--new">
          {!isMove && (
            <div className="records-verify-box">
              <MaterialIcon name="verified_user" size={16} color="var(--color-link)" />
              <div className="records-verify-box__text">
                <div className="records-verify-box__line">
                  <strong>Método:</strong> {rec.es_manual ? 'Registro manual' : 'Reconocimiento facial · en vivo'}
                </div>
                {rec.score != null && (
                  <div className="records-verify-box__line">
                    <strong>Confianza:</strong> {(rec.score * 100).toFixed(1)}%
                  </div>
                )}
                {rec.latitud != null && rec.longitud != null && (
                  <div className="records-verify-box__line">
                    <strong>Ubicación:</strong> {rec.latitud.toFixed(5)}°, {rec.longitud.toFixed(5)}° · GPS
                  </div>
                )}
              </div>
            </div>
          )}

          {!isMove && rec.tipo === 'ENTRADA' && (
            rec.fecha_salida ? (
              <div className="records-stat-row">
                <StatBox label="HORA SALIDA" value={formatTimeShort(new Date(rec.fecha_salida))} color="var(--color-danger)" />
                <StatBox label="TIEMPO LABORADO" value={formatDuration(rec.fecha_hora, rec.fecha_salida)} />
              </div>
            ) : (
              <StatBox label="EN CURSO — TIEMPO TRANSCURRIDO" value="En curso" color="var(--color-success)" />
            )
          )}

          {!isMove && rec.es_manual && rec.motivo && (
            <div className="records-motivo-box">
              <div className="records-motivo-box__label">MOTIVO REGISTRADO</div>
              <div className="records-motivo-box__value">&quot;{rec.motivo}&quot;</div>
            </div>
          )}

          {!isMove && rec.latitud != null && rec.longitud != null && (
            <button
              type="button"
              className="records-map-btn"
              onClick={() => onOpenMap(rec.latitud, rec.longitud, `Ubicación — ${recordTitle(rec, false)}`)}
            >
              <MapPinIcon size={14} color="var(--color-link)" />
              Ver ubicación en mapa
            </button>
          )}

          {isMove && (
            <>
              <RouteMiniMap rec={rec} onOpen={() => onOpenRoute(rec)} />
              <div className="records-stat-row records-stat-row--wrap">
                {rec.distancia_km != null && <StatBox label="DISTANCIA" value={`${rec.distancia_km.toFixed(1)} km`} />}
                {rec.duracion_min != null && <StatBox label="DURACIÓN" value={`${Math.floor(rec.duracion_min / 60)}h ${String(rec.duracion_min % 60).padStart(2, '0')}m`} />}
                <StatBox label="PARADAS" value={paradas} />
              </div>
              {rec.dir_destino && <StatBox label="DESTINO PROGRAMADO" value={rec.dir_destino} />}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Chip({ label, active, onClick }) {
  return (
    <button type="button" className={`records-chip${active ? ' records-chip--active' : ''}`} onClick={onClick}>
      {label}
    </button>
  );
}

const PERIOD_OPTIONS = [
  { value: 'all', label: 'Todo' },
  { value: 'today', label: 'Hoy' },
  { value: 'week', label: 'Esta semana' },
  { value: 'month', label: 'Este mes' },
];

export default function RecordsView({
  loading,
  error,
  total,
  tab,
  setTab,
  tipoFilter,
  setTipoFilter,
  activePeriod,
  selectPeriod,
  desdeInput,
  hastaInput,
  changeDesde,
  changeHasta,
  records,
  jornadas,
  expandedIds,
  toggleExpanded,
  openMap,
  now,
  onBack,
  onOpenRoute,
  selectedDate,
  selectDate,
  jumpToDate,
  weekDays,
  dayRecords,
  weekTotalMs,
  weekComplianceRatio,
}) {
  const isTiempo = tab === 'tiempo';
  const list = isTiempo ? jornadas : records;
  const dateInputRef = useRef(null);

  if (NEW_DESIGN_ENABLED) {
    const today = new Date();
    const dayJornada = jornadas.find((j) => isSameDay(new Date(j.fecha_hora), selectedDate));

    return (
      <div className="records-screen records-screen--new-design">
        <input
          ref={dateInputRef}
          type="date"
          className="records-date-input-hidden"
          onChange={(e) => jumpToDate(e.target.value)}
        />

        <header className="records-header records-header--new">
          <div className="records-header__top records-header__top--new">
            <button type="button" className="records-back records-back--new" onClick={onBack} aria-label="Volver">
              <ChevronLeftIcon size={20} color="#fff" />
            </button>
            <div className="records-header__title records-header__title--new">Historial</div>
            <button
              type="button"
              className="records-calendar-btn"
              onClick={() => dateInputRef.current?.showPicker?.() ?? dateInputRef.current?.click()}
              aria-label="Elegir fecha"
            >
              <MaterialIcon name="calendar_month" size={18} color="#fff" />
            </button>
          </div>

          <WeekStrip days={weekDays} selectedDate={selectedDate} onSelect={selectDate} />
        </header>

        <div className="records-identity-anchor">
          <div className="records-summary-row">
            <div className="records-summary-card">
              <span className="records-summary-card__icon">
                <MaterialIcon name="schedule" size={16} color="var(--color-link)" />
              </span>
              <div className="records-summary-card__text">
                <div className="records-summary-card__label">TIEMPO LABORADO</div>
                <div className="records-summary-card__value">{formatDurationMs(weekTotalMs)}</div>
              </div>
            </div>

            {weekComplianceRatio != null && (
              <div className="records-summary-card">
                <span className="records-summary-card__icon">
                  <MaterialIcon name="verified" size={16} fill={1} color={complianceColor(weekComplianceRatio)} />
                </span>
                <div className="records-summary-card__text">
                  <div className="records-summary-card__label">DÍAS COMPLETOS</div>
                  <div className="records-summary-card__value" style={{ color: complianceColor(weekComplianceRatio) }}>
                    {Math.round(weekComplianceRatio * 100)}%
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="records-body records-body--new">
          <div className="records-segmented">
            <button
              type="button"
              className={`records-segmented__btn${!isTiempo ? ' records-segmented__btn--active' : ''}`}
              onClick={() => setTab('marcaciones')}
            >
              Marcaciones
            </button>
            <button
              type="button"
              className={`records-segmented__btn${isTiempo ? ' records-segmented__btn--active' : ''}`}
              onClick={() => setTab('tiempo')}
            >
              Tiempo laborado
            </button>
          </div>

          <div className="records-day-heading">{dayHeading(selectedDate, today)}</div>

          {loading && <div className="records-empty"><div className="records-spinner" /><span>Cargando…</span></div>}

          {!loading && error && (
            <div className="records-empty"><span>Error: {error}</span></div>
          )}

          {!loading && !error && !isTiempo && dayRecords.length === 0 && (
            <div className="records-empty">
              <SearchIcon size={36} color="var(--color-label)" />
              <span>Sin registros este día</span>
            </div>
          )}

          {!loading && !error && !isTiempo && dayRecords.map((rec, i) => (
            <RecordCardNew
              key={`${rec.tipo_registro}-${rec.id}-${rec.tipo}-${i}`}
              rec={rec}
              expanded={expandedIds.has(`${rec.tipo_registro}-${rec.id}-${rec.tipo}-${i}`)}
              onToggle={() => toggleExpanded(`${rec.tipo_registro}-${rec.id}-${rec.tipo}-${i}`)}
              onOpenMap={openMap}
              onOpenRoute={onOpenRoute}
            />
          ))}

          {!loading && !error && isTiempo && !dayJornada && (
            <div className="records-empty">
              <SearchIcon size={36} color="var(--color-label)" />
              <span>Sin jornada este día</span>
            </div>
          )}

          {!loading && !error && isTiempo && dayJornada && (
            <TimeRow
              rec={dayJornada}
              now={now}
              expanded={expandedIds.has(`jornada-${dayJornada.id}`)}
              onToggle={() => toggleExpanded(`jornada-${dayJornada.id}`)}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="records-screen">
      <header className="records-header">
        <div className="records-header__top">
          <button type="button" className="records-back" onClick={onBack} aria-label="Volver">
            <ChevronLeftIcon size={20} color="var(--color-link)" />
          </button>
          <div className="records-header__title">Historial de registros</div>
          <span className="records-header__count">{total} registros</span>
        </div>

        <div className="records-tabs">
          <button
            type="button"
            className={`records-tab${!isTiempo ? ' records-tab--active' : ''}`}
            onClick={() => setTab('marcaciones')}
          >
            MARCACIONES
          </button>
          <button
            type="button"
            className={`records-tab${isTiempo ? ' records-tab--active' : ''}`}
            onClick={() => setTab('tiempo')}
          >
            TIEMPO LABORADO
          </button>
        </div>
      </header>

      <div className="records-body">
        <div className="records-field">
          <div className="records-field__label">TIPO DE EVENTO</div>
          <div className="records-select-wrap">
            <select
              className="records-select"
              value={tipoFilter}
              onChange={(e) => setTipoFilter(e.target.value)}
            >
              <option value="all">Todos los eventos</option>
              <option value="entrada">Entrada</option>
              <option value="salida">Salida</option>
              <option value="movimiento">Movimiento</option>
              <option value="manual">Manual</option>
            </select>
            <span className="records-select__chevron"><ChevronDownIcon size={14} color="var(--color-label)" /></span>
          </div>
        </div>

        <div className="records-date-row">
          <div className="records-field">
            <div className="records-field__label">DESDE</div>
            <input
              type="date"
              className="records-date-input"
              value={desdeInput}
              onChange={(e) => changeDesde(e.target.value)}
            />
          </div>
          <div className="records-field">
            <div className="records-field__label">HASTA</div>
            <input
              type="date"
              className="records-date-input"
              value={hastaInput}
              onChange={(e) => changeHasta(e.target.value)}
            />
          </div>
        </div>

        <div className="records-chips">
          {PERIOD_OPTIONS.map((opt) => (
            <Chip key={opt.value} label={opt.label} active={activePeriod === opt.value} onClick={() => selectPeriod(opt.value)} />
          ))}
        </div>

        <div className="records-count-line">{list.length} de {total} registros</div>

        {loading && <div className="records-empty"><div className="records-spinner" /><span>Cargando…</span></div>}

        {!loading && error && (
          <div className="records-empty"><span>Error: {error}</span></div>
        )}

        {!loading && !error && total === 0 && (
          <div className="records-empty"><span>Aún no hay registros</span></div>
        )}

        {!loading && !error && total > 0 && list.length === 0 && (
          <div className="records-empty">
            <SearchIcon size={36} color="var(--color-label)" />
            <span>{isTiempo ? 'Sin jornadas en el período seleccionado' : 'Sin registros con los filtros seleccionados'}</span>
          </div>
        )}

        {!loading && !error && !isTiempo && records.map((rec, i) => (
          <MarkRow
            key={`${rec.tipo_registro}-${rec.id}-${rec.tipo}-${i}`}
            rec={rec}
            expanded={expandedIds.has(`${rec.tipo_registro}-${rec.id}-${rec.tipo}-${i}`)}
            onToggle={() => toggleExpanded(`${rec.tipo_registro}-${rec.id}-${rec.tipo}-${i}`)}
            onOpenMap={openMap}
            onOpenRoute={onOpenRoute}
          />
        ))}

        {!loading && !error && isTiempo && jornadas.map((rec, i) => (
          <TimeRow
            key={`jornada-${rec.id}-${i}`}
            rec={rec}
            now={now}
            expanded={expandedIds.has(`jornada-${rec.id}-${i}`)}
            onToggle={() => toggleExpanded(`jornada-${rec.id}-${i}`)}
          />
        ))}
      </div>
    </div>
  );
}
