export default function CameraIcon({ size = 24, color = 'currentColor', strokeWidth = 1.8 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M4 7h3l1.5-2h7L17 7h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
      <circle cx="12" cy="13" r="3.4" stroke={color} strokeWidth={strokeWidth} />
    </svg>
  );
}
