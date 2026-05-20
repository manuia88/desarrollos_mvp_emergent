// W5.22 Z.8 — LandingAtlaxWidget: chat flotante esquina inferior derecha
import React, { useState } from 'react';

export default function LandingAtlaxWidget({ landing }) {
  const [open, setOpen] = useState(false);
  const brand = landing?.brand_kit || {};
  const primary = brand.color_primary || '#6366F1';
  const secondary = brand.color_secondary || '#EC4899';

  return (
    <div data-testid="landing-atlax-widget" style={{ position: 'fixed', right: 24, bottom: 24, zIndex: 9999 }}>
      {open && (
        <div style={{ width: 320, marginBottom: 12, background: 'rgba(13,16,23,0.96)', backdropFilter: 'blur(24px)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 16, padding: 18, color: '#F0EBE0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontFamily: 'Outfit, sans-serif' }}>Atlax</strong>
            <button data-testid="atlax-close" onClick={() => setOpen(false)} aria-label="Close" style={{ background: 'transparent', color: '#a0a4b0', border: 'none', cursor: 'pointer' }}>×</button>
          </div>
          <p style={{ marginTop: 12, fontSize: 14, color: '#a0a4b0', lineHeight: 1.5 }}>
            Soy Atlax, tu asistente. Pregunta sobre este proyecto: precios, amenidades, ubicacion o disponibilidad.
          </p>
          <a
            data-testid="atlax-open-chat"
            href="/asistente"
            target="_blank"
            rel="noreferrer"
            style={{ display: 'inline-block', marginTop: 12, padding: '10px 18px', background: `linear-gradient(90deg, ${primary}, ${secondary})`, color: '#fff', borderRadius: 9999, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}
          >
            Abrir chat
          </a>
        </div>
      )}
      <button
        data-testid="atlax-toggle"
        onClick={() => setOpen(!open)}
        aria-label="Abrir Atlax"
        style={{
          width: 56, height: 56, borderRadius: 9999,
          background: `linear-gradient(135deg, ${primary}, ${secondary})`,
          color: '#fff', border: 'none', cursor: 'pointer',
          boxShadow: '0 10px 30px rgba(99,102,241,0.4)',
          fontWeight: 800, fontSize: 16,
        }}
      >
        AI
      </button>
    </div>
  );
}
