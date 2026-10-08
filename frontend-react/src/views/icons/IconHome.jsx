export default function IconHome({ active }) {
  const c = active ? 'var(--color-link)' : '#A6ACC0';
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M4 11l8-7 8 7" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M6 9.5V20h12V9.5" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}
