const EVENT_LABELS = {
  entry:       "Entrada",
  exit:        "Salida",
  lunch:       "Almuerzo",
  breakfast:   "Desayuno",
  break_start: "Break",
  break_end:   "Fin de break",
  transfer:    "Traslado",
  manual:      "Manual",
};

export class GeolocationService {
  #position = null;

  async request() {
    if (!navigator.geolocation) {
      throw new Error("Geolocalización no disponible en este dispositivo.");
    }
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          this.#position = {
            latitude:  parseFloat(pos.coords.latitude.toFixed(7)),
            longitude: parseFloat(pos.coords.longitude.toFixed(7)),
            accuracy:  Math.round(pos.coords.accuracy),
            altitude:  pos.coords.altitude ? parseFloat(pos.coords.altitude.toFixed(1)) : null,
          };
          resolve(this.#position);
        },
        (err) => {
          const msgs = {
            1: "Permiso de ubicación denegado.",
            2: "Posición no disponible.",
            3: "Tiempo de espera de ubicación agotado.",
          };
          reject(new Error(msgs[err.code] || "Error de geolocalización."));
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
      );
    });
  }

  get current() { return this.#position; }

  mapsUrl() {
    if (!this.#position) return null;
    return `https://maps.google.com/?q=${this.#position.latitude},${this.#position.longitude}`;
  }

  formatAccuracy(meters) {
    if (!meters) return "Sin dato";
    if (meters <= 10) return `~${meters}m — Alta precisión`;
    if (meters <= 50) return `~${meters}m — Media precisión`;
    return `~${meters}m — Baja precisión`;
  }

  shortLabel() {
    if (!this.#position) return null;
    return `~${this.#position.accuracy}m precisión`;
  }
}

export function eventLabel(type) {
  return EVENT_LABELS[type] ?? type;
}

export function formatTime(date = new Date()) {
  return date.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

export function formatDate(date = new Date()) {
  return date.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export function initials(name = "") {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
}
