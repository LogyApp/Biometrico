import { useState } from 'react';
import { applyUpdate } from '../services/appUpdateService';

export function useAppUpdateController({ info }) {
  const [updating, setUpdating] = useState(false);

  async function onUpdate() {
    setUpdating(true);
    await applyUpdate(info.version);
  }

  return {
    info,
    updating,
    onUpdate,
  };
}
