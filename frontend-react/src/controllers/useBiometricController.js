import { getFirstName } from '../models/nameUtils';

export function useBiometricController(worker, onStartCapture, onChangeIdentity) {
  const fullName = worker?.nombre || '';

  return {
    firstName: getFirstName(fullName),
    fullName,
    onStartCapture,
    onChangeIdentity,
  };
}
