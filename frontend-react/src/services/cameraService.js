import { setStoredPermission } from './permissionsService';

function mapCameraError(err) {
  if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
    setStoredPermission('camera', 'denied');
    return new Error('Permiso de cámara denegado. Habilítalo en la configuración del navegador.');
  }
  if (err.name === 'NotFoundError') {
    return new Error('No se encontró ninguna cámara en este dispositivo.');
  }
  if (err.name === 'NotReadableError') {
    return new Error('La cámara está siendo usada por otra aplicación. Ciérrala e intenta de nuevo.');
  }
  return new Error(`Error de cámara: ${err.message}`);
}

export class CameraService {
  constructor(videoEl) {
    this._video = videoEl;
    this._stream = null;
    this._rafId = null;
  }

  async start(isStale) {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Cámara no disponible. Abre la app en localhost o con HTTPS.');
    }

    try {
      this._stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
    } catch (primary) {
      if (primary.name === 'OverconstrainedError' || primary.name === 'ConstraintNotSatisfiedError') {
        this._stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }).catch(() => {
          throw new Error('No se encontró ninguna cámara en este dispositivo.');
        });
      } else {
        throw mapCameraError(primary);
      }
    }

    setStoredPermission('camera', 'granted');

    if (isStale?.()) {
      this._stream.getTracks().forEach((track) => track.stop());
      this._stream = null;
      return;
    }

    this._video.srcObject = this._stream;

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('La cámara tardó demasiado en iniciar.')), 8000);
      this._video.onloadedmetadata = () => {
        clearTimeout(timeout);
        this._video.play().then(resolve).catch(reject);
      };
      if (this._video.readyState >= 1) {
        clearTimeout(timeout);
        this._video.play().then(resolve).catch(reject);
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  startDetectionLoop(faceMesh) {
    const loop = async () => {
      if (!this._stream) return;
      if (this._video.readyState >= 2 && !this._video.paused) {
        try {
          await faceMesh.send({ image: this._video });
        } catch {}
      }
      this._rafId = requestAnimationFrame(loop);
    };
    this._rafId = requestAnimationFrame(loop);
  }

  stop() {
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    if (this._stream) {
      this._stream.getTracks().forEach((track) => track.stop());
      this._stream = null;
    }
    if (this._video) {
      this._video.srcObject = null;
      this._video.onloadedmetadata = null;
    }
  }

  captureFrame() {
    const canvas = document.createElement('canvas');
    canvas.width = this._video.videoWidth || 640;
    canvas.height = this._video.videoHeight || 480;
    canvas.getContext('2d').drawImage(this._video, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.88);
  }
}
