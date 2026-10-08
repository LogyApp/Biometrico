import SquarePenIcon from './icons/SquarePenIcon';
import MaterialIcon from './icons/MaterialIcon';
import './ManualRegisterSheet.css';

export default function ReportNoveltySheet({ open, tipo, text, updateText, submitting, onSubmit, onClose }) {
  if (!open) return null;

  return (
    <div className="manual-register-screen">
      <header className="manual-register-header">
        <div className="manual-register-header__brand">
          <span className="manual-register-header__mark"><SquarePenIcon size={17} color="#D97706" /></span>
          <div>
            <div className="manual-register-header__title">Reportar novedad</div>
            <div className="manual-register-header__subtitle">
              {tipo === 'ENTRADA' ? 'Se asocia a tu entrada de hoy' : 'Se asocia a tu última salida de hoy'}
            </div>
          </div>
        </div>
        <button type="button" className="manual-register-header__close" onClick={onClose} aria-label="Cerrar">
          <MaterialIcon name="close" size={16} color="var(--color-subtext)" />
        </button>
      </header>

      <div className="manual-register-body">
        <div className="manual-register-field">
          <label className="manual-register-field__label" htmlFor="novelty-text">Novedad (obligatorio)</label>
          <textarea
            id="novelty-text"
            className="manual-register-textarea"
            placeholder="Ej: Salí antes por una cita médica autorizada por mi supervisor."
            maxLength={512}
            value={text}
            onChange={(e) => updateText(e.target.value)}
          />
          <span className="manual-register-field__counter">{text.length}/512</span>
        </div>

        <div className="manual-register-warning">
          <MaterialIcon name="info" size={16} color="#D97706" />
          <span className="manual-register-warning__text">
            Solo puedes reportar una novedad por {tipo === 'ENTRADA' ? 'entrada' : 'salida'}. Una vez guardada no se puede modificar.
          </span>
        </div>
      </div>

      <div className="manual-register-footer">
        <button type="button" className="manual-register-submit" onClick={onSubmit} disabled={submitting}>
          {submitting ? 'Enviando…' : 'Guardar novedad'}
        </button>
      </div>
    </div>
  );
}
