const API_BASE = import.meta.env.VITE_API_URL || '/api';

function handleNetworkError(err) {
  if (!navigator.onLine || err instanceof TypeError) {
    throw new Error('Sin conexión con el servidor. Revisa tu conexión a internet o datos móviles e inténtalo de nuevo.');
  }
  throw err;
}

export async function getModulos() {
  try {
    const res = await fetch(`${API_BASE}/tickets/modulos`);
    if (!res.ok) throw new Error('Error al cargar módulos');
    return await res.json();
  } catch (err) {
    handleNetworkError(err);
  }
}

export async function getMotivos(modulo = 'Biometrico') {
  try {
    const res = await fetch(`${API_BASE}/tickets/motivos?modulo=${encodeURIComponent(modulo)}`);
    if (!res.ok) throw new Error('Error al cargar motivos');
    return await res.json();
  } catch (err) {
    handleNetworkError(err);
  }
}

export async function getWorkerPhone(identificacion) {
  try {
    const res = await fetch(`${API_BASE}/tickets/telefono/${encodeURIComponent(identificacion)}`);
    if (!res.ok) return '';
    const data = await res.json();
    return data?.telefono || '';
  } catch {
    return '';
  }
}

export async function getMisTickets(identificacion) {
  try {
    const res = await fetch(`${API_BASE}/tickets/mis-tickets/${encodeURIComponent(identificacion)}`);
    if (!res.ok) throw new Error('Error al cargar tus tickets');
    return await res.json();
  } catch (err) {
    handleNetworkError(err);
  }
}

export async function crearTicket(formData) {
  try {
    const res = await fetch(`${API_BASE}/tickets/crear`, {
      method: 'POST',
      body: formData,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(data?.detail || data?.error || 'Error al enviar el ticket');
    }
    return data;
  } catch (err) {
    handleNetworkError(err);
  }
}

export async function calificarTicket(ticket, identificacion, satisfaccion, sugerencia) {
  try {
    const res = await fetch(`${API_BASE}/tickets/${encodeURIComponent(ticket)}/calificar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identificacion: String(identificacion),
        satisfaccion: Number(satisfaccion),
        sugerencia: sugerencia ? String(sugerencia).trim() : null,
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(data?.detail || data?.error || 'Error al guardar la calificación');
    }
    return data;
  } catch (err) {
    handleNetworkError(err);
  }
}
