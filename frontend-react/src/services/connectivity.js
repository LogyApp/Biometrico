export function isConnectivityFailure(err) {
  return !navigator.onLine || err instanceof TypeError || err.name === 'AbortError';
}

export function isRateLimited(err) {
  return err.status === 429;
}

export const RATE_LIMIT_MESSAGE = 'El sistema está recibiendo muchas solicitudes en este momento. Espera unos segundos e intenta de nuevo.';
