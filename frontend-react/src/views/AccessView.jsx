import { useEffect } from 'react';
import { NEW_DESIGN_ENABLED } from '../config/designFlags';
import FaceScanIcon from './icons/FaceScanIcon';
import MaterialIcon from './icons/MaterialIcon';
import PolicySheet from './PolicySheet';
import BrandMark from './shared/BrandMark';
import StatusBlurOverlay from './shared/StatusBlurOverlay';
import './AccessView.css';

function Stepper() {
  return (
    <div className="access-stepper">
      <div className="access-stepper__step access-stepper__step--active">
        <span className="access-stepper__dot">
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="access-stepper__label access-stepper__label--active">Verificación</span>
      </div>
      <div className="access-stepper__line" />
      <div className="access-stepper__step">
        <span className="access-stepper__dot access-stepper__dot--muted">
          {NEW_DESIGN_ENABLED && <span className="access-stepper__number">2</span>}
        </span>
        <span className="access-stepper__label">Biométrico</span>
      </div>
    </div>
  );
}

export default function AccessView({
  documentNumber,
  updateDocumentNumber,
  consent,
  setConsent,
  loading,
  error,
  errorTitle,
  dismissError,
  submit,
  policyOpen,
  openPolicy,
  closePolicy,
  acceptPolicy,
  autoLoginPending,
  autoLoginError,
  retryAutoLogin,
  dismissAutoLoginError,
}) {
  useEffect(() => {
    if (!NEW_DESIGN_ENABLED) return;
    const root = document.documentElement;
    const prevBackground = root.style.backgroundColor;
    root.style.backgroundColor = 'rgb(0, 31, 71)';
    return () => {
      root.style.backgroundColor = prevBackground;
    };
  }, []);

  if (autoLoginPending) {
    return (
      <div className="access-screen access-screen--loading">
        <div className="access-autologin">
          <div className="access-autologin__spinner" />
          <div className="access-autologin__text">Cargando sesión…</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`access-screen${NEW_DESIGN_ENABLED ? ' access-screen--new-design' : ''}`}>
      {autoLoginError && (
        <StatusBlurOverlay
          icon={<MaterialIcon name="warning" size={28} fill={1} color="#D64545" />}
          title="No pudimos verificar tu sesión"
          subtitle={autoLoginError}
          tone="error"
          retryLabel="Reintentar"
          onRetry={retryAutoLogin}
          secondaryLabel="Continuar manualmente"
          onSecondary={dismissAutoLoginError}
        />
      )}
      {error && (
        <StatusBlurOverlay
          icon={<MaterialIcon name="warning" size={28} fill={1} color="#D64545" />}
          title={errorTitle || 'Ocurrió un error'}
          subtitle={error}
          tone="error"
          secondaryLabel="Entendido"
          onSecondary={dismissError}
        />
      )}
      <header className="access-header">
        <div className="access-header__glow access-header__glow--1" />
        <div className="access-header__glow access-header__glow--2" />

        <div className="access-header__brand-row">
          <BrandMark tagline={NEW_DESIGN_ENABLED ? 'Sistemas de Seguridad' : undefined} />
          <div className="access-header__badge">
            <span className="access-header__badge-dot" />
            {NEW_DESIGN_ENABLED ? 'Conexión segura' : 'Acceso seguro'}
          </div>
        </div>

        <div className="access-header__intro">
          <div className="access-header__identity">
            {!NEW_DESIGN_ENABLED && <FaceScanIcon />}
            <div className="access-header__title-block">
              <h1 className="access-header__title">Control de Acceso</h1>
              <p className="access-header__subtitle">Verifica tu identidad para continuar</p>
            </div>
          </div>
          <Stepper />
        </div>
      </header>

      <form className="access-sheet" onSubmit={submit}>
        <div className="access-card">
          <div className="access-sheet__head">
            <h2 className="access-sheet__title">Verificación de identidad</h2>
            <p className="access-sheet__subtitle">Ingresa tu número de cédula para continuar</p>
          </div>

          <div className="access-field-group">
            <div className="access-field-group__item">
              <label className="access-field__label" htmlFor="document-number">Número de cédula</label>
              <input
                id="document-number"
                className="access-input"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="Ej: 1234567890"
                autoComplete="off"
                value={documentNumber}
                onChange={(e) => updateDocumentNumber(e.target.value)}
              />
            </div>
          </div>

          <label className="access-consent">
            <input
              type="checkbox"
              className="access-consent__checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span className="access-consent__text">
              Autorizo el tratamiento de mis datos biométricos conforme a la{' '}
              <button
                type="button"
                className="access-consent__link"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openPolicy();
                }}
              >
                Política de Privacidad
              </button>{' '}
              de Logyser S.A.S (Ley 1581/2012).
            </span>
          </label>
        </div>

        <button type="submit" className="access-submit" disabled={loading}>
          {loading ? 'Verificando…' : 'Continuar'}
          {!loading && (
            <svg width="14" height="10" viewBox="0 0 14 10" fill="none">
              <path d="M1 5h11M8 1l4 4-4 4" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" stroke="currentColor" />
            </svg>
          )}
        </button>

        <p className="access-support-note">
          ¿Tienes problemas para ingresar? Contacta al equipo de soporte de Logyser S.A.S.
        </p>
      </form>

      <PolicySheet open={policyOpen} onClose={closePolicy} onAccept={acceptPolicy} />
    </div>
  );
}
