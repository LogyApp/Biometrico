import { useEffect } from 'react';

// iOS pinta el área segura (home indicator) con el fondo de <html>, no el de
// la pantalla activa — si no coinciden, se ve una franja de color distinto
// en pantallas oscuras (splash, descarga, cámara).
export function useHtmlTheme(isDark) {
  useEffect(() => {
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
    return () => {
      document.documentElement.dataset.theme = 'light';
    };
  }, [isDark]);
}

// Mismo problema que arriba pero para pantallas del diseño nuevo cuyo header
// es un navy exacto que no coincide con ninguno de los dos presets de
// useHtmlTheme — sincroniza <html> directamente con ese color mientras la
// pantalla está activa.
export function useHtmlBackground(color) {
  useEffect(() => {
    if (!color) return undefined;
    const root = document.documentElement;
    const prev = root.style.backgroundColor;
    root.style.backgroundColor = color;
    return () => {
      root.style.backgroundColor = prev;
    };
  }, [color]);
}
