export default function IdCardIcon({ size = 24, color = 'currentColor', strokeWidth = 2 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <circle cx="9" cy="11" r="2" />
      <path d="M6.17 15a3 3 0 0 1 5.66 0" />
      <path d="M16 10h2" />
      <path d="M16 14h2" />
    </svg>
  );
}
