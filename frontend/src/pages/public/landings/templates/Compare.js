// W5.22 Z.8 — Landing template: Compare (tabla vs competidores)
import React from 'react';

export default function Compare({ landing, children }) {
  const c = landing.content || {};
  const brand = landing.brand_kit || {};
  const primary = brand.color_primary || '#6366F1';
  const secondary = brand.color_secondary || '#EC4899';
  const fontH = brand.font_heading || 'Outfit, sans-serif';
  const fontB = brand.font_body || 'DM Sans, sans-serif';
  const cta = c.cta?.primary?.text || 'Ver por que somos diferentes';

  const competitors = c.competitors || [
    { name: 'Esta opcion', score: '92' },
    { name: 'Alternativa A', score: '74' },
    { name: 'Alternativa B', score: '68' },
  ];
  const features = c.features || [];

  return (
    <div data-testid="tpl-compare" style={{ background: '#06080F', color: '#F0EBE0', fontFamily: fontB, minHeight: '100vh' }}>
      <div style={{ padding: '5rem 1.5rem 2rem', textAlign: 'center', maxWidth: 1000, margin: '0 auto' }}>
        <h1 style={{ fontFamily: fontH, fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 800, margin: 0, lineHeight: 1.1 }}>
          {c.hero?.title}
        </h1>
        {c.hero?.subtitle && (
          <p style={{ maxWidth: 700, margin: '20px auto 0', color: '#a0a4b0', lineHeight: 1.7, fontSize: 'clamp(1rem, 1.4vw, 1.15rem)' }}>{c.hero.subtitle}</p>
        )}
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem 1.5rem 4rem', overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: 640, borderCollapse: 'separate', borderSpacing: 0, background: 'rgba(13,16,23,0.7)', borderRadius: 14, overflow: 'hidden' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: 16, fontSize: 12, color: '#a0a4b0', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Caracteristica</th>
              {competitors.map((co, i) => (
                <th key={i} style={{ padding: 16, textAlign: 'center', background: i === 0 ? `linear-gradient(180deg, ${primary}22, transparent)` : 'transparent', borderBottom: i === 0 ? `2px solid ${primary}` : 'none' }}>
                  <div style={{ fontFamily: fontH, fontWeight: 700, color: i === 0 ? primary : '#cdd0d6' }}>{co.name}</div>
                  <div style={{ fontSize: 22, marginTop: 4, color: i === 0 ? secondary : '#6b7280', fontWeight: 800 }}>{co.score}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(features.length ? features : Array.from({ length: 5 }).map((_, i) => ({ title: `Caracteristica ${i + 1}`, description: '' }))).slice(0, 8).map((f, i) => (
              <tr key={i} style={{ borderTop: '1px solid rgba(99,102,241,0.12)' }}>
                <td style={{ padding: 14, fontWeight: 600 }}>{f.title}</td>
                {competitors.map((co, ci) => (
                  <td key={ci} style={{ padding: 14, textAlign: 'center', color: ci === 0 ? '#10B981' : '#6b7280' }}>
                    {ci === 0 ? '✓' : (ci === 1 ? '~' : '×')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ textAlign: 'center', marginTop: 32 }}>
          <button
            data-testid="tpl-compare-cta"
            onClick={() => document.getElementById('lead-form-section')?.scrollIntoView({ behavior: 'smooth' })}
            style={{ padding: '14px 32px', background: `linear-gradient(90deg, ${primary}, ${secondary})`, color: '#fff', border: 'none', borderRadius: 9999, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}
          >
            {cta}
          </button>
        </div>
      </div>

      <div id="lead-form-section" style={{ padding: '3rem 1.5rem', background: 'rgba(13,16,23,0.95)', borderTop: '1px solid rgba(99,102,241,0.2)' }}>{children}</div>
    </div>
  );
}
