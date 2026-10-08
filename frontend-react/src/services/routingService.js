import { ensureGoogleMaps } from './googleMapsLoader';

let placesServicePromise = null;
let directionsServicePromise = null;

function getPlacesService() {
  if (!placesServicePromise) {
    placesServicePromise = ensureGoogleMaps().then((maps) => new maps.places.PlacesService(document.createElement('div')));
  }
  return placesServicePromise;
}

function getDirectionsService() {
  if (!directionsServicePromise) {
    directionsServicePromise = ensureGoogleMaps().then((maps) => new maps.DirectionsService());
  }
  return directionsServicePromise;
}

// points: [{lat,lng}, ...] en orden — soporta 2 (A→B) o más (A→parada1→parada2→...→B)
export async function getMultiRoute(points) {
  if (points.length < 2) throw new Error('Se necesitan al menos dos puntos para calcular la ruta.');

  const service = await getDirectionsService();
  const origin = points[0];
  const destination = points[points.length - 1];
  const waypoints = points.slice(1, -1).map((p) => ({ location: { lat: p.lat, lng: p.lng }, stopover: true }));

  const result = await new Promise((resolve, reject) => {
    service.route(
      {
        origin: { lat: origin.lat, lng: origin.lng },
        destination: { lat: destination.lat, lng: destination.lng },
        waypoints,
        travelMode: google.maps.TravelMode.DRIVING,
      },
      (response, status) => {
        if (status !== google.maps.DirectionsStatus.OK || !response?.routes?.length) {
          reject(new Error('No se pudo calcular la ruta. Verifica la conexión.'));
          return;
        }
        resolve(response);
      }
    );
  });

  const route = result.routes[0];
  const distanceM = route.legs.reduce((sum, leg) => sum + leg.distance.value, 0);
  const durationS = route.legs.reduce((sum, leg) => sum + leg.duration.value, 0);

  return {
    distKm: +(distanceM / 1000).toFixed(2),
    timeMin: Math.round(durationS / 60),
    coords: route.overview_path.map((p) => [p.lat(), p.lng()]),
  };
}

export function getRoute(fromLat, fromLng, toLat, toLng) {
  return getMultiRoute([{ lat: fromLat, lng: fromLng }, { lat: toLat, lng: toLng }]);
}

export async function searchAddress(query) {
  const service = await getPlacesService();
  return new Promise((resolve, reject) => {
    service.textSearch({ query, region: 'co' }, (results, status) => {
      if (
        status !== google.maps.places.PlacesServiceStatus.OK &&
        status !== google.maps.places.PlacesServiceStatus.ZERO_RESULTS
      ) {
        reject(new Error('No se pudo buscar la dirección.'));
        return;
      }
      resolve((results ?? []).slice(0, 5).map((r) => ({
        lat: r.geometry.location.lat(),
        lon: r.geometry.location.lng(),
        display_name: r.formatted_address,
      })));
    });
  });
}
