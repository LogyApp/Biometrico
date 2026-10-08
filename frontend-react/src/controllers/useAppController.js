import { useState } from 'react';
import { isOfflineReady } from '../services/offlineDb';
import { clearWorkerSession } from '../models/workerSessionStorage';

export function useAppController() {
  const [step, setStep] = useState('splash');
  const [worker, setWorker] = useState(null);

  function handleSplashReady() {
    setStep('access');
  }

  function goHomeOrPrepareOffline(nextWorker) {
    if (nextWorker) setWorker(nextWorker);
    setStep('home');
  }

  function handleStartDownload() {
    setStep('download');
  }

  function handleCancelDownload() {
    setStep('home');
  }

  function handleVerified(nextWorker) {
    setWorker(nextWorker);
    setStep('biometric');
  }

  function handleAlreadyEnrolled(nextWorker) {
    goHomeOrPrepareOffline(nextWorker);
  }

  function handleChangeIdentity() {
    clearWorkerSession();
    setWorker(null);
    setStep('access');
  }

  function handleStartCapture() {
    setStep('capture');
  }

  function handleCancelCapture() {
    setStep('biometric');
  }

  function handleEnrolled() {
    goHomeOrPrepareOffline(null);
  }

  function handleOfflineReady() {
    setStep('home');
  }

  function handleLogout() {
    clearWorkerSession();
    setWorker(null);
    setStep('access');
  }

  function handleFastExit() {
    clearWorkerSession();
    setWorker(null);
    setStep('access');
  }

  return {
    step,
    worker,
    handleSplashReady,
    handleVerified,
    handleAlreadyEnrolled,
    handleChangeIdentity,
    handleStartCapture,
    handleCancelCapture,
    handleEnrolled,
    handleStartDownload,
    handleCancelDownload,
    handleOfflineReady,
    handleLogout,
    handleFastExit,
  };
}
