import { useState } from 'react';

export function useScreenTour(steps) {
  const [tourOpen, setTourOpen] = useState(false);
  const [tourStep, setTourStep] = useState(0);

  function openTour() {
    setTourStep(0);
    setTourOpen(true);
  }

  function closeTour() {
    setTourOpen(false);
  }

  function nextTourStep() {
    setTourStep((step) => {
      if (step >= steps.length - 1) {
        closeTour();
        return step;
      }
      return step + 1;
    });
  }

  function prevTourStep() {
    setTourStep((step) => Math.max(0, step - 1));
  }

  return {
    tourOpen,
    tourStep,
    tourSteps: steps,
    openTour,
    nextTourStep,
    prevTourStep,
    closeTour,
  };
}
