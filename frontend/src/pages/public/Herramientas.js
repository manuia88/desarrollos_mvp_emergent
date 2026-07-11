/*
 *  /herramientas — hub público de TODAS las herramientas, en tarjetas (nombre + para qué sirve).
 *  Un solo lugar para descubrirlas y entrar. Lee del catálogo único (lib/toolsCatalog), así nunca
 *  se desincroniza del navbar. build-for-endstate: cada tarjeta ya enlaza a su herramienta real.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import PublicNav from '../../components/ui/PublicNav';
import { tc } from '../../lib/titleCase';
import { TOOL_GROUPS } from '../../lib/toolsCatalog';

export default function Herramientas() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg, #0E0F1A)' }}>
      <PublicNav />
      <main style={{ maxWidth: 1120, margin: '0 auto', padding: '48px 24px 96px' }}>
        <div style={{ letterSpacing: '0.16em', fontSize: 11, color: 'var(--theme)', textTransform: 'uppercase', fontWeight: 800, fontFamily: "'Outfit',sans-serif" }}>DesarrollosMX</div>
        <h1 style={{ margin: '10px 0 8px', fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: 'clamp(2rem,4vw,2.8rem)', lineHeight: 1.05, letterSpacing: '-0.02em', color: 'var(--cream)' }}>
          Todas las herramientas
        </h1>
        <p style={{ margin: 0, color: 'var(--cream-2)', fontSize: 15.5, maxWidth: 680, lineHeight: 1.55, fontFamily: 'DM Sans, sans-serif' }}>
          Inteligencia de mercado, calculadoras y datos — todo en un lugar. Elige y entra.
        </p>

        {TOOL_GROUPS.map((g) => (
          <section key={g.title} style={{ marginTop: 40 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <h2 style={{ margin: 0, fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: 15, color: 'var(--cream)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{g.title}</h2>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
              {g.items.map((tl) => (
                <Link key={tl.to} to={tl.to} className="dmx-card" style={{
                  display: 'block', textDecoration: 'none', padding: '18px 18px 16px', borderRadius: 16,
                  background: 'var(--bg-2, rgba(255,255,255,0.03))', border: '1px solid var(--border)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 800, fontSize: 16.5, color: 'var(--cream)', letterSpacing: '-0.01em' }}>{tc(tl.label)}</div>
                    <span style={{ color: 'var(--theme)', fontSize: 18, fontWeight: 800 }}>→</span>
                  </div>
                  <div style={{ marginTop: 6, color: 'var(--cream-2)', fontSize: 13.5, lineHeight: 1.5, fontFamily: 'DM Sans, sans-serif' }}>{tl.desc}</div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
