// Bug conocido de iOS/WKWebView: env(safe-area-inset-*) y 100dvh pueden
// quedar con un valor obsoleto después de volver de segundo plano o de
// abrir/cerrar el teclado — visualViewport sí se mantiene correcto en
// ambos casos, así que reflejamos su alto en una custom property y
// forzamos un recálculo de estilos justo en esos eventos.
//
// Además, iOS NO reduce env(safe-area-inset-bottom) cuando el teclado
// cubre el home indicator — ese inset representa la geometría física del
// dispositivo, no el estado de la UI. Sin esto, cualquier padding que
// reserve ese espacio deja una franja muerta justo encima del teclado.
// Por eso detectamos el teclado abierto (visualViewport se achica mucho
// más que por un simple cambio de orientación) y colapsamos --safe-bottom
// a 0 mientras dure.
const KEYBOARD_THRESHOLD_PX = 150;

export function initViewportFix() {
  const root = document.documentElement;
  let fullHeight = window.innerHeight;

  function update() {
    const height = window.visualViewport?.height ?? window.innerHeight;
    root.style.setProperty('--app-vh', `${height}px`);

    const keyboardOpen = fullHeight - height > KEYBOARD_THRESHOLD_PX;
    root.classList.toggle('keyboard-open', keyboardOpen);
  }

  function resetBaseline() {
    fullHeight = window.innerHeight;
    update();
  }

  update();

  window.visualViewport?.addEventListener('resize', update);
  window.visualViewport?.addEventListener('scroll', update);
  window.addEventListener('resize', resetBaseline);
  window.addEventListener('orientationchange', resetBaseline);
  window.addEventListener('pageshow', resetBaseline);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') resetBaseline();
  });
}
