import { ensureGoogleMaps } from './googleMapsLoader';

let geocoderPromise = null;

function getGeocoder() {
  if (!geocoderPromise) {
    geocoderPromise = ensureGoogleMaps().then((maps) => new maps.Geocoder());
  }
  return geocoderPromise;
}

export async function reverseGeocode(lat, lng) {
  const geocoder = await getGeocoder();
  const response = await geocoder.geocode({ location: { lat, lng } });
  const results = response?.results;
  if (!results?.length) throw new Error('Dirección no disponible.');
  const parts = (results[0].formatted_address ?? '').split(',');
  const address = parts.slice(0, 3).map((part) => part.trim()).filter(Boolean).join(', ');
  if (!address) throw new Error('Dirección no disponible.');
  return address;
}
