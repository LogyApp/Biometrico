import { useEffect, useRef, useState } from 'react';
import { NEW_DESIGN_ENABLED } from '../config/designFlags';
import { hasSeenTour, markTourSeen, TOUR_STEPS, TOUR_STEPS_NEW } from '../models/tourModel';
import { startTour } from '../services/tourService';

const AUTO_START_DELAY_MS = 900;

export function useHelpController() {
  const [open, setOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const autoStartedRef = useRef(false);

  function openSheet() {
    setOpen(true);
  }

  function closeSheet() {
    setOpen(false);
  }

  function closeTour() {
    setTourOpen(false);
    markTourSeen();
  }

  function runTour() {
    setOpen(false);
    if (NEW_DESIGN_ENABLED) {
      setTourStep(0);
      setTourOpen(true);
      return;
    }
    startTour(TOUR_STEPS, markTourSeen);
  }

  function nextTourStep() {
    setTourStep((step) => {
      if (step >= TOUR_STEPS_NEW.length - 1) {
        closeTour();
        return step;
      }
      return step + 1;
    });
  }

  function prevTourStep() {
    setTourStep((step) => Math.max(0, step - 1));
  }

  useEffect(() => {
    if (autoStartedRef.current || hasSeenTour()) return;
    autoStartedRef.current = true;
    const timer = setTimeout(() => runTour(), AUTO_START_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  return {
    open,
    openSheet,
    closeSheet,
    runTour,
    tourOpen,
    tourStep,
    tourSteps: TOUR_STEPS_NEW,
    nextTourStep,
    prevTourStep,
    closeTour,
  };
}
