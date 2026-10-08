import { useEffect, useState } from 'react';
import {
  checkEnrollment,
  getAccessFormError,
  shouldProceedToBiometric,
  shouldProceedToHome,
} from '../models/enrollmentModel';
import { isOfflineReady, getWorkerProfile } from '../services/offlineDb';
import { openSession } from '../models/sessionModel';
import { loadWorkerSession, saveWorkerSession, clearWorkerSession } from '../models/workerSessionStorage';
import { isConnectivityFailure, isRateLimited, RATE_LIMIT_MESSAGE } from '../services/connectivity';

const SESSION_CONFLICT_TITLE = 'Cuenta activa en otro dispositivo';
const SESSION_CONFLICT_DETAIL = 'Esta cuenta ya tiene una sesión abierta en otro dispositivo. Contacta a tu supervisor para reasignarlo.';

async function tryOfflineAccess(identificacion) {
  const ready = await isOfflineReady();
  if (!ready) return null;
  const profile = await getWorkerProfile();
  if (!profile || Number(profile.identificacion) !== identificacion) return null;
  return profile;
}

async function isSessionBlocked(identificacion) {
  try {
    const result = await openSession(identificacion);
    return result.status === 'other_device';
  } catch (err) {
    if (isConnectivityFailure(err)) return false;
    throw err;
  }
}

const DEFINITIVE_REJECTION_STATUSES = ['not_found', 'invalid_credentials'];

export function useAccessController({ onVerified, onAlreadyEnrolled }) {
  const saved = loadWorkerSession();
  const [documentNumber, setDocumentNumber] = useState('');
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [errorTitle, setErrorTitle] = useState(null);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [autoLoginPending, setAutoLoginPending] = useState(!!saved);
  const [autoLoginError, setAutoLoginError] = useState(null);
  const [autoLoginRetryTick, setAutoLoginRetryTick] = useState(0);

  useEffect(() => {
    const saved = loadWorkerSession();
    if (!saved) {
      setAutoLoginPending(false);
      return;
    }

    let cancelled = false;
    setAutoLoginPending(true);
    setAutoLoginError(null);

    (async () => {
      try {
        const response = await checkEnrollment({
          identificacion: saved.identificacion,
        });
        if (cancelled) return;

        if (shouldProceedToHome(response.status)) {
          const blocked = await isSessionBlocked(saved.identificacion);
          if (cancelled) return;
          if (!blocked) {
            setAutoLoginPending(false);
            onAlreadyEnrolled(response.worker);
            return;
          }
          raiseError(SESSION_CONFLICT_TITLE, SESSION_CONFLICT_DETAIL);
        } else if (shouldProceedToBiometric(response.status)) {
          // Enrolamiento que quedó a medias al cerrar la app: se retoma.
          setAutoLoginPending(false);
          onVerified(response.worker, {});
          return;
        } else if (DEFINITIVE_REJECTION_STATUSES.includes(response.status)) {
          clearWorkerSession();
        }
      } catch (err) {
        if (cancelled) return;
        // Sin red, timeout o error del servidor: la sesión guardada sigue
        // siendo válida, así que se entra con los datos de este dispositivo.
        const offline = await tryOfflineAccess(saved.identificacion);
        if (cancelled) return;
        if (offline) {
          setAutoLoginPending(false);
          onAlreadyEnrolled(offline);
          return;
        }
        if (isConnectivityFailure(err)) {
          setAutoLoginError('Sin conexión. Conéctate a internet para recuperar tu sesión.');
        } else if (isRateLimited(err)) {
          setAutoLoginError(RATE_LIMIT_MESSAGE);
        } else {
          setAutoLoginError('No pudimos verificar tu sesión guardada. Intenta de nuevo.');
        }
      }
      if (!cancelled) setAutoLoginPending(false);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLoginRetryTick]);

  function retryAutoLogin() {
    setAutoLoginRetryTick((t) => t + 1);
  }

  function dismissAutoLoginError() {
    setAutoLoginError(null);
  }

  function openPolicy() {
    setPolicyOpen(true);
  }

  function closePolicy() {
    setPolicyOpen(false);
  }

  function acceptPolicy() {
    setConsent(true);
    setPolicyOpen(false);
  }

  function dismissError() {
    setError(null);
    setErrorTitle(null);
  }

  function raiseError(title, detail) {
    setErrorTitle(title);
    setError(detail);
  }

  function updateDocumentNumber(value) {
    setDocumentNumber(value.replace(/[^0-9]/g, ''));
  }

  async function submit(event) {
    event.preventDefault();
    const formError = getAccessFormError({ documentNumber, consent });
    if (formError) {
      raiseError('Revisa los datos', formError);
      return;
    }
    setLoading(true);
    dismissError();
    try {
      const response = await checkEnrollment({
        identificacion: Number(documentNumber),
      });
      if (shouldProceedToBiometric(response.status)) {
        saveWorkerSession({ identificacion: Number(documentNumber) });
        onVerified(response.worker, {});
      } else if (shouldProceedToHome(response.status)) {
        const blocked = await isSessionBlocked(Number(documentNumber));
        if (blocked) {
          raiseError(SESSION_CONFLICT_TITLE, SESSION_CONFLICT_DETAIL);
        } else {
          saveWorkerSession({ identificacion: Number(documentNumber) });
          onAlreadyEnrolled(response.worker);
        }
      } else {
        raiseError('No pudimos verificarte', response.message);
      }
    } catch (err) {
      if (isConnectivityFailure(err)) {
        const offline = await tryOfflineAccess(Number(documentNumber));
        if (offline) {
          saveWorkerSession({ identificacion: Number(documentNumber) });
          onAlreadyEnrolled(offline);
          return;
        }
        raiseError(
          'Sin conexión',
          'No hay datos guardados en este dispositivo para esta cédula. Conéctate a internet para verificar por primera vez.'
        );
      } else if (isRateLimited(err)) {
        raiseError('Un momento', RATE_LIMIT_MESSAGE);
      } else {
        raiseError('Ocurrió un error', err.message);
      }
    } finally {
      setLoading(false);
    }
  }

  return {
    documentNumber,
    updateDocumentNumber,
    consent,
    setConsent,
    loading,
    error,
    errorTitle,
    dismissError,
    submit,
    policyOpen,
    openPolicy,
    closePolicy,
    acceptPolicy,
    autoLoginPending,
    autoLoginError,
    retryAutoLogin,
    dismissAutoLoginError,
  };
}
