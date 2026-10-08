import { NEW_DESIGN_ENABLED } from '../config/designFlags';
import CloseIcon from './icons/CloseIcon';
import MaterialIcon from './icons/MaterialIcon';
import StatusBlurOverlay from './shared/StatusBlurOverlay';
import './CaptureView.css';

const CORNERS = [
  { top: 46, left: 18, borderTop: true, borderLeft: true },
  { top: 46, right: 18, borderTop: true, borderRight: true },
  { bottom: 46, left: 18, borderBottom: true, borderLeft: true },
  { bottom: 46, right: 18, borderBottom: true, borderRight: true },
];

export default function CaptureView({
  videoRef,
  status,
  errorMessage,
  faceState,
  instruction,
  stepIndex,
  stepsTotal,
  stepDone,
  retry,
  onCancel,
  permissionPrompt,
}) {
  const progressPct = Math.min(100, Math.round((stepIndex / stepsTotal) * 100));
  const ovalStateClass =
    faceState === 'detected' ? 'capture-oval--detected' : faceState === 'lost' ? 'capture-oval--lost' : '';
  const topCaption =
    faceState === 'detected' ? 'Capturando…' : faceState === 'lost' ? 'Buscando tu rostro…' : 'Preparando la captura…';

  if (NEW_DESIGN_ENABLED) {
    return (
      <div className="capture-screen capture-screen--new-design">
        <video ref={videoRef} className="capture-video" autoPlay playsInline muted />

        <div className="capture-topbar">
          <button type="button" className="capture-close" onClick={onCancel} aria-label="Cancelar">
            <CloseIcon size={16} />
          </button>
          <span className="capture-badge">Paso {stepIndex + 1} de {stepsTotal}</span>
        </div>

        <div className="capture-top-caption">{topCaption}</div>

        <div className="capture-guide">
          <div className={`capture-oval ${ovalStateClass}`}>
            <svg width="100%" height="100%" viewBox="0 0 240 300" className="capture-oval__ring">
              <ellipse cx="120" cy="150" rx="105" ry="135" />
            </svg>
            {CORNERS.map((c, i) => (
              <div
                key={i}
                className="capture-oval__corner"
                style={{
                  top: c.top,
                  bottom: c.bottom,
                  left: c.left,
                  right: c.right,
                  borderTop: c.borderTop ? '2.5px solid #fff' : 'none',
                  borderBottom: c.borderBottom ? '2.5px solid #fff' : 'none',
                  borderLeft: c.borderLeft ? '2.5px solid #fff' : 'none',
                  borderRight: c.borderRight ? '2.5px solid #fff' : 'none',
                }}
              />
            ))}
          </div>
        </div>

        <div className="capture-bottom">
          <div className="capture-dots">
            {stepDone.map((done, i) => (
              <span
                key={i}
                className={`capture-dot${done ? ' capture-dot--done' : i === stepIndex ? ' capture-dot--active' : ''}`}
              />
            ))}
          </div>
          <div className="capture-progress">
            <div className="capture-progress__fill" style={{ width: `${progressPct}%` }} />
          </div>
          <div className="capture-instruction">{instruction}</div>
        </div>

        {permissionPrompt && (
          <StatusBlurOverlay
            icon={<MaterialIcon name="photo_camera" size={28} fill={1} color="rgb(0, 31, 71)" />}
            title="Necesitamos tu cámara"
            subtitle="La usamos para verificar tu identidad por reconocimiento facial durante el registro biométrico."
            tone="neutral"
            retryLabel={permissionPrompt.requesting ? 'Solicitando…' : 'Permitir acceso'}
            onRetry={permissionPrompt.onAllow}
            secondaryLabel="Ahora no"
            onSecondary={permissionPrompt.onDismiss}
          />
        )}

        {status === 'error' && (
          <StatusBlurOverlay
            icon={<MaterialIcon name="warning" size={28} fill={1} color="#D64545" />}
            title="No pudimos continuar"
            subtitle={errorMessage}
            tone="error"
            retryLabel="Reintentar"
            onRetry={retry}
            secondaryLabel="Cancelar"
            onSecondary={onCancel}
          />
        )}

        {status === 'saving' && (
          <div className="capture-overlay">
            <div className="capture-overlay__card">
              <div className="capture-spinner" />
              <p className="capture-overlay__text">Procesando datos biométricos…</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="capture-screen">
      <video ref={videoRef} className="capture-video" autoPlay playsInline muted />

      <div className="capture-topbar">
        <button type="button" className="capture-close" onClick={onCancel} aria-label="Cancelar">
          <CloseIcon size={16} />
        </button>
        <span className="capture-badge">{stepsTotal} pasos</span>
      </div>

      <div className="capture-title-row">
        <span className="capture-title">Captura biométrica</span>
      </div>

      <div className="capture-guide">
        <div className={`capture-oval ${ovalStateClass}`}>
          <svg width="100%" height="100%" viewBox="0 0 240 300" className="capture-oval__ring">
            <ellipse cx="120" cy="150" rx="105" ry="135" />
          </svg>
          {CORNERS.map((c, i) => (
            <div
              key={i}
              className="capture-oval__corner"
              style={{
                top: c.top,
                bottom: c.bottom,
                left: c.left,
                right: c.right,
                borderTop: c.borderTop ? '2.5px solid #fff' : 'none',
                borderBottom: c.borderBottom ? '2.5px solid #fff' : 'none',
                borderLeft: c.borderLeft ? '2.5px solid #fff' : 'none',
                borderRight: c.borderRight ? '2.5px solid #fff' : 'none',
              }}
            />
          ))}
        </div>
      </div>

      <div className="capture-bottom">
        <div className="capture-dots">
          {stepDone.map((done, i) => (
            <span
              key={i}
              className={`capture-dot${done ? ' capture-dot--done' : i === stepIndex ? ' capture-dot--active' : ''}`}
            />
          ))}
        </div>
        <div className="capture-progress">
          <div className="capture-progress__fill" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="capture-instruction">{instruction}</div>
      </div>

      {permissionPrompt && (
        <StatusBlurOverlay
          icon={<MaterialIcon name="photo_camera" size={28} fill={1} color="rgb(0, 31, 71)" />}
          title="Necesitamos tu cámara"
          subtitle="La usamos para verificar tu identidad por reconocimiento facial durante el registro biométrico."
          tone="neutral"
          retryLabel={permissionPrompt.requesting ? 'Solicitando…' : 'Permitir acceso'}
          onRetry={permissionPrompt.onAllow}
          secondaryLabel="Ahora no"
          onSecondary={permissionPrompt.onDismiss}
        />
      )}

      {status === 'error' && (
        <StatusBlurOverlay
          icon={<MaterialIcon name="warning" size={28} fill={1} color="#D64545" />}
          title="No pudimos continuar"
          subtitle={errorMessage}
          tone="error"
          retryLabel="Reintentar"
          onRetry={retry}
          secondaryLabel="Cancelar"
          onSecondary={onCancel}
        />
      )}

      {status === 'saving' && (
        <div className="capture-overlay">
          <div className="capture-overlay__card">
            <div className="capture-spinner" />
            <p className="capture-overlay__text">Procesando datos biométricos…</p>
          </div>
        </div>
      )}
    </div>
  );
}
