import { useCallback, useRef, useState } from 'react';
import { resolvePermissionStatus, probeCameraPermission, probeGeolocationPermission } from '../services/permissionsService';

const PROBES = {
  camera: probeCameraPermission,
  geolocation: probeGeolocationPermission,
};

export function usePermissionPrompt(kind) {
  const [visible, setVisible] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const resolveRef = useRef(null);

  const ensure = useCallback(async () => {
    const status = await resolvePermissionStatus(kind);
    if (status === 'granted') return true;
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setVisible(true);
    });
  }, [kind]);

  async function allow() {
    setRequesting(true);
    const granted = await PROBES[kind]();
    setRequesting(false);
    setVisible(false);
    resolveRef.current?.(granted);
    resolveRef.current = null;
  }

  function dismiss() {
    setVisible(false);
    resolveRef.current?.(false);
    resolveRef.current = null;
  }

  return { visible, requesting, ensure, allow, dismiss };
}
