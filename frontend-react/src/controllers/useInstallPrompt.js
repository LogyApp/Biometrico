import { useCallback, useEffect, useState } from 'react';
import { isInstalled, promptInstall, subscribeInstallPrompt } from '../services/installPromptService';

const STORAGE_KEY = 'install_prompt_last_shown_at';
const NAG_INTERVAL_MS = 5 * 60 * 1000;

function isAndroid() {
  return /Android/i.test(navigator.userAgent);
}

/**
 * Reaparece cada 5 minutos hasta que el usuario instale la app — a propósito
 * no hay opción de "no volver a mostrar", solo "ahora no" (aplaza 5 min).
 * Solo aplica a Android; en cualquier otra plataforma nunca se activa.
 */
export function useInstallPrompt(active) {
  const [visible, setVisible] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [fallback, setFallback] = useState(false);

  const eligible = active && isAndroid() && !isInstalled();

  useEffect(() => {
    if (!eligible) {
      setVisible(false);
      return undefined;
    }

    let timer = null;

    function show() {
      if (isInstalled()) return;
      setVisible(true);
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
      timer = setTimeout(show, NAG_INTERVAL_MS);
    }

    function scheduleFromStoredTimestamp() {
      const lastShown = Number(localStorage.getItem(STORAGE_KEY) || 0);
      const elapsed = Date.now() - lastShown;
      const wait = Math.max(0, NAG_INTERVAL_MS - elapsed);
      timer = setTimeout(show, wait);
    }

    scheduleFromStoredTimestamp();

    const unsubscribe = subscribeInstallPrompt(() => {
      if (isInstalled()) {
        setVisible(false);
        setFallback(false);
        if (timer) clearTimeout(timer);
      }
    });

    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [eligible]);

  const install = useCallback(async () => {
    setInstalling(true);
    const outcome = await promptInstall();
    setInstalling(false);
    if (outcome === 'unavailable') {
      setFallback(true);
      return;
    }
    // 'accepted' o 'dismissed': cerramos nuestro modal; si no se instaló,
    // el temporizador ya programado lo vuelve a mostrar en 5 min.
    setVisible(false);
    setFallback(false);
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
    setFallback(false);
  }, []);

  return { visible: eligible && visible, installing, fallback, install, dismiss };
}
