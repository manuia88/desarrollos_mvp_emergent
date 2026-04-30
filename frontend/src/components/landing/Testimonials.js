// Testimonials — double marquee rows, pause on hover
import React from 'react';
import FadeUp from '../animations/FadeUp';

const TESTIMONIALS = [
  { quote: 'Con DMX pude comparar Del Valle y Condesa en 2 minutos. Antes tardaba semanas.', author: 'Laura S.', role: 'Compradora, CDMX' },
  { quote: 'El IE Score de colonia me convenció de invertir en Roma Norte. Fue la mejor decisión.', author: 'Ricardo M.', role: 'Inversionista' },
  { quote: 'Como asesor, el argumentario AI me ahorra 3 horas al día. Es extraordinario.', author: 'Ana G.', role: 'Asesora inmobiliaria' },
  { quote: 'El radar de comparación de colonias es lo más claro que he visto en el mercado.', author: 'Jorge P.', role: 'Arquitecto y comprador' },
  { quote: 'Mis clientes preguntan por el IE Score antes que el precio. Eso dice todo.', author: 'Carlos V.', role: 'Master Broker' },
  { quote: 'La transparencia de datos es lo que diferencia a DMX de cualquier portal.', author: 'Sofía R.', role: 'Directora de Desarrollo' },
  { quote: 'Tomar la decisión de comprar en Narvarte fue fácil con el reporte de colonia.', author: 'Mariana L.', role: 'Primera compradora' },
  { quote: 'DMX es lo que siempre necesité. Datos reales, sin conflicto de interés.', author: 'Alejandro F.', role: 'CFO, Empresa de RE' },
];

// Duplicate for seamless loop
const ROW1 = [...TESTIMONIALS, ...TESTIMONIALS];
const ROW2 = [...TESTIMONIALS.slice(4), ...TESTIMONIALS.slice(0, 4), ...TESTIMONIALS.slice(4), ...TESTIMONIALS.slice(0, 4)];

function TestimonialCard({ t }) {
  return (
    <div style={{
      width: 340, flexShrink: 0,
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
      borderRadius: 16,
      padding: 24,
      marginRight: 16,
    }}>
      <p style={{
        fontFamily: 'DM Sans', fontStyle: 'italic', fontSize: 14,
        color: 'var(--cream-2)', lineHeight: 1.65, marginBottom: 16,
      }}>
        "{t.quote}"
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 9999,
          background: 'var(--grad)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'Outfit', fontWeight: 700, fontSize: 12, color: '#fff',
        }}>
          {t.author[0]}
        </div>
        <div>
          <div style={{ fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13, color: 'var(--cream)' }}>
            {t.author}
          </div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>
            {t.role}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Testimonials() {
  return (
    <section data-testid="testimonials-section" style={{ padding: '80px 0', background: 'var(--bg)', overflow: 'hidden' }}>
      <FadeUp>
        <div style={{ textAlign: 'center', padding: '0 32px', marginBottom: 48 }}>
          <div className="tag-pill" style={{ marginBottom: 16 }}>Lo que dicen</div>
          <h2 style={{
            fontFamily: 'Outfit', fontWeight: 800,
            fontSize: 'clamp(32px, 4.5vw, 54px)',
            lineHeight: 1.0, letterSpacing: '-0.028em',
            color: 'var(--cream)',
          }}>
            Decisiones reales, resultados reales.
          </h2>
        </div>
      </FadeUp>

      {/* Marquee wrapper */}
      <div
        className="marquee-wrap"
        style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        {/* Fade masks */}
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, width: 80, height: '100%',
            background: 'linear-gradient(to right, var(--bg), transparent)', zIndex: 2, pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', right: 0, top: 0, width: 80, height: '100%',
            background: 'linear-gradient(to left, var(--bg), transparent)', zIndex: 2, pointerEvents: 'none' }} />
          <div className="marquee-row" style={{ animationDuration: '28s' }}>
            {ROW1.map((t, i) => <TestimonialCard key={i} t={t} />)}
          </div>
        </div>

        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, width: 80, height: '100%',
            background: 'linear-gradient(to right, var(--bg), transparent)', zIndex: 2, pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', right: 0, top: 0, width: 80, height: '100%',
            background: 'linear-gradient(to left, var(--bg), transparent)', zIndex: 2, pointerEvents: 'none' }} />
          <div className="marquee-row rev" style={{ animationDuration: '34s' }}>
            {ROW2.map((t, i) => <TestimonialCard key={i} t={t} />)}
          </div>
        </div>
      </div>
    </section>
  );
}
