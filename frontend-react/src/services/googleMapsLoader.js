import { GOOGLE_MAPS_API_KEY } from './googleMapsKey';

let loadPromise = null;

export function ensureGoogleMaps() {
  if (window.google?.maps?.Map) return Promise.resolve(window.google.maps);
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    window.__initGoogleMaps = () => {
      delete window.__initGoogleMaps;
      resolve(window.google.maps);
    };
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places&language=es&region=CO&loading=async&callback=__initGoogleMaps`;
    script.async = true;
    script.onerror = () => {
      loadPromise = null;
      reject(new Error('No se pudo cargar Google Maps.'));
    };
    document.head.appendChild(script);
  });
  return loadPromise;
}
