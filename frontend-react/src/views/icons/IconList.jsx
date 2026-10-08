export default function IconList({ active }) {
  const c = active ? 'var(--color-link)' : '#A6ACC0';
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="4" y="3" width="16" height="18" rx="2" stroke={c} strokeWidth="1.8" />
      <path d="M8 8h8M8 12h8M8 16h5" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
