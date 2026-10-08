export default function ResultIcon({ success }) {
  const color = success ? 'var(--color-success)' : '#FF8080';
  return (
    <svg width="58" height="58" viewBox="0 0 58 58" fill="none">
      <circle cx="29" cy="29" r="25" stroke={color} strokeWidth="2.5" />
      {success ? (
        <polyline points="17,30 26,39 42,20" stroke={color} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      ) : (
        <>
          <line x1="20" y1="20" x2="38" y2="38" stroke={color} strokeWidth="3.5" strokeLinecap="round" />
          <line x1="38" y1="20" x2="20" y2="38" stroke={color} strokeWidth="3.5" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}
