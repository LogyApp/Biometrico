import { useEffect, useState } from 'react';
import MaterialIcon from './icons/MaterialIcon';
import './TourView.css';

const CARD_MARGIN = 20;
const CARD_WIDTH = 320;
const CARD_WIDTH_WIDE = 380;
const CARD_WIDE_THRESHOLD = 90;
const VIEWPORT_PADDING = 16;
const HOLE_PAD = 6;
const CARD_MIN_HEIGHT = 210;

function measureTarget(selector) {
  if (!selector) return null;
  const el = document.querySelector(selector);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  return rect;
}

function computeDimBands(rect) {
  const viewportH = window.innerHeight;
  const viewportW = window.innerWidth;
  const top = Math.max(0, rect.top - HOLE_PAD);
  const bottom = Math.min(viewportH, rect.bottom + HOLE_PAD);
  const left = Math.max(0, rect.left - HOLE_PAD);
  const right = Math.min(viewportW, rect.right + HOLE_PAD);

  return [
    { top: 0, left: 0, width: viewportW, height: top },
    { top: bottom, left: 0, width: viewportW, height: Math.max(0, viewportH - bottom) },
    { top, left: 0, width: left, height: Math.max(0, bottom - top) },
    { top, left: right, width: Math.max(0, viewportW - right), height: Math.max(0, bottom - top) },
  ];
}

function computeCardStyle(rect, descLength) {
  const viewportH = window.innerHeight;
  const viewportW = window.innerWidth;
  const baseWidth = descLength > CARD_WIDE_THRESHOLD ? CARD_WIDTH_WIDE : CARD_WIDTH;
  const cardWidth = Math.min(baseWidth, viewportW - VIEWPORT_PADDING * 2);

  const spaceBelow = viewportH - rect.bottom;
  const spaceAbove = rect.top;
  const placeBelow = spaceBelow >= CARD_MIN_HEIGHT || spaceBelow >= spaceAbove;

  let left = rect.left + rect.width / 2 - cardWidth / 2;
  left = Math.max(VIEWPORT_PADDING, Math.min(left, viewportW - cardWidth - VIEWPORT_PADDING));

  const style = { position: 'fixed', left, width: cardWidth };
  if (placeBelow) {
    style.top = Math.min(rect.bottom + CARD_MARGIN, Math.max(VIEWPORT_PADDING, viewportH - CARD_MIN_HEIGHT - VIEWPORT_PADDING));
  } else {
    style.bottom = Math.max(viewportH - rect.top + CARD_MARGIN, VIEWPORT_PADDING);
  }
  return style;
}

export default function TourView({ tourOpen, tourStep, tourSteps, nextTourStep, prevTourStep, closeTour }) {
  const [targetRect, setTargetRect] = useState(null);
  const step = tourOpen ? tourSteps[tourStep] : null;

  useEffect(() => {
    if (!tourOpen || !step) {
      setTargetRect(null);
      return undefined;
    }

    const el = step.element ? document.querySelector(step.element) : null;
    el?.scrollIntoView({ block: 'center', behavior: 'auto' });

    function update() {
      setTargetRect(measureTarget(step.element));
    }

    const raf = requestAnimationFrame(update);
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', update);
    };
  }, [tourOpen, tourStep, step]);

  if (!tourOpen || !step) return null;

  const total = tourSteps.length;
  const isFirst = tourStep === 0;
  const isLast = tourStep === total - 1;
  const cardStyle = targetRect ? computeCardStyle(targetRect, step.description?.length ?? 0) : undefined;
  const dimBands = targetRect ? computeDimBands(targetRect) : null;

  return (
    <div className={`tour-overlay${targetRect ? ' tour-overlay--anchored' : ''}`}>
      {dimBands && dimBands.map((band, i) => (
        <div key={i} className="tour-dim" style={band} />
      ))}

      {targetRect && (
        <div
          className="tour-ring"
          style={{
            top: targetRect.top - HOLE_PAD,
            left: targetRect.left - HOLE_PAD,
            width: targetRect.width + HOLE_PAD * 2,
            height: targetRect.height + HOLE_PAD * 2,
          }}
        />
      )}

      <div className="tour-card" style={cardStyle}>
        <div className="tour-card__head">
          <span className="tour-card__icon">
            <MaterialIcon name={step.icon} size={20} fill={1} color="rgb(0, 31, 71)" />
          </span>
          <div className="tour-card__title">{step.title}</div>
          <button type="button" className="tour-card__close" onClick={closeTour} aria-label="Cerrar">
            <MaterialIcon name="close" size={16} color="var(--color-subtext)" />
          </button>
        </div>

        <p className="tour-card__desc">{step.description}</p>

        <div className="tour-card__footer">
          <div className="tour-card__progress">
            <div className="tour-card__dots">
              {tourSteps.map((_, i) => (
                <span key={i} className={`tour-card__dot${i <= tourStep ? ' tour-card__dot--done' : ''}`} />
              ))}
            </div>
            <span className="tour-card__counter">{tourStep + 1} / {total}</span>
          </div>

          <div className="tour-card__actions">
            {!isFirst && (
              <button type="button" className="tour-card__btn tour-card__btn--ghost" onClick={prevTourStep}>
                Atrás
              </button>
            )}
            <button type="button" className="tour-card__btn tour-card__btn--solid" onClick={nextTourStep}>
              {isLast ? '¡Listo!' : 'Siguiente'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
