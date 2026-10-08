const ASSET_BASE = '/mediapipe/face_mesh/';
const SCRIPT_URL = `${ASSET_BASE}face_mesh.js`;
const MIN_DETECTION_CONFIDENCE = 0.6;
const MIN_TRACKING_CONFIDENCE = 0.5;

let sharedFaceMesh = null;
let initPromise = null;
let scriptPromise = null;

function loadScript() {
  if (typeof window !== 'undefined' && window.FaceMesh) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.crossOrigin = 'anonymous';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('No se pudo cargar el detector facial.'));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export async function ensureFaceMesh() {
  if (sharedFaceMesh) return sharedFaceMesh;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    await loadScript();
    const faceMesh = new window.FaceMesh({ locateFile: (file) => ASSET_BASE + file });
    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: false,
      minDetectionConfidence: MIN_DETECTION_CONFIDENCE,
      minTrackingConfidence: MIN_TRACKING_CONFIDENCE,
    });
    await faceMesh.initialize();
    sharedFaceMesh = faceMesh;
    return faceMesh;
  })();
  return initPromise;
}
