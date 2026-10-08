import { useEffect, useRef, useState } from 'react';
import { NEW_DESIGN_ENABLED } from '../config/designFlags';
import { getDisplayName } from '../models/nameUtils';
import { getGreeting, formatTimeShort, formatDateShort } from '../models/dateUtils';
import { ATTENDANCE_STATUS, attendanceStatusLabel } from '../models/attendanceModel';
import { getTypeMeta, recordBadge } from '../models/historyModel';
import UserIcon from './icons/UserIcon';
import MaterialIcon from './icons/MaterialIcon';
import CircleHelpIcon from './icons/CircleHelpIcon';
import ClipboardIcon from './icons/ClipboardIcon';
import ClipboardCheckIcon from './icons/ClipboardCheckIcon';
import PencilIcon from './icons/PencilIcon';
import IconClockSmall from './icons/IconClockSmall';
import IconVerified from './icons/IconVerified';
import IconCameraOff from './icons/IconCameraOff';
import IconPin from './icons/IconPin';
import IconRefresh from './icons/IconRefresh';
import IconMap from './icons/IconMap';
import IconHome from './icons/IconHome';
import IconList from './icons/IconList';
import IconLogout from './icons/IconLogout';
import IconNav from './icons/IconNav';
import BrandMark from './shared/BrandMark';
import LocationSheet from './LocationSheet';
import ManualRegisterSheet from './ManualRegisterSheet';
import ReportNoveltySheet from './ReportNoveltySheet';
import StatusBlurOverlay from './shared/StatusBlurOverlay';
import './HomeView.css';

function MapsLink({ coords }) {
  if (!coords) return null;
  return (
    <a
      className="home-time-card__maps"
      href={`https://www.google.com/maps?q=${coords.lat},${coords.lng}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Ver ubicación del registro en Google Maps"
    >
      <MaterialIcon name="location_on" size={13} fill={1} color="#D64545" />
      Maps
    </a>
  );
}

const OTHER_DEVICES_TOAST_MS = 4000;
const OTHER_DEVICES_EXIT_MS = 260;

// Aviso informativo, no bloqueante: sube desde abajo, se va solo a los ~4 s.
// Si se toca antes, abre una mini ventana con el detalle hasta que se cierre.
function OtherDevicesToast({ devices, onDone }) {
  const [phase, setPhase] = useState('visible');
  const [detailOpen, setDetailOpen] = useState(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (detailOpen) return undefined;
    const timer = setTimeout(() => setPhase('leaving'), OTHER_DEVICES_TOAST_MS);
    return () => clearTimeout(timer);
  }, [detailOpen]);

  useEffect(() => {
    if (phase !== 'leaving') return undefined;
    const timer = setTimeout(() => onDoneRef.current(), OTHER_DEVICES_EXIT_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  const count = devices.length;
  const leaving = phase === 'leaving';

  return (
    <div className={`home-devices-toast-layer${leaving ? ' home-devices-toast-layer--leaving' : ''}`}>
      {detailOpen && (
        <div className="home-devices-popover" role="dialog" aria-label="Dispositivo conectado">
          <div className="home-devices-popover__title">
            <MaterialIcon name="devices" size={16} color="rgb(0, 31, 71)" />
            {count === 1 ? 'Dispositivo conectado' : `${count} dispositivos conectados`}
          </div>
          {devices.map((d, i) => (
            <div className="home-devices-popover__item" key={d.key}>
              {count > 1 && <span className="home-devices-popover__label">DISPOSITIVO {i + 1}</span>}
              <span className="home-devices-popover__row">
                <span className="home-devices-popover__key">Última actividad</span>
                <span className="home-devices-popover__value">
                  {formatTimeShort(new Date(d.last_activity))} · {formatDateShort(new Date(d.last_activity))}
                </span>
              </span>
              <span className="home-devices-popover__row">
                <span className="home-devices-popover__key">Sede</span>
                <span className="home-devices-popover__value">{d.sede ?? 'Sin marcación en una sede'}</span>
              </span>
            </div>
          ))}
          <button type="button" className="home-devices-popover__close" onClick={() => setPhase('leaving')}>
            Entendido
          </button>
        </div>
      )}

      {!detailOpen && (
        <button type="button" className="home-devices-toast" onClick={() => { if (!leaving) setDetailOpen(true); }}>
          <span className="home-devices-toast__icon">
            <MaterialIcon name="devices" size={17} color="#fff" />
          </span>
          <span className="home-devices-toast__text">
            <span className="home-devices-toast__title">
              {count === 1 ? 'Tu cuenta está abierta en otro dispositivo' : `Tu cuenta está abierta en ${count} dispositivos más`}
            </span>
            <span className="home-devices-toast__sub">Toca para ver el detalle</span>
          </span>
        </button>
      )}
    </div>
  );
}

function NoveltyLine({ onReport }) {
  return (
    <div className="home-time-card__novelty">
      <span>¿Desea reportar alguna novedad?</span>
      <button type="button" className="home-time-card__novelty-link" onClick={onReport}>
        Reportar
      </button>
    </div>
  );
}

function TabItem({ icon, label, active, onClick, className }) {
  return (
    <button
      type="button"
      className={`home-tab${active ? ' home-tab--active' : ''}${className ? ` ${className}` : ''}`}
      onClick={onClick}
    >
      <span className="home-tab__icon-wrap">{icon}</span>
      <span className={`home-tab__label${active ? ' home-tab__label--active' : ''}`}>{label}</span>
    </button>
  );
}

function TabBar({ onRegistros, onMovimiento, onAyuda, onLogout, onProfile, movimientoLoading }) {
  if (NEW_DESIGN_ENABLED) {
    return (
      <div className="home-tabbar">
        <TabItem icon={<MaterialIcon name="home" size={21} fill={1} weight={600} color="var(--color-link)" />} label="Inicio" active />
        <TabItem icon={<MaterialIcon name="history" size={21} weight={300} color="#A6ACC0" />} label="Registros" onClick={onRegistros} className="home-tab--registros" />
        <TabItem
          icon={movimientoLoading ? <span className="home-inline-spinner" style={{ color: '#A6ACC0' }} /> : <MaterialIcon name="near_me" size={21} weight={300} color="#A6ACC0" />}
          label="Movimiento"
          onClick={onMovimiento}
          className="home-tab--movimiento"
        />
        <TabItem icon={<MaterialIcon name="person" size={21} weight={300} color="#A6ACC0" />} label="Perfil" onClick={onProfile} className="home-tab--perfil" />
      </div>
    );
  }

  return (
    <div className="home-tabbar">
      <TabItem icon={<IconHome active />} label="Inicio" active />
      <TabItem icon={<IconList />} label="Registros" onClick={onRegistros} className="home-tab--registros" />

      <div className="home-tab home-tab--movimiento">
        <button type="button" className="home-tab__movimiento-btn" onClick={onMovimiento} aria-label="Movimiento">
          <span className="home-tab__movimiento-ring" />
          <span className="home-tab__movimiento-circle"><IconNav /></span>
        </button>
        <span className="home-tab__label home-tab__label--movimiento">Movimiento</span>
      </div>

      <TabItem icon={<CircleHelpIcon size={20} color="#A6ACC0" />} label="Ayuda" onClick={onAyuda} className="home-tab--ayuda" />
      <TabItem icon={<IconLogout />} label="Salir" onClick={onLogout} className="home-tab--logout" />
    </div>
  );
}

const RECENT_RECORD_ICONS = {
  ENTRADA: 'login',
  SALIDA: 'logout',
  MOVIMIENTO_INICIO: 'login',
  MOVIMIENTO_FIN: 'flag',
  DESTINO_FIJO: 'place',
  LIBRE: 'near_me',
  SEDE: 'apartment',
  MOVIMIENTO: 'near_me',
};

function recentRecordIcon(tipo) {
  return RECENT_RECORD_ICONS[tipo] ?? 'near_me';
}

const DAY_STATUS_TEXT = {
  [ATTENDANCE_STATUS.NONE]: 'Sin registrar',
  [ATTENDANCE_STATUS.ACTIVE]: 'Turno en curso',
  [ATTENDANCE_STATUS.COMPLETE]: 'Jornada completa',
  [ATTENDANCE_STATUS.PARTIAL]: 'Jornada parcial',
  [ATTENDANCE_STATUS.INCOMPLETE]: 'Jornada incompleta',
};

const DAY_STATUS_ICON = {
  [ATTENDANCE_STATUS.NONE]: 'radio_button_unchecked',
  [ATTENDANCE_STATUS.ACTIVE]: 'bolt',
  [ATTENDANCE_STATUS.COMPLETE]: 'check_circle',
  [ATTENDANCE_STATUS.PARTIAL]: 'warning',
  [ATTENDANCE_STATUS.INCOMPLETE]: 'pending',
};

const DAY_STATUS_COLOR = {
  [ATTENDANCE_STATUS.NONE]: 'var(--color-subtext)',
  [ATTENDANCE_STATUS.ACTIVE]: 'rgb(0, 31, 71)',
  [ATTENDANCE_STATUS.COMPLETE]: '#1E9E5A',
  [ATTENDANCE_STATUS.PARTIAL]: '#D97706',
  [ATTENDANCE_STATUS.INCOMPLETE]: 'var(--color-danger)',
};

function elapsedParts(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [
    [String(h).padStart(2, '0'), 'h'],
    [String(m).padStart(2, '0'), 'm'],
    [String(s).padStart(2, '0'), 's'],
  ];
}

function locationText(addressStatus, address, locationStatus) {
  if (locationStatus === 'error') return 'Ubicación no disponible';
  if (locationStatus === 'loading') return 'Obteniendo ubicación…';
  if (addressStatus === 'loading') return 'Ubicando dirección…';
  if (addressStatus === 'ready') return address;
  return 'Dirección no disponible';
}

export default function HomeView({
  now,
  worker,
  sessionBlocked,
  dismissSessionBlock,
  otherDevices,
  dismissOtherDevices,
  attendanceStatus,
  actionTipo,
  entryTimeMs,
  exitTimeMs,
  entryCoords,
  exitCoords,
  attendanceLoading,
  registeredToday,
  lastPhoto,
  location,
  locationStatus,
  address,
  addressStatus,
  handleLocationAction,
  mapSheetOpen,
  closeMapSheet,
  logoutError,
  dismissLogoutError,
  logoutConfirmOpen,
  dismissLogoutConfirm,
  confirmLogout,
  locationRetryAlert,
  locationRetrying,
  locationPendingFor,
  dismissLocationRetryAlert,
  retryLocationAndContinue,
  longShiftAlert,
  dismissLongShiftAlert,
  loggingOut,
  handleLogout,
  handleFastExit,
  handleActionButton,
  manualSheetOpen,
  openManualSheet,
  closeManualSheet,
  manualMotivo,
  updateManualMotivo,
  manualError,
  dismissManualError,
  submitManual,
  noveltySheetOpen,
  noveltyTipo,
  openNoveltySheet,
  closeNoveltySheet,
  noveltyText,
  updateNoveltyText,
  noveltySubmitting,
  submitNovelty,
  noveltyResult,
  dismissNoveltyResult,
  handleTabRegistros,
  handleTabMovimiento,
  movementAlert,
  dismissMovementAlert,
  handleTabAyuda,
  onOpenProfile,
  permissionPrompt,
  avatarUrl,
  onAvatarError,
  workTimer,
  elapsedDisplayMs,
  recentRecords,
  recentRecordsLoading,
  failedSyncCount,
  retryFailedSync,
  retryingFailedSync,
  offlineReady = true,
  onStartDownload,
}) {
  if (sessionBlocked) {
    return (
      <div className="home-screen">
        <StatusBlurOverlay
          icon={<MaterialIcon name="warning" size={28} fill={1} color="#D64545" />}
          title="Cuenta activa en otro dispositivo"
          subtitle="Esta cuenta ya tiene una sesión abierta en otro dispositivo. Contacta a tu supervisor para reasignarlo."
          tone="error"
          secondaryLabel="Entendido"
          onSecondary={dismissSessionBlock}
        />
      </div>
    );
  }

  const isActive = attendanceStatus === ATTENDANCE_STATUS.ACTIVE;
  const hasRecords = attendanceStatus !== ATTENDANCE_STATUS.NONE;
  const statusLabel = attendanceStatusLabel(attendanceStatus);
  const STATUS_CLASSES = {
    [ATTENDANCE_STATUS.ACTIVE]: 'home-status-pill--active',
    [ATTENDANCE_STATUS.COMPLETE]: 'home-status-pill--complete',
    [ATTENDANCE_STATUS.PARTIAL]: 'home-status-pill--partial',
    [ATTENDANCE_STATUS.INCOMPLETE]: 'home-status-pill--incomplete',
  };
  const statusClass = STATUS_CLASSES[attendanceStatus] ?? 'home-status-pill--complete';

  if (NEW_DESIGN_ENABLED) {
    return (
      <div className="home-screen home-screen--new-design">
        {permissionPrompt && (
          <StatusBlurOverlay
            icon={<MaterialIcon name="location_on" size={28} fill={1} color="rgb(0, 31, 71)" />}
            title="Necesitamos tu ubicación"
            subtitle="La usamos para registrar dónde marcas tu asistencia y hacer seguimiento de tus movimientos en campo."
            tone="neutral"
            retryLabel={permissionPrompt.requesting ? 'Solicitando…' : 'Permitir acceso'}
            onRetry={permissionPrompt.onAllow}
            secondaryLabel="Ahora no"
            onSecondary={permissionPrompt.onDismiss}
          />
        )}

        {longShiftAlert && (
          <StatusBlurOverlay
            icon={<MaterialIcon name="schedule" size={28} fill={1} color="#D64545" />}
            title="Turno prolongado"
            subtitle="Tienes un ingreso abierto desde hace muchas horas. Si ya terminaste tu turno, registra tu salida."
            tone="error"
            secondaryLabel="Entendido"
            onSecondary={dismissLongShiftAlert}
          />
        )}

        {movementAlert && (
          <StatusBlurOverlay
            icon={<MaterialIcon name="warning" size={28} fill={1} color="#D64545" />}
            title="Movimiento no disponible"
            subtitle={movementAlert}
            tone="error"
            secondaryLabel="Entendido"
            onSecondary={dismissMovementAlert}
          />
        )}

        {locationRetryAlert && (
          <StatusBlurOverlay
            icon={<MaterialIcon name="location_on" size={28} fill={1} color="#D64545" />}
            title="Ubicación necesaria"
            subtitle={
              locationRetryAlert.permitted
                ? 'No pudimos obtener tu ubicación. Verifica que el GPS esté activado e inténtalo de nuevo.'
                : 'Necesitamos acceso a tu ubicación para registrar tu asistencia. Permítelo para continuar.'
            }
            tone="error"
            retryLabel={locationRetrying ? 'Solicitando…' : (locationRetryAlert.permitted ? 'Reintentar' : 'Permitir ubicación')}
            onRetry={retryLocationAndContinue}
            secondaryLabel="Cancelar"
            onSecondary={dismissLocationRetryAlert}
          />
        )}

        {logoutConfirmOpen && (
          <StatusBlurOverlay
            icon={<MaterialIcon name="logout" size={26} color="rgb(0, 31, 71)" />}
            title="¿Deseas salir del sistema?"
            subtitle="Se cerrará tu sesión activa en este dispositivo."
            tone="neutral"
            retryLabel="Cerrar sesión"
            onRetry={confirmLogout}
            secondaryLabel="Cancelar"
            onSecondary={dismissLogoutConfirm}
            secondaryVariant="button"
          />
        )}

        {logoutError && (
          <StatusBlurOverlay
            icon={<MaterialIcon name="warning" size={28} fill={1} color="#D64545" />}
            title="No puedes cerrar sesión todavía"
            subtitle={logoutError}
            tone="error"
            secondaryLabel="Entendido"
            onSecondary={dismissLogoutError}
          />
        )}

        <header className="home-header">
          <div className="home-header__circle" />

          <div className="home-header__brand-row">
            <BrandMark />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                className="home-header__fast-exit-btn"
                onClick={handleFastExit}
                title="Salida Rápida"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '5px 11px',
                  borderRadius: 20,
                  background: 'rgba(255, 255, 255, 0.15)',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                <MaterialIcon name="bolt" size={15} color="#fff" />
                <span>Salida Rápida</span>
              </button>
              <button type="button" className="home-header__help-btn" onClick={handleTabAyuda} aria-label="Ayuda">
                <MaterialIcon name="help" size={19} color="#fff" />
              </button>
            </div>
          </div>

          <div className="home-header__greeting">
            <div className="home-header__greeting-hello">{getGreeting(now)},</div>
            <div className="home-header__greeting-name">{getDisplayName(worker?.nombre)}</div>
          </div>
        </header>

        <div className="home-identity-anchor">
          <div className="home-identity home-identity--floating">
            <div className="home-identity__avatar-wrap">
              <div className="home-identity__avatar">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="home-identity__avatar-photo" onError={onAvatarError} />
                ) : (
                  <MaterialIcon name="person" size={22} color="var(--color-ink-navy)" />
                )}
              </div>
            </div>
            <div className="home-identity__text">
              <div className="home-identity__hello">Estado del día</div>
              <div className="home-identity__name-row">
                <span className="home-identity__name">
                  <MaterialIcon name={DAY_STATUS_ICON[attendanceStatus]} size={13} fill={1} color={DAY_STATUS_COLOR[attendanceStatus]} />
                  <span className="home-identity__name-text">{DAY_STATUS_TEXT[attendanceStatus]}</span>
                </span>
                <span className={`home-time-card__pill home-time-card__pill--${isActive ? 'active' : 'inactive'}`}>
                  {isActive ? 'En curso' : 'Inactivo'}
                </span>
              </div>
            </div>
            <div className="home-identity__divider" />
            <div className="home-identity__time">
              <div className="home-identity__time-row">{formatTimeShort(now)}</div>
              <div className="home-identity__date">{formatDateShort(now)}</div>
            </div>
          </div>
        </div>

        <div className="home-body home-body--new-design">
          {failedSyncCount > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 14px',
                borderRadius: 12,
                background: 'rgba(217, 119, 6, 0.12)',
                border: '1px solid rgba(217, 119, 6, 0.35)',
                marginBottom: 4,
              }}
            >
              <MaterialIcon name="sync_problem" size={18} fill={1} color="#D97706" />
              <span style={{ flex: 1, fontSize: 12.5, color: '#8a5a05' }}>
                {failedSyncCount === 1
                  ? '1 marcación no se pudo confirmar con el servidor.'
                  : `${failedSyncCount} marcaciones no se pudieron confirmar con el servidor.`}
                {' '}Contacta a soporte si persiste.
              </span>
              <button
                type="button"
                onClick={retryFailedSync}
                disabled={retryingFailedSync}
                style={{
                  border: 'none',
                  background: '#D97706',
                  color: '#fff',
                  borderRadius: 8,
                  padding: '6px 10px',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {retryingFailedSync ? 'Reintentando…' : 'Reintentar'}
              </button>
            </div>
          )}

          {!offlineReady && (
            <div className="home-offline-banner">
              <div className="home-offline-banner__icon">
                <MaterialIcon name="wifi_off" size={20} color="#0D7A68" />
              </div>
              <div className="home-offline-banner__body">
                <div className="home-offline-banner__title">Modo sin conexión disponible</div>
                <div className="home-offline-banner__desc">
                  Descarga el paquete biométrico para registrarte en zonas sin internet.
                </div>
              </div>
              {onStartDownload && (
                <button type="button" className="home-offline-banner__btn" onClick={onStartDownload}>
                  Descargar
                </button>
              )}
            </div>
          )}

          <div className="home-reg-card">
            <div className="home-reg-card__circles">
              <div className="home-reg-card__circle home-reg-card__circle--1" />
              <div className="home-reg-card__circle home-reg-card__circle--2" />
              <div className="home-reg-card__circle home-reg-card__circle--3" />
            </div>

            <div className="home-reg-card__scan">
              <div className="home-reg-card__scan-ring">
                <div className="home-reg-card__scan-ring-mask">
                  {lastPhoto ? (
                    <img src={lastPhoto} alt="" className="home-reg-card__scan-photo" />
                  ) : (
                    <MaterialIcon name="person" size={50} color="rgba(255,255,255,0.55)" />
                  )}
                </div>
                <span className="home-reg-card__scan-check">
                  <MaterialIcon name="check" size={13} fill={1} weight={700} color="#fff" />
                </span>
              </div>
              <div className="home-reg-card__scan-title">
                {lastPhoto ? 'Identidad verificada' : 'Listo para verificar'}
              </div>
              <div className="home-reg-card__scan-sub">
                {isActive ? 'Toca el botón para registrar tu salida' : 'Toca el botón para registrar tu ingreso'}
              </div>
            </div>

            <button
              type="button"
              className={`home-reg-card__action${isActive ? ' home-reg-card__action--exit' : ''}`}
              onClick={handleActionButton}
              disabled={locationPendingFor === 'verify'}
            >
              {locationPendingFor === 'verify' ? (
                <>
                  <span className="home-inline-spinner" />
                  Obteniendo ubicación…
                </>
              ) : (
                <>
                  <MaterialIcon name={isActive ? 'logout' : 'login'} size={17} weight={600} color="currentColor" />
                  {isActive ? 'Registrar Salida' : 'Registrar Ingreso'}
                </>
              )}
            </button>

            <button
              type="button"
              className="home-reg-card__manual-link"
              onClick={openManualSheet}
              disabled={locationPendingFor === 'manual'}
            >
              {locationPendingFor === 'manual' ? (
                'Obteniendo ubicación…'
              ) : (
                <>¿Falla la cámara? <span>Registro manual</span></>
              )}
            </button>

            <button
              type="button"
              className="home-reg-card__location-link"
              onClick={handleLocationAction}
              aria-label={addressStatus === 'ready' ? 'Ver mapa' : 'Actualizar ubicación'}
            >
              <MaterialIcon name="location_on" size={14} fill={1} color="currentColor" />
              <span className="home-reg-card__location-text">{locationText(addressStatus, address, locationStatus)}</span>
            </button>
          </div>

          <div className="home-summary-row">
            <div className="home-time-card">
              <span className="home-summary-card__label">
                <span className="home-summary-card__icon"><MaterialIcon name="show_chart" size={13} color="rgb(0, 31, 71)" /></span>
                HOY
              </span>

              {attendanceLoading ? (
                <div className="home-time-card__status">
                  <span className="home-time-card__status-icon home-time-card__status-icon--muted">
                    <MaterialIcon name="hourglass_top" size={16} color="var(--color-subtext)" />
                  </span>
                  <div className="home-time-card__status-title">Consultando…</div>
                </div>
              ) : !hasRecords ? (
                <div className="home-time-card__status">
                  <span className="home-time-card__status-icon home-time-card__status-icon--muted">
                    <MaterialIcon name="event_busy" size={16} color="var(--color-subtext)" />
                  </span>
                  <div>
                    <div className="home-time-card__status-title">Sin registrar hoy</div>
                    <div className="home-time-card__status-sub">Aún no marcas tu entrada</div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="home-time-card__big">
                    {elapsedParts(elapsedDisplayMs).map(([value, unit], i) => (
                      <span className="home-time-card__big-group" key={unit}>
                        <span className="home-time-card__big-num">{value}</span>
                        <span className="home-time-card__big-unit">{unit}</span>
                      </span>
                    ))}
                  </div>
                  <div className="home-time-card__divider" />
                  <div className="home-time-card__block">
                    <div className="home-time-card__row">
                      <span className="home-time-card__row-label">ENTRADA</span>
                      <span className="home-time-card__row-value">
                        {entryTimeMs ? (
                          <>
                            {formatTimeShort(new Date(entryTimeMs))}
                            <span className="home-time-card__row-value-sub"> · {formatDateShort(new Date(entryTimeMs))}</span>
                          </>
                        ) : '—'}
                        <MapsLink coords={entryTimeMs ? entryCoords : null} />
                      </span>
                    </div>
                    {entryTimeMs && <NoveltyLine onReport={() => openNoveltySheet('ENTRADA')} />}
                  </div>
                  <div className="home-time-card__block">
                    <div className="home-time-card__row">
                      <span className="home-time-card__row-label">SALIDA</span>
                      {exitTimeMs ? (
                        <span className="home-time-card__row-value">
                          {formatTimeShort(new Date(exitTimeMs))}
                          <span className="home-time-card__row-value-sub"> · {formatDateShort(new Date(exitTimeMs))}</span>
                          <MapsLink coords={exitCoords} />
                        </span>
                      ) : (
                        <span className="home-time-card__live-badge">
                          <span className="home-time-card__live-dot" />
                          En curso
                        </span>
                      )}
                    </div>
                    {exitTimeMs && <NoveltyLine onReport={() => openNoveltySheet('SALIDA')} />}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="home-recent">
            <div className="home-recent__head">
              <span className="home-recent__title-label">HISTORIAL DE REGISTROS</span>
              <button type="button" className="home-recent__all" onClick={handleTabRegistros}>Ver todos</button>
            </div>

            {recentRecordsLoading ? (
              <div className="home-recent__empty">Consultando…</div>
            ) : recentRecords.length > 0 ? (
              <div className="home-recent__list">
                {recentRecords.map((rec) => {
                  const meta = getTypeMeta(rec.tipo ?? 'LIBRE');
                  const badge = recordBadge(rec);
                  const isActiveMove = badge?.role === 'active';
                  return (
                    <div className="home-recent__item" key={`${rec.tipo_registro}-${rec.id}-${rec.tipo}`}>
                      <span className="home-recent__icon">
                        <MaterialIcon name={recentRecordIcon(rec.tipo)} size={20} color="rgb(88, 99, 122)" />
                      </span>
                      <div className="home-recent__text">
                        <span className="home-recent__label">{rec.dir_destino || meta.label}</span>
                        <span className="home-recent__meta">
                          {formatTimeShort(new Date(rec.fecha_hora))} · {formatDateShort(new Date(rec.fecha_hora))}
                          {badge ? ` · ${badge.label}` : ''}
                        </span>
                      </div>
                      {isActiveMove && (
                        <span className="home-recent__status">
                          <MaterialIcon name="sync" size={16} color="rgb(0, 31, 71)" />
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="home-recent__empty">Aún no tienes registros.</div>
            )}
          </div>
        </div>

        {otherDevices?.length > 0 && (
          <OtherDevicesToast devices={otherDevices} onDone={dismissOtherDevices} />
        )}

        <TabBar
          onRegistros={handleTabRegistros}
          onMovimiento={handleTabMovimiento}
          onAyuda={handleTabAyuda}
          onLogout={handleLogout}
          onProfile={onOpenProfile}
          movimientoLoading={locationPendingFor === 'movement'}
        />

        {loggingOut && (
          <div className="home-logout-overlay home-logout-overlay--new-design">
            <div className="home-logout-card">
              <div className="home-logout-spinner" />
              <div className="home-logout-text">Cerrando sesión…</div>
            </div>
          </div>
        )}

        <LocationSheet open={mapSheetOpen} location={location} address={address} onClose={closeMapSheet} />

        <ManualRegisterSheet
          open={manualSheetOpen}
          actionTipo={actionTipo}
          motivo={manualMotivo}
          updateMotivo={updateManualMotivo}
          onSubmit={submitManual}
          onClose={closeManualSheet}
          locationStatus={locationStatus}
          address={address}
          addressStatus={addressStatus}
          location={locationStatus === 'ready' ? location : null}
          now={now}
        />

        {manualError && (
          <div className="home-manual-error-layer">
            <StatusBlurOverlay
              icon={<MaterialIcon name="warning" size={28} fill={1} color="#D64545" />}
              title="Revisa el motivo"
              subtitle={manualError}
              tone="error"
              secondaryLabel="Entendido"
              onSecondary={dismissManualError}
            />
          </div>
        )}

        <ReportNoveltySheet
          open={noveltySheetOpen}
          tipo={noveltyTipo}
          text={noveltyText}
          updateText={updateNoveltyText}
          submitting={noveltySubmitting}
          onSubmit={submitNovelty}
          onClose={closeNoveltySheet}
        />

        {noveltyResult && (
          <div className="home-manual-error-layer">
            <StatusBlurOverlay
              icon={
                noveltyResult.ok
                  ? <MaterialIcon name="check_circle" size={28} fill={1} color="#1E9E5A" />
                  : <MaterialIcon name="warning" size={28} fill={1} color="#D64545" />
              }
              title={noveltyResult.ok ? 'Novedad registrada' : 'No se registró la novedad'}
              subtitle={noveltyResult.message}
              tone={noveltyResult.ok ? 'neutral' : 'error'}
              secondaryLabel="Entendido"
              onSecondary={dismissNoveltyResult}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="home-screen">
      {permissionPrompt && (
        <StatusBlurOverlay
          icon={<MaterialIcon name="location_on" size={28} fill={1} color="rgb(0, 31, 71)" />}
          title="Necesitamos tu ubicación"
          subtitle="La usamos para registrar dónde marcas tu asistencia y hacer seguimiento de tus movimientos en campo."
          tone="neutral"
          retryLabel={permissionPrompt.requesting ? 'Solicitando…' : 'Permitir acceso'}
          onRetry={permissionPrompt.onAllow}
          secondaryLabel="Ahora no"
          onSecondary={permissionPrompt.onDismiss}
        />
      )}

      {longShiftAlert && (
        <StatusBlurOverlay
          icon={<MaterialIcon name="schedule" size={28} fill={1} color="#D64545" />}
          title="Turno prolongado"
          subtitle="Tienes un ingreso abierto desde hace muchas horas. Si ya terminaste tu turno, registra tu salida."
          tone="error"
          secondaryLabel="Entendido"
          onSecondary={dismissLongShiftAlert}
        />
      )}

      {movementAlert && (
        <StatusBlurOverlay
          icon={<MaterialIcon name="warning" size={28} fill={1} color="#D64545" />}
          title="Movimiento no disponible"
          subtitle={movementAlert}
          tone="error"
          secondaryLabel="Entendido"
          onSecondary={dismissMovementAlert}
        />
      )}

      {logoutConfirmOpen && (
        <StatusBlurOverlay
          icon={<MaterialIcon name="logout" size={26} color="rgb(0, 31, 71)" />}
          title="¿Deseas salir del sistema?"
          subtitle="Se cerrará tu sesión activa en este dispositivo."
          tone="neutral"
          retryLabel="Cerrar sesión"
          onRetry={confirmLogout}
          secondaryLabel="Cancelar"
          onSecondary={dismissLogoutConfirm}
          secondaryVariant="button"
        />
      )}

      {logoutError && (
        <StatusBlurOverlay
          icon={<MaterialIcon name="warning" size={28} fill={1} color="#D64545" />}
          title="No puedes cerrar sesión todavía"
          subtitle={logoutError}
          tone="error"
          secondaryLabel="Entendido"
          onSecondary={dismissLogoutError}
        />
      )}

      <header className="home-header">
        <div className="home-header__texture" />

        <div className="home-header__brand-row">
          <BrandMark />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              className="home-header__fast-exit-btn"
              onClick={handleFastExit}
              title="Salida Rápida"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '5px 11px',
                borderRadius: 20,
                background: 'rgba(255, 255, 255, 0.15)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                color: '#fff',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              <MaterialIcon name="bolt" size={15} color="#fff" />
              <span>Salida Rápida</span>
            </button>
            {isActive && (
              <div className="home-header__badge">
                <span className="home-header__badge-dot" />
                <span>Turno activo</span>
              </div>
            )}
          </div>
        </div>

        <div className="home-identity">
          <button type="button" className="home-identity__avatar-wrap" onClick={onOpenProfile} aria-label="Ver mi perfil">
            <div className="home-identity__avatar">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="home-identity__avatar-photo" onError={onAvatarError} />
              ) : (
                <UserIcon size={22} color="var(--color-ink-navy)" strokeWidth={2} />
              )}
            </div>
            <span className="home-identity__edit-badge"><PencilIcon size={10} color="#fff" strokeWidth={2.5} /></span>
          </button>
          <div className="home-identity__text">
            <div className="home-identity__hello">{getGreeting(now)},</div>
            <div className="home-identity__name">{getDisplayName(worker?.nombre)}</div>
          </div>
          <div className="home-identity__time">
            <div className="home-identity__time-row">
              <IconClockSmall color="var(--color-accent)" />
              <span>{formatTimeShort(now)}</span>
            </div>
            <div className="home-identity__date">{formatDateShort(now)}</div>
          </div>
        </div>
      </header>

      <div className="home-body">
        <div className="home-camera-card">
          {lastPhoto ? (
            <>
              <img src={lastPhoto} alt="Última verificación" className="home-camera-card__photo" />
              <div className="home-camera-card__photo-badge">
                <IconVerified />
                <span>Última verificación</span>
              </div>
            </>
          ) : (
            <>
              <span className="home-camera-card__off"><IconCameraOff /></span>
              <div className="home-camera-card__guide">
                {[
                  { top: 0, left: 0, borderTop: true, borderLeft: true },
                  { top: 0, right: 0, borderTop: true, borderRight: true },
                  { bottom: 0, left: 0, borderBottom: true, borderLeft: true },
                  { bottom: 0, right: 0, borderBottom: true, borderRight: true },
                ].map((c, i) => (
                  <div
                    key={i}
                    className="home-camera-card__corner"
                    style={{
                      top: c.top,
                      bottom: c.bottom,
                      left: c.left,
                      right: c.right,
                      borderTop: c.borderTop ? '2px solid rgba(255,255,255,0.35)' : 'none',
                      borderBottom: c.borderBottom ? '2px solid rgba(255,255,255,0.35)' : 'none',
                      borderLeft: c.borderLeft ? '2px solid rgba(255,255,255,0.35)' : 'none',
                      borderRight: c.borderRight ? '2px solid rgba(255,255,255,0.35)' : 'none',
                    }}
                  />
                ))}
                <UserIcon size={40} color="rgba(255,255,255,0.4)" strokeWidth={1.5} />
              </div>
              <div className="home-camera-card__text">
                <div className="home-camera-card__title">Vista previa no disponible</div>
                <div className="home-camera-card__sub">Se activará al iniciar el registro con reconocimiento facial</div>
              </div>
            </>
          )}
        </div>

        <div className="home-location-row">
          <div className="home-location-pill">
            <IconPin />
            <span className="home-location-pill__text">{locationText(addressStatus, address, locationStatus)}</span>
            <span className={`home-location-pill__badge${locationStatus === 'error' ? ' home-location-pill__badge--error' : ''}`}>
              {locationStatus === 'error' ? 'SIN GPS' : 'GPS'}
            </span>
          </div>
          <button
            type="button"
            className="home-location-action"
            onClick={handleLocationAction}
            aria-label={addressStatus === 'ready' ? 'Ver mapa' : 'Actualizar ubicación'}
          >
            {addressStatus === 'ready' ? <IconMap /> : <IconRefresh />}
          </button>
        </div>

        <div className="home-day-card">
          <div className="home-day-card__head">
            <span className="home-day-card__label">REGISTRO DEL DÍA</span>
            {hasRecords && (
              <span className={`home-status-pill ${statusClass}${isActive && workTimer ? ' home-status-pill--timer' : ''}`}>
                {attendanceLoading ? '…' : isActive && workTimer ? (
                  <span className="home-status-pill__timer">En curso {workTimer}</span>
                ) : statusLabel}
              </span>
            )}
          </div>

          {hasRecords ? (
            <>
              <div className="home-day-card__row">
                <span className="home-day-card__key">Entrada</span>
                <span className="home-day-card__value home-day-card__value--success">
                  {entryTimeMs ? formatTimeShort(new Date(entryTimeMs)) : '—'}
                </span>
              </div>
              {exitTimeMs && (
                <div className="home-day-card__row">
                  <span className="home-day-card__key">Salida</span>
                  <span className="home-day-card__value home-day-card__value--danger">
                    {formatTimeShort(new Date(exitTimeMs))}
                  </span>
                </div>
              )}
            </>
          ) : (
            <div className="home-day-card__empty">
              {attendanceLoading ? (
                <>
                  <ClipboardIcon size={20} color="var(--color-subtext)" strokeWidth={1.75} />
                  <span>Consultando registros…</span>
                </>
              ) : registeredToday ? (
                <>
                  <ClipboardCheckIcon size={20} color="var(--color-link)" strokeWidth={1.75} />
                  <span>Ya tienes un registro hecho hoy. Consulta el detalle en Registros.</span>
                </>
              ) : (
                <>
                  <ClipboardIcon size={20} color="var(--color-subtext)" strokeWidth={1.75} />
                  <span>Aún no tienes marcaciones hoy.</span>
                </>
              )}
            </div>
          )}

          <button type="button" className="home-day-card__manual" onClick={openManualSheet}>
            Registrar Manualmente
          </button>
        </div>

        <button
          type="button"
          className={`home-action-btn${isActive ? ' home-action-btn--exit' : ''}`}
          onClick={handleActionButton}
        >
          {isActive ? 'Registrar Salida' : 'Registrar Ingreso'}
        </button>
      </div>

      <TabBar
        onRegistros={handleTabRegistros}
        onMovimiento={handleTabMovimiento}
        onAyuda={handleTabAyuda}
        onLogout={handleLogout}
      />

      {loggingOut && (
        <div className="home-logout-overlay">
          <div className="home-spinner" />
        </div>
      )}

      <LocationSheet open={mapSheetOpen} location={location} address={address} onClose={closeMapSheet} />

      <ManualRegisterSheet
        open={manualSheetOpen}
        actionTipo={actionTipo}
        motivo={manualMotivo}
        updateMotivo={updateManualMotivo}
        onSubmit={submitManual}
        onClose={closeManualSheet}
        locationStatus={locationStatus}
        address={address}
        addressStatus={addressStatus}
        now={now}
      />

      {manualError && (
        <div className="home-manual-error-layer">
          <StatusBlurOverlay
            icon={<MaterialIcon name="warning" size={28} fill={1} color="#D64545" />}
            title="Revisa el motivo"
            subtitle={manualError}
            tone="error"
            secondaryLabel="Entendido"
            onSecondary={dismissManualError}
          />
        </div>
      )}
    </div>
  );
}
