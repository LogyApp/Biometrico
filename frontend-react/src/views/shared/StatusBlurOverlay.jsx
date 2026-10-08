import './StatusBlurOverlay.css';

export default function StatusBlurOverlay({
  icon,
  title,
  subtitle,
  tone = 'neutral',
  retryLabel = 'Reintentar',
  onRetry,
  secondaryLabel,
  onSecondary,
  secondaryVariant = 'link',
  children,
}) {
  const hasBoth = Boolean(onRetry) && Boolean(onSecondary);
  const soloAction = !hasBoth && (onRetry || onSecondary);
  const soloLabel = onRetry ? retryLabel : secondaryLabel;
  const soloHandler = onRetry || onSecondary;

  return (
    <div className="status-blur-overlay">
      <div className="status-blur-overlay__card">
        <div className={`status-blur-overlay__icon status-blur-overlay__icon--${tone}`}>{icon}</div>
        <div className="status-blur-overlay__title">{title}</div>
        {subtitle && <div className="status-blur-overlay__subtitle">{subtitle}</div>}
        {children}

        {hasBoth && secondaryVariant === 'button' && (
          <div className="status-blur-overlay__actions status-blur-overlay__actions--split">
            <button type="button" className="status-blur-overlay__btn status-blur-overlay__btn--ghost" onClick={onSecondary}>
              {secondaryLabel}
            </button>
            <button
              type="button"
              className={`status-blur-overlay__btn status-blur-overlay__btn--solid status-blur-overlay__btn--${tone}`}
              onClick={onRetry}
            >
              {retryLabel}
            </button>
          </div>
        )}

        {hasBoth && secondaryVariant !== 'button' && (
          <div className="status-blur-overlay__actions">
            <button
              type="button"
              className={`status-blur-overlay__btn status-blur-overlay__btn--solid status-blur-overlay__btn--${tone}`}
              onClick={onRetry}
            >
              {retryLabel}
            </button>
            <button type="button" className="status-blur-overlay__link" onClick={onSecondary}>
              {secondaryLabel}
            </button>
          </div>
        )}

        {soloAction && (
          <div className="status-blur-overlay__actions">
            <button
              type="button"
              className={`status-blur-overlay__btn status-blur-overlay__btn--solid status-blur-overlay__btn--${tone}`}
              onClick={soloHandler}
            >
              {soloLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
