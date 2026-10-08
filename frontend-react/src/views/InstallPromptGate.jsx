import StatusBlurOverlay from './shared/StatusBlurOverlay';
import MaterialIcon from './icons/MaterialIcon';
import { useInstallPrompt } from '../controllers/useInstallPrompt';

export default function InstallPromptGate({ active }) {
  const { visible, installing, fallback, install, dismiss } = useInstallPrompt(active);

  if (!visible) return null;

  if (fallback) {
    return (
      <StatusBlurOverlay
        icon={<MaterialIcon name="add_to_home_screen" size={28} fill={1} color="rgb(0, 31, 71)" />}
        title="Instala la aplicación"
        subtitle="Toca el menú ⋮ arriba a la derecha de Chrome y elige “Instalar aplicación” o “Agregar a pantalla de inicio”."
        tone="neutral"
        secondaryLabel="Entendido"
        onSecondary={dismiss}
      />
    );
  }

  return (
    <StatusBlurOverlay
      icon={<MaterialIcon name="install_mobile" size={28} fill={1} color="rgb(0, 31, 71)" />}
      title="Instala la aplicación"
      subtitle="Tenla siempre a un toque desde tu pantalla de inicio, con acceso más rápido y funcionamiento sin conexión."
      tone="neutral"
      retryLabel={installing ? 'Instalando…' : 'Instalar ahora'}
      onRetry={install}
      secondaryLabel="Ahora no"
      onSecondary={dismiss}
    />
  );
}
