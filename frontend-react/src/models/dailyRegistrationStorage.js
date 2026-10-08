import { todayInBogota } from './dateUtils';

const STORAGE_KEY = 'lgy_daily_reg_v1';

export function hasRegisteredToday() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    return JSON.parse(raw).date === todayInBogota();
  } catch {
    return false;
  }
}

export function markRegisteredToday() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ date: todayInBogota() }));
  } catch {}
}
