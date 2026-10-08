import { useRef } from 'react';
import { NEW_DESIGN_ENABLED } from '../config/designFlags';
import ChevronLeftIcon from './icons/ChevronLeftIcon';
import UserIcon from './icons/UserIcon';
import PencilIcon from './icons/PencilIcon';
import BriefcaseIcon from './icons/BriefcaseIcon';
import ClipboardIcon from './icons/ClipboardIcon';
import MapPinIcon from './icons/MapPinIcon';
import IdCardIcon from './icons/IdCardIcon';
import IconShield from './icons/IconShield';
import MaterialIcon from './icons/MaterialIcon';
import StatusBlurOverlay from './shared/StatusBlurOverlay';
import './ProfileView.css';

const FIELD_ICONS = {
  cargo: BriefcaseIcon,
  operacion: ClipboardIcon,
  regional: MapPinIcon,
};

function ProfileField({ icon, label, value }) {
  return (
    <div className="profile-field">
      <div className="profile-field__icon">{icon}</div>
      <div className="profile-field__body">
        <div className="profile-field__label">{label}</div>
        <div className="profile-field__value">{value}</div>
      </div>
    </div>
  );
}

export default function ProfileView({
  displayName,
  identificacion,
  fields,
  onBack,
  avatarUrl,
  onAvatarError,
  onAvatarFileSelected,
  uploading,
  avatarError,
  dismissAvatarError,
  onLogout,
  lastEntryLabel,
  logoutConfirmOpen,
  dismissLogoutConfirm,
  confirmLogout,
  logoutError,
  dismissLogoutError,
  loggingOut,
}) {
  const fileInputRef = useRef(null);

  if (NEW_DESIGN_ENABLED) {
    return (
      <div className="profile-screen profile-screen--new-design">
        {avatarError && (
          <StatusBlurOverlay
            icon={<MaterialIcon name="warning" size={28} fill={1} color="#D64545" />}
            title={avatarError.title}
            subtitle={avatarError.message}
            tone="error"
            secondaryLabel="Entendido"
            onSecondary={dismissAvatarError}
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
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="profile-avatar-input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) onAvatarFileSelected(file);
          }}
        />
        <header className="profile-header">
          <div className="profile-header__circle profile-header__circle--1" />
          <div className="profile-header__circle profile-header__circle--2" />

          <div className="profile-header__top">
            <button type="button" className="profile-back" onClick={onBack} aria-label="Volver">
              <ChevronLeftIcon size={20} color="#fff" />
            </button>
            <div className="profile-header__title">Mi perfil</div>
          </div>

          <div className="profile-avatar-section">
            <button
              type="button"
              className="profile-avatar-wrap profile-avatar-wrap--square"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              aria-label="Cambiar foto de perfil"
            >
              <div className="profile-avatar profile-avatar--square">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt=""
                    className="profile-avatar__photo"
                    onError={onAvatarError}
                  />
                ) : (
                  <>
                    <UserIcon size={30} color="rgba(255,255,255,0.6)" strokeWidth={1.8} />
                    <span className="profile-avatar__browse">o <u>busca un archivo</u></span>
                  </>
                )}
                {uploading && (
                  <div className="profile-avatar__uploading">
                    <div className="profile-avatar__spinner" />
                  </div>
                )}
              </div>
              <span className="profile-edit-badge">
                <MaterialIcon name="photo_camera" size={13} color="#fff" />
              </span>
            </button>
            <div className="profile-name">
              {displayName}
              <MaterialIcon name="edit" size={14} color="rgba(255,255,255,0.7)" />
            </div>
            <div className="profile-cedula">C.C {identificacion}</div>
          </div>
        </header>

        <div className="profile-body">
          <div className="profile-section">
            <div className="profile-group__external-title">Datos personales</div>
            <div className="profile-group">
              <div className="profile-group__item">
                <span className="profile-group__label">NOMBRE COMPLETO</span>
                <span className="profile-group__value">{displayName}</span>
              </div>
              <div className="profile-group__divider" />
              <div className="profile-group__item">
                <span className="profile-group__label">NÚMERO DE DOCUMENTO</span>
                <span className="profile-group__value">C.C {identificacion}</span>
              </div>
            </div>
          </div>

          {fields.length > 0 && (
            <div className="profile-section">
              <div className="profile-group__external-title">Información laboral</div>
              <div className="profile-group">
                {fields.map((field, i) => (
                  <div key={field.key}>
                    <div className="profile-group__item">
                      <span className="profile-group__label">{field.label.toUpperCase()}</span>
                      <span className="profile-group__value">{field.value}</span>
                    </div>
                    {i < fields.length - 1 && <div className="profile-group__divider" />}
                  </div>
                ))}
              </div>
            </div>
          )}

          {lastEntryLabel && <div className="profile-last-entry">{lastEntryLabel}</div>}

          <button type="button" className="profile-logout-btn" onClick={onLogout}>
            <MaterialIcon name="logout" size={16} color="#D64545" />
            Cerrar sesión
          </button>
        </div>

        {loggingOut && (
          <div className="home-logout-overlay home-logout-overlay--new-design">
            <div className="home-logout-card">
              <div className="home-logout-spinner" />
              <div className="home-logout-text">Cerrando sesión…</div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="profile-screen">
      {avatarError && (
        <StatusBlurOverlay
          icon={<MaterialIcon name="warning" size={28} fill={1} color="#D64545" />}
          title={avatarError.title}
          subtitle={avatarError.message}
          tone="error"
          secondaryLabel="Entendido"
          onSecondary={dismissAvatarError}
        />
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="profile-avatar-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onAvatarFileSelected(file);
        }}
      />
      <header className="profile-header">
        <div className="profile-header__texture" />

        <div className="profile-header__top">
          <button type="button" className="profile-back" onClick={onBack} aria-label="Volver">
            <ChevronLeftIcon size={20} color="#fff" />
          </button>
          <div className="profile-header__title">Mi Perfil</div>
        </div>

        <div className="profile-avatar-section">
          <button
            type="button"
            className="profile-avatar-wrap"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            aria-label="Cambiar foto de perfil"
          >
            <div className="profile-avatar">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt=""
                  className="profile-avatar__photo"
                  onError={onAvatarError}
                />
              ) : (
                <UserIcon size={38} color="#fff" strokeWidth={1.8} />
              )}
              {uploading && (
                <div className="profile-avatar__uploading">
                  <div className="profile-avatar__spinner" />
                </div>
              )}
            </div>
            <span className="profile-edit-badge">
              <PencilIcon size={13} color="#fff" strokeWidth={2.5} />
            </span>
          </button>
          <div className="profile-name">{displayName}</div>
          <div className="profile-cedula">
            <IdCardIcon size={13} color="rgba(255,255,255,0.75)" />
            <span>Cédula {identificacion}</span>
          </div>
        </div>
      </header>

      <div className="profile-body">
        {fields.length > 0 && (
          <>
            <div className="profile-section-title">INFORMACIÓN LABORAL</div>
            <div className="profile-fields">
              {fields.map((field) => {
                const Icon = FIELD_ICONS[field.key];
                return (
                  <ProfileField
                    key={field.key}
                    icon={<Icon size={18} color="var(--color-link)" />}
                    label={field.label}
                    value={field.value}
                  />
                );
              })}
            </div>
          </>
        )}
      </div>

      <div className="profile-security">
        <div className="profile-security__icon">
          <IconShield />
        </div>
        <div>
          <div className="profile-security__title">Tus datos están protegidos</div>
          <div className="profile-security__sub">Tratamiento conforme a la Política de Privacidad de Logyser S.A.S · Ley 1581/2012</div>
        </div>
      </div>
    </div>
  );
}
