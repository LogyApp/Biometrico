export class CameraManager {
  constructor(videoEl) {
    this._video  = videoEl;
    this._stream = null;
    this._rafId  = null;
  }

  async start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Cámara no disponible. Abre la app en localhost o con HTTPS.");
    }

    // Intentar primero con cámara frontal y resolución ideal
    try {
      this._stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
    } catch (primary) {
      if (primary.name === "OverconstrainedError" || primary.name === "ConstraintNotSatisfiedError") {
        // Fallback sin constraints
        this._stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }).catch(() => {
          throw new Error("No se encontró ninguna cámara en este dispositivo.");
        });
      } else if (primary.name === "NotAllowedError" || primary.name === "PermissionDeniedError") {
        throw new Error("Permiso de cámara denegado. Habilítalo en la configuración del navegador.");
      } else if (primary.name === "NotFoundError") {
        throw new Error("No se encontró ninguna cámara en este dispositivo.");
      } else if (primary.name === "NotReadableError") {
        throw new Error("La cámara está siendo usada por otra aplicación. Ciérrala e intenta de nuevo.");
      } else {
        throw new Error(`Error de cámara: ${primary.message}`);
      }
    }

    this._video.srcObject = this._stream;

    // Esperar a que el video tenga frames reales antes de resolver
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("La cámara tardó demasiado en iniciar.")), 8000);
      this._video.onloadedmetadata = () => {
        clearTimeout(timeout);
        this._video.play().then(resolve).catch(reject);
      };
      // Si ya tiene metadata (segundo intento), resolver directamente
      if (this._video.readyState >= 1) {
        clearTimeout(timeout);
        this._video.play().then(resolve).catch(reject);
      }
    });

    // Pequeña pausa para que el primer frame esté disponible
    await new Promise((r) => setTimeout(r, 120));
  }

  startMediaPipe(faceMesh) {
    const loop = async () => {
      if (!this._stream) return;
      // Solo procesar frames cuando el video tiene datos reales
      if (this._video.readyState >= 2 && !this._video.paused) {
        try {
          await faceMesh.send({ image: this._video });
        } catch {
          // Frame descartado — normal durante transiciones
        }
      }
      this._rafId = requestAnimationFrame(loop);
    };
    this._rafId = requestAnimationFrame(loop);
  }

  stop() {
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
    if (this._stream) {
      this._stream.getTracks().forEach((t) => t.stop());
      this._stream = null;
    }
    if (this._video) {
      this._video.srcObject = null;
      this._video.onloadedmetadata = null;
    }
  }

  captureFrame() {
    const canvas  = document.createElement("canvas");
    canvas.width  = this._video.videoWidth  || 640;
    canvas.height = this._video.videoHeight || 480;
    canvas.getContext("2d").drawImage(this._video, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.88);
  }
}
