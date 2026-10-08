import { useState } from 'react';
import { getDisplayName } from '../models/nameUtils';
import { buildProfileFields } from '../models/profileModel';
import { getAvatarUrl, uploadAvatar } from '../services/avatarService';
import { isConnectivityFailure } from '../services/connectivity';
import { formatDateShort, formatTimeShort } from '../models/dateUtils';

function mapAvatarError(err) {
  if (isConnectivityFailure(err)) {
    return {
      title: 'Sin conexión',
      message: 'No tienes conexión a internet. Verifica tu red e intenta de nuevo.',
    };
  }
  if (err.title) {
    return { title: err.title, message: err.message };
  }
  if (err.status === 422) {
    return { title: 'Imagen no válida', message: err.message };
  }
  if (err.status === 429) {
    return {
      title: 'Demasiados intentos',
      message: 'Espera un momento antes de volver a intentar subir tu foto.',
    };
  }
  if (err.status === 503) {
    return { title: 'Servicio no disponible', message: err.message };
  }
  return {
    title: 'Ocurrió un error',
    message: err.message || 'No se pudo actualizar la foto de perfil. Intenta de nuevo.',
  };
}

export function useProfileController({ worker, onBack, onLogout, lastAttendanceRecord }) {
  const identificacion = worker?.identificacion;
  const [avatarUrl, setAvatarUrl] = useState(() => getAvatarUrl(identificacion));
  const [avatarBroken, setAvatarBroken] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [avatarError, setAvatarError] = useState(null);

  async function onAvatarFileSelected(file) {
    if (!file || !identificacion) return;
    setUploading(true);
    setAvatarError(null);
    try {
      const url = await uploadAvatar(identificacion, file);
      setAvatarUrl(url);
      setAvatarBroken(false);
    } catch (err) {
      setAvatarError(mapAvatarError(err));
    } finally {
      setUploading(false);
    }
  }

  const lastEntryLabel = lastAttendanceRecord
    ? `${lastAttendanceRecord.tipo === 'SALIDA' ? 'Última salida' : 'Último ingreso'}: ${formatDateShort(new Date(lastAttendanceRecord.fecha_hora))} · ${formatTimeShort(new Date(lastAttendanceRecord.fecha_hora))}`
    : null;

  return {
    displayName: getDisplayName(worker?.nombre),
    identificacion,
    fields: buildProfileFields(worker),
    onBack,
    onLogout,
    lastEntryLabel,
    avatarUrl: avatarBroken ? null : avatarUrl,
    onAvatarError: () => setAvatarBroken(true),
    onAvatarFileSelected,
    uploading,
    avatarError,
    dismissAvatarError: () => setAvatarError(null),
  };
}
