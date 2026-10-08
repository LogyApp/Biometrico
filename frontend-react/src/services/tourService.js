import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import './tourTheme.css';

const RESIDUAL_SELECTORS = [
  '.home-header',
  '.home-body',
  '.home-camera-card',
  '.home-location-row',
  '.home-action-btn',
  '.home-day-card__manual',
  '.home-tab--movimiento',
  '.home-tab--registros',
  '.home-tab--ayuda',
  '.home-tabbar',
];
const RESIDUAL_PROPS = ['z-index', 'position', 'pointer-events', 'overflow'];

let currentTour = null;

function cleanResiduals() {
  RESIDUAL_SELECTORS.forEach((selector) => {
    const el = document.querySelector(selector);
    if (!el) return;
    RESIDUAL_PROPS.forEach((prop) => el.style.removeProperty(prop));
  });
  document.body.classList.remove('driver-active');
  document.body.style.removeProperty('overflow');
}

function iconMarkup(Icon) {
  return renderToStaticMarkup(createElement(Icon, { size: 17, color: '#fff', strokeWidth: 1.8 }));
}

function popoverTitle(step) {
  return `<span class="tour-step-icon">${iconMarkup(step.icon)}</span><span class="tour-step-title-text">${step.title}</span>`;
}

export function startTour(steps, onFinish) {
  if (currentTour) {
    try {
      currentTour.destroy();
    } catch {}
    currentTour = null;
  }
  cleanResiduals();

  const driverSteps = steps.map((step) => ({
    element: step.element,
    popover: {
      title: popoverTitle(step),
      description: step.description,
      side: step.side,
      align: step.align,
    },
  }));

  currentTour = driver({
    showProgress: true,
    progressText: 'Paso {{current}} de {{total}}',
    nextBtnText: 'Siguiente',
    prevBtnText: 'Atrás',
    doneBtnText: '¡Listo!',
    showButtons: ['next', 'previous', 'close'],
    closeBtnText: 'Omitir guía',
    allowClose: true,
    overlayOpacity: 0.6,
    smoothScroll: false,
    animate: true,
    onDestroyed: () => {
      currentTour = null;
      cleanResiduals();
      onFinish?.();
    },
    steps: driverSteps,
  });

  currentTour.drive();
}
