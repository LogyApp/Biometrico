import { useEffect, useRef } from 'react';
import { NEW_DESIGN_ENABLED } from '../config/designFlags';
import { ensureGoogleMaps } from '../services/googleMapsLoader';
import { pulsingMarker } from '../services/mapMarkers';
import { STATIC_MAP_OPTIONS, triggerResize } from '../services/mapHelpers';
import { HELP_ITEMS, HELP_LEGAL_NOTE } from '../models/helpModel';
import CloseIcon from './icons/CloseIcon';
import CircleArrowRightIcon from './icons/CircleArrowRightIcon';
import ChevronRightIcon from './icons/ChevronRightIcon';
import ShieldCheckIcon from './icons/ShieldCheckIcon';
import CircleHelpIcon from './icons/CircleHelpIcon';
import UserIcon from './icons/UserIcon';
import LogInIcon from './icons/LogInIcon';
import SquarePenIcon from './icons/SquarePenIcon';
import NavigationIcon from './icons/NavigationIcon';
import WifiOffIcon from './icons/WifiOffIcon';
import ClipboardIcon from './icons/ClipboardIcon';
import LogOutIcon from './icons/LogOutIcon';
import MaterialIcon from './icons/MaterialIcon';
import './HelpSheet.css';

const MOVEMENT_MAP_CENTER = { lat: 4.6486, lng: -74.0925 };

const ITEM_ICONS = {
  perfil: UserIcon,
  entrada_salida: LogInIcon,
  manual: SquarePenIcon,
  movimiento: NavigationIcon,
  offline: WifiOffIcon,
  historial: ClipboardIcon,
  sesion: LogOutIcon,
};

function HelpMovementMap() {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!NEW_DESIGN_ENABLED || !containerRef.current) return undefined;
    let cancelled = false;

    ensureGoogleMaps().then((maps) => {
      if (cancelled || !containerRef.current) return;
      const map = new maps.Map(containerRef.current, { center: MOVEMENT_MAP_CENTER, zoom: 14, ...STATIC_MAP_OPTIONS });
      pulsingMarker(map, MOVEMENT_MAP_CENTER, '#2a4a8f', { size: 16 });
      setTimeout(() => triggerResize(map), 120);
    }).catch(() => {});

    return () => { cancelled = true; };
  }, []);

  return <div ref={containerRef} className="help-item__map" />;
}

function HelpItem({ icon, title, desc, extra }) {
  return (
    <div className="help-item">
      <div className="help-item__icon">{icon}</div>
      <div className="help-item__body">
        <div className="help-item__title">{title}</div>
        <div className="help-item__desc">{desc}</div>
        {extra}
      </div>
    </div>
  );
}

export default function HelpSheet({ open, closeSheet, runTour }) {
  if (!open) return null;

  if (NEW_DESIGN_ENABLED) {
    return (
      <div className="help-screen">
        <header className="help-screen__header">
          <div className="help-sheet__brand">
            <span className="help-sheet__brand-mark">
              <MaterialIcon name="help" size={18} color="rgb(0, 31, 71)" />
            </span>
            <div>
              <div className="help-sheet__title">Centro de Ayuda</div>
              <div className="help-sheet__subtitle">Control de Acceso Biométrico · Logyser S.A.S</div>
            </div>
          </div>
          <button type="button" className="help-sheet__close" onClick={closeSheet} aria-label="Cerrar">
            <MaterialIcon name="close" size={16} color="var(--color-subtext)" />
          </button>
        </header>

        <div className="help-screen__body">
          <button type="button" className="help-tour-btn" onClick={runTour}>
            <span className="help-tour-btn__icon">
              <MaterialIcon name="play_circle" size={20} fill={1} color="#fff" />
            </span>
            <span className="help-tour-btn__text">
              <span className="help-tour-btn__label">Ver guía paso a paso</span>
              <span className="help-tour-btn__sub">Aprende a usar cada función en pocos pasos</span>
            </span>
            <MaterialIcon name="chevron_right" size={18} color="#fff" />
          </button>

          <div className="help-section-title">¿QUÉ PUEDES HACER?</div>

          <div className="help-items">
            {HELP_ITEMS.map((item) => {
              const Icon = ITEM_ICONS[item.key];
              return (
                <HelpItem
                  key={item.key}
                  icon={<Icon size={19} color="currentColor" />}
                  title={item.title}
                  desc={item.desc}
                  extra={item.key === 'movimiento' ? <HelpMovementMap /> : null}
                />
              );
            })}
          </div>

          <div className="help-note">
            <MaterialIcon name="verified_user" size={16} color="var(--color-link)" />
            <span className="help-note__text">{HELP_LEGAL_NOTE}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="help-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeSheet();
      }}
    >
      <div className="help-sheet">
        <div className="help-sheet__handle" />
        <div className="help-sheet__header">
          <div className="help-sheet__brand">
            <span className="help-sheet__brand-mark">
              <CircleHelpIcon size={17} color="var(--color-link)" />
            </span>
            <div>
              <div className="help-sheet__title">Centro de Ayuda</div>
              <div className="help-sheet__subtitle">Control de Acceso Biométrico · Logyser S.A.S</div>
            </div>
          </div>
          <button type="button" className="help-sheet__close" onClick={closeSheet} aria-label="Cerrar">
            <CloseIcon size={13} />
          </button>
        </div>

        <div className="help-sheet__body">
          <button type="button" className="help-tour-btn" onClick={runTour}>
            <span className="help-tour-btn__icon">
              <CircleArrowRightIcon size={18} color="#fff" />
            </span>
            <span className="help-tour-btn__text">
              <span className="help-tour-btn__label">Ver guía paso a paso</span>
              <span className="help-tour-btn__sub">Aprende a usar cada función en pocos pasos</span>
            </span>
            <ChevronRightIcon size={16} color="#fff" />
          </button>

          <div className="help-section-title">¿QUÉ PUEDES HACER?</div>

          <div className="help-items-scroll">
            <div className="help-items">
              {HELP_ITEMS.map((item) => {
                const Icon = ITEM_ICONS[item.key];
                return (
                  <HelpItem
                    key={item.key}
                    icon={<Icon size={19} color="var(--color-link)" />}
                    title={item.title}
                    desc={item.desc}
                  />
                );
              })}
            </div>
          </div>

          <div className="help-note">
            <ShieldCheckIcon size={16} color="var(--color-link)" />
            <span className="help-note__text">{HELP_LEGAL_NOTE}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
