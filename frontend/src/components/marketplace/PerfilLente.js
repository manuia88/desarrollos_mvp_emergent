/**
 * PerfilLente — "¿Para qué lo quieres?" en la ficha del desarrollo. El lente que vive en las tabs de colonia
 * (invertir/vivir/familia/primera), pero aplicado a ESTE desarrollo con sus números reales. En vez de mostrarle todo a
 * todos, pregunta el perfil y arma la historia relevante. Dato real (lugares de Google + precio/recámaras/m² del dev +
 * matemática de crédito). onGoTo(testid) lleva a la sección profunda (Tu dinero / Lo mejor cerca).
 */
import React, { useEffect, useState } from 'react';

const API = process.env.REACT_APP_BACKEND_URL;
const money = (n) => `$${Number(Math.round(n)).toLocaleString('es-MX')}`;

const PROFILES = [
  { k: 'invertir', icon: '💰', label: 'Invertir' },
  { k: 'vivir', icon: '🏡', label: 'Vivir' },
  { k: 'familia', icon: '👨‍👩‍👧', label: 'Familia' },
  { k: 'primera', icon: '🔑', label: 'Primera casa' },
];

function Fact({ n, l }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(22px,2.6vw,30px)', color: 'var(--cream)', lineHeight: 1, letterSpacing: '-0.02em' }}>{n}</div>
      <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-2)', marginTop: 5, lineHeight: 1.3 }}>{l}</div>
    </div>
  );
}

export default function PerfilLente({ dev, onGoTo, onPerfilChange }) {
  const [perfil, setPerfil] = useState('invertir');
  const [vida, setVida] = useState(null);
  const pick = (k) => { setPerfil(k); if (onPerfilChange) onPerfilChange(k); };

  useEffect(() => {
    const cid = dev.colonia_id || dev.colonia;
    if (!cid) return undefined;
    let alive = true;
    fetch(`${API}/api/zona/${encodeURIComponent(cid)}/vida`).then((r) => r.json()).then((d) => { if (alive) setVida(d); }).catch(() => {});
    return () => { alive = false; };
  }, [dev.colonia_id, dev.colonia]);

  const am = (vida && vida.amenidades) || {};
  const beds = dev.bedrooms_range || [];
  const m2 = dev.m2_range || [];
  const price = dev.price_from || 0;
  const recTxt = beds.length ? (beds[0] === beds[1] ? `${beds[0]}` : `${beds[0]}–${beds[1]}`) : '—';
  const m2Txt = m2.length ? (m2[0] === m2[1] ? `${m2[0]}` : `${m2[0]}–${m2[1]}`) : '—';
  const pm2 = dev.price_m2_dev || (price && m2[0] ? Math.round(price / m2[0]) : null);
  // Crédito hipotecario (20% enganche, 20 años, ~11.45%)
  const _i = 0.1145 / 12;
  const pf = _i / (1 - (1 + _i) ** (-240));
  const eng = Math.round(price * 0.20);
  const mens = price ? Math.round((price - eng) * pf) : 0;

  const PANELS = {
    invertir: {
      titulo: 'Como inversión',
      facts: [
        pm2 ? { n: money(pm2), l: 'precio/m² · en rango de obra nueva' } : null,
        { n: `${recTxt} rec`, l: `${m2Txt} m² — unidad rentable` },
        { n: 'Preventa', l: 'entras antes de la plusvalía de entrega' },
      ].filter(Boolean),
      verdict: 'Pon tus números: ROI, TIR, renta y comparación vs CETES con el precio real de esta unidad.',
      cta: 'Ver ROI y TIR completos →', goto: 'tu-dinero',
    },
    vivir: {
      titulo: 'Para vivir aquí',
      facts: [
        am.restaurante ? { n: am.restaurante, l: 'restaurantes a un paso' } : null,
        am.cafe ? { n: am.cafe, l: 'cafés cerca' } : null,
        { n: `${m2Txt} m²`, l: `${recTxt} recámaras de espacio` },
      ].filter(Boolean),
      verdict: 'La vida diaria alrededor del edificio: lo mejor cerca, con foto y reseñas reales.',
      cta: 'Ver qué hay cerca →', goto: 'lo-mejor-cerca',
    },
    familia: {
      titulo: 'Para tu familia',
      facts: [
        am.escuela ? { n: am.escuela, l: 'escuelas cerca' } : null,
        am.hospital ? { n: am.hospital, l: 'hospitales cerca' } : null,
        am.parque ? { n: am.parque, l: 'parques para los niños' } : null,
      ].filter(Boolean),
      verdict: `Espacio para crecer (${recTxt} recámaras, ${m2Txt} m²) con servicios y áreas verdes alrededor.`,
      cta: 'Ver escuelas y parques →', goto: 'lo-mejor-cerca',
    },
    primera: {
      titulo: 'Tu primera casa',
      facts: [
        eng ? { n: money(eng), l: 'enganche (20%)' } : null,
        mens ? { n: `${money(mens)}/mes`, l: 'mensualidad estimada con crédito' } : null,
        { n: `${recTxt} rec`, l: 'para empezar tu patrimonio' },
      ].filter(Boolean),
      verdict: 'Deja de pagar renta: aquí ves qué enganche necesitas y cuánto pagarías al mes — ajustable a tu caso.',
      cta: 'Calcular mi crédito →', goto: 'tu-dinero',
    },
  };
  const p = PANELS[perfil];

  return (
    <section data-testid="perfil-lente" style={{ marginTop: 24, borderRadius: 24, overflow: 'hidden', border: '1px solid var(--card-border, var(--border))', background: 'var(--surface-card)' }}>
      <div style={{ padding: 'clamp(18px,2.4vw,26px) clamp(18px,2.4vw,26px) 0' }}>
        <div className="eyebrow" style={{ color: 'var(--theme)' }}>Hecho a tu medida</div>
        <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(20px,2.8vw,30px)', letterSpacing: '-0.02em', color: 'var(--cream)', margin: '4px 0 16px' }}>¿Para qué lo quieres?</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {PROFILES.map((pr) => {
            const a = perfil === pr.k;
            return (
              <button key={pr.k} data-testid={`lente-${pr.k}`} onClick={() => pick(pr.k)} style={{
                padding: '11px 18px', borderRadius: 12, cursor: 'pointer',
                border: a ? '1px solid transparent' : '1px solid var(--card-border, var(--border))',
                background: a ? 'var(--grad)' : 'transparent',
                color: a ? '#fff' : 'var(--cream-2)',
                fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 7,
              }}><span style={{ fontSize: 16 }}>{pr.icon}</span>{pr.label}</button>
            );
          })}
        </div>
      </div>

      <div style={{ padding: 'clamp(18px,2.4vw,26px)', marginTop: 16, background: 'linear-gradient(135deg, rgba(99,102,241,0.06), rgba(16,185,129,0.04))' }}>
        <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--cream)', marginBottom: 14 }}>{p.titulo}</div>
        <div style={{ display: 'flex', gap: 'clamp(20px,4vw,44px)', flexWrap: 'wrap', marginBottom: 16 }}>
          {p.facts.map((f, i) => <Fact key={i} n={f.n} l={f.l} />)}
        </div>
        <p style={{ fontFamily: 'DM Sans', fontSize: 13.5, color: 'var(--cream-2)', lineHeight: 1.55, margin: '0 0 16px', maxWidth: 620 }}>{p.verdict}</p>
        <button onClick={() => onGoTo && onGoTo(p.goto)} data-testid="lente-cta" style={{
          padding: '12px 22px', borderRadius: 12, border: 'none', background: 'var(--grad)', color: '#fff',
          fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 14.5, cursor: 'pointer', boxShadow: '0 8px 24px rgba(99,102,241,0.25)',
        }}>{p.cta}</button>
      </div>
    </section>
  );
}
