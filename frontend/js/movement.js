/*
 * MovementManager — Gestión de mapas, rastreo GPS y rutas OSRM
 * Usa Leaflet.js + OpenStreetMap (sin API key)
 */

const OSRM_URL     = "https://router.project-osrm.org/route/v1/driving";
const NOMINATIM    = "https://nominatim.openstreetmap.org";
const ARRIVAL_DIST = 0.03;  // km — radio de llegada al destino (30m, igual al círculo de marcación)
const WP_MIN_DIST  = 0.03;  // km — distancia mínima para grabar waypoint (30m)
const WP_MIN_TIME  = 12000; // ms — intervalo mínimo entre waypoints (12s)

/* Haversine — distancia entre dos puntos GPS en km */
export function haversine(lat1, lng1, lat2, lng2) {
  const R   = 6371;
  const dLa = (lat2 - lat1) * Math.PI / 180;
  const dLo = (lng2 - lng1) * Math.PI / 180;
  const a   = Math.sin(dLa/2)**2
            + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLo/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

export class MovementManager {
  constructor() {
    this._map       = null;
    this._posMkr    = null;   // marcador posición actual
    this._destMkr   = null;   // marcador destino
    this._traceLine = null;   // polilínea recorrida
    this._routeLine = null;   // polilínea ruta planeada (OSRM)
    this._watchId   = null;

    this._waypoints     = [];
    this._totalDist     = 0;
    this._lastPos       = null;
    this._destLat       = null;
    this._destLng       = null;
    this._maxDesvio     = 0;
    this._arrivalFired  = false;
    this._arrivalCircle = null;

    // Callbacks
    this.onPositionUpdate  = null;   // ({lat, lng, speed, accuracy, totalDist, distToDestKm})
    this.onDestinationSet  = null;   // ({lat, lng, address})
    this.onRouteReady      = null;   // ({distKm, timeMin, coords})
    this.onArrival         = null;   // ()
    this.onError           = null;   // (msg)
  }

  /* ── Inicializar mapa en un contenedor DOM ── */
  initMap(containerId, center, zoom = 15) {
    if (this._map) { this._map.remove(); this._map = null; }

    const container = typeof containerId === "string"
      ? document.getElementById(containerId)
      : containerId;

    // Limpiar estado previo de Leaflet en el contenedor
    if (container && container._leaflet_id) {
      delete container._leaflet_id;
    }

    this._map = L.map(container || containerId, {
      zoomControl:       false,
      attributionControl: false,
      tap:               true,
      tapTolerance:      15,
    }).setView(center, zoom);

    // OpenStreetMap — más fiable en móvil, crossOrigin evita bloqueos CORS
    L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      { subdomains: "abc", maxZoom: 19, crossOrigin: "anonymous" }
    ).addTo(this._map);

    L.control.zoom({ position: "bottomright" }).addTo(this._map);

    return this._map;
  }

  /* ── Habilitar selección de destino con clic en mapa ── */
  enableDestPick() {
    if (!this._map) return;
    this._map.on("click", async (e) => {
      await this.setDestination(e.latlng.lat, e.latlng.lng);
    });
  }

  /* ── Colocar marcador en posición actual ── */
  setInitialPosition(lat, lng) {
    if (!this._map) return;
    this._map.setView([lat, lng], 16);
    if (this._posMkr) this._map.removeLayer(this._posMkr);
    this._posMkr = L.marker([lat, lng], { icon: this._posIcon() }).addTo(this._map);
  }

  /* ── Fijar destino y reverse-geocode ── */
  async setDestination(lat, lng) {
    if (!this._map) return;
    this._destLat = lat;
    this._destLng = lng;

    if (this._destMkr) this._map.removeLayer(this._destMkr);
    this._destMkr = L.marker([lat, lng], { icon: this._destIcon() }).addTo(this._map);

    // Círculo visual de zona de llegada (igual al rango de marcación de entrada/salida)
    if (this._arrivalCircle) this._map.removeLayer(this._arrivalCircle);
    this._arrivalCircle = L.circle([lat, lng], {
      radius: ARRIVAL_DIST * 1000,
      color: "#1B2A5E", fillColor: "#1B2A5E", fillOpacity: .07,
      weight: 1.5, dashArray: "4 3",
    }).addTo(this._map);

    const address = await this._reverseGeocode(lat, lng);
    this.onDestinationSet?.({ lat, lng, address });
    return address;
  }

  /* ── Calcular y dibujar ruta OSRM ── */
  async loadRoute(fromLat, fromLng, toLat, toLng) {
    const url  = `${OSRM_URL}/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`;
    const resp = await fetch(url);
    const data = await resp.json();

    if (data.code !== "Ok" || !data.routes?.length) {
      throw new Error("No se pudo calcular la ruta. Verifica la conexión.");
    }

    const route   = data.routes[0];
    const coords  = route.geometry.coordinates.map(([ln, la]) => [la, ln]);
    const distKm  = +(route.distance / 1000).toFixed(2);
    const timeMin = Math.round(route.duration / 60);

    if (this._routeLine) this._map.removeLayer(this._routeLine);
    this._routeLine = L.polyline(coords, {
      color: "#1B2A5E", weight: 5, opacity: .65, dashArray: "10 5",
    }).addTo(this._map);

    this._map.fitBounds(this._routeLine.getBounds(), { padding: [48, 48] });
    this.onRouteReady?.({ distKm, timeMin, coords });
    return { distKm, timeMin };
  }

  /* ── Iniciar rastreo GPS ── */
  startTracking() {
    this._waypoints    = [];
    this._totalDist    = 0;
    this._maxDesvio    = 0;
    this._lastPos      = null;
    this._arrivalFired = false;

    if (this._traceLine) this._map.removeLayer(this._traceLine);
    this._traceLine = L.polyline([], {
      color: "#F15A22", weight: 5, opacity: .9,
    }).addTo(this._map);

    if (!navigator.geolocation) {
      this.onError?.("Geolocalización no disponible en este dispositivo.");
      return;
    }

    this._watchId = navigator.geolocation.watchPosition(
      (pos) => this._onPosition(pos),
      (err) => this.onError?.(`GPS: ${err.message}`),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  }

  /* ── Detener rastreo y retornar datos ── */
  stopTracking() {
    if (this._watchId !== null) {
      navigator.geolocation.clearWatch(this._watchId);
      this._watchId = null;
    }
    return {
      waypoints: this._waypoints,
      totalDist: +this._totalDist.toFixed(3),
      maxDesvio: +this._maxDesvio.toFixed(3),
    };
  }

  /* ── Destruir el mapa ── */
  destroy() {
    this.stopTracking();
    if (this._map) { this._map.remove(); this._map = null; }
    this._posMkr = this._destMkr = this._traceLine = this._routeLine = this._arrivalCircle = null;
  }

  /* ── Handler de posición GPS ── */
  _onPosition(pos) {
    const { latitude: lat, longitude: lng, speed, accuracy } = pos.coords;
    const ts = pos.timestamp;

    // Actualizar marcador posición
    if (!this._posMkr) {
      this._posMkr = L.marker([lat, lng], { icon: this._posIcon() }).addTo(this._map);
    } else {
      this._posMkr.setLatLng([lat, lng]);
    }
    this._map.panTo([lat, lng], { animate: true, duration: 0.6 });

    // Traza visual: actualizar en CADA posición GPS (trazo suave y en tiempo real)
    this._traceLine?.addLatLng([lat, lng]);

    // Calcular distancia desde último waypoint registrado
    let distFromLast = 0;
    if (this._lastPos) {
      distFromLast    = haversine(this._lastPos.lat, this._lastPos.lng, lat, lng);
      this._totalDist += distFromLast;
    }

    // Calcular distancia al destino (si hay destino fijo)
    let distToDestKm = null;
    if (this._destLat !== null) {
      distToDestKm = haversine(lat, lng, this._destLat, this._destLng);

      // Calcular desvío respecto a la ruta planeada (máximo)
      if (this._routeLine) {
        const nearestOnRoute = this._nearestOnRoute(lat, lng);
        const desvio = haversine(lat, lng, nearestOnRoute.lat, nearestOnRoute.lng);
        if (desvio > this._maxDesvio) this._maxDesvio = desvio;
      }

      // Detectar llegada — dispara una sola vez cuando entra al radio de 30 m
      if (!this._arrivalFired && distToDestKm <= ARRIVAL_DIST) {
        this._arrivalFired = true;
        this.onArrival?.();
      }
    }

    // Grabar waypoint (filtrado por distancia/tiempo — datos para el backend)
    const timeSinceLast = this._lastPos ? ts - this._lastPos.ts : Infinity;
    if (!this._lastPos || distFromLast >= WP_MIN_DIST || timeSinceLast >= WP_MIN_TIME) {
      const wp = { lat, lng, ts, speed: speed ? +speed.toFixed(2) : 0, accuracy: accuracy ? Math.round(accuracy) : null };
      this._waypoints.push(wp);
      this._lastPos = { lat, lng, ts };
    }

    this.onPositionUpdate?.({
      lat, lng,
      speed:       speed ? +(speed * 3.6).toFixed(1) : 0,  // m/s → km/h
      accuracy:    Math.round(accuracy),
      totalDist:   +this._totalDist.toFixed(3),
      distToDestKm: distToDestKm !== null ? +distToDestKm.toFixed(3) : null,
    });
  }

  /* ── Encontrar punto más cercano en la polilínea de ruta ── */
  _nearestOnRoute(lat, lng) {
    if (!this._routeLine) return { lat, lng };
    const lls    = this._routeLine.getLatLngs();
    let minD     = Infinity;
    let nearest  = lls[0];
    for (const ll of lls) {
      const d = haversine(lat, lng, ll.lat, ll.lng);
      if (d < minD) { minD = d; nearest = ll; }
    }
    return nearest;
  }

  /* ── Geocodificación inversa (coordenadas → dirección) ── */
  async _reverseGeocode(lat, lng) {
    try {
      const res  = await fetch(`${NOMINATIM}/reverse?format=json&lat=${lat}&lon=${lng}`, {
        headers: { "Accept-Language": "es" },
      });
      const data = await res.json();
      const parts = data.display_name?.split(",") ?? [];
      return parts.slice(0, 3).join(",").trim() || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    } catch {
      return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    }
  }

  /* ── Búsqueda de dirección (texto → opciones) ── */
  async searchAddress(query) {
    const url  = `${NOMINATIM}/search?format=json&q=${encodeURIComponent(query)}&limit=5&countrycodes=co`;
    const res  = await fetch(url, { headers: { "Accept-Language": "es" } });
    return await res.json();  // [{display_name, lat, lon}]
  }

  /* ── Iconos Leaflet ── */
  _posIcon() {
    return L.divIcon({
      className: "",
      html: `<div class="lmap-pos-dot"><div class="lmap-pos-ring"></div></div>`,
      iconSize:   [30, 30],
      iconAnchor: [15, 15],
    });
  }

  _destIcon() {
    return L.divIcon({
      className: "",
      html: `<div class="lmap-dest-pin"></div>`,
      iconSize:   [28, 36],
      iconAnchor: [14, 36],
    });
  }
}
