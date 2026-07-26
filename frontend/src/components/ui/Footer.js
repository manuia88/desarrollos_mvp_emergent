import React from 'react';
import { Link } from 'react-router-dom';
import { tc } from '../../lib/titleCase';

/**
 * DMX UI · Footer — pie de página compartido del rediseño claro. Sobre tokens (var(--*)) → se adapta al scope.
 * Lo usa PublicPageShell, así que toda página pública/portal cierra igual. Cero footers inline ad-hoc.
 */
const COLS = [
  { title: 'Explora', links: [['Comprar', '/marketplace'], ['Mapa de valores', '/mapa'], ['Colonias', '/colonias'], ['Comparar zonas', '/comparar']] },
  { title: 'Inteligencia', links: [['Valores catastrales', '/valores'], ['Simulador', '/simulador'], ['Metodología', '/methodology'], ['Confianza', '/confianza']] },
  { title: 'Para profesionales', links: [['Asesores', '/asesores'], ['Desarrolladores', '/desarrolladores']] },
];

export default function Footer() {
  return (
    <footer style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-card)', marginTop: 64 }}>
      {/* El pie iba con 4 columnas fijas y sin punto de quiebre, así que su ancho mínimo
          (220px de la marca + 3 columnas + separaciones + márgenes) empujaba la página a ~600px:
          TODA pantalla pública se desbordaba de lado en un celular de 390px, que es donde la gente
          compra (auditoría A–Z 07-26). Se apila en pantalla angosta. Va como regla con punto de
          quiebre y no como estilo en línea porque un estilo en línea no puede consultar el ancho. */}
      <style>{`
        .dmx-footer-wrap { max-width: 1240px; margin: 0 auto; padding: 48px 32px 32px; }
        .dmx-footer-cols { display: grid; grid-template-columns: minmax(220px, 1.4fr) repeat(3, 1fr); gap: 32px; margin-bottom: 36px; }
        @media (max-width: 720px) {
          .dmx-footer-wrap { padding: 32px 20px 24px; }
          .dmx-footer-cols { grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 28px; }
          .dmx-footer-cols > :first-child { grid-column: 1 / -1; }
        }
        @media (max-width: 380px) { .dmx-footer-cols { grid-template-columns: 1fr; } }
      `}</style>
      <div className="dmx-footer-wrap">
        <div className="dmx-footer-cols">
          <div>
            <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 20, letterSpacing: '-0.02em', color: 'var(--cream)' }}>
              Desarrollos<span style={{ color: 'var(--theme)' }}>MX</span>
            </div>
            <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)', lineHeight: 1.6, marginTop: 10, maxWidth: 280 }}>
              La inteligencia inmobiliaria de CDMX: precio real por colonia, plusvalía oficial y catastro — para comprar con cero miedo.
            </p>
          </div>
          {COLS.map((col) => (
            <div key={col.title}>
              <div style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--cream-3)', marginBottom: 14 }}>{tc(col.title)}</div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {col.links.map(([label, to]) => (
                  <li key={to}>
                    <Link to={to} style={{ fontFamily: 'DM Sans', fontSize: 13.5, color: 'var(--cream-2)', textDecoration: 'none' }}>{tc(label)}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, paddingTop: 22, borderTop: '1px solid var(--border)' }}>
          <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>© 2026 DesarrollosMX · Ciudad de México</span>
          <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>Datos: SIGCDMX · SHF · INEGI · fuentes oficiales</span>
        </div>
      </div>
    </footer>
  );
}
