export const STATIC_MAP_OPTIONS = {
  disableDefaultUI: true,
  gestureHandling: 'none',
  clickableIcons: false,
  keyboardShortcuts: false,
  zoomControl: false,
};

export const INTERACTIVE_MAP_OPTIONS = {
  disableDefaultUI: true,
  clickableIcons: false,
  keyboardShortcuts: false,
  zoomControl: false,
  gestureHandling: 'greedy',
};

export function buildBounds(points) {
  const bounds = new google.maps.LatLngBounds();
  points.forEach((p) => bounds.extend(p));
  return bounds;
}

export function toGooglePadding([x, y]) {
  return { top: y, bottom: y, left: x, right: x };
}

export function dashedLineOptions({ color, opacity = 1, weight = 3 }) {
  return {
    strokeOpacity: 0,
    icons: [{
      icon: { path: 'M 0,-1 0,1', strokeOpacity: opacity, strokeColor: color, scale: weight },
      offset: '0',
      repeat: '12px',
    }],
  };
}

export function triggerResize(map) {
  google.maps.event.trigger(map, 'resize');
}
