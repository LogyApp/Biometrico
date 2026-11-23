export function formatDistancia(distM, enSede) {
  if (distM == null) {
    return {
      hasCoords: false,
      text: 'Sin GPS',
      badgeLabel: 'Sin GPS',
      detailLabel: 'Sin GPS',
      isCerca: false,
      color: 'rgb(100, 116, 139)',
      bg: 'rgba(100, 116, 139, 0.1)',
    };
  }

  const isCerca = enSede != null ? Boolean(enSede) : distM <= 350;
  const text = distM >= 1000 ? `${(distM / 1000).toFixed(1)} km` : `${Math.round(distM)} m`;

  return {
    hasCoords: true,
    text,
    badgeLabel: `📍 ${text}`,
    detailLabel: isCerca ? `${text} (En sede)` : `${text} (Fuera de sede)`,
    isCerca,
    color: isCerca ? '#1E9E5A' : '#D64545',
    bg: isCerca ? 'rgba(30, 158, 90, 0.12)' : 'rgba(214, 69, 69, 0.12)',
  };
}
