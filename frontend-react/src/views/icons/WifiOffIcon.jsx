export default function WifiOffIcon({ size = 24, color = 'currentColor', strokeWidth = 2 }) {
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
      <path d="M2 2l20 20" />
      <path d="M8.5 16.5a5 5 0 0 1 7 0" />
      <path d="M5 12.5a10 10 0 0 1 5-2.6" />
      <path d="M19 12.5a10 10 0 0 0-3.4-2.3" />
      <path d="M1.5 8.5a15 15 0 0 1 4-2.7" />
      <path d="M22.5 8.5a15 15 0 0 0-8-4.2" />
      <circle cx="12" cy="20" r="1" fill={color} stroke="none" />
    </svg>
  );
}
