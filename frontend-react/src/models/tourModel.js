import ShieldCheckIcon from '../views/icons/ShieldCheckIcon';
import UserIcon from '../views/icons/UserIcon';
import CameraIcon from '../views/icons/CameraIcon';
import MapPinIcon from '../views/icons/MapPinIcon';
import ClockIcon from '../views/icons/ClockIcon';
import SquarePenIcon from '../views/icons/SquarePenIcon';
import LogInIcon from '../views/icons/LogInIcon';
import WifiOffIcon from '../views/icons/WifiOffIcon';
import NavigationIcon from '../views/icons/NavigationIcon';
import ClipboardIcon from '../views/icons/ClipboardIcon';
import CircleHelpIcon from '../views/icons/CircleHelpIcon';
import LogOutIcon from '../views/icons/LogOutIcon';

const TOUR_KEY = 'lgy_tour_done_v3';

export function hasSeenTour() {
  try {
    return !!localStorage.getItem(TOUR_KEY);
  } catch {
    return true;
  }
}

export function markTourSeen() {
  try {
    localStorage.setItem(TOUR_KEY, '1');
  } catch {}
}

export const TOUR_STEPS = [
  {
    icon: ShieldCheckIcon,
    title: 'Bienvenido a Logyser Acceso',
    description:
      'Esta guía recorre el sistema completo — cada pantalla, botón y condición que necesitas conocer. Tócala de nuevo cuando quieras desde el Centro de Ayuda. Puedes salir cuando quieras con <strong>Omitir guía</strong>.',
    side: 'over',
    align: 'center',
  },
  {
    element: '.home-identity__avatar-wrap',
    icon: UserIcon,
    title: 'Tu perfil',
    description: 'Consulta tu nombre, cédula, cargo, operación y regional registrados en el sistema. Es solo de consulta — tus datos laborales los administra tu empresa.',
    side: 'bottom',
    align: 'start',
  },
  {
    element: '.home-camera-card',
    icon: CameraIcon,
    title: 'Foto del último registro',
    description:
      'Queda la foto de tu última verificación biométrica, como respaldo visual. Se limpia sola 40 minutos después de completar tu jornada (entrada + salida), para que la pantalla siempre esté lista para el próximo registro.',
    side: 'bottom',
    align: 'center',
  },
  {
    element: '.home-location-row',
    icon: MapPinIcon,
    title: 'Ubicación GPS',
    description:
      'El sistema captura tu ubicación en cada marcación para fines de auditoría. Necesita el permiso de ubicación una sola vez — si lo rechazas, te lo pedirá de nuevo cuando lo necesite. Toca el ícono del mapa para ver el punto exacto.',
    side: 'bottom',
    align: 'center',
  },
  {
    element: '.home-day-card',
    icon: ClockIcon,
    title: 'Registro del día',
    description:
      'Muestra tu hora de entrada y salida de hoy. Igual que la foto, se restablece 40 minutos después de completar el ciclo — no se pierde nada, tu historial real sigue disponible en <strong>Registros</strong>.',
    side: 'top',
    align: 'center',
  },
  {
    element: '.home-day-card__manual',
    icon: SquarePenIcon,
    title: 'Registro Manual',
    description:
      'Úsalo solo si la cámara falla. Debes describir un motivo real y detallado — el sistema rechaza una sola palabra o texto sin sentido. Queda marcado como <strong>manual</strong> en tu historial para auditoría.',
    side: 'top',
    align: 'center',
  },
  {
    element: '.home-action-btn',
    icon: LogInIcon,
    title: 'Registrar Ingreso / Salida',
    description:
      'El botón principal: cambia automáticamente entre <strong>Ingreso</strong> y <strong>Salida</strong> según tu estado actual. Verifica tu identidad moviendo la cabeza frente a la cámara — sin fotos congeladas, todo en video en vivo.',
    side: 'top',
    align: 'center',
  },
  {
    icon: WifiOffIcon,
    title: 'Funciona sin conexión',
    description:
      'Todo el reconocimiento facial corre directamente en tu teléfono, así que marcar entrada, salida o un movimiento funciona igual con o sin internet. La hora real queda guardada en el momento exacto en que registras, y todo se sincroniza solo apenas vuelva la señal.',
    side: 'over',
    align: 'center',
  },
  {
    element: '.home-tab--movimiento',
    icon: NavigationIcon,
    title: 'Registrar Movimiento',
    description:
      'Para salidas temporales — diligencias, entregas, visitas a otras sedes. Primero verificas tu identidad, luego eliges <strong>navegación libre</strong> o un <strong>destino fijo</strong> (con paradas intermedias y regreso opcional). El recorrido GPS completo queda registrado.',
    side: 'top',
    align: 'center',
  },
  {
    element: '.home-tab--registros',
    icon: ClipboardIcon,
    title: 'Historial de registros',
    description: 'Consulta todas tus marcaciones y recorridos anteriores. Cada una indica si fue biométrica o manual, y los movimientos incluyen el mapa completo del trayecto.',
    side: 'top',
    align: 'center',
  },
  {
    element: '.home-tab--ayuda',
    icon: CircleHelpIcon,
    title: 'Centro de ayuda',
    description: 'Aquí encuentras un resumen de cada función y puedes volver a ver esta guía completa cuando quieras.',
    side: 'top',
    align: 'center',
  },
  {
    element: '.home-tab--logout',
    icon: LogOutIcon,
    title: 'Cerrar sesión',
    description:
      'Libera este dispositivo para que otro trabajador pueda iniciar sesión — cada cuenta solo puede estar activa en un dispositivo a la vez. Si tienes un ingreso sin salida registrada, primero debes cerrarlo antes de salir del sistema.',
    side: 'top',
    align: 'end',
  },
];

export const TOUR_STEPS_NEW = [
  {
    element: '.home-header__help-btn',
    icon: 'help',
    title: 'Centro de Ayuda',
    description: 'Desde aquí abres esta guía y un resumen de cada función, cuando lo necesites.',
  },
  {
    element: '.home-identity--floating',
    icon: 'schedule',
    title: 'Estado del día',
    description: 'Muestra si ya registraste tu entrada, si tienes un turno en curso, o cómo quedó tu jornada de hoy.',
  },
  {
    element: '.home-reg-card__camera',
    icon: 'center_focus_strong',
    title: 'Registro biométrico',
    description: 'Aquí registras tu entrada y salida verificando tu identidad. El botón cambia según tu estado del día.',
  },
  {
    element: '.home-reg-card__manual',
    icon: 'edit_square',
    title: 'Registro Manual',
    description: 'Si la cámara falla, registra manualmente describiendo un motivo real y detallado.',
  },
  {
    icon: 'wifi_off',
    title: 'Funciona sin conexión',
    description: 'El reconocimiento facial corre en tu teléfono — marca igual aunque no tengas internet en ese momento.',
  },
  {
    element: '.home-reg-card__location-link',
    icon: 'location_on',
    title: 'Tu ubicación',
    description: 'El sistema captura tu ubicación en cada marcación para fines de auditoría. Toca la dirección para verla en el mapa.',
  },
  {
    element: '.home-time-card',
    icon: 'show_chart',
    title: 'Resumen del día',
    description: 'Tu tiempo trabajado hoy, con la hora de entrada y de salida cuando ya la registraste.',
  },
  {
    element: '.home-recent',
    icon: 'history',
    title: 'Historial de movimientos',
    description: 'Tus últimos movimientos registrados, con hora, dirección y estado. Toca "Ver todos" para el historial completo.',
  },
  {
    element: '.home-tab--registros',
    icon: 'history',
    title: 'Registros',
    description: 'Desde el footer abres tu historial completo de marcaciones y movimientos, con filtros por fecha y tipo de registro.',
  },
  {
    element: '.home-tab--movimiento',
    icon: 'near_me',
    title: 'Movimiento',
    description: 'Sal temporalmente (diligencias, entregas). El sistema registra tu recorrido GPS completo.',
  },
  {
    element: '.home-tab--perfil',
    icon: 'person',
    title: 'Tu perfil',
    description: 'Consulta tu nombre, cédula, cargo, operación y regional registrados en el sistema. Es solo consulta — tus datos laborales los administra tu empresa.',
  },
];

export const MOVEMENT_TOUR_STEPS = [
  {
    element: '.move-choice-grid-card--destino',
    icon: 'location_on',
    title: 'Ir a un destino',
    description: 'Fija el punto exacto en el mapa. El sistema calcula la ruta y el tiempo estimado — ideal para entregas o diligencias con dirección conocida.',
  },
  {
    element: '.move-choice-grid-card--libre',
    icon: 'near_me',
    title: 'Navegación libre',
    description: 'Sin destino fijo. Se registra tu recorrido GPS completo en tiempo real — ideal para rutas con varias paradas o destinos variables.',
  },
  {
    element: '.move-choice-grid-card--sedes',
    icon: 'apartment',
    title: 'Traslado entre sedes',
    description: 'Próximamente: registra tu traslado permanente a otra sede o punto de trabajo, eligiendo origen y destino desde el mapa.',
  },
  {
    element: '.move-choice-cancel',
    icon: 'close',
    title: 'Cancelar',
    description: 'Si no vas a registrar un movimiento ahora, toca aquí para volver a la pantalla principal sin guardar nada.',
  },
];
