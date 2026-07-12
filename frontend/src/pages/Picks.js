/*
 *  DMX Picks IA — la superficie del MOAT (founder 07-09, investing.com ProPicks).
 *  5 estrategias con sus picks (predicciones datadas) + track record con transparencia radical.
 *  Consume /api/picks y /api/picks/track-record. Imán de leads: picks visibles, "por qué" citado.
 */
import React, { useEffect, useState } from 'react';
import { visitorId } from '../lib/buyerSignal';   // segmentación por persona: tus zonas exploradas
import ToolNav from '../components/ui/ToolNav';

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

const PRESUPUESTOS = [
  ['', 'Todos'], [3000000, 'Hasta $3M'], [5000000, 'Hasta $5M'], [8000000, 'Hasta $8M'], [15000000, 'Hasta $15M'],
];

const money = (n) => (n ? `$${Math.round(n).toLocaleString('es-MX')}` : '—');

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const proximaActualizacion = () => {
  const d = new Date();
  const m = (d.getMonth() + 1) % 12;   // el cron congela el día 1 del mes siguiente
  return `1 de ${MESES[m]}`;
};

export default function Picks({ user, onLogin }) {
  const [data, setData] = useState(null);
  const [track, setTrack] = useState(null);
  const [tab, setTab] = useState('plusvalia');
  const [presupuesto, setPresupuesto] = useState('');
  const [alcaldia, setAlcaldia] = useState('');
  const [alcaldias, setAlcaldias] = useState([]);   // catálogo derivado del 1er load sin filtro
  const [bt, setBt] = useState(null);               // backtest $1M
  const [btMode, setBtMode] = useState('vivo');     // vivo | historico
  const [btUnit, setBtUnit] = useState('%');        // % | $
  const [unidadEst, setUnidadEst] = useState('oportunidad');   // picks a nivel UNIDAD (el átomo)
  const [unidades, setUnidades] = useState([]);
  const [unidadEstrats, setUnidadEstrats] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const p = new URLSearchParams({ estrategia: unidadEst, n: '10' });
    if (presupuesto) p.set('presupuesto', presupuesto);
    if (alcaldia) p.set('alcaldia', alcaldia);
    fetch(`${API}/api/picks/unidades?${p.toString()}`).then((r) => r.json())
      .then((d) => { if (alive) { setUnidades(d.picks || []); if (d.estrategias) setUnidadEstrats(d.estrategias); } })
      .catch(() => {});
    return () => { alive = false; };
  }, [unidadEst, presupuesto, alcaldia]);

  const [paraTi, setParaTi] = useState([]);

  useEffect(() => {
    let alive = true;
    fetch(`${API}/api/picks/backtest?monto=1000000`).then((r) => r.json())
      .then((d) => { if (alive) setBt(d); }).catch(() => {});
    try {
      const vid = visitorId();
      if (vid) fetch(`${API}/api/picks/para-ti?visitor_id=${encodeURIComponent(vid)}`).then((r) => r.json())
        .then((d) => { if (alive && d.personalizado) setParaTi(d.zonas || []); }).catch(() => {});
    } catch (e) { /* noop */ }
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const p = new URLSearchParams();
        if (presupuesto) p.set('presupuesto', presupuesto);
        if (alcaldia) p.set('alcaldia', alcaldia);
        const qs = p.toString();
        const [r1, r2] = await Promise.all([
          fetch(`${API}/api/picks${qs ? `?${qs}` : ''}`).then((r) => r.json()),
          fetch(`${API}/api/picks/track-record`).then((r) => r.json()),
        ]);
        if (!alive) return;
        const es = r1.estrategias || {};
        setData(es);
        setTrack(r2 || {});
        // catálogo de alcaldías: solo del primer load sin filtros (para no perder opciones al filtrar)
        if (!presupuesto && !alcaldia) {
          const set = new Set();
          Object.values(es).forEach((g) => (g.picks || []).forEach((pk) => pk.alcaldia && set.add(pk.alcaldia)));
          if (set.size) setAlcaldias(Array.from(set).sort());
        }
      } catch (e) { /* fail-soft */ }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [presupuesto, alcaldia]);

  const picks = (data && data[tab] && data[tab].picks) || [];
  const ideas = ((data && data.emergentes && data.emergentes.picks) || []).slice(0, 5);

  return (
    <div style={{ background: C.bg, minHeight: '100vh', fontFamily: FONT, color: C.ink }}>
      <ToolNav />
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
          {ideas.length > 0 && (
            <div style={{ marginTop: 20, background: 'rgba(255,255,255,0.12)', borderRadius: 14, padding: '12px 16px' }}>
              <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 14 }}>💡 Ideas: {ideas.length} zonas emergentes antes de que suban</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                {ideas.map((p, i) => (
                  <button key={p.id || i} onClick={() => setTab('emergentes')}
                    style={{ background: 'rgba(255,255,255,0.9)', color: C.accent, border: 'none', borderRadius: 999, padding: '5px 12px', fontFamily: FONT, fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>
                    {p.entity_name}{p.vs_cdmx_precio_pct != null && p.vs_cdmx_precio_pct < 0 ? ` · ${p.vs_cdmx_precio_pct}% vs CDMX` : ''}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 20px 60px' }}>
        {/* Para ti — segmentación por persona: tus zonas exploradas cruzadas con los picks */}
        {paraTi.length > 0 && (
          <div className="dmx-card" style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: 18, marginTop: 22 }}>
            <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 17, color: C.ink }}>Para ti</div>
            <div style={{ fontFamily: FONT, fontSize: 13, color: C.ink2, marginTop: 2 }}>Basado en las zonas que exploraste — cruzadas con lo que la IA recomienda.</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 10, marginTop: 12 }}>
              {paraTi.map((z, i) => (
                <a key={i} href={`/fundamentales/${z.colonia_id}`} className="dmx-card" style={{ display: 'block', textDecoration: 'none', background: '#FBFAFC', border: `1px solid ${C.line}`, borderRadius: 12, padding: 13 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 15, color: C.ink }}>{z.name}</span>
                    {z.es_pick && <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 11, color: '#fff', background: C.accent, borderRadius: 999, padding: '1px 8px' }}>⭐ Pick · {z.pick_estrategia}</span>}
                  </div>
                  <div style={{ fontFamily: FONT, fontSize: 12, color: C.faint, marginTop: 2 }}>La exploraste {z.veces_explorada} {z.veces_explorada === 1 ? 'vez' : 'veces'}</div>
                  <div style={{ display: 'flex', gap: 12, marginTop: 7, fontFamily: FONT, fontSize: 12.5 }}>
                    {z.precio_m2 && <span style={{ color: C.ink2 }}>{money(z.precio_m2)}/m²</span>}
                    {z.plusvalia_yoy != null && <span style={{ color: z.plusvalia_yoy >= 0 ? C.green : C.ink2, fontWeight: 700 }}>{z.plusvalia_yoy > 0 ? '+' : ''}{z.plusvalia_yoy}%/año</span>}
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

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

        {/* Segmentación por presupuesto */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
          <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: C.ink2 }}>Tu presupuesto:</span>
          {PRESUPUESTOS.map(([val, lbl]) => {
            const on = String(presupuesto) === String(val);
            return (
              <button key={lbl} onClick={() => setPresupuesto(val)}
                style={{ padding: '6px 13px', borderRadius: 20, cursor: 'pointer', fontFamily: FONT, fontWeight: 600, fontSize: 13,
                  border: `1.5px solid ${on ? C.accent : C.line}`, background: on ? '#F3F0FF' : '#fff', color: on ? C.accent : C.ink2 }}>{lbl}</button>
            );
          })}
          {presupuesto && <span style={{ fontFamily: FONT, fontSize: 12, color: C.faint }}>· depa ~70 m² que entra en tu monto</span>}
          <span style={{ fontFamily: FONT, fontSize: 12, color: C.faint, marginLeft: alcaldias.length ? 0 : 'auto', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            🔄 Próxima actualización: <b style={{ color: C.ink2 }}>{proximaActualizacion()}</b>
          </span>
          {alcaldias.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
              <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: C.ink2 }}>Alcaldía:</span>
              <select value={alcaldia} onChange={(e) => setAlcaldia(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: 10, border: `1.5px solid ${alcaldia ? C.accent : C.line}`, background: '#fff', color: alcaldia ? C.accent : C.ink2, fontFamily: FONT, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                <option value="">Todas</option>
                {alcaldias.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* Picks de la estrategia activa */}
        {loading ? (
          <div style={{ padding: 40, color: C.faint }}>Cargando picks…</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16, marginTop: 18 }}>
            {picks.length === 0 && (
              <div style={{ color: C.faint, padding: 20 }}>
                {presupuesto
                  ? 'Ningún pick de esta estrategia cabe en ese presupuesto. Sube el monto o prueba otra estrategia.'
                  : 'Aún no hay picks de esta estrategia para tu zona.'}
              </div>
            )}
            {picks.map((p, i) => {
              const lock = !user && i >= 3;   // freemium suave: 3 picks libres, el resto con registro gratis
              return (
              <div key={p.id || i} className="dmx-card" style={{ position: 'relative', overflow: 'hidden', background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: 18 }}>
                <div style={{ filter: lock ? 'blur(6px)' : 'none', pointerEvents: lock ? 'none' : 'auto', userSelect: lock ? 'none' : 'auto' }}>
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
                    {p.vs_cdmx_precio_pct != null && (
                      <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 12.5, color: p.vs_cdmx_precio_pct < 0 ? C.green : p.vs_cdmx_precio_pct > 0 ? C.amber : C.faint, background: '#F6F4FB', borderRadius: 999, padding: '2px 9px' }}>{p.vs_cdmx_precio_pct > 0 ? '+' : ''}{p.vs_cdmx_precio_pct}% vs CDMX</span>
                    )}
                    <span style={{ fontFamily: FONT, fontSize: 12, color: C.faint }}>pick del {String(p.mes || '').replace('-', '/')} · horizonte {p.horizonte_meses}m</span>
                  </div>
                </div>
                {lock && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'rgba(251,250,252,0.55)' }}>
                    <div style={{ fontSize: 22 }}>🔒</div>
                    <button onClick={onLogin} style={{ background: C.accent, color: '#fff', border: 'none', borderRadius: 10, padding: '9px 16px', fontFamily: HEAD, fontWeight: 800, fontSize: 13.5, cursor: 'pointer' }}>Regístrate gratis para ver</button>
                  </div>
                )}
              </div>
              );
            })}
          </div>
        )}

        {/* Mejores DEPARTAMENTOS — picks a nivel unidad (el átomo), no solo colonia */}
        {unidades.length > 0 && (
          <div style={{ marginTop: 34 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 22, color: C.ink }}>Los mejores departamentos ahora</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {unidadEstrats.map((e) => (
                  <button key={e.key} onClick={() => setUnidadEst(e.key)}
                    style={{ padding: '6px 13px', borderRadius: 20, cursor: 'pointer', fontFamily: FONT, fontWeight: 600, fontSize: 13, border: `1.5px solid ${unidadEst === e.key ? C.accent : C.line}`, background: unidadEst === e.key ? '#F3F0FF' : '#fff', color: unidadEst === e.key ? C.accent : C.ink2 }}>{e.label}</button>
                ))}
              </div>
            </div>
            <div style={{ fontFamily: FONT, fontSize: 13, color: C.ink2, marginTop: 4 }}>Unidades reales disponibles — no la colonia, el departamento exacto.</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, marginTop: 14 }}>
              {unidades.map((u, i) => (
                <a key={i} href={`/desarrollo/${u.development_id}`} className="dmx-card" style={{ display: 'block', textDecoration: 'none', background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 15 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 12, color: '#fff', background: C.accent, borderRadius: 7, padding: '2px 8px' }}>#{i + 1}</span>
                    {u.sobre_mercado_pct != null && (
                      <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 12, color: u.sobre_mercado_pct < 0 ? C.green : C.amber, background: u.sobre_mercado_pct < 0 ? '#EAF7F0' : '#FCF3E6', borderRadius: 999, padding: '2px 9px' }}>{u.sobre_mercado_pct > 0 ? '+' : ''}{u.sobre_mercado_pct}% vs zona</span>
                    )}
                  </div>
                  <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 16, color: C.ink, marginTop: 8 }}>{u.dev_name}{u.unit_number ? ` · ${u.unit_number}` : ''}</div>
                  <div style={{ fontFamily: FONT, fontSize: 12.5, color: C.faint }}>{[u.colonia, u.alcaldia].filter(Boolean).join(' · ')}</div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', marginTop: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 17, color: C.ink }}>{money(u.precio)}</span>
                    <span style={{ fontFamily: FONT, fontSize: 12.5, color: C.ink2 }}>{money(u.precio_m2)}/m²</span>
                    <span style={{ fontFamily: FONT, fontSize: 12.5, color: C.faint }}>{[u.recamaras ? `${u.recamaras} rec` : null, u.m2 ? `${Math.round(u.m2)} m²` : null].filter(Boolean).join(' · ')}</span>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Simulado en $1M — traduce el track record a dinero (toggle vivo/histórico + $/%) */}
        {bt && (() => {
          const d = btMode === 'vivo' ? bt.vivo : bt.historico;
          return (
            <div className="dmx-card" style={{ background: 'linear-gradient(120deg,#F7F4FF,#FBF0FA)', border: `1px solid ${C.line}`, borderRadius: 18, padding: 24, marginTop: 34 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 20, color: C.ink }}>Si invirtieras $1,000,000</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ display: 'flex', border: `1.5px solid ${C.line}`, borderRadius: 10, overflow: 'hidden' }}>
                    {['vivo', 'historico'].map((m) => (
                      <button key={m} onClick={() => setBtMode(m)} style={{ padding: '6px 12px', border: 'none', cursor: 'pointer', fontFamily: FONT, fontWeight: 700, fontSize: 12.5, background: btMode === m ? C.accent : '#fff', color: btMode === m ? '#fff' : C.ink2 }}>{m === 'vivo' ? 'En vivo' : 'Histórico'}</button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', border: `1.5px solid ${C.line}`, borderRadius: 10, overflow: 'hidden' }}>
                    {['%', '$'].map((u) => (
                      <button key={u} onClick={() => setBtUnit(u)} style={{ padding: '6px 12px', border: 'none', cursor: 'pointer', fontFamily: FONT, fontWeight: 700, fontSize: 12.5, background: btUnit === u ? C.accent : '#fff', color: btUnit === u ? '#fff' : C.ink2 }}>{u}</button>
                    ))}
                  </div>
                </div>
              </div>
              {d ? (
                <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'baseline', marginTop: 14 }}>
                  <div>
                    <span style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 38, color: d.ganancia_pct >= 0 ? C.green : '#B03A3A' }}>
                      {btUnit === '%' ? `${d.ganancia_pct > 0 ? '+' : ''}${d.ganancia_pct}%` : money(d.valor_actual)}
                    </span>
                    <div style={{ fontSize: 12.5, color: C.ink2 }}>
                      {btUnit === '%' ? `hoy valdría ${money(d.valor_actual)}` : `${d.ganancia_abs >= 0 ? '+' : ''}${money(d.ganancia_abs)} de ganancia`}
                    </div>
                  </div>
                  <div style={{ fontFamily: FONT, fontSize: 12.5, color: C.faint, maxWidth: 320, lineHeight: 1.45 }}>
                    {btMode === 'vivo'
                      ? `Repartido en ${d.n} picks vigentes, valorados a precio de mercado de hoy${d.desde ? ` (desde ${d.desde})` : ''}. Se mueve con el mercado.`
                      : `Basado en ${d.n} picks que ya cumplieron su horizonte — rendimiento real, aciertos y fallos.`}
                  </div>
                </div>
              ) : (
                <div style={{ fontFamily: FONT, fontSize: 13.5, color: C.ink2, marginTop: 14, lineHeight: 1.5 }}>
                  {btMode === 'historico'
                    ? 'El simulado histórico se activa cuando los primeros picks cumplan su horizonte (12 meses). Congelamos hoy para poder probarlo mañana.'
                    : 'Aún sin picks vigentes con precio de referencia.'}
                </div>
              )}
              <div style={{ fontFamily: FONT, fontSize: 11, color: C.faint, marginTop: 12 }}>Simulación educativa, no asesoría de inversión. Rendimientos pasados no garantizan futuros.</div>
            </div>
          );
        })()}

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
