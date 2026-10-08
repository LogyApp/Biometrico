import { httpGet } from '../services/httpClient';

export function fetchSedes(identificacion) {
  return httpGet(`/sedes/${identificacion}`);
}

const ORIGEN_CHECK_TIMEOUT_MS = 5000;

export function checkOrigenNearSede(lat, lng) {
  return httpGet(`/sedes/origen-check?lat=${lat}&lng=${lng}`, ORIGEN_CHECK_TIMEOUT_MS);
}

export function groupSedesByRegional(sedes) {
  const groups = new Map();
  for (const sede of sedes) {
    if (!groups.has(sede.regional)) groups.set(sede.regional, []);
    groups.get(sede.regional).push(sede);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([regional, items]) => ({ regional, sedes: items }));
}

export function filterSedes(sedes, query) {
  const q = query.trim().toLowerCase();
  if (!q) return sedes;
  return sedes.filter(
    (s) => s.lugar.toLowerCase().includes(q) || s.regional.toLowerCase().includes(q)
  );
}
