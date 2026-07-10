/*
 *  DMX Picks IA — la superficie del MOAT (founder 07-09, investing.com ProPicks).
 *  5 estrategias con sus picks (predicciones datadas) + track record con transparencia radical.
 *  Consume /api/picks y /api/picks/track-record. Imán de leads: picks visibles, "por qué" citado.
 */
import React, { useEffect, useState } from 'react';

const API = process.env.REACT_APP_BACKEND_URL || '';

const C = {
  bg: '#FBFAFC', ink: '#15121C', ink2: '#5B5568', faint: '#9A93A6',
  line: '#EFEBF4', card: '#FFFFFF', accent: '#6D4AFF', green: '#1E9E63', amber: '#D98A00',
};
const GRAD = 'linear-gradient(120deg, #6D4AFF, #C63FAE)';
const FONT = "'DM Sans', system-ui, -apple-system, sans-serif";
const HEAD = "'Outfit', system-ui, -apple-system, sans-serif";

const ESTRAT = {
  plusvalia: { emoji: '📈', label: 'Mejor plusvalía', sub: 'Las que más aprecian' },
  renta: { emoji: '💸', label: 'Mejor renta', sub: 'Mayor flujo por peso invertido' },
  preventa: { emoji: '🏗️', label: 'Mejor preventa', sub: 'El salto lanzamiento → entrega' },
  refugio: { emoji: '🛡️', label: 'Refugio seguro', sub: 'Capital protegido, riesgo bajo' },
  emergentes: { emoji: '🌱', label: 'Zona emergente', sub: 'Entra antes de que suba' },
};
const ORDEN = ['plusvalia', 'renta', 'preventa', 'refugio', 'emergentes'];

const money = (n) => (n ? `$${Math.round(n).toLocaleString('es-MX')}` : '—');

export default function Picks({ user, onLogin }) {
  const [data, setData] = useState(null);
  const [track, setTrack] = useState(null);
  const [tab, setTab] = useState('plusvalia');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [r1, r2] = await Promise.all([
          fetch(`${API}/api/picks`).then((r) => r.json()),
          fetch(`${API}/api/picks/track-record`).then((r) => r.json()),
        ]);
        if (!alive) return;
        setData(r1.estrategias || {});
        setTrack(r2 || {});
      } catch (e) { /* fail-soft */ }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const picks = (data && data[tab] && data[tab].picks) || [];

  return (
    <div style={{ background: C.bg, minHeight: '100vh', fontFamily: FONT, color: C.ink }}>
      {/* Hero */}
      <div style={{ background: GRAD, color: '#fff', padding: '52px 20px 40px' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <div style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, opacity: 0.85, letterSpacing: '0.04em', textTransform: 'uppercase' }}>DMX Picks IA</div>
          <h1 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 40, lineHeight: 1.05, margin: '8px 0 10px', letterSpacing: '-0.02em', maxWidth: 780 }}>
            Las zonas y desarrollos que la IA elige — con su tesis y su historial
          </h1>
          <p style={{ fontFamily: FONT, fontSize: 17, opacity: 0.92, maxWidth: 640, lineHeight: 1.5 }}>
            Cada pick es una predicción con fecha. Con el tiempo probamos cuáles acertaron — incluidas las que fallaron.
            Sin humo: los números salen de nuestros índices, no de opiniones.
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 20px 60px' }}>
        {/* Tabs de estrategia */}
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '22px 0 8px', marginTop: -1 }}>
          {ORDEN.map((k) => {
            const e = ESTRAT[k]; const on = tab === k;
            return (
              <button key={k} onClick={() => setTab(k)} className="dmx-card"
                style={{
                  flex: 'none', textAlign: 'left', padding: '12px 16px', borderRadius: 14, cursor: 'pointer',
                  border: `1.5px solid ${on ? C.accent : C.line}`, background: on ? '#F3F0FF' : C.card, minWidth: 172,
                }}>
                <div style={{ fontSize: 20 }}>{e.emoji}</div>
                <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 15, color: on ? C.accent : C.ink, marginTop: 4 }}>{e.label}</div>
                <div style={{ fontFamily: FONT, fontSize: 12, color: C.ink2 }}>{e.sub}</div>
              </button>
            );
          })}
        </div>

        {/* Picks de la estrategia activa */}
        {loading ? (
          <div style={{ padding: 40, color: C.faint }}>Cargando picks…</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16, marginTop: 18 }}>
            {picks.length === 0 && (
              <div style={{ color: C.faint, padding: 20 }}>Aún no hay picks de esta estrategia para tu zona.</div>
            )}
            {picks.map((p, i) => (
              <div key={p.id || i} className="dmx-card" style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 13, color: '#fff', background: C.accent, borderRadius: 8, padding: '3px 9px' }}>#{i + 1}</span>
                  <span style={{ fontFamily: FONT, fontSize: 12, color: C.faint }}>{ESTRAT[tab].emoji} {ESTRAT[tab].label}</span>
                </div>
                <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 20, color: C.ink, marginTop: 8, letterSpacing: '-0.01em' }}>{p.entity_name}</div>
                {p.alcaldia && <div style={{ fontFamily: FONT, fontSize: 13, color: C.ink2 }}>{p.alcaldia}</div>}
                <div style={{ fontFamily: FONT, fontSize: 14, color: C.ink2, marginTop: 10, lineHeight: 1.5 }}>{p.tesis}</div>
                <div style={{ display: 'flex', gap: 16, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  {p.precio_ref_m2 ? (
                    <span style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 15, color: C.ink }}>{money(p.precio_ref_m2)}<span style={{ fontSize: 12, color: C.faint }}>/m²</span></span>
                  ) : p.precio_ref_desde ? (
                    <span style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 15, color: C.ink }}>Desde {money(p.precio_ref_desde)}</span>
                  ) : null}
                  <span style={{ fontFamily: FONT, fontSize: 12, color: C.faint }}>pick del {String(p.mes || '').replace('-', '/')} · horizonte {p.horizonte_meses}m</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Track record — transparencia radical */}
        <div className="dmx-card" style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 18, padding: 24, marginTop: 34 }}>
          <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 22, color: C.ink }}>Ganadoras anteriores</div>
          <div style={{ fontFamily: FONT, fontSize: 14, color: C.ink2, marginTop: 4 }}>
            La prueba, con transparencia radical — mostramos también las que fallaron.
          </div>
          {track && track.cerrados > 0 ? (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'baseline' }}>
                <div><span style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 34, color: C.green }}>{track.tasa_acierto_pct}%</span><div style={{ fontSize: 12, color: C.faint }}>tasa de acierto ({track.cerrados} cerrados)</div></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 18 }}>
                <div>
                  <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 13, color: C.green, marginBottom: 6 }}>Mejores</div>
                  {(track.mejores || []).map((m, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontFamily: FONT, fontSize: 13, padding: '4px 0', borderBottom: `1px solid ${C.line}` }}>
                      <span>{m.entidad}</span><span style={{ fontWeight: 700, color: C.green }}>{m.delta_pct > 0 ? '+' : ''}{m.delta_pct}%</span>
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 13, color: C.amber, marginBottom: 6 }}>Las que fallaron</div>
                  {(track.peores || []).map((m, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontFamily: FONT, fontSize: 13, padding: '4px 0', borderBottom: `1px solid ${C.line}` }}>
                      <span>{m.entidad}</span><span style={{ fontWeight: 700, color: m.delta_pct < 0 ? C.amber : C.ink2 }}>{m.delta_pct > 0 ? '+' : ''}{m.delta_pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 14, padding: '16px 18px', background: '#F7F5FC', borderRadius: 12, fontFamily: FONT, fontSize: 14, color: C.ink2 }}>
              📅 El historial se construye con el tiempo. Congelamos <b>{(track && track.vigentes) || 0} predicciones</b> hoy —
              en cuanto cumplan su horizonte, aquí verás cuáles acertaron. Esto es lo que nadie puede copiar.
            </div>
          )}
        </div>

        {/* CTA lead */}
        {!user && (
          <div style={{ background: GRAD, color: '#fff', borderRadius: 18, padding: '26px 24px', marginTop: 24, textAlign: 'center' }}>
            <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 22 }}>¿Quieres el pick a tu medida?</div>
            <div style={{ fontFamily: FONT, fontSize: 15, opacity: 0.92, marginTop: 6 }}>Regístrate y recibe los picks filtrados por tu presupuesto y objetivo.</div>
            <button onClick={onLogin} style={{ marginTop: 14, background: '#fff', color: C.accent, border: 'none', borderRadius: 10, padding: '11px 22px', fontFamily: HEAD, fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>Crear cuenta gratis</button>
          </div>
        )}

        <div style={{ fontFamily: FONT, fontSize: 12, color: C.faint, marginTop: 20, textAlign: 'center' }}>
          DMX Picks IA es análisis basado en datos, no asesoría de inversión. Los rendimientos pasados no garantizan resultados futuros.
        </div>
      </div>
    </div>
  );
}
