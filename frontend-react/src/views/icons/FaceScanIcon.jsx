import UserIcon from './UserIcon';

const CORNERS = [
  { top: 5, left: 5, borderTop: true, borderLeft: true },
  { top: 5, right: 5, borderTop: true, borderRight: true },
  { bottom: 5, left: 5, borderBottom: true, borderLeft: true },
  { bottom: 5, right: 5, borderBottom: true, borderRight: true },
];

export default function FaceScanIcon() {
  return (
    <div className="access-icon">
      <div className="access-icon__frame">
        {CORNERS.map((c, i) => (
          <div
            key={i}
            className="access-icon__corner"
            style={{
              top: c.top,
              bottom: c.bottom,
              left: c.left,
              right: c.right,
              borderTop: c.borderTop ? '2px solid var(--color-icon-stroke)' : 'none',
              borderBottom: c.borderBottom ? '2px solid var(--color-icon-stroke)' : 'none',
              borderLeft: c.borderLeft ? '2px solid var(--color-icon-stroke)' : 'none',
              borderRight: c.borderRight ? '2px solid var(--color-icon-stroke)' : 'none',
            }}
          />
        ))}
        <UserIcon size={36} color="var(--color-icon-stroke)" strokeWidth={1.8} />
      </div>
    </div>
  );
}
