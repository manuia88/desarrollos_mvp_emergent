// Corona "Veredicto del Desarrollo" — sube al TOPE de la ficha el veredicto que ya razona BuySignal
// (precio en contexto obra-nueva-vs-obra-nueva + plusvalía oficial + valor de zona + catastral + timing),
// en un hero glanceable + CTA que CIERRA CICLO (asesor / Atlax). No duplica BuySignal: lo resume y eleva.
// Consume /api/public/buy-signal (mismo dato, un solo fetch). El detalle completo sigue abajo en BuySignal.
import React, { useEffect, useState } from 'react';
import { fetchBuySignal } from '../../api/marketplace';
import { tc } from '../../lib/titleCase';

const COL = { verde: '#34d399', ambar: '#fcd34d', rojo: '#fca5a5', theme: '#c4b5fd' };
const GLOW = { verde: 'rgba(52,211,153,0.18)', ambar: 'rgba(252,211,77,0.16)', rojo: 'rgba(252,165,165,0.14)', theme: 'rgba(196,181,253,0.16)' };
const mmx = (n) => n == null ? '—' : (Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(Math.abs(n) >= 1e7 ? 1 : 2)}M` : `$${Math.round(n / 1000)}k`);
const pm = (n) => n == null ? '—' : `$${Math.round(n / 1000)}k`;

function Stat({ label, value, sub, color }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '.07em', fontWeight: 700, marginBottom: 5 }}>{label}</div>
      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(24px,2.6vw,32px)', color: color || 'var(--cream)', lineHeight: 1, letterSpacing: '-0.02em' }}>{value}</div>
      {sub && <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export default function VeredictoDesarrollo({ devId, onContact, onAskAtlax }) {
  const [d, setD] = useState(null);
  useEffect(() => { if (devId) fetchBuySignal(devId).then(setD).catch(() => setD(false)); }, [devId]);

  if (d === null) {
    return <div style={{ marginTop: 14, padding: '20px 22px', borderRadius: 18, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)', color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13 }}>Analizando si es buena compra…</div>;
  }
  if (!d || !d.ok) return null;
  const { precio_contexto: pc, valuacion_zona: vz, timing: tm, veredicto: v } = d;
  if (!v && !pc) return null;
  const color = (v && v.color) || (pc && pc.posicion && pc.posicion.color) || 'verde';
  const titulo = (v && v.titulo) || (pc && pc.posicion && pc.posicion.etiqueta) || 'Veredicto';
  const lectura = (v && v.lectura) || (pc && pc.posicion && pc.posicion.lectura) || '';
  const plus = vz && vz.plusvalia_oficial && vz.plusvalia_oficial.plusvalia_anual_pct;

  return (
    <section data-testid="veredicto-corona" style={{
      marginTop: 16, marginBottom: 4, padding: '24px 26px', borderRadius: 20,
      background: `radial-gradient(120% 140% at 0% 0%, ${GLOW[color] || GLOW.verde}, rgba(255,255,255,0.015) 55%)`,
      border: `1px solid ${COL[color] || COL.verde}33`,
      boxShadow: `0 1px 40px ${GLOW[color] || GLOW.verde}`,
    }}>
      <div className="eyebrow" style={{ margin: 0, letterSpacing: '0.16em', color: 'var(--cream-3)' }}>{tc('El veredicto · inteligencia DMX')}</div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginTop: 8, flexWrap: 'wrap' }}>
        <span style={{ width: 16, height: 16, borderRadius: 999, background: COL[color] || COL.verde, marginTop: 8, flexShrink: 0, boxShadow: `0 0 16px ${COL[color] || COL.verde}` }} />
        <div style={{ flex: 1, minWidth: 240 }}>
          <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(22px,3vw,32px)', letterSpacing: '-0.025em', color: COL[color] || COL.verde, margin: 0, lineHeight: 1.05 }}>{titulo}</h2>
          {lectura && <p style={{ fontFamily: 'DM Sans', fontSize: 13.5, color: 'var(--cream-2)', margin: '6px 0 0', maxWidth: 640, lineHeight: 1.5 }}>{lectura}</p>}
        </div>
      </div>

      {/* Tira de stats que sostienen el veredicto (fusión de motores) */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 20,
        marginTop: 20, paddingTop: 18, borderTop: '1px solid var(--border)',
      }}>
        {pc && pc.este_pm2 != null && (
          <Stat label="Precio / m²" value={`${pm(pc.este_pm2)}/m²`}
            sub={pc.posicion ? pc.posicion.etiqueta : (pc.m2 ? `${pc.m2} m²` : null)}
            color={pc.posicion ? (COL[pc.posicion.color] || 'var(--cream)') : 'var(--cream)'} />
        )}
        {vz && vz.pm2 != null && (
          <Stat label="Valor de zona" value={`${mmx(vz.pm2)}/m²`} sub={vz.confianza ? `confianza ${vz.confianza}` : null} />
        )}
        {plus != null && (
          <Stat label="Plusvalía oficial" value={`+${plus}%`} sub="anual · SHF" color={COL.verde} />
        )}
        {vz && vz.valor_catastral_suelo != null && vz.valor_catastral_suelo >= 2000 && (
          <Stat label="Piso catastral" value={`${mmx(vz.valor_catastral_suelo)}/m²`} sub="oficial SIG CDMX" />
        )}
        {tm && tm.fase_label && (
          <Stat label="Momento de zona" value={tm.fase_label} sub={tm.zona} color={COL[tm.color] || 'var(--cream)'} />
        )}
      </div>

      {/* CTA que CIERRA CICLO: pregúntale a Atlax (agéntico) + habla con asesor (lead → Cerebro) */}
      <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
        {onAskAtlax && (
          <button onClick={onAskAtlax} data-testid="veredicto-atlax" style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 18px', borderRadius: 12,
            border: '1px solid rgba(139,92,246,0.4)', background: 'rgba(139,92,246,0.12)',
            color: 'var(--cream)', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13.5, cursor: 'pointer',
          }}>✨ ¿Me conviene? Pregúntale a Atlax</button>
        )}
        {onContact && (
          <button onClick={onContact} data-testid="veredicto-contacto" style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 18px', borderRadius: 12,
            border: 'none', background: `linear-gradient(135deg, ${COL[color] || COL.verde}, #8b5cf6)`,
            color: '#0b0b12', fontFamily: 'DM Sans', fontWeight: 800, fontSize: 13.5, cursor: 'pointer',
          }}>Agendar visita →</button>
        )}
      </div>
      <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)', marginTop: 11, lineHeight: 1.4 }}>
        Veredicto basado en obra nueva comparable, plusvalía oficial, valor de zona y catastro — análisis completo abajo.
      </div>
    </section>
  );
}
