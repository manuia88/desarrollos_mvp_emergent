// ¿Es Buena Compra? (comprador · A12 Precio Justo + A07 Buen Momento) — primer surface
// del arsenal de valuación de cara al comprador. Reusa AVM + ciclo + índices vía /api/public/buy-signal.
import React, { useEffect, useState } from 'react';
import { fetchBuySignal } from '../../api/marketplace';

const COL = { verde: '#86efac', ambar: '#fcd34d', rojo: '#fca5a5' };
const BG = { verde: 'rgba(34,197,94,0.12)', ambar: 'rgba(245,158,11,0.12)', rojo: 'rgba(239,68,68,0.12)' };
const BD = { verde: 'rgba(34,197,94,0.32)', ambar: 'rgba(245,158,11,0.32)', rojo: 'rgba(239,68,68,0.32)' };
const mmx = (n) => n == null ? '—' : (n >= 1e6 ? `$${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2)}M` : `$${Math.round(n / 1000)}k`);

const panel = { background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 16, padding: 18 };

function Bar({ value, color }) {
  return (
    <div style={{ height: 7, borderRadius: 999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
      <div style={{ width: `${Math.max(3, Math.min(100, value))}%`, height: '100%', background: color, borderRadius: 999 }} />
    </div>
  );
}

export default function BuySignal({ devId }) {
  const [d, setD] = useState(null);
  useEffect(() => { if (devId) fetchBuySignal(devId).then(setD).catch(() => setD(false)); }, [devId]);

  if (d === null) return <div style={{ ...panel, color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13 }}>Evaluando la compra…</div>;
  if (!d || !d.ok) return null;
  const { precio_justo: pj, timing: tm, veredicto: v } = d;
  if (!pj && !tm) return null;

  return (
    <section data-testid="buy-signal" style={{
      marginTop: 28, padding: '22px 24px',
      background: 'linear-gradient(180deg, rgba(99,102,241,0.06), rgba(236,72,153,0.03))',
      border: '1px solid var(--border)', borderRadius: 16,
    }}>
      <div className="eyebrow" style={{ margin: 0, letterSpacing: '0.14em' }}>Decisión de compra</div>
      <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(20px,2.6vw,28px)', letterSpacing: '-0.02em', color: 'var(--cream)', margin: '4px 0 4px' }}>
        ¿Es buena compra?
      </h2>
      <p style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-3)', margin: '0 0 16px', maxWidth: 620, lineHeight: 1.5 }}>
        Cruzamos lo que cuesta contra lo que vale en el mercado, y el momento de la zona. <strong style={{ color: 'var(--cream)' }}>DMX no opina, mide.</strong>
      </p>

      {/* Veredicto */}
      {v && (
        <div data-testid="bs-veredicto" style={{ ...panel, background: BG[v.color], border: `1px solid ${BD[v.color]}`, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 12, height: 12, borderRadius: 999, background: COL[v.color], flexShrink: 0 }} />
            <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: COL[v.color] }}>{v.titulo}</span>
          </div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 13.5, color: 'var(--cream-2)', marginTop: 7, lineHeight: 1.5 }}>{v.lectura}</div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 14 }}>
        {/* Precio Justo */}
        {pj && (
          <div data-testid="bs-precio" style={panel}>
            <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700 }}>Precio justo</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: 'var(--cream)' }}>{mmx(pj.precio_lista)}</span>
              <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>precio · valor est. {mmx(pj.valor_estimado)}</span>
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 9, padding: '4px 11px', borderRadius: 9999, background: BG[pj.color], border: `1px solid ${BD[pj.color]}` }}>
              <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 13, color: COL[pj.color] }}>{pj.vs_pct > 0 ? '+' : ''}{pj.vs_pct}%</span>
              <span style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: COL[pj.color] }}>{pj.etiqueta}</span>
            </div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)', marginTop: 9, lineHeight: 1.45 }}>{pj.lectura}</div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)', marginTop: 8 }}>
              Rango {mmx(pj.range_low)}–{mmx(pj.range_high)} · {pj.m2}m² · {pj.recamaras} rec · confianza {pj.confianza}{pj.modelo === 'heuristic' ? ' (estimada)' : ''}
            </div>
          </div>
        )}

        {/* Buen Momento */}
        {tm && (
          <div data-testid="bs-momento" style={panel}>
            <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700 }}>Buen momento</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 8 }}>
              <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: COL[tm.color] }}>{tm.fase_label}</span>
              <span style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)' }}>en {tm.zona}</span>
            </div>
            <div style={{ marginTop: 10 }}><Bar value={tm.score} color={COL[tm.color]} /></div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)', marginTop: 9, lineHeight: 1.45 }}>{tm.lectura}</div>
            <div style={{ display: 'flex', gap: 14, marginTop: 10, flexWrap: 'wrap', fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>
              <span>Plusvalía <b style={{ color: 'var(--cream)' }}>{tm.plusvalia_idx ?? '—'}</b></span>
              <span>Índice DMX <b style={{ color: 'var(--cream)' }}>{tm.idm}{tm.idm_letra}</b></span>
              <span>Renta ~<b style={{ color: 'var(--cream)' }}>{tm.renta.mejor === 'corta' ? tm.renta.corta_pct : tm.renta.larga_pct}%</b>{tm.renta.fuente === 'estimado' ? ' (est.)' : ''}</span>
            </div>
          </div>
        )}
      </div>
      <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)', marginTop: 12, lineHeight: 1.4 }}>{d.nota}</div>
    </section>
  );
}
