function capitalizeWord(word) {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

export function getFirstName(fullName) {
  if (!fullName) return '';
  return fullName.trim().split(/\s+/)[0];
}

export function getDisplayName(fullName) {
  const words = (fullName || '').trim().split(/\s+/).filter(Boolean).map(capitalizeWord);
  if (words.length >= 3) return `${words[0]} ${words[2]}`;
  if (words.length === 2) return `${words[0]} ${words[1]}`;
  return words[0] ?? 'Usuario';
}
