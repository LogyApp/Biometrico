import { useState } from 'react';
import { useAppController } from './controllers/useAppController';
import { useSplashController } from './controllers/useSplashController';
import { useAccessController } from './controllers/useAccessController';
import { useBiometricController } from './controllers/useBiometricController';
import { useCaptureController } from './controllers/useCaptureController';
import { useHomeController } from './controllers/useHomeController';
import { useVerifyController } from './controllers/useVerifyController';
import { useRecordsController } from './controllers/useRecordsController';
import { useMovementRouteController } from './controllers/useMovementRouteController';
import { useHelpController } from './controllers/useHelpController';
import { useScreenTour } from './controllers/useScreenTour';
import { MOVEMENT_TOUR_STEPS } from './models/tourModel';
import { useMovementChoiceController } from './controllers/useMovementChoiceController';
import { useMovementDestinoController } from './controllers/useMovementDestinoController';
import { useMovementSedesController } from './controllers/useMovementSedesController';
import { useMovementTrackingController } from './controllers/useMovementTrackingController';
import { useProfileController } from './controllers/useProfileController';
import { useDownloadController } from './controllers/useDownloadController';
import { useAppUpdateController } from './controllers/useAppUpdateController';
import { getDisplayName } from './models/nameUtils';
import { useHtmlTheme, useHtmlBackground } from './services/htmlTheme';
import AccessView from './views/AccessView';
import BiometricView from './views/BiometricView';
import CaptureView from './views/CaptureView';
import HomeView from './views/HomeView';
import VerifyView from './views/VerifyView';
import RecordsView from './views/RecordsView';
import MovementRouteView from './views/MovementRouteView';
import LocationDetailView from './views/LocationDetailView';
import HelpSheet from './views/HelpSheet';
import TourView from './views/TourView';
import MovementChoiceView from './views/MovementChoiceView';
import MovementDestinoView from './views/MovementDestinoView';
import MovementSedesView from './views/MovementSedesView';
import MovementTrackingView from './views/MovementTrackingView';
import ProfileView from './views/ProfileView';
import DownloadView from './views/DownloadView';
import SplashView from './views/SplashView';
import AppUpdateView from './views/AppUpdateView';
import InstallPromptGate from './views/InstallPromptGate';

const VERIFY_TIPO_LABELS = {
  ENTRADA: 'Registrar Ingreso',
  SALIDA: 'Registrar Salida',
  MOVIMIENTO: 'Verificación de seguridad',
};

function CaptureScreen({ identificacion, onEnrolled, onCancel }) {
  const capture = useCaptureController({ identificacion, onEnrolled, onCancel });
  return <CaptureView {...capture} />;
}

function VerifyScreen({ identificacion, tipo, location, locationStatus, address, addressStatus, workerName, onDone, onCancel }) {
  const verify = useVerifyController({ identificacion, tipo, location, onDone, onCancel });
  return (
    <VerifyView
      {...verify}
      tipo={tipo}
      tipoLabel={VERIFY_TIPO_LABELS[tipo] ?? tipo}
      workerName={workerName}
      location={location}
      locationStatus={locationStatus}
      address={address}
      addressStatus={addressStatus}
    />
  );
}

function MovementRouteScreen({ rec, onBack }) {
  const route = useMovementRouteController({ rec, onBack });
  return <MovementRouteView {...route} />;
}

function RecordsScreen({ identificacion, onBack }) {
  const [routeRecord, setRouteRecord] = useState(null);
  const records = useRecordsController({ identificacion, onBack });
  useHtmlBackground(!routeRecord && !records.mapTarget ? 'rgb(0, 31, 71)' : null);

  if (routeRecord) {
    return <MovementRouteScreen rec={routeRecord} onBack={() => setRouteRecord(null)} />;
  }

  if (records.mapTarget) {
    return <LocationDetailView mapTarget={records.mapTarget} onBack={records.closeMap} />;
  }

  return <RecordsView {...records} onOpenRoute={setRouteRecord} />;
}

function MovementChoiceScreen({ identificacion, location, onSelectDestino, onSelectSedes, onStarted, onCancel, manualReason }) {
  const choice = useMovementChoiceController({ identificacion, location, onStarted, onSelectDestino, onSelectSedes, onCancel, manualReason });
  const tour = useScreenTour(MOVEMENT_TOUR_STEPS);
  useHtmlBackground('rgb(0, 31, 71)');
  return (
    <>
      <MovementChoiceView {...choice} onOpenTour={tour.openTour} />
      <TourView {...tour} />
    </>
  );
}

function MovementDestinoScreen({ identificacion, location, onStarted, onBack, manualReason }) {
  const destino = useMovementDestinoController({ identificacion, location, onStarted, onBack, manualReason });
  return <MovementDestinoView {...destino} />;
}

function MovementSedesScreen({ identificacion, location, onStarted, onBack, manualReason }) {
  const sedes = useMovementSedesController({ identificacion, location, onStarted, onBack, manualReason });
  useHtmlBackground('rgb(0, 31, 71)');
  return <MovementSedesView {...sedes} />;
}

function MovementTrackingScreen({ movement, onFinished }) {
  const tracking = useMovementTrackingController({ movement, onFinished });
  useHtmlBackground('rgb(0, 31, 71)');
  return <MovementTrackingView {...tracking} />;
}

function MovementFlowScreen({ identificacion, location, onFinished, onCancel, resumedMovement, manualReason }) {
  const [step, setStep] = useState(resumedMovement ? 'tracking' : 'choice');
  const [movement, setMovement] = useState(resumedMovement ?? null);

  function handleStarted(mv) {
    setMovement(mv);
    setStep('tracking');
  }

  if (step === 'destino') {
    return (
      <MovementDestinoScreen
        identificacion={identificacion}
        location={location}
        onStarted={handleStarted}
        onBack={() => setStep('choice')}
        manualReason={manualReason}
      />
    );
  }

  if (step === 'sedes') {
    return (
      <MovementSedesScreen
        identificacion={identificacion}
        location={location}
        onStarted={handleStarted}
        onBack={() => setStep('choice')}
        manualReason={manualReason}
      />
    );
  }

  if (step === 'tracking' && movement) {
    return <MovementTrackingScreen movement={movement} onFinished={onFinished} />;
  }

  return (
    <MovementChoiceScreen
      identificacion={identificacion}
      location={location}
      onSelectDestino={() => setStep('destino')}
      onSelectSedes={() => setStep('sedes')}
      onStarted={handleStarted}
      onCancel={onCancel}
      manualReason={manualReason}
    />
  );
}

function ProfileScreen({ worker, onBack, home }) {
  const profile = useProfileController({ worker, onBack, onLogout: home.handleLogout, lastAttendanceRecord: home.lastAttendanceRecord });
  useHtmlBackground('rgb(0, 31, 71)');
  return (
    <ProfileView
      {...profile}
      logoutConfirmOpen={home.logoutConfirmOpen}
      dismissLogoutConfirm={home.dismissLogoutConfirm}
      confirmLogout={home.confirmLogout}
      logoutError={home.logoutError}
      dismissLogoutError={home.dismissLogoutError}
      loggingOut={home.loggingOut}
    />
  );
}

function DownloadScreen({ worker, onDone }) {
  const download = useDownloadController({ worker, onDone });
  return <DownloadView {...download} />;
}

function HomeScreen({ worker, onLogout, onFastExit }) {
  const [verifyTipo, setVerifyTipo] = useState(null);
  const [recordsOpen, setRecordsOpen] = useState(false);
  const [movementOpen, setMovementOpen] = useState(false);
  const [movementManualReason, setMovementManualReason] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const help = useHelpController();
  useHtmlTheme(!!verifyTipo);

  const home = useHomeController({
    worker,
    onLogout,
    onFastExit,
    onStartVerify: setVerifyTipo,
    onOpenRecords: () => setRecordsOpen(true),
    onOpenHelp: help.openSheet,
    onStartMovement: () => setVerifyTipo('MOVIMIENTO'),
    onOpenProfile: () => setProfileOpen(true),
  });

  useHtmlBackground(
    !verifyTipo && !movementOpen && !home.resumedMovement && !recordsOpen && !profileOpen
      ? 'rgb(0, 31, 71)'
      : null
  );

  function handleVerifyDone(result) {
    setVerifyTipo(null);

    if (result.tipo === 'MOVIMIENTO') {
      setMovementManualReason(result.manual ? result.motivo : null);
      setMovementOpen(true);
      return;
    }

    if (result.frame) home.recordPhoto(result.frame);
    home.applyLocalMarcacion(result.tipo, result.clientTimestamp ?? Date.now());
  }

  function handleVerifyCancel() {
    setVerifyTipo(null);
  }

  function handleMovementFinished() {
    setMovementOpen(false);
    setMovementManualReason(null);
    home.clearResumedMovement();
  }

  if (verifyTipo) {
    return (
      <VerifyScreen
        identificacion={worker?.identificacion}
        tipo={verifyTipo}
        location={home.location}
        locationStatus={home.locationStatus}
        address={home.address}
        addressStatus={home.addressStatus}
        workerName={getDisplayName(worker?.nombre)}
        onDone={handleVerifyDone}
        onCancel={handleVerifyCancel}
      />
    );
  }

  if (movementOpen || home.resumedMovement) {
    return (
      <MovementFlowScreen
        identificacion={worker?.identificacion}
        location={home.location}
        onFinished={handleMovementFinished}
        onCancel={() => setMovementOpen(false)}
        resumedMovement={home.resumedMovement}
        manualReason={movementManualReason}
      />
    );
  }

  if (recordsOpen) {
    return <RecordsScreen identificacion={worker?.identificacion} onBack={() => setRecordsOpen(false)} />;
  }

  if (profileOpen) {
    return <ProfileScreen worker={worker} onBack={() => setProfileOpen(false)} home={home} />;
  }

  return (
    <>
      <HomeView {...home} />
      <HelpSheet {...help} />
      <TourView {...help} />
    </>
  );
}

function AppUpdateScreen({ info }) {
  const update = useAppUpdateController({ info });
  return <AppUpdateView {...update} />;
}

function SplashScreen({ onReady }) {
  const splash = useSplashController({ onReady });
  if (splash.updateInfo) {
    return <AppUpdateScreen info={splash.updateInfo} />;
  }
  return <SplashView {...splash} />;
}

function App() {
  const {
    step,
    worker,
    handleSplashReady,
    handleVerified,
    handleAlreadyEnrolled,
    handleChangeIdentity,
    handleStartCapture,
    handleCancelCapture,
    handleEnrolled,
    handleOfflineReady,
    handleLogout,
    handleFastExit,
  } = useAppController();

  const access = useAccessController({ onVerified: handleVerified, onAlreadyEnrolled: handleAlreadyEnrolled });
  const biometric = useBiometricController(worker, handleStartCapture, handleChangeIdentity);

  useHtmlTheme(step === 'splash' || step === 'download' || step === 'capture');

  let screen;
  if (step === 'splash') {
    screen = <SplashScreen onReady={handleSplashReady} />;
  } else if (step === 'download') {
    screen = <DownloadScreen worker={worker} onDone={handleOfflineReady} />;
  } else if (step === 'capture') {
    screen = (
      <CaptureScreen
        identificacion={worker?.identificacion}
        onEnrolled={handleEnrolled}
        onCancel={handleCancelCapture}
      />
    );
  } else if (step === 'home') {
    screen = <HomeScreen worker={worker} onLogout={handleLogout} onFastExit={handleFastExit} />;
  } else if (step === 'biometric') {
    screen = <BiometricView {...biometric} />;
  } else {
    screen = <AccessView {...access} />;
  }

  // Suspendida en splash/download/capture/biometric: son flujos de cámara o
  // de arranque donde interrumpir con un modal sería disruptivo o inseguro.
  const installGateActive = step === 'home' || step === 'access';

  return (
    <>
      {screen}
      <InstallPromptGate active={installGateActive} />
    </>
  );
}

export default App;
