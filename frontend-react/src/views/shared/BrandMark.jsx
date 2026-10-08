import './BrandMark.css';

export default function BrandMark({ tagline = 'Apoyo Logístico y Operativo' }) {
  return (
    <div className="brand-mark">
      <img src="/brand/logo-mark.png" alt="Logyser" className="brand-mark__logo" />
      <div>
        <div className="brand-mark__name">LOG&amp;SER</div>
        {tagline && <div className="brand-mark__tagline">{tagline}</div>}
      </div>
    </div>
  );
}
