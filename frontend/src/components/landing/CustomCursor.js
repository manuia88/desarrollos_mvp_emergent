// CustomCursor — desktop only (pointer: fine)
// 3 layers: dot (10px), ring (28px), glow (120px) with different lag
import React, { useEffect, useRef } from 'react';

export default function CustomCursor() {
  const dotRef = useRef(null);
  const ringRef = useRef(null);
  const glowRef = useRef(null);

  useEffect(() => {
    // Only activate on pointer:fine (desktop mouse) y si el usuario NO pidió menos movimiento.
    // El cursor nativo se oculta (CSS) SOLO cuando esta clase está presente → si el JS no corre,
    // el cursor nativo permanece visible (evita quedarse sin cursor por un fallo de carga).
    if (!window.matchMedia('(pointer: fine)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    document.body.classList.add('custom-cursor-on');

    let mx = -999, my = -999;
    let rx = -999, ry = -999;
    let gx = -999, gy = -999;
    let raf;

    const onMove = (e) => {
      mx = e.clientX; my = e.clientY;
    };
    window.addEventListener('mousemove', onMove, { passive: true });

    const lerp = (a, b, t) => a + (b - a) * t;

    const tick = () => {
      if (dotRef.current) {
        dotRef.current.style.transform = `translate(${mx}px, ${my}px) translate(-50%, -50%)`;
      }
      rx = lerp(rx, mx, 0.14);
      ry = lerp(ry, my, 0.14);
      if (ringRef.current) {
        ringRef.current.style.transform = `translate(${rx}px, ${ry}px) translate(-50%, -50%)`;
      }
      gx = lerp(gx, mx, 0.10);
      gy = lerp(gy, my, 0.10);
      if (glowRef.current) {
        glowRef.current.style.transform = `translate(${gx}px, ${gy}px) translate(-50%, -50%)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(raf);
      document.body.classList.remove('custom-cursor-on');
    };
  }, []);

  // Only render on desktop
  if (typeof window !== 'undefined' && !window.matchMedia('(pointer: fine)').matches) {
    return null;
  }

  return (
    <>
      <div ref={dotRef} className="cursor-dot" data-testid="cursor-dot" />
      <div ref={ringRef} className="cursor-ring" />
      <div ref={glowRef} className="cursor-glow" />
    </>
  );
}
