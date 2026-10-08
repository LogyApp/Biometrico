import { httpGet } from '../services/httpClient';

export function getWaypoints(movimientoId) {
  return httpGet(`/history/movement/${movimientoId}/waypoints`);
}
