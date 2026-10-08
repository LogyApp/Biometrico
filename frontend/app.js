"use strict";

const App = (() => {
  const LIVENESS_STEPS_REGISTER = ["left", "right", "blink"];
  const LIVENESS_STEPS_VERIFY = ["blink"];
  const HEAD_YAW_THRESHOLD = 0.18;
  const BLINK_EAR_THRESHOLD = 0.22;
  const FACE_CONFIDENCE_THRESHOLD = 0.7;

  let mode = null;
  let camera = null;
  let faceMesh = null;
  let videoEl = null;
  let canvasEl = null;
  let ctx = null;
  let faceOvalEl = null;

  let livenessSteps = [];
  let currentStep = 0;
  let capturedFrames = [];
  let stepDone = false;
  let lastLandmarks = null;
  let baseNoseX = null;

  function goTo(screen) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    document.getElementById(`screen-${screen}`).classList.add("active");
  }

  function showAlert(elId, msg) {
    const el = document.getElementById(elId);
    el.textContent = msg;
    el.classList.remove("hidden");
  }

  function hideAlert(elId) {
    document.getElementById(elId).classList.add("hidden");
  }

  function buildStepDots(count) {
    const container = document.getElementById("steps-indicator");
    container.innerHTML = "";
    for (let i = 0; i < count; i++) {
      const dot = document.createElement("div");
      dot.className = "step-dot" + (i === 0 ? " active" : "");
      dot.id = `dot-${i}`;
      container.appendChild(dot);
    }
  }

  function markDotDone(index) {
    const dot = document.getElementById(`dot-${index}`);
    if (dot) { dot.classList.remove("active"); dot.classList.add("done"); }
    const next = document.getElementById(`dot-${index + 1}`);
    if (next) next.classList.add("active");
  }

  function setProgress(pct) {
    document.getElementById("liveness-progress").style.width = `${pct}%`;
  }

  function setInstruction(text) {
    document.getElementById("instr-text").textContent = text;
  }

  const STEP_INSTRUCTIONS = {
    left: "Gira la cabeza hacia la IZQUIERDA lentamente",
    right: "Gira la cabeza hacia la DERECHA lentamente",
    blink: "Parpadea conscientemente (cierra y abre los ojos)",
  };

  function earValue(landmarks, eyeIndices) {
    const [p1, p2, p3, p4, p5, p6] = eyeIndices.map((i) => landmarks[i]);
    const vert1 = Math.hypot(p2.x - p6.x, p2.y - p6.y);
    const vert2 = Math.hypot(p3.x - p5.x, p3.y - p5.y);
    const horiz = Math.hypot(p1.x - p4.x, p1.y - p4.y);
    return (vert1 + vert2) / (2 * horiz);
  }

  const LEFT_EYE = [362, 385, 387, 263, 373, 380];
  const RIGHT_EYE = [33, 160, 158, 133, 153, 144];

  function computeEAR(landmarks) {
    return (earValue(landmarks, LEFT_EYE) + earValue(landmarks, RIGHT_EYE)) / 2;
  }

  function getYawNormalized(landmarks) {
    const noseTip = landmarks[1];
    const leftEar = landmarks[234];
    const rightEar = landmarks[454];
    const faceWidth = Math.abs(rightEar.x - leftEar.x);
    const faceCenter = (leftEar.x + rightEar.x) / 2;
    return (noseTip.x - faceCenter) / (faceWidth || 1);
  }

  function checkFacePresent(landmarks) {
    return landmarks && landmarks.length > 0;
  }

  function captureFrame() {
    const offscreen = document.createElement("canvas");
    offscreen.width = videoEl.videoWidth;
    offscreen.height = videoEl.videoHeight;
    const octx = offscreen.getContext("2d");
    octx.drawImage(videoEl, 0, 0);
    return offscreen.toDataURL("image/jpeg", 0.85);
  }

  async function onFaceMeshResults(results) {
    if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
      faceOvalEl.className = "face-oval error";
      setInstruction("No se detecta rostro. Centra tu cara.");
      return;
    }

    const landmarks = results.multiFaceLandmarks[0];
    lastLandmarks = landmarks;
    faceOvalEl.className = "face-oval detected";

    if (currentStep >= livenessSteps.length) return;

    const step = livenessSteps[currentStep];

    if (step === "blink") {
      const ear = computeEAR(landmarks);
      if (!stepDone && ear < BLINK_EAR_THRESHOLD) {
        stepDone = true;
        await completeStep();
      }
    } else {
      const yaw = getYawNormalized(landmarks);
      if (baseNoseX === null) baseNoseX = yaw;

      const delta = yaw - baseNoseX;
      if (!stepDone) {
        if (step === "left" && delta > HEAD_YAW_THRESHOLD) {
          stepDone = true;
          await completeStep();
        } else if (step === "right" && delta < -HEAD_YAW_THRESHOLD) {
          stepDone = true;
          await completeStep();
        }
      }
    }
  }

  async function completeStep() {
    capturedFrames.push(captureFrame());
    markDotDone(currentStep);
    setProgress(((currentStep + 1) / livenessSteps.length) * 100);
    currentStep++;
    stepDone = false;
    baseNoseX = null;

    if (currentStep >= livenessSteps.length) {
      setInstruction("Listo. Procesando...");
      await stopCamera();
      if (mode === "register") {
        await submitRegister();
      } else {
        await submitVerify();
      }
    } else {
      setInstruction(STEP_INSTRUCTIONS[livenessSteps[currentStep]]);
    }
  }

  async function initFaceMesh() {
    if (faceMesh) return;
    faceMesh = new FaceMesh({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/${file}`,
    });
    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: false,
      minDetectionConfidence: FACE_CONFIDENCE_THRESHOLD,
      minTrackingConfidence: 0.5,
    });
    faceMesh.onResults(onFaceMeshResults);
    await faceMesh.initialize();
  }

  async function startCamera(steps) {
    livenessSteps = steps;
    currentStep = 0;
    capturedFrames = [];
    stepDone = false;
    baseNoseX = null;

    videoEl = document.getElementById("video");
    canvasEl = document.getElementById("canvas-overlay");
    ctx = canvasEl.getContext("2d");
    faceOvalEl = document.getElementById("face-oval");

    buildStepDots(steps.length);
    setProgress(0);
    setInstruction(STEP_INSTRUCTIONS[steps[0]]);

    goTo("camera");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      videoEl.srcObject = stream;
      await videoEl.play();
    } catch {
      goTo(mode === "register" ? "register" : "verify");
      showAlert(mode === "register" ? "reg-alert" : "ver-alert", "No se pudo acceder a la cámara.");
      return;
    }

    await initFaceMesh();

    camera = new Camera(videoEl, {
      onFrame: async () => {
        canvasEl.width = videoEl.videoWidth;
        canvasEl.height = videoEl.videoHeight;
        await faceMesh.send({ image: videoEl });
      },
      width: 640,
      height: 480,
    });
    camera.start();
  }

  async function stopCamera() {
    if (camera) { camera.stop(); camera = null; }
    if (videoEl && videoEl.srcObject) {
      videoEl.srcObject.getTracks().forEach((t) => t.stop());
      videoEl.srcObject = null;
    }
  }

  async function startRegisterCamera() {
    const doc = document.getElementById("reg-doc").value.trim();
    const name = document.getElementById("reg-name").value.trim();
    hideAlert("reg-alert");
    if (!doc || !name) { showAlert("reg-alert", "Completa todos los campos."); return; }
    if (doc.length < 3) { showAlert("reg-alert", "Documento muy corto."); return; }
    mode = "register";
    await startCamera(LIVENESS_STEPS_REGISTER);
  }

  async function startVerifyCamera() {
    const doc = document.getElementById("ver-doc").value.trim();
    hideAlert("ver-alert");
    if (!doc) { showAlert("ver-alert", "Ingresa el número de documento."); return; }
    mode = "verify";
    await startCamera(LIVENESS_STEPS_VERIFY);
  }

  async function submitRegister() {
    goTo("processing");
    document.getElementById("processing-text").textContent = "Extrayendo biometría...";

    const doc = document.getElementById("reg-doc").value.trim();
    const name = document.getElementById("reg-name").value.trim();

    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document_id: doc, full_name: name, frames: capturedFrames }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.detail || "Error del servidor");

      showResult(
        data.status === "registered" ? "success" : "warning",
        data.status === "registered" ? "Registro exitoso" : "Ya registrado",
        data.message,
        null
      );
    } catch (e) {
      showResult("danger", "Error de registro", e.message, null);
    }
  }

  async function submitVerify() {
    goTo("processing");
    document.getElementById("processing-text").textContent = "Verificando identidad...";

    const doc = document.getElementById("ver-doc").value.trim();

    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document_id: doc, frame: capturedFrames[0] }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.detail || "Error del servidor");

      const isAuth = data.status === "authorized";
      showResult(
        isAuth ? "success" : "danger",
        isAuth ? "Acceso autorizado" : "Acceso denegado",
        data.message,
        data.status !== "not_found" ? `Score: ${(data.score * 100).toFixed(1)}%` : null
      );
    } catch (e) {
      showResult("danger", "Error de verificación", e.message, null);
    }
  }

  function showResult(type, title, subtitle, score) {
    const iconMap = {
      success: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
      danger: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
      warning: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    };

    document.getElementById("result-icon").className = `result-icon ${type}`;
    document.getElementById("result-icon").innerHTML = iconMap[type];
    document.getElementById("result-title").textContent = title;
    document.getElementById("result-subtitle").textContent = subtitle;

    const scoreBadge = document.getElementById("result-score");
    if (score) {
      scoreBadge.textContent = score;
      scoreBadge.classList.remove("hidden");
    } else {
      scoreBadge.classList.add("hidden");
    }

    goTo("result");
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js"));
  }

  return { goTo, startRegisterCamera, startVerifyCamera, stopCamera };
})();
