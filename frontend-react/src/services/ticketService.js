const API_BASE = import.meta.env.VITE_API_URL || '/api';

export async function getModulos() {
  const res = await fetch(`${API_BASE}/tickets/modulos`);
  if (!res.ok) throw new Error('Error al cargar módulos');
  return res.json();
}

export async function getMotivos(modulo = 'Biometrico') {
  const res = await fetch(`${API_BASE}/tickets/motivos?modulo=${encodeURIComponent(modulo)}`);
  if (!res.ok) throw new Error('Error al cargar motivos');
  return res.json();
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
  const res = await fetch(`${API_BASE}/tickets/mis-tickets/${encodeURIComponent(identificacion)}`);
  if (!res.ok) throw new Error('Error al cargar tus tickets');
  return res.json();
}

export async function crearTicket(formData) {
  const res = await fetch(`${API_BASE}/tickets/crear`, {
    method: 'POST',
    body: formData,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.detail || data?.error || 'Error al enviar el ticket');
  }
  return data;
}

export async function calificarTicket(ticket, identificacion, satisfaccion, sugerencia) {
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
}
