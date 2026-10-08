import ShieldCheckIcon from './icons/ShieldCheckIcon';
import MaterialIcon from './icons/MaterialIcon';
import StatusBlurOverlay from './shared/StatusBlurOverlay';
import BrandMark from './shared/BrandMark';
import './SplashView.css';

export default function SplashView({ progress, statusText, permissionPrompt }) {
  return (
    <div className="splash-screen splash-screen--new-design">
      <div className="splash-screen__glow splash-screen__glow--1" />
      <div className="splash-screen__glow splash-screen__glow--2" />
      <div className="splash-screen__texture" />

      <div className="splash-screen__company">
        <BrandMark />
      </div>

      <div className="splash-screen__brand">
        <div className="splash-screen__icon">
          <ShieldCheckIcon size={48} color="var(--color-accent)" strokeWidth={1.6} />
        </div>
        <div className="splash-screen__text">
          <div className="splash-screen__name">Biométrico</div>
          <div className="splash-screen__tagline">Control de acceso corporativo</div>
        </div>
      </div>

      <div className="splash-screen__loader">
        <div className="splash-screen__bar">
          <div className="splash-screen__bar-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
        <div className="splash-screen__status">{statusText}</div>
      </div>

      {permissionPrompt && (
        <StatusBlurOverlay
          icon={<MaterialIcon name="photo_camera" size={28} fill={1} color="rgb(0, 31, 71)" />}
          title="Necesitamos tu cámara"
          subtitle="La usamos para verificar tu identidad por reconocimiento facial."
          tone="neutral"
          retryLabel={permissionPrompt.requesting ? 'Solicitando…' : 'Permitir acceso'}
          onRetry={permissionPrompt.onAllow}
          secondaryLabel="Ahora no"
          onSecondary={permissionPrompt.onDismiss}
        />
      )}
    </div>
  );
}
