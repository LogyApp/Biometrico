// Alinea un rostro detectado por MediaPipe FaceMesh a un recorte de 112x112,
// replicando la normalización que usa ArcFace/InsightFace en el backend
// (misma plantilla de 5 puntos), para que el embedding calculado en el
// navegador sea comparable con el guardado en el servidor.

// Plantilla estándar de InsightFace para el crop 112x112 (arcface_dst).
const ARCFACE_TEMPLATE = [
  { x: 38.2946, y: 51.6963 }, // ojo derecho del sujeto (lado izquierdo de la imagen)
  { x: 73.5318, y: 51.5014 }, // ojo izquierdo del sujeto (lado derecho de la imagen)
  { x: 56.0252, y: 71.7366 }, // punta de la nariz
  { x: 41.5493, y: 92.3655 }, // comisura derecha de la boca
  { x: 70.7299, y: 92.2041 }, // comisura izquierda de la boca
];

// Índices de MediaPipe FaceMesh (468 puntos) usados para aproximar los
// 5 puntos que normalmente entrega un detector tipo RetinaFace.
const LM = {
  eyeRightOuter: 33, eyeRightInner: 133,
  eyeLeftOuter: 263, eyeLeftInner: 362,
  noseTip: 1,
  mouthRight: 61,
  mouthLeft: 291,
};

function mid(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function toPixels(lm, width, height) {
  return { x: lm.x * width, y: lm.y * height };
}

export function extractFivePoints(landmarks, width, height) {
  const px = (index) => toPixels(landmarks[index], width, height);
  return [
    mid(px(LM.eyeRightOuter), px(LM.eyeRightInner)),
    mid(px(LM.eyeLeftOuter), px(LM.eyeLeftInner)),
    px(LM.noseTip),
    px(LM.mouthRight),
    px(LM.mouthLeft),
  ];
}

// Transformación de similitud (escala + rotación + traslación, sin reflexión)
// por mínimos cuadrados, resuelta con aritmética compleja: en 2D, "escala +
// rotación" es exactamente una multiplicación compleja, así que el ajuste se
// reduce a una regresión lineal cerrada — equivalente al método de Umeyama
// para este caso (sin necesidad de SVD).
function solveSimilarityTransform(src, dst) {
  const n = src.length;
  const meanSrc = src.reduce((a, p) => ({ x: a.x + p.x / n, y: a.y + p.y / n }), { x: 0, y: 0 });
  const meanDst = dst.reduce((a, p) => ({ x: a.x + p.x / n, y: a.y + p.y / n }), { x: 0, y: 0 });

  let numRe = 0, numIm = 0, den = 0;
  for (let i = 0; i < n; i++) {
    const sx = src[i].x - meanSrc.x, sy = src[i].y - meanSrc.y;
    const dx = dst[i].x - meanDst.x, dy = dst[i].y - meanDst.y;
    // conj(s) * d = (sx - i·sy)(dx + i·dy)
    numRe += sx * dx + sy * dy;
    numIm += sx * dy - sy * dx;
    den += sx * sx + sy * sy;
  }
  const wr = numRe / den;
  const wi = numIm / den;
  const tx = meanDst.x - (wr * meanSrc.x - wi * meanSrc.y);
  const ty = meanDst.y - (wi * meanSrc.x + wr * meanSrc.y);
  return { a: wr, b: wi, c: -wi, d: wr, e: tx, f: ty };
}

// Devuelve un canvas de 112x112 con el rostro alineado, listo para el modelo ArcFace.
export function alignFaceCrop(sourceEl, landmarks, width, height) {
  const fivePoints = extractFivePoints(landmarks, width, height);
  const M = solveSimilarityTransform(fivePoints, ARCFACE_TEMPLATE);

  const canvas = document.createElement('canvas');
  canvas.width = 112;
  canvas.height = 112;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(M.a, M.b, M.c, M.d, M.e, M.f);
  ctx.drawImage(sourceEl, 0, 0, width, height);
  return canvas;
}
