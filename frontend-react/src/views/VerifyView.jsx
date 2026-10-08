import { useEffect, useState } from 'react';
import CloseIcon from './icons/CloseIcon';
import MaterialIcon from './icons/MaterialIcon';
import StatusBlurOverlay from './shared/StatusBlurOverlay';
import ManualRegisterSheet from './ManualRegisterSheet';
import { verifySuccessMessage } from '../models/verifyModel';
import './VerifyView.css';

const CORNERS = [
  { top: 46, left: 18, borderTop: true, borderLeft: true },
  { top: 46, right: 18, borderTop: true, borderRight: true },
  { bottom: 46, left: 18, borderBottom: true, borderLeft: true },
  { bottom: 46, right: 18, borderBottom: true, borderRight: true },
];

const PROCESSING_MESSAGES = ['Comparando rostro…', 'Verificando identidad…', 'Casi listo…'];
const PROCESSING_MESSAGE_MS = 900;

function useCyclingMessage(active, messages, intervalMs) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!active) {
      setIndex(0);
      return;
    }
    const timer = setInterval(() => setIndex((i) => (i + 1) % messages.length), intervalMs);
    return () => clearInterval(timer);
  }, [active, messages, intervalMs]);

  return messages[index];
}

export default function VerifyView({
  videoRef,
  status,
  errorMessage,
  faceState,
  instruction,
  retry,
  onCancel,
  tipoLabel,
  tipo,
  workerName,
  permissionPrompt,
  manualSheetOpen,
  openManualSheet,
  closeManualSheet,
  manualMotivo,
  updateManualMotivo,
  manualError,
  dismissManualError,
  submitManualMovement,
  location,
  locationStatus,
  address,
  addressStatus,
}) {
  const ovalStateClass =
    faceState === 'detected' ? 'verify-oval--detected' : faceState === 'lost' ? 'verify-oval--lost' : '';

  const showOverlay = status === 'authorized' || status === 'denied' || status === 'error' || Boolean(permissionPrompt);
  const showFaceGuide = !showOverlay;

  const processingMessage = useCyclingMessage(status === 'processing', PROCESSING_MESSAGES, PROCESSING_MESSAGE_MS);
  const topCaption =
    status === 'processing' ? processingMessage : faceState === 'detected' ? 'Capturando…' : 'Preparando la verificación…';

  return (
    <div className="verify-screen">
      <video ref={videoRef} className="verify-video" autoPlay playsInline muted />

      <div className="verify-topbar">
        <button type="button" className="verify-close" onClick={onCancel} aria-label="Cancelar">
          <CloseIcon size={16} />
        </button>
        <span className="verify-badge">{tipoLabel}</span>
      </div>

      {showFaceGuide && <div className="verify-top-caption">{topCaption}</div>}

      {showFaceGuide && (
        <div className="verify-guide">
          <div className={`verify-oval ${ovalStateClass}`}>
            <svg width="100%" height="100%" viewBox="0 0 240 300" className="verify-oval__ring">
              <ellipse cx="120" cy="150" rx="105" ry="135" />
            </svg>
            {CORNERS.map((c, i) => (
              <div
                key={i}
                className="verify-oval__corner"
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
      )}

      {showFaceGuide && <div className="verify-instruction">{instruction}</div>}

      {showFaceGuide && tipo === 'MOVIMIENTO' && (
        <button type="button" className="verify-manual-trigger" onClick={openManualSheet}>
          ¿Problemas con la cámara? Continuar manualmente
        </button>
      )}

      {permissionPrompt && (
        <StatusBlurOverlay
          icon={<MaterialIcon name="photo_camera" size={28} fill={1} color="rgb(0, 31, 71)" />}
          title="Necesitamos tu cámara"
          subtitle="La usamos para verificar tu identidad por reconocimiento facial."
          tone="neutral"
          retryLabel={permissionPrompt.requesting ? 'Solicitando…' : 'Permitir acceso'}
          onRetry={permissionPrompt.onAllow}
          secondaryLabel="Cancelar"
          onSecondary={permissionPrompt.onDismiss}
        />
      )}

      {status === 'authorized' && (
        <StatusBlurOverlay
          icon={<MaterialIcon name="check_circle" size={30} fill={1} color="#1E9E5A" />}
          title={verifySuccessMessage(tipo)}
          tone="success"
        />
      )}

      {status === 'denied' && (
        <StatusBlurOverlay
          icon={<MaterialIcon name="cancel" size={30} fill={1} color="#D64545" />}
          title={`Al parecer no eres ${workerName}`}
          subtitle="Verifica que seas tú quien está frente a la cámara e inténtalo de nuevo."
          tone="error"
          onRetry={retry}
          secondaryLabel="Cancelar"
          onSecondary={onCancel}
        />
      )}

      {status === 'error' && (
        <StatusBlurOverlay
          icon={<MaterialIcon name="cancel" size={30} fill={1} color="#D64545" />}
          title="No se pudo completar la verificación"
          subtitle={errorMessage}
          tone="error"
          onRetry={retry}
          secondaryLabel="Cancelar"
          onSecondary={onCancel}
        />
      )}

      <ManualRegisterSheet
        open={manualSheetOpen}
        actionTipo="MOVIMIENTO"
        title="Movimiento manual"
        subtitle="Se registrará sin verificación biométrica"
        motivo={manualMotivo}
        updateMotivo={updateManualMotivo}
        onSubmit={submitManualMovement}
        onClose={closeManualSheet}
        locationStatus={locationStatus}
        address={address}
        addressStatus={addressStatus}
        location={locationStatus === 'ready' ? location : null}
        now={Date.now()}
        submitLabel="Continuar sin biometría"
      />

      {manualError && (
        <div className="verify-manual-error-layer">
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
