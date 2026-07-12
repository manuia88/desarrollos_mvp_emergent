/*
 *  /herramientas — hub público de TODAS las herramientas, en tarjetas (nombre + para qué sirve).
 *  Un solo lugar para descubrirlas y entrar. Lee del catálogo único (lib/toolsCatalog), así nunca
 *  se desincroniza del navbar. Tema CLARO (patrón página-herramienta): .tool-surface + ToolNav, igual
 *  que Comparador/Simulador. build-for-endstate: cada tarjeta ya enlaza a su herramienta real.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import ToolNav from '../../components/ui/ToolNav';
import { tc } from '../../lib/titleCase';
import { TOOL_GROUPS } from '../../lib/toolsCatalog';

// Paleta CLARA (misma que ComparatorPage): texto oscuro sobre blanco.
const INK = '#1E2230';
const INK_2 = '#5A5F6E';
const RULE = '#E6E8EE';

export default function Herramientas() {
  return (
    <div className="tool-surface" style={{ color: INK, fontFamily: 'DM Sans, sans-serif' }}>
      <ToolNav />
      <main style={{ maxWidth: 1120, margin: '0 auto', padding: '48px 24px 96px' }}>
        <div style={{ letterSpacing: '0.16em', fontSize: 11, color: 'var(--theme)', textTransform: 'uppercase', fontWeight: 800, fontFamily: "'Outfit',sans-serif" }}>DesarrollosMX</div>
        <h1 style={{ margin: '10px 0 8px', fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: 'clamp(2rem,4vw,2.8rem)', lineHeight: 1.05, letterSpacing: '-0.02em', color: INK }}>
          Todas las herramientas
        </h1>
        <p style={{ margin: 0, color: INK_2, fontSize: 15.5, maxWidth: 680, lineHeight: 1.55 }}>
          Inteligencia de mercado, calculadoras y datos — todo en un lugar. Elige y entra.
        </p>

        {TOOL_GROUPS.map((g) => (
          <section key={g.title} style={{ marginTop: 40 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <h2 style={{ margin: 0, fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: 15, color: INK, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{g.title}</h2>
              <div style={{ flex: 1, height: 1, background: RULE }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
              {g.items.map((tl) => (
                <Link key={tl.to} to={tl.to} className="dmx-card" style={{
                  display: 'block', textDecoration: 'none', padding: '18px 18px 16px', borderRadius: 16,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: 16.5, color: INK, letterSpacing: '-0.01em' }}>{tc(tl.label)}</div>
                    <span style={{ color: 'var(--theme)', fontSize: 18, fontWeight: 800 }}>→</span>
                  </div>
                  <div style={{ marginTop: 6, color: INK_2, fontSize: 13.5, lineHeight: 1.5 }}>{tl.desc}</div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
