// W5.22 Z.8 — Landing template: Urgent (countdown · scarcity-driven)
import React, { useEffect, useState } from 'react';

function useCountdown(expiresAt) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const target = expiresAt ? new Date(expiresAt).getTime() : Date.now() + 1000 * 60 * 60 * 48;
  const diff = Math.max(0, target - now);
  const d = Math.floor(diff / (1000 * 60 * 60 * 24));
  const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const m = Math.floor((diff / (1000 * 60)) % 60);
  const s = Math.floor((diff / 1000) % 60);
  return { d, h, m, s, expired: diff === 0 };
}

export default function Urgent({ landing, children }) {
  const c = landing.content || {};
  const brand = landing.brand_kit || {};
  const primary = brand.color_primary || '#EF4444';
  const fontH = brand.font_heading || 'Outfit, sans-serif';
  const fontB = brand.font_body || 'DM Sans, sans-serif';
  const cta = c.cta?.primary?.text || 'Aparta tu unidad hoy';
  const { d, h, m, s, expired } = useCountdown(c.urgent_expires_at);

  return (
    <div data-testid="tpl-urgent" style={{ background: '#0E0808', color: '#FFFFFF', fontFamily: fontB, minHeight: '100vh' }}>
      <div style={{ background: primary, padding: '10px 16px', textAlign: 'center', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', fontSize: 12 }}>
        Solo quedan unidades limitadas
      </div>
      <div style={{ padding: '4rem 1.5rem 3rem', textAlign: 'center', maxWidth: 1000, margin: '0 auto' }}>
        <h1 style={{ fontFamily: fontH, fontSize: 'clamp(2.2rem, 5.5vw, 4rem)', fontWeight: 800, margin: 0, lineHeight: 1.05 }}>
          {c.hero?.title}
        </h1>
        {c.hero?.subtitle && (
          <p style={{ maxWidth: 700, margin: '20px auto 0', color: '#FCA5A5', fontSize: 'clamp(1rem, 1.4vw, 1.15rem)', lineHeight: 1.6 }}>
            {c.hero.subtitle}
          </p>
        )}

        <div style={{ marginTop: 40, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          {[
            { label: 'Dias', v: d },
            { label: 'Hrs', v: h },
            { label: 'Min', v: m },
            { label: 'Seg', v: s },
          ].map((u, i) => (
            <div key={i} data-testid={`urgent-count-${u.label.toLowerCase()}`} style={{ minWidth: 80, padding: '14px 18px', background: 'rgba(239,68,68,0.12)', border: `1px solid ${primary}55`, borderRadius: 12 }}>
              <div style={{ fontFamily: fontH, fontSize: 32, fontWeight: 800, color: primary }}>{String(u.v).padStart(2, '0')}</div>
              <div style={{ fontSize: 11, color: '#FCA5A5', textTransform: 'uppercase', letterSpacing: '0.15em' }}>{u.label}</div>
            </div>
          ))}
        </div>

        <button
          data-testid="tpl-urgent-cta"
          onClick={() => document.getElementById('lead-form-section')?.scrollIntoView({ behavior: 'smooth' })}
          disabled={expired}
          style={{
            marginTop: 40, padding: '16px 40px',
            background: expired ? '#555' : primary, color: '#fff', border: 'none',
            borderRadius: 9999, fontWeight: 800, fontSize: 16, cursor: expired ? 'not-allowed' : 'pointer',
            letterSpacing: '0.05em',
            animation: expired ? 'none' : 'urgentPulse 1.6s ease-in-out infinite',
          }}
        >
          {expired ? 'Periodo cerrado' : cta}
        </button>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem 1.5rem 4rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        {(c.features || []).slice(0, 4).map((f, i) => (
          <div key={i} style={{ padding: 20, border: `1px solid ${primary}33`, borderRadius: 10 }}>
            <h3 style={{ margin: 0, fontFamily: fontH, color: primary, fontSize: 16 }}>{f.title}</h3>
            <p style={{ color: '#FCA5A5', marginTop: 8, fontSize: 14, lineHeight: 1.5 }}>{f.description}</p>
          </div>
        ))}
      </div>

      <div id="lead-form-section" style={{ padding: '3rem 1.5rem', background: '#1a0a0a', borderTop: `1px solid ${primary}44` }}>{children}</div>
      <style>{`@keyframes urgentPulse { 0%,100% { transform: translateY(0); box-shadow: 0 0 0 0 ${primary}66; } 50% { transform: translateY(-2px); box-shadow: 0 0 0 12px ${primary}00; } }`}</style>
    </div>
  );
}
