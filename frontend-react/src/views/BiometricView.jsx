import { NEW_DESIGN_ENABLED } from '../config/designFlags';
import { CAPTURE_STEPS } from '../models/biometricModel';
import UserIcon from './icons/UserIcon';
import IconTurn from './icons/IconTurn';
import IconFront from './icons/IconFront';
import IconDevice from './icons/IconDevice';
import IconShield from './icons/IconShield';
import IconChangeUser from './icons/IconChangeUser';
import MaterialIcon from './icons/MaterialIcon';
import BrandMark from './shared/BrandMark';
import './BiometricView.css';

const STEP_ICON_NAMES = {
  turnLeft: 'replay',
  turnRight: 'refresh',
  front: 'face',
  device: 'smartphone',
};

function InstructionCardNew({ stepKey, title, sub }) {
  return (
    <div className="biometric-card biometric-card--new">
      <div className="biometric-card__icon biometric-card__icon--new">
        <MaterialIcon name={STEP_ICON_NAMES[stepKey]} size={16} color="rgb(0, 31, 71)" />
      </div>
      <div className="biometric-card__text">
        <div className="biometric-card__title">{title}</div>
        <div className="biometric-card__sub">{sub}</div>
      </div>
    </div>
  );
}

function StepDot({ active, done }) {
  const filled = active || done;
  return (
    <div className={`biometric-dot${filled ? ' biometric-dot--filled' : ''}`}>
      {done && !active && (
        <svg width="9" height="7" viewBox="0 0 10 8" fill="none">
          <path d="M1 4l3 3 5-6" stroke="#0f1b3d" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
}

const STEP_ICONS = {
  turnLeft: IconTurn,
  turnRight: IconTurn,
  front: IconFront,
  device: IconDevice,
};

function InstructionCard({ stepKey, title, sub }) {
  const Icon = STEP_ICONS[stepKey];
  return (
    <div className="biometric-card">
      <div className="biometric-card__icon">
        <Icon />
      </div>
      <div className="biometric-card__text">
        <div className="biometric-card__title">{title}</div>
        <div className="biometric-card__sub">{sub}</div>
      </div>
    </div>
  );
}

const FACE_FRAME_CORNERS = [
  { top: 6, left: 6, borderTop: true, borderLeft: true },
  { top: 6, right: 6, borderTop: true, borderRight: true },
  { bottom: 6, left: 6, borderBottom: true, borderLeft: true },
  { bottom: 6, right: 6, borderBottom: true, borderRight: true },
];

export default function BiometricView({ firstName, fullName, onStartCapture, onChangeIdentity }) {
  if (NEW_DESIGN_ENABLED) {
    return (
      <div className="biometric-screen biometric-screen--new-design">
        <header className="biometric-header biometric-header--new">
          <div className="biometric-header__top-row">
            <BrandMark tagline="Control de Acceso Biométrico" />
            <span className="biometric-secure-badge">
              <span className="biometric-secure-badge__dot" />
              Acceso seguro
            </span>
          </div>

          <div className="biometric-stepper--new">
            <div className="biometric-stepper__track">
              <div className="biometric-step__dot biometric-step__dot--done">
                <MaterialIcon name="check" size={13} weight={700} color="#fff" />
              </div>
              <div className="biometric-step__line" />
              <div className="biometric-step__dot biometric-step__dot--active">2</div>
            </div>
            <div className="biometric-stepper__labels">
              <span className="biometric-step__label biometric-step__label--done">Verificación</span>
              <span className="biometric-step__label biometric-step__label--active">Biométrico</span>
            </div>
          </div>

          <div className="biometric-greeting biometric-greeting--new">
            <div className="biometric-avatar biometric-avatar--new">
              <UserIcon size={20} color="rgb(0, 31, 71)" strokeWidth={2.2} />
            </div>
            <div>
              <div className="biometric-greeting__hello biometric-greeting__hello--new">¡Hola, {firstName}!</div>
              <div className="biometric-greeting__name biometric-greeting__name--new">{fullName}</div>
            </div>
          </div>
        </header>

        <div className="biometric-body--new">
          <div className="biometric-target biometric-target--new">
            <div className="biometric-target__ring-wrap biometric-target__ring-wrap--new">
              <svg width="148" height="148" viewBox="0 0 148 148" className="biometric-target__progress">
                <circle cx="74" cy="74" r="70" stroke="#E7E9F0" strokeWidth="3" fill="none" />
                <circle
                  cx="74" cy="74" r="70" stroke="#1E9E5A" strokeWidth="4" fill="none"
                  strokeLinecap="round" strokeDasharray="140 400" transform="rotate(-90 74 74)"
                />
              </svg>
              <div className="biometric-target__frame biometric-target__frame--new">
                {FACE_FRAME_CORNERS.map((c, i) => (
                  <div
                    key={i}
                    className="biometric-target__corner"
                    style={{
                      top: c.top,
                      bottom: c.bottom,
                      left: c.left,
                      right: c.right,
                      borderTop: c.borderTop ? '2px solid rgb(0, 31, 71)' : 'none',
                      borderBottom: c.borderBottom ? '2px solid rgb(0, 31, 71)' : 'none',
                      borderLeft: c.borderLeft ? '2px solid rgb(0, 31, 71)' : 'none',
                      borderRight: c.borderRight ? '2px solid rgb(0, 31, 71)' : 'none',
                    }}
                  />
                ))}
                <UserIcon size={44} color="rgb(0, 31, 71)" strokeWidth={1.6} />
              </div>
            </div>
            <div className="biometric-target__caption">
              <div className="biometric-target__title biometric-target__title--new">Mueve suavemente la cabeza</div>
              <div className="biometric-target__sub biometric-target__sub--new">El sistema detecta movimiento natural — no necesitas hacer gestos forzados</div>
            </div>
          </div>

          <div className="biometric-cards-grid">
            {CAPTURE_STEPS.map((step) => (
              <InstructionCardNew key={step.key} stepKey={step.key} title={step.title} sub={step.sub} />
            ))}
          </div>

          <button type="button" className="biometric-start biometric-start--new" onClick={onStartCapture}>
            Iniciar captura biométrica
            <MaterialIcon name="arrow_forward" size={16} color="#fff" />
          </button>

          <div className="biometric-security biometric-security--new">
            <div className="biometric-security__icon biometric-security__icon--new">
              <MaterialIcon name="verified_user" size={16} color="rgb(0, 31, 71)" />
            </div>
            <div>
              <div className="biometric-security__title">Tus datos están protegidos</div>
              <div className="biometric-security__sub">Cifrado TLS · Ley 1581/2012 · El proceso toma ~30 seg</div>
            </div>
          </div>

          <button type="button" className="biometric-change-identity biometric-change-identity--new" onClick={onChangeIdentity}>
            <IconChangeUser />
            ¿No eres tú? — Cambiar identificación
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="biometric-screen">
      <header className="biometric-header">
        <div className="biometric-header__glow biometric-header__glow--1" />
        <div className="biometric-header__glow biometric-header__glow--2" />

        <div className="biometric-stepper">
          <StepDot done />
          <div className="biometric-stepper__line" />
          <StepDot active />
          <span className="biometric-stepper__label">PASO 2 · REGISTRO BIOMÉTRICO</span>
        </div>

        <div className="biometric-greeting">
          <div className="biometric-avatar">
            <UserIcon size={22} color="var(--color-ink-navy)" strokeWidth={2.2} />
          </div>
          <div>
            <div className="biometric-greeting__hello">¡Hola, {firstName}!</div>
            <div className="biometric-greeting__name">{fullName}</div>
          </div>
        </div>

        <div className="biometric-target">
          <div className="biometric-target__ring-wrap">
            <svg width="148" height="148" viewBox="0 0 148 148" className="biometric-target__progress">
              <circle cx="74" cy="74" r="70" stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" fill="none" />
              <circle
                cx="74" cy="74" r="70" stroke="var(--color-accent)" strokeWidth="3" fill="none"
                strokeLinecap="round" strokeDasharray="140 400" transform="rotate(-90 74 74)"
              />
            </svg>
            <div className="biometric-target__frame">
              {FACE_FRAME_CORNERS.map((c, i) => (
                <div
                  key={i}
                  className="biometric-target__corner"
                  style={{
                    top: c.top,
                    bottom: c.bottom,
                    left: c.left,
                    right: c.right,
                    borderTop: c.borderTop ? '2px solid #EAF1FF' : 'none',
                    borderBottom: c.borderBottom ? '2px solid #EAF1FF' : 'none',
                    borderLeft: c.borderLeft ? '2px solid #EAF1FF' : 'none',
                    borderRight: c.borderRight ? '2px solid #EAF1FF' : 'none',
                  }}
                />
              ))}
              <UserIcon size={44} color="#EAF1FF" strokeWidth={1.6} />
            </div>
          </div>
          <div className="biometric-target__caption">
            <div className="biometric-target__title">Mueve suavemente la cabeza</div>
            <div className="biometric-target__sub">El sistema detecta movimiento natural — no necesitas hacer gestos forzados</div>
          </div>
        </div>
      </header>

      <div className="biometric-sheet">
        <div className="biometric-cards-grid">
          {CAPTURE_STEPS.map((step) => (
            <InstructionCard key={step.key} stepKey={step.key} title={step.title} sub={step.sub} />
          ))}
        </div>

        <button type="button" className="biometric-start" onClick={onStartCapture}>
          Iniciar captura biométrica
          <svg width="14" height="10" viewBox="0 0 14 10" fill="none">
            <path d="M1 5h11M8 1l4 4-4 4" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <div className="biometric-security">
          <div className="biometric-security__icon">
            <IconShield />
          </div>
          <div>
            <div className="biometric-security__title">Tus datos están protegidos</div>
            <div className="biometric-security__sub">Cifrado TLS · Ley 1581/2012 · El proceso toma ~30 seg</div>
          </div>
        </div>

        <button type="button" className="biometric-change-identity" onClick={onChangeIdentity}>
          <IconChangeUser />
          ¿No eres tú? — Cambiar identificación
        </button>
      </div>
    </div>
  );
}
