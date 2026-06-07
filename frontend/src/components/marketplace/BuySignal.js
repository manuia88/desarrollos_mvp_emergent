// ¿Es Buena Compra? (comprador) — Precio en Contexto (obra nueva vs obra nueva, NUNCA contra
// reventa) + Buen Momento (ciclo). Reformula la prima de estrenar como VALOR, no sobreprecio.
// Comunicación cuidada: jamás dice "caro". Consume /api/public/buy-signal.
import React, { useEffect, useState } from 'react';
import { fetchBuySignal } from '../../api/marketplace';

const COL = { verde: '#86efac', ambar: '#fcd34d', rojo: '#fca5a5', theme: '#c4b5fd' };
const BG = { verde: 'rgba(34,197,94,0.12)', ambar: 'rgba(245,158,11,0.12)', rojo: 'rgba(239,68,68,0.12)', theme: 'rgba(139,92,246,0.14)' };
const BD = { verde: 'rgba(34,197,94,0.32)', ambar: 'rgba(245,158,11,0.32)', rojo: 'rgba(239,68,68,0.32)', theme: 'rgba(139,92,246,0.36)' };
const pm = (n) => n == null ? '—' : `$${Math.round(n / 1000)}k/m²`;
const mmx = (n) => n == null ? '—' : (Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(Math.abs(n) >= 1e7 ? 1 : 2)}M` : `$${Math.round(n / 1000)}k`);
const panel = { background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 16, padding: 18 };

// Escala visual: reventa → obra nueva → este precio
function PriceScale({ refs, este }) {
  const vals = [...refs.map(r => r.pm2), este].filter(Boolean);
  const min = Math.min(...vals) * 0.96, max = Math.max(...vals) * 1.04;
  const pos = (v) => `${((v - min) / (max - min || 1)) * 100}%`;
  const refColor = { nuevo: '#a5b4fc', reventa: 'var(--cream-3)', promedio: 'var(--cream-2)' };
  return (
    <div style={{ position: 'relative', height: 46, margin: '14px 0 8px' }}>
      <div style={{ position: 'absolute', top: 26, left: 0, right: 0, height: 4, borderRadius: 999, background: 'rgba(255,255,255,0.08)' }} />
      {refs.map((r, i) => (
        <div key={i} style={{ position: 'absolute', top: 20, left: pos(r.pm2), transform: 'translateX(-50%)' }}>
          <div style={{ width: 8, height: 8, borderRadius: 999, background: refColor[r.clave] || 'var(--cream-3)', margin: '0 auto' }} title={`${r.label}: ${pm(r.pm2)}`} />
          <div style={{ fontFamily: 'DM Sans', fontSize: 8.5, color: 'var(--cream-3)', whiteSpace: 'nowrap', marginTop: 3, textAlign: 'center' }}>{r.label.split(' ')[0]}</div>
        </div>
      ))}
      {/* marcador "este precio" */}
      <div style={{ position: 'absolute', top: 0, left: pos(este), transform: 'translateX(-50%)' }}>
        <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 11, color: 'var(--cream)', whiteSpace: 'nowrap', textAlign: 'center' }}>{pm(este)}</div>
        <div style={{ width: 2, height: 18, background: 'var(--cream)', margin: '2px auto 0' }} />
      </div>
    </div>
  );
}

export default function BuySignal({ devId }) {
  const [d, setD] = useState(null);
  useEffect(() => { if (devId) fetchBuySignal(devId).then(setD).catch(() => setD(false)); }, [devId]);

  if (d === null) return <div style={{ ...panel, color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13 }}>Poniendo el precio en contexto…</div>;
  if (!d || !d.ok) return null;
  const { precio_contexto: pc, timing: tm, veredicto: v } = d;
  if (!pc && !tm) return null;
  const pos = pc && pc.posicion;
  const prima = pc && pc.prima_estrenar;

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
      <p style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-3)', margin: '0 0 16px', maxWidth: 640, lineHeight: 1.5 }}>
        Ubicamos el precio entre <strong style={{ color: 'var(--cream)' }}>otros desarrollos nuevos comparables</strong> de la zona (no contra reventa, que siempre es más barata), y el momento de la zona.
      </p>

      {v && (
        <div data-testid="bs-veredicto" style={{ ...panel, background: BG[v.color] || BG.verde, border: `1px solid ${BD[v.color] || BD.verde}`, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 12, height: 12, borderRadius: 999, background: COL[v.color] || COL.verde, flexShrink: 0 }} />
            <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: COL[v.color] || COL.verde }}>{v.titulo}</span>
          </div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 13.5, color: 'var(--cream-2)', marginTop: 7, lineHeight: 1.5 }}>{v.lectura}</div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(290px,1fr))', gap: 14 }}>
        {/* Precio en contexto */}
        {pc && pos && (
          <div data-testid="bs-precio" style={panel}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700 }}>Precio en contexto</span>
              <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>{mmx(pc.precio_lista)} · {pc.m2}m²</span>
            </div>

            <PriceScale refs={pc.referencias || []} este={pc.este_pm2} />

            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 4, padding: '4px 11px', borderRadius: 9999, background: BG[pos.color] || BG.verde, border: `1px solid ${BD[pos.color] || BD.verde}` }}>
              <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 12.5, color: COL[pos.color] || COL.verde }}>{pos.etiqueta}</span>
            </div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)', marginTop: 8, lineHeight: 1.45 }}>{pos.lectura}</div>
            {pos.nota && <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--warm, #E2982E)', marginTop: 4 }}>{pos.nota}</div>}

            {/* Prima de estrenar = valor, no sobreprecio */}
            {prima && (
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)', lineHeight: 1.45 }}>{prima.lectura}</div>
                <ul style={{ margin: '7px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {prima.valor.map((x, i) => (
                    <li key={i} style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-2)', display: 'flex', gap: 6 }}>
                      <span style={{ color: COL.verde }}>✓</span>{x}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Buen Momento */}
        {tm && (
          <div data-testid="bs-momento" style={panel}>
            <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700 }}>Buen momento</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 8 }}>
              <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: COL[tm.color] || COL.verde }}>{tm.fase_label}</span>
              <span style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)' }}>en {tm.zona}</span>
            </div>
            <div style={{ marginTop: 10, height: 7, borderRadius: 999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
              <div style={{ width: `${Math.max(3, Math.min(100, tm.score))}%`, height: '100%', background: COL[tm.color] || COL.verde, borderRadius: 999 }} />
            </div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)', marginTop: 9, lineHeight: 1.45 }}>{tm.lectura}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 11 }}>
              {(tm.senales || []).map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 999, background: COL[s.color] || COL.verde, flexShrink: 0 }} />
                  <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>{s.label}:</span>
                  <span style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream)', fontWeight: 600 }}>{s.plain}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Lo que respalda el precio */}
      {pc && (pc.respaldo || []).length > 0 && (
        <div data-testid="bs-respaldo" style={{ marginTop: 14, ...panel }}>
          <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700, marginBottom: 8 }}>Lo que respalda el precio</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {pc.respaldo.map((r, i) => (
              <span key={i} style={{ padding: '5px 11px', borderRadius: 9999, background: 'rgba(139,92,246,0.10)', border: '1px solid rgba(139,92,246,0.26)', fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-2)' }}>{r.texto}</span>
            ))}
          </div>
        </div>
      )}
      <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-3)', marginTop: 12, lineHeight: 1.4 }}>{d.nota}</div>
    </section>
  );
}
