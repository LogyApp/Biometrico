const _el = (id) => document.getElementById(id);

export const UI = {
  goTo(screenId) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    const screen = _el(`screen-${screenId}`);
    if (screen) { screen.classList.add("active"); screen.scrollTop = 0; }
  },

  setInstruction(id, text) {
    const el = _el(id);
    if (el) el.textContent = text;
  },

  setProgress(id, pct) {
    const el = _el(id);
    if (el) el.style.width = `${pct}%`;
  },

  /* Sincroniza estado en el ring Y en el container (corners) */
  setFaceOval(id, state) {
    const ring = _el(id);
    if (!ring) return;

    ring.className = `oval-ring${state ? ` ${state}` : ""}`;

    const container = ring.closest(".oval-container");
    if (container) {
      container.className = `oval-container${state ? ` ${state}` : ""}`;
    }
  },

  buildStepDots(containerId, count) {
    const c = _el(containerId);
    if (!c) return;
    c.innerHTML = "";
    for (let i = 0; i < count; i++) {
      const d = document.createElement("div");
      d.className = `step-dot${i === 0 ? " active" : ""}`;
      d.id = `${containerId}-dot-${i}`;
      c.appendChild(d);
    }
  },

  markDotDone(containerId, index) {
    const done = _el(`${containerId}-dot-${index}`);
    if (done) { done.classList.remove("active"); done.classList.add("done"); }
    const next = _el(`${containerId}-dot-${index + 1}`);
    if (next) next.classList.add("active");
  },
};
