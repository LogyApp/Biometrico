export default function CircleHelpIcon({ size = 24, color = 'currentColor', strokeWidth = 1.8 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth={strokeWidth} />
      <path
        d="M9.5 9.2c.3-1.4 1.5-2.2 2.7-2.2 1.3 0 2.6.9 2.6 2.3 0 1.7-2.6 1.8-2.6 3.7"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="12" cy="16.7" r="1" fill={color} />
    </svg>
  );
}
