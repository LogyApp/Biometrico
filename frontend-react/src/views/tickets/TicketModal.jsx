import { useState, useEffect, useRef } from 'react';
import MaterialIcon from '../icons/MaterialIcon';
import {
  getMotivos,
  getWorkerPhone,
  getMisTickets,
  crearTicket,
  calificarTicket,
} from '../../services/ticketService';
import './TicketModal.css';

const MOTIVOS_DEFAULT = [
  'Modificar Hora',
  'Agregar Asistencia',
  'Reiniciar lectura de rostro',
  'Otro',
];

const STAR_LABELS = {
  1: 'Muy insatisfecho',
  2: 'Insatisfecho',
  3: 'Neutral',
  4: 'Satisfecho',
  5: 'Muy satisfecho',
};

const ESTADO_CLASSES = {
  'en proceso': 'tkb-estado--proceso',
  'pendiente': 'tkb-estado--pendiente',
  'resuelto': 'tkb-estado--resuelto',
  'rechazado': 'tkb-estado--rechazado',
};

export default function TicketModal({ open, onClose, worker, onTicketChanged }) {
  const [tab, setTab] = useState('nuevo'); // 'nuevo' | 'mis_tickets'

  // Formulario nuevo ticket
  const [motivos, setMotivos] = useState(MOTIVOS_DEFAULT);
  const [motivoSelect, setMotivoSelect] = useState('Modificar Hora');
  const [motivoCustom, setMotivoCustom] = useState('');
  const [telefono, setTelefono] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [archivo, setArchivo] = useState(null);
  const [archivoPreview, setArchivoPreview] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [formError, setFormError] = useState(null);
  const [ticketCreado, setTicketCreado] = useState(null);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  const fileInputRef = useRef(null);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Mis tickets
  const [ticketsData, setTicketsData] = useState({
    tickets: [],
    quincena: null,
    porCalificar: 0,
    porEstado: {},
  });
  const [cargandoTickets, setCargandoTickets] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState('Todos');

  // Calificación interactiva
  const [califStates, setCalifStates] = useState({}); // { [ticketId]: { stars: 5, hoverStars: 0, comment: '', sending: false, error: null } }

  // Cargar motivos configurados
  useEffect(() => {
    if (!open) return;
    let cancel = false;
    getMotivos('Biometrico')
      .then((mots) => {
        if (!cancel && Array.isArray(mots) && mots.length > 0) {
          setMotivos(mots);
          if (!mots.includes(motivoSelect)) {
            setMotivoSelect(mots[0]);
          }
        }
      })
      .catch((err) => console.warn('Error cargando motivos:', err));
    return () => {
      cancel = true;
    };
  }, [open]);

  // Pre-llenar teléfono desde Maestro_Segmentación (columna Celular)
  useEffect(() => {
    if (!open || !worker?.identificacion) return;
    let cancel = false;
    getWorkerPhone(worker.identificacion)
      .then((phone) => {
        if (!cancel && phone && !telefono) {
          setTelefono(phone);
        }
      })
      .catch((err) => console.warn('Error obteniendo teléfono:', err));
    return () => {
      cancel = true;
    };
  }, [open, worker?.identificacion]);

  // Cargar mis tickets
  const cargarTickets = async () => {
    if (!worker?.identificacion) return;
    setCargandoTickets(true);
    try {
      const data = await getMisTickets(worker.identificacion);
      setTicketsData({
        tickets: data.tickets || [],
        quincena: data.quincena || null,
        porCalificar: data.porCalificar || 0,
        porEstado: data.porEstado || {},
      });
      if (onTicketChanged) {
        onTicketChanged(data.porCalificar || 0);
      }
    } catch (err) {
      console.warn('Error cargando mis tickets:', err);
    } finally {
      setCargandoTickets(false);
    }
  };

  useEffect(() => {
    if (open) {
      cargarTickets();
    }
  }, [open, worker?.identificacion]);

  // Limpiar preview de archivo al desmontar
  useEffect(() => {
    return () => {
      if (archivoPreview) {
        URL.revokeObjectURL(archivoPreview);
      }
    };
  }, [archivoPreview]);

  if (!open) return null;

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (archivoPreview) {
      URL.revokeObjectURL(archivoPreview);
    }
    setArchivo(file);
    if (file.type.startsWith('image/')) {
      setArchivoPreview(URL.createObjectURL(file));
    } else {
      setArchivoPreview(null);
    }
  };

  const handleRemoveFile = () => {
    if (archivoPreview) {
      URL.revokeObjectURL(archivoPreview);
    }
    setArchivo(null);
    setArchivoPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmitNuevo = async (e) => {
    e.preventDefault();
    setFormError(null);
    setTicketCreado(null);

    if (!isOnline) {
      setFormError('Estás sin conexión a internet. Conéctate a una red móvil o Wi-Fi para enviar el ticket.');
      return;
    }

    const motivoFinal =
      motivoSelect === 'Otro' ? (motivoCustom.trim() || 'Otro') : motivoSelect;

    if (!motivoFinal) {
      setFormError('Por favor especifica el motivo del ticket.');
      return;
    }

    if (!descripcion.trim()) {
      setFormError('Por favor describe la novedad o problema.');
      return;
    }

    setEnviando(true);
    try {
      const fd = new FormData();
      fd.append('identificacion', String(worker?.identificacion || ''));
      fd.append('operacion', String(worker?.operacion || 'BOGOTA'));
      fd.append('modulo', 'Biometrico');
      fd.append('motivo', motivoFinal);
      fd.append('descripcion', descripcion.trim());
      if (telefono.trim()) {
        fd.append('telefono', telefono.trim());
      }
      if (archivo) {
        fd.append('evidencia', archivo);
      }

      const res = await crearTicket(fd);
      setTicketCreado(res.ticket);
      // Reset form fields
      setDescripcion('');
      setMotivoCustom('');
      handleRemoveFile();
      // Recargar tickets
      await cargarTickets();
    } catch (err) {
      setFormError(err.message || 'Error al enviar el ticket.');
    } finally {
      setEnviando(false);
    }
  };

  // Manejo de calificación
  const initCalifState = (ticketId) => {
    if (!califStates[ticketId]) {
      setCalifStates((prev) => ({
        ...prev,
        [ticketId]: { stars: 5, hoverStars: 0, comment: '', sending: false, error: null },
      }));
    }
  };

  const setCalifStars = (ticketId, stars) => {
    setCalifStates((prev) => ({
      ...prev,
      [ticketId]: { ...(prev[ticketId] || {}), stars },
    }));
  };

  const setCalifHover = (ticketId, hoverStars) => {
    setCalifStates((prev) => ({
      ...prev,
      [ticketId]: { ...(prev[ticketId] || {}), hoverStars },
    }));
  };

  const setCalifComment = (ticketId, comment) => {
    setCalifStates((prev) => ({
      ...prev,
      [ticketId]: { ...(prev[ticketId] || {}), comment },
    }));
  };

  const handleSubmitCalificacion = async (ticketId) => {
    const state = califStates[ticketId] || { stars: 5, comment: '' };
    setCalifStates((prev) => ({
      ...prev,
      [ticketId]: { ...(prev[ticketId] || {}), sending: true, error: null },
    }));

    try {
      await calificarTicket(
        ticketId,
        worker.identificacion,
        state.stars,
        state.comment
      );
      // Actualizar localmente el ticket
      setTicketsData((prev) => {
        const updated = prev.tickets.map((t) => {
          if (t.ticket === ticketId) {
            return {
              ...t,
              porCalificar: false,
              satisfaccion: state.stars,
              sugerencia: state.comment,
              fechaCalificacion: new Date().toISOString().replace('T', ' ').slice(0, 16),
            };
          }
          return t;
        });
        const newPorCalificar = updated.filter((t) => t.porCalificar).length;
        if (onTicketChanged) {
          onTicketChanged(newPorCalificar);
        }
        return {
          ...prev,
          tickets: updated,
          porCalificar: newPorCalificar,
        };
      });
    } catch (err) {
      setCalifStates((prev) => ({
        ...prev,
        [ticketId]: { ...(prev[ticketId] || {}), sending: false, error: err.message },
      }));
    }
  };

  // Filtrado de tickets
  const ticketsFiltrados = ticketsData.tickets.filter((t) => {
    if (filtroEstado === 'Todos') return true;
    return String(t.estado || '').toLowerCase() === filtroEstado.toLowerCase();
  });

  return (
    <div className="tkb-overlay" onClick={onClose}>
      <div className="tkb-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <header className="tkb-header">
          <div className="tkb-header__title">
            <span style={{ fontSize: '1.25rem' }}>🎫</span>
            <span>Tickets de Soporte</span>
          </div>
          <button
            type="button"
            className="tkb-close-btn"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <MaterialIcon name="close" size={18} color="#fff" />
          </button>
        </header>

        {/* Tabs */}
        <div className="tkb-tabs">
          <button
            type="button"
            className={`tkb-tab ${tab === 'nuevo' ? 'tkb-tab--active' : ''}`}
            onClick={() => {
              setTab('nuevo');
              setTicketCreado(null);
            }}
          >
            <span>＋ Nuevo ticket</span>
          </button>

          <button
            type="button"
            className={`tkb-tab ${tab === 'mis_tickets' ? 'tkb-tab--active' : ''}`}
            onClick={() => {
              setTab('mis_tickets');
              cargarTickets();
            }}
          >
            <span>Mis tickets</span>
            {ticketsData.porCalificar > 0 ? (
              <span className="tkb-tab-badge tkb-tab-badge--calificar">
                ⭐ {ticketsData.porCalificar}
              </span>
            ) : ticketsData.tickets.length > 0 ? (
              <span className="tkb-tab-badge">{ticketsData.tickets.length}</span>
            ) : null}
          </button>
        </div>

        {/* Body */}
        <div className="tkb-body">
          {tab === 'nuevo' ? (
            <form onSubmit={handleSubmitNuevo}>
              {/* Información del solicitante */}
              <div className="tkb-worker-info">
                <div className="tkb-worker-info__row">
                  <span className="tkb-worker-info__label">Solicitante:</span>
                  <span className="tkb-worker-info__val">
                    {worker?.nombre || 'Colaborador'} ({worker?.identificacion})
                  </span>
                </div>
                <div className="tkb-worker-info__row">
                  <span className="tkb-worker-info__label">Operación:</span>
                  <span className="tkb-worker-info__val">
                    {worker?.operacion || 'Operación general'}
                  </span>
                </div>
              </div>

              {!isOnline && (
                <div className="tkb-alert-offline">
                  <MaterialIcon name="wifi_off" size={18} color="#92400e" />
                  <span>Estás sin conexión a internet. Los tickets requieren conexión activa para enviarse y adjuntar evidencias.</span>
                </div>
              )}

              {ticketCreado && (
                <div className="tkb-alert-success">
                  <MaterialIcon name="check_circle" size={20} color="#15803d" />
                  <div>
                    <div>¡Ticket <strong>#{ticketCreado}</strong> creado con éxito!</div>
                    <button
                      type="button"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#15803d',
                        textDecoration: 'underline',
                        fontWeight: 700,
                        cursor: 'pointer',
                        padding: 0,
                        marginTop: 4,
                        fontSize: '0.8rem',
                      }}
                      onClick={() => setTab('mis_tickets')}
                    >
                      Ver en "Mis tickets" →
                    </button>
                  </div>
                </div>
              )}

              {formError && (
                <div className="tkb-alert-error">
                  <MaterialIcon name="error" size={18} color="#b91c1c" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Motivo */}
              <div className="tkb-form-group">
                <label htmlFor="tkb-motivo">
                  Motivo<span className="tkb-req">*</span>
                </label>
                <select
                  id="tkb-motivo"
                  className="tkb-select"
                  value={motivoSelect}
                  onChange={(e) => setMotivoSelect(e.target.value)}
                  disabled={enviando}
                >
                  {motivos.map((mot) => (
                    <option key={mot} value={mot}>
                      {mot}
                    </option>
                  ))}
                </select>

                {motivoSelect === 'Otro' && (
                  <input
                    type="text"
                    className="tkb-input"
                    style={{ marginTop: 6 }}
                    placeholder="Describe brevemente el motivo..."
                    value={motivoCustom}
                    onChange={(e) => setMotivoCustom(e.target.value)}
                    disabled={enviando}
                    autoFocus
                  />
                )}
              </div>

              {/* Teléfono prellenado */}
              <div className="tkb-form-group">
                <label htmlFor="tkb-tel">Teléfono / Celular de contacto</label>
                <input
                  id="tkb-tel"
                  type="tel"
                  className="tkb-input"
                  placeholder="Ej: 3001234567"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  disabled={enviando}
                />
                <small className="tkb-hint">Tomado automáticamente de tu registro (puedes actualizarlo si cambió).</small>
              </div>

              {/* Descripción */}
              <div className="tkb-form-group">
                <label htmlFor="tkb-desc">
                  Descripción<span className="tkb-req">*</span>
                </label>
                <textarea
                  id="tkb-desc"
                  className="tkb-textarea"
                  placeholder="Describe detalladamente la novedad, fecha, hora o asistencia a gestionar..."
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  disabled={enviando}
                />
              </div>

              {/* Evidencia */}
              <div className="tkb-form-group">
                <label>Evidencia adjunta (opcional)</label>
                <input
                  type="file"
                  ref={fileInputRef}
                  className="tkb-file-input"
                  accept="image/*,.pdf"
                  onChange={handleFileChange}
                />

                {!archivo ? (
                  <div
                    className="tkb-file-drop"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <MaterialIcon name="attach_file" size={24} color="#6b21a8" />
                    <div>
                      <span style={{ fontWeight: 600, color: '#4a148c', fontSize: '0.86rem' }}>
                        Toca aquí para adjuntar foto o documento
                      </span>
                      <small className="tkb-hint">Formatos: JPG, PNG o PDF (máx. 15 MB)</small>
                    </div>
                  </div>
                ) : (
                  <div className="tkb-file-preview-card">
                    <div className="tkb-file-preview-info">
                      {archivoPreview ? (
                        <img src={archivoPreview} alt="Vista previa" className="tkb-file-preview-thumb" />
                      ) : (
                        <MaterialIcon name="description" size={24} color="#6b21a8" />
                      )}
                      <span className="tkb-file-preview-name">{archivo.name}</span>
                    </div>
                    <button
                      type="button"
                      className="tkb-file-remove-btn"
                      onClick={handleRemoveFile}
                      title="Eliminar archivo"
                    >
                      <MaterialIcon name="close" size={18} color="#ef4444" />
                    </button>
                  </div>
                )}
              </div>

              {/* Footer dentro del formulario */}
              <div className="tkb-footer" style={{ margin: '16px -20px -18px', padding: '14px 20px' }}>
                <button
                  type="button"
                  className="tkb-btn-secundario"
                  onClick={onClose}
                  disabled={enviando}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="tkb-btn-primario"
                  disabled={enviando || !isOnline}
                  title={!isOnline ? 'Requiere conexión a internet' : ''}
                >
                  {enviando ? (
                    <>
                      <MaterialIcon name="sync" size={16} color="#fff" />
                      <span>Enviando…</span>
                    </>
                  ) : !isOnline ? (
                    <>
                      <MaterialIcon name="wifi_off" size={16} color="#fff" />
                      <span>Sin conexión</span>
                    </>
                  ) : (
                    <span>Enviar ticket</span>
                  )}
                </button>
              </div>
            </form>
          ) : (
            /* Tab: Mis Tickets */
            <div>
              {/* Header de quincena y aviso de calificar */}
              <div className="tkb-mis-header">
                {ticketsData.quincena && (
                  <span className="tkb-quincena">
                    📅 {ticketsData.quincena.nombre}
                  </span>
                )}
                <button
                  type="button"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#6b21a8',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: '0.8rem',
                    fontWeight: 600,
                  }}
                  onClick={cargarTickets}
                >
                  <MaterialIcon name="refresh" size={15} color="#6b21a8" />
                  <span>Actualizar</span>
                </button>
              </div>

              {ticketsData.porCalificar > 0 && (
                <div className="tkb-aviso-calificar">
                  <MaterialIcon name="star" size={20} color="#166534" fill={1} />
                  <span>
                    Tienes <strong>{ticketsData.porCalificar}</strong> ticket(s) con respuesta listos para calificar.
                  </span>
                </div>
              )}

              {/* Filtros por estado */}
              <div className="tkb-chips">
                {['Todos', 'En Proceso', 'Pendiente', 'Resuelto', 'Rechazado'].map((st) => (
                  <button
                    key={st}
                    type="button"
                    className={`tkb-chip ${filtroEstado === st ? 'tkb-chip--activo' : ''}`}
                    onClick={() => setFiltroEstado(st)}
                  >
                    {st}{' '}
                    {st !== 'Todos' && ticketsData.porEstado[st] ? (
                      <b>({ticketsData.porEstado[st]})</b>
                    ) : null}
                  </button>
                ))}
              </div>

              {/* Lista de tickets */}
              {cargandoTickets ? (
                <div className="tkb-empty">
                  <MaterialIcon name="sync" size={28} color="#6b21a8" />
                  <span>Consultando tickets…</span>
                </div>
              ) : ticketsFiltrados.length === 0 ? (
                <div className="tkb-empty">
                  <MaterialIcon name="inbox" size={36} color="#94a3b8" />
                  <span>No tienes tickets con el filtro seleccionado.</span>
                  <button
                    type="button"
                    className="tkb-btn-secundario"
                    style={{ marginTop: 8 }}
                    onClick={() => setTab('nuevo')}
                  >
                    Crear un nuevo ticket
                  </button>
                </div>
              ) : (
                <div className="tkb-tickets-list">
                  {ticketsFiltrados.map((t) => {
                    const stNorm = String(t.estado || '').toLowerCase();
                    const stClass = ESTADO_CLASSES[stNorm] || 'tkb-estado--proceso';
                    const calif = califStates[t.ticket] || { stars: 5, hoverStars: 0, comment: '', sending: false, error: null };
                    const activeStars = calif.hoverStars || calif.stars;

                    if (t.porCalificar) {
                      initCalifState(t.ticket);
                    }

                    return (
                      <div
                        key={t.ticket}
                        className={`tkb-item ${t.porCalificar ? 'tkb-item--por-calificar' : ''}`}
                      >
                        <div className="tkb-item-top">
                          <span className="tkb-item-id">#{t.ticket}</span>
                          <span className={`tkb-estado ${stClass}`}>
                            {t.estado || 'En Proceso'}
                          </span>
                          <span className="tkb-item-fecha">{t.fechaRegistro}</span>
                        </div>

                        <div className="tkb-item-meta">
                          {t.motivo}
                        </div>

                        <div className="tkb-item-desc">{t.descripcion}</div>

                        {t.evidencia && (
                          <div className="tkb-item-evidencia">
                            📎{' '}
                            <a href={t.evidencia} target="_blank" rel="noopener noreferrer">
                              Ver archivo adjunto
                            </a>
                          </div>
                        )}

                        {t.observaciones && (
                          <div className="tkb-item-respuesta">
                            <div className="tkb-item-respuesta__title">Respuesta de soporte:</div>
                            <div className="tkb-item-respuesta__text">{t.observaciones}</div>
                          </div>
                        )}

                        {/* Caja interactiva para calificar si está por calificar */}
                        {t.porCalificar ? (
                          <div className="tkb-calif-box">
                            <div className="tkb-calif-box__title">
                              ⭐ Califica la atención de este ticket
                            </div>
                            <div className="tkb-calif-box__desc">
                              El ticket fue respondido. Por favor indica qué tan satisfecho estás:
                            </div>

                            <div className="tkb-estrellas">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                  key={star}
                                  type="button"
                                  className={`tkb-estrella-btn ${star <= activeStars ? 'tkb-estrella-btn--activa' : ''}`}
                                  onMouseEnter={() => setCalifHover(t.ticket, star)}
                                  onMouseLeave={() => setCalifHover(t.ticket, 0)}
                                  onClick={() => setCalifStars(t.ticket, star)}
                                  aria-label={`${star} estrellas`}
                                >
                                  ★
                                </button>
                              ))}
                            </div>

                            <div className="tkb-estrellas-desc">
                              {STAR_LABELS[activeStars] || ''}
                            </div>

                            <textarea
                              className="tkb-calif-textarea"
                              placeholder="¿Tienes alguna sugerencia o comentario adicional? (opcional)"
                              value={calif.comment}
                              onChange={(e) => setCalifComment(t.ticket, e.target.value)}
                              disabled={calif.sending}
                            />

                            {calif.error && (
                              <div className="tkb-alert-error" style={{ marginBottom: 8 }}>
                                <span>{calif.error}</span>
                              </div>
                            )}

                            <button
                              type="button"
                              className="tkb-btn-primario"
                              onClick={() => handleSubmitCalificacion(t.ticket)}
                              disabled={calif.sending}
                            >
                              {calif.sending ? 'Guardando…' : 'Enviar calificación'}
                            </button>
                          </div>
                        ) : t.satisfaccion ? (
                          <div className="tkb-item-calificado">
                            <span className="tkb-item-calificado__stars">
                              {'★'.repeat(t.satisfaccion)}
                              {'☆'.repeat(5 - t.satisfaccion)}
                            </span>{' '}
                            <strong>Calificado ({t.satisfaccion}/5)</strong>
                            {t.fechaCalificacion && <span> · {t.fechaCalificacion}</span>}
                            {t.sugerencia && (
                              <div style={{ marginTop: 2, fontStyle: 'italic', color: '#4b5563' }}>
                                "{t.sugerencia}"
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
