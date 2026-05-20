// W5.22 Z.8 — Landing template: Investor (data-heavy · ROI + plusvalia)
import React from 'react';

export default function Investor({ landing, children }) {
  const c = landing.content || {};
  const brand = landing.brand_kit || {};
  const primary = brand.color_primary || '#6366F1';
  const secondary = brand.color_secondary || '#EC4899';
  const fontH = brand.font_heading || 'Outfit, sans-serif';
  const fontB = brand.font_body || 'DM Sans, sans-serif';
  const cta = c.cta?.primary?.text || 'Descarga proyeccion ROI';

  const stats = c.stats || [];

  return (
    <div data-testid="tpl-investor" style={{ background: '#06080F', color: '#F0EBE0', fontFamily: fontB, minHeight: '100vh' }}>
      <div style={{ padding: '5rem 1.5rem 3rem', borderBottom: '1px solid rgba(99,102,241,0.2)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'inline-block', padding: '4px 12px', borderRadius: 9999, background: 'rgba(99,102,241,0.15)', color: primary, fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Investor brief</div>
          <h1 style={{ fontFamily: fontH, fontSize: 'clamp(2rem, 5vw, 3.75rem)', fontWeight: 800, lineHeight: 1.1, margin: '20px 0 0', maxWidth: 800 }}>
            {c.hero?.title}
          </h1>
          {c.hero?.subtitle && (
            <p style={{ color: '#a0a4b0', maxWidth: 700, fontSize: 'clamp(1rem, 1.4vw, 1.15rem)', marginTop: 20, lineHeight: 1.7 }}>{c.hero.subtitle}</p>
          )}
        </div>
      </div>

      {stats.length > 0 && (
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '3rem 1.5rem', display: 'grid', gridTemplateColumns: `repeat(${Math.min(stats.length, 4)}, 1fr)`, gap: 20 }}>
          {stats.slice(0, 4).map((s, i) => (
            <div key={i} style={{ background: 'rgba(13,16,23,0.92)', backdropFilter: 'blur(24px)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 12, padding: 24 }}>
              <div style={{ fontFamily: fontH, fontSize: 'clamp(1.5rem, 3vw, 2.25rem)', fontWeight: 700, background: `linear-gradient(90deg, ${primary}, ${secondary})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                {s.value}
              </div>
              <div style={{ fontSize: 12, color: '#a0a4b0', marginTop: 8, letterSpacing: '0.05em' }}>{s.label}</div>
              <div style={{ marginTop: 12, height: 6, background: 'rgba(99,102,241,0.1)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(60 + i * 12, 96)}%`, background: `linear-gradient(90deg, ${primary}, ${secondary})` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '2rem 1.5rem 4rem' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', background: 'rgba(13,16,23,0.55)', borderRadius: 12, overflow: 'hidden' }}>
          <thead>
            <tr style={{ background: 'rgba(99,102,241,0.12)' }}>
              <th style={{ textAlign: 'left', padding: 14, color: primary, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Indicador</th>
              <th style={{ textAlign: 'right', padding: 14, color: primary, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Valor</th>
            </tr>
          </thead>
          <tbody>
            {(c.features || []).slice(0, 6).map((f, i) => (
              <tr key={i} style={{ borderBottom: '1px solid rgba(99,102,241,0.15)' }}>
                <td style={{ padding: 14 }}>
                  <div style={{ fontWeight: 600 }}>{f.title}</div>
                  <div style={{ fontSize: 12, color: '#a0a4b0', marginTop: 2 }}>{f.description}</div>
                </td>
                <td style={{ padding: 14, textAlign: 'right', color: primary, fontFamily: fontH, fontWeight: 700 }}>
                  {f.value || '+'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: 32, textAlign: 'center' }}>
          <button
            data-testid="tpl-investor-cta"
            onClick={() => document.getElementById('lead-form-section')?.scrollIntoView({ behavior: 'smooth' })}
            style={{ padding: '14px 36px', background: `linear-gradient(90deg, ${primary}, ${secondary})`, color: '#fff', border: 'none', borderRadius: 9999, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}
          >
            {cta}
          </button>
        </div>
      </div>

      <div id="lead-form-section" style={{ padding: '3rem 1.5rem', background: 'rgba(13,16,23,0.95)', borderTop: '1px solid rgba(99,102,241,0.2)' }}>{children}</div>
    </div>
  );
}
