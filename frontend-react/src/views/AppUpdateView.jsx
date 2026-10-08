import MaterialIcon from './icons/MaterialIcon';
import './AppUpdateView.css';

const NOTE_ICONS = {
  shield: 'verified_user',
  lock: 'lock',
  refresh: 'refresh',
};

export default function AppUpdateView({ info, updating, onUpdate }) {
  return (
    <div className="app-update-screen">
      <header className="app-update-header">
        <div className="app-update-header__circle" />
        <div className="app-update-header__icon">
          <MaterialIcon name="system_update" size={30} fill={1} color="#fff" />
        </div>
        <div className="app-update-header__title">Nueva versión disponible</div>
        {info.sizeMb != null && <div className="app-update-header__badge">{info.sizeMb} MB</div>}
      </header>

      <div className="app-update-body">
        <div className="app-update-intro">
          Esta actualización mejora el rendimiento y la seguridad de tu proceso de verificación:
        </div>

        <div className="app-update-notes">
          {(info.notes ?? []).map((note, i) => (
            <div className="app-update-note" key={i}>
              <div className="app-update-note__icon">
                <MaterialIcon name={NOTE_ICONS[note.icon] ?? 'refresh'} size={18} color="rgb(0, 31, 71)" />
              </div>
              <div className="app-update-note__body">
                <div className="app-update-note__title">{note.title}</div>
                <div className="app-update-note__desc">{note.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <button type="button" className="app-update-cta" onClick={onUpdate} disabled={updating}>
          {updating ? 'Actualizando…' : 'Actualizar ahora'}
        </button>
      </div>
    </div>
  );
}
