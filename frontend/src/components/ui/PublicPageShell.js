import React, { useEffect } from 'react';
import LightScope from './LightScope';
import PublicNav from './PublicNav';
import Footer from './Footer';

/**
 * DMX UI · PublicPageShell — el caparazón ÚNICO de la cara pública + portales claros (refactor 2026-06-17).
 *
 * Resuelve de raíz lo que el color-swap por página NO resolvía:
 *  1) Fija el tema claro a nivel <body> (clase `public-light` en index.css) → adiós fondos negros residuales
 *     que asomaban detrás del scope.
 *  2) Trae el navbar (PublicNav) y el footer (Footer) consistentes → un solo sitio, no dos.
 *  3) El contenido se compone con las primitivas del sistema (Card/Section/Button) — rediseño real, no recolor.
 *
 * Uso:  return <PublicPageShell><Section>…</Section></PublicPageShell>
 * Props: nav (default true), footer (default true), mainStyle (override del <main>).
 */
export default function PublicPageShell({ children, nav = true, footer = true, mainStyle, ...rest }) {
  useEffect(() => {
    document.body.classList.add('public-light');
    return () => document.body.classList.remove('public-light');
  }, []);
  return (
    <LightScope {...rest}>
      {nav && <PublicNav />}
      <main style={{ paddingTop: 64, ...mainStyle }}>
        {children}
      </main>
      {footer && <Footer />}
    </LightScope>
  );
}
