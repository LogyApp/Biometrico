import * as ort from 'onnxruntime-web';
import { alignFaceCrop } from './faceAlignmentService';

const MODEL_URL = import.meta.env.DEV
  ? '/models/w600k_r50.onnx'
  : 'https://storage.googleapis.com/logyser-facial-models/models/w600k_r50.onnx';
const EMBEDDING_SIZE = 512;

ort.env.wasm.wasmPaths = '/ort/';
// Single-thread: evita depender de SharedArrayBuffer (requiere cabeceras
// COOP/COEP que no queremos exigir en todo el despliegue solo por esto).
ort.env.wasm.numThreads = 1;

let sessionPromise = null;

async function purgeCachedModel() {
  if (!('caches' in self)) return;
  try {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map(async (name) => {
      const cache = await caches.open(name);
      await cache.delete(MODEL_URL);
    }));
  } catch {}
}

function loadSession() {
  if (!sessionPromise) {
    sessionPromise = ort.InferenceSession.create(MODEL_URL, {
      executionProviders: ['wasm'],
    }).catch(async (err) => {
      sessionPromise = null;
      await purgeCachedModel();
      throw err;
    });
  }
  return sessionPromise;
}

// Descarga y prepara el modelo con anticipación (usado por la pantalla de
// descarga obligatoria) para que la primera verificación offline no tenga
// que esperar la carga del modelo.
export function ensureLocalFaceModel() {
  return loadSession();
}

// Descarga el modelo con progreso real medible (onProgress recibe 0..1).
// Al pasar por fetch(), el Service Worker cachea la respuesta igual que
// cualquier otro request a /models/ — así ensureLocalFaceModel() la
// encuentra ya en caché la próxima vez, incluso sin conexión.
const MODEL_FETCH_TIMEOUT_MS = 45000;
const MODEL_FETCH_RETRIES = 2;

async function fetchModelOnce() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MODEL_FETCH_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(MODEL_URL, { signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('La descarga tardó demasiado. Verifica tu conexión e intenta de nuevo.');
    }
    throw new Error('No se pudo conectar con el servidor de descargas. Verifica tu conexión e intenta de nuevo.');
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    throw new Error(`El servidor de descargas respondió con un error (${res.status}). Intenta de nuevo en unos minutos.`);
  }
  if (!res.body) {
    throw new Error('El servidor de descargas no devolvió contenido. Intenta de nuevo.');
  }
  return res;
}

export async function downloadModelWithProgress(onProgress) {
  let lastErr;
  for (let attempt = 0; attempt <= MODEL_FETCH_RETRIES; attempt++) {
    if (attempt > 0) {
      onProgress(0);
      await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
    }
    try {
      const res = await fetchModelOnce();
      const total = Number(res.headers.get('content-length')) || 0;
      const reader = res.body.getReader();
      let received = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.length;
        if (total) onProgress(received / total);
      }
      onProgress(1);
      return;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

// Convierte el canvas alineado (112x112 RGB) al tensor NCHW normalizado que
// espera ArcFace: (pixel - 127.5) / 127.5, canales en orden RGB — misma
// normalización que usa InsightFace en el backend (swapRB + input_std=127.5).
function canvasToTensor(canvas) {
  const ctx = canvas.getContext('2d');
  const { data } = ctx.getImageData(0, 0, 112, 112);
  const plane = 112 * 112;
  const floatData = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    floatData[i] = (data[i * 4] - 127.5) / 127.5;
    floatData[plane + i] = (data[i * 4 + 1] - 127.5) / 127.5;
    floatData[2 * plane + i] = (data[i * 4 + 2] - 127.5) / 127.5;
  }
  return new ort.Tensor('float32', floatData, [1, 3, 112, 112]);
}

function l2Normalize(vec) {
  let sumSq = 0;
  for (let i = 0; i < vec.length; i++) sumSq += vec[i] * vec[i];
  const norm = Math.sqrt(sumSq) || 1;
  const out = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) out[i] = vec[i] / norm;
  return out;
}

// sourceEl: el <video> (o canvas) del que se tomó el frame.
// landmarks: results.multiFaceLandmarks[0] de MediaPipe FaceMesh.
// width/height: dimensiones del frame usado para la detección (video.videoWidth/Height).
export async function extractEmbeddingLocal(sourceEl, landmarks, width, height) {
  const session = await loadSession();
  const aligned = alignFaceCrop(sourceEl, landmarks, width, height);
  const tensor = canvasToTensor(aligned);

  const inputName = session.inputNames[0];
  const outputs = await session.run({ [inputName]: tensor });
  const outputName = session.outputNames[0];
  const raw = outputs[outputName].data;

  return l2Normalize(raw);
}

// Ambos vectores deben venir L2-normalizados (enrolamiento y verificación
// local ya lo garantizan) — la similitud coseno es entonces el producto punto.
export function cosineSimilarityLocal(a, b) {
  let dot = 0;
  for (let i = 0; i < EMBEDDING_SIZE; i++) dot += a[i] * b[i];
  return dot;
}
