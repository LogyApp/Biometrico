const STORAGE_KEY = 'lgy_photo_v1';

export function getStoredPhoto() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredPhoto(dataUrl) {
  try {
    if (dataUrl) {
      localStorage.setItem(STORAGE_KEY, dataUrl);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {}
}
