import { NEW_DESIGN_ENABLED } from '../config/designFlags';
import DownloadIcon from './icons/DownloadIcon';
import './DownloadView.css';

const ACCENT = '#3ED9C0';
const RING_RADIUS = 49;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function ResourceRow({ label, done }) {
  return (
    <div className="download-row">
      <span className={`download-row__dot${done ? ' download-row__dot--done' : ''}`}>
        {done && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M1.5 5.2l2.4 2.4 4.6-5" stroke="#0d2b26" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
        )}
      </span>
      <span className={`download-row__label${done ? ' download-row__label--done' : ''}`}>{label}</span>
    </div>
  );
}

export default function DownloadView({ resources, overallPct, downloadedMb, totalMb, remainingLabel, error, retry, onCancel }) {
  const dashOffset = RING_CIRCUMFERENCE * (1 - overallPct / 100);
  const screenClass = `download-screen${NEW_DESIGN_ENABLED ? ' download-screen--new-design' : ''}`;

  if (error) {
    return (
      <div className={screenClass}>
        <div className="download-screen__glow" />
        {NEW_DESIGN_ENABLED && <div className="download-screen__glow download-screen__glow--2" />}
        <div className="download-screen__dots" />
        <div className="download-screen__body">
          <div className="download-error">
            <div className="download-error__icon">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#FF8080" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                <path d="M12 9v4M12 17h.01" />
              </svg>
            </div>
            <div className="download-error__title">No pudimos preparar tu acceso sin conexión</div>
            <p className="download-error__text">{error}</p>
            <button type="button" className="download-error__retry" onClick={retry}>Reintentar</button>
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                style={{
                  marginTop: 10,
                  background: 'none',
                  border: 'none',
                  color: 'rgba(255, 255, 255, 0.85)',
                  fontSize: 13,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                Volver al inicio
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={screenClass}>
      <div className="download-screen__glow" />
      {NEW_DESIGN_ENABLED && <div className="download-screen__glow download-screen__glow--2" />}
      <div className="download-screen__dots" />

      <div className="download-screen__body">
        <div className="download-progress">
          <div className="download-ring">
            <svg width="108" height="108" viewBox="0 0 108 108" className="download-ring__svg">
              <circle cx="54" cy="54" r={RING_RADIUS} stroke="rgba(255,255,255,0.1)" strokeWidth="4" fill="none" />
              <circle
                cx="54" cy="54" r={RING_RADIUS} stroke={ACCENT} strokeWidth="4" fill="none"
                strokeLinecap="round"
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={dashOffset}
                className="download-ring__progress"
              />
            </svg>
            <div className="download-ring__core">
              <DownloadIcon size={30} color={ACCENT} strokeWidth={2.2} />
            </div>
          </div>

          <div className="download-pct">
            <span className="download-pct__num">{overallPct}</span>
            <span className="download-pct__sign">%</span>
          </div>

          <div className="download-meta">
            <span className="download-meta__size">{downloadedMb.toFixed(1)} MB de {totalMb.toFixed(1)} MB</span>
            <div className="download-meta__time">
              <span className="download-meta__time-val">{remainingLabel}</span>
              <span className="download-meta__time-label">restantes</span>
            </div>
          </div>
        </div>

        <div className="download-checklist">
          {resources.map((r) => (
            <ResourceRow key={r.key} label={r.label} done={r.done} />
          ))}
        </div>
      </div>

      <div className="download-footer">
        <div className="download-bar">
          <div className="download-bar__fill" style={{ width: `${overallPct}%` }} />
        </div>
        <div className="download-footer__text">
          <div className="download-footer__title">Preparando tu aplicación</div>
          <div className="download-footer__sub">
            Estamos descargando los recursos necesarios<br />para el funcionamiento de la app
          </div>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(255, 255, 255, 0.75)',
                fontSize: 12.5,
                cursor: 'pointer',
                marginTop: 12,
                textDecoration: 'underline',
              }}
            >
              Hacerlo más tarde (volver al inicio)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
