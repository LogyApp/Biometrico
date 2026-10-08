import { httpPost } from './httpClient';

const AVATAR_BASE_URL = 'https://storage.googleapis.com/logyser-perfiles/facial-avatars';
const VERSION_KEY_PREFIX = 'lgy_avatar_v_';
const AVATAR_SIZE = 640;

export function getAvatarUrl(identificacion) {
  if (!identificacion) return null;
  const version = localStorage.getItem(`${VERSION_KEY_PREFIX}${identificacion}`) || '0';
  return `${AVATAR_BASE_URL}/${identificacion}.jpg?v=${version}`;
}

function bumpAvatarVersion(identificacion) {
  localStorage.setItem(`${VERSION_KEY_PREFIX}${identificacion}`, String(Date.now()));
}

function resizeToSquareBase64(file, size = AVATAR_SIZE, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const sx = (img.naturalWidth - side) / 2;
      const sy = (img.naturalHeight - side) / 2;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      const err = new Error('El archivo seleccionado está dañado o no es una imagen válida.');
      err.title = 'Archivo no válido';
      reject(err);
    };
    img.src = objectUrl;
  });
}

export async function uploadAvatar(identificacion, file) {
  if (!file.type.startsWith('image/')) {
    const err = new Error('Selecciona un archivo de imagen (JPG, PNG, etc.).');
    err.title = 'Archivo no válido';
    throw err;
  }
  const photo_base64 = await resizeToSquareBase64(file);
  await httpPost('/profile/avatar', { identificacion, photo_base64 }, 20000);
  bumpAvatarVersion(identificacion);
  return getAvatarUrl(identificacion);
}
