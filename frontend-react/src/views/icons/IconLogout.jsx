export default function IconLogout({ active }) {
  const c = active ? 'var(--color-link)' : '#A6ACC0';
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M10 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M14 8l5 4-5 4M19 12H9" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}
