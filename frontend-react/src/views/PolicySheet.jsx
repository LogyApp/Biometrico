import { NEW_DESIGN_ENABLED } from '../config/designFlags';
import { PRIVACY_POLICY_SECTIONS, PRIVACY_POLICY_TITLE } from '../models/privacyPolicyModel';
import MaterialIcon from './icons/MaterialIcon';
import './PolicySheet.css';

function PolicyLine({ segments }) {
  return (
    <p className="policy-line">
      {segments.map((segment, i) => (
        segment.strong ? <strong key={i}>{segment.text}</strong> : <span key={i}>{segment.text}</span>
      ))}
    </p>
  );
}

export default function PolicySheet({ open, onClose, onAccept }) {
  if (!open) return null;

  if (NEW_DESIGN_ENABLED) {
    return (
      <div className="policy-screen">
        <header className="policy-screen__header">
          <span className="policy-screen__icon">
            <MaterialIcon name="shield" size={18} color="rgb(0, 31, 71)" />
          </span>
          <h2 className="policy-sheet__title">{PRIVACY_POLICY_TITLE}</h2>
          <button type="button" className="policy-sheet__close" onClick={onClose} aria-label="Cerrar">
            <MaterialIcon name="close" size={16} color="var(--color-subtext)" />
          </button>
        </header>

        <div className="policy-sheet__body">
          {PRIVACY_POLICY_SECTIONS.map((section, i) => (
            <div key={i} className="policy-section">
              <div className="policy-section__title">{section.title}</div>
              {section.lines.map((segments, j) => (
                <PolicyLine key={j} segments={segments} />
              ))}
            </div>
          ))}
        </div>

        <div className="policy-screen__footer">
          <button type="button" className="policy-sheet__accept" onClick={onAccept}>
            Entendido — Acepto
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="policy-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="policy-sheet">
        <div className="policy-sheet__handle" />
        <div className="policy-sheet__header">
          <h2 className="policy-sheet__title">{PRIVACY_POLICY_TITLE}</h2>
          <button type="button" className="policy-sheet__close" onClick={onClose} aria-label="Cerrar">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="policy-sheet__body">
          {PRIVACY_POLICY_SECTIONS.map((section, i) => (
            <div key={i} className="policy-section">
              <div className="policy-section__title">{section.title}</div>
              {section.lines.map((segments, j) => (
                <PolicyLine key={j} segments={segments} />
              ))}
            </div>
          ))}
        </div>
        <div className="policy-sheet__footer">
          <button type="button" className="policy-sheet__accept" onClick={onAccept}>
            Entendido — Acepto
          </button>
        </div>
      </div>
    </div>
  );
}
