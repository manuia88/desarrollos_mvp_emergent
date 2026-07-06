/**
 * CubeHistoriaView — la HISTORIA del cubo (el moat temporal, antes invisible).
 *
 * El cron de demanda materializa series diarias/semanales/quincenales/mensuales por colonia Y por
 * desarrollo (dmx_market_snapshots) — este view las hace visibles: cómo evoluciona el interés, los
 * visitantes y las interacciones de CADA entidad, a la granularidad que pidas. Hipergranular por diseño:
 * nivel (colonia/desarrollo) × medida × granularidad × entidad. Honesto: sin serie → lo dice, no inventa.
 * Backend: GET /api/superadmin/demand-intel/timeseries (existía sin UI — censo 2026-07-05).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { History, AlertCircle } from 'lucide-react';
import { getCubeTimeseries } from '../../api/superadminMetricsCube';

const TIERS = [['colonia', 'Colonia'], ['development', 'Desarrollo']];
const MEASURES = [
  ['tension', 'Tensión (personas/unidad)'],
  ['demanda_corte', 'Demanda del corte (personas)'],
  ['disponibles_corte', 'Disponibles del corte'],
  ['demand_interactions', 'Interacciones', 'Todo lo que la gente hizo (vistas, guardados, clics)'],
  ['demand_visitors', 'Visitantes', 'Personas distintas interesadas'],
  ['interest_score', 'Interés', 'Qué tan caliente está (índice ponderado)'],
];
const GRANS = [['day', 'Día'], ['week', 'Semana'], ['quincena', 'Quincena'], ['month', 'Mes']];

const tc = (s) => String(s ?? '—').replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const pill = (on) => ({
  fontFamily: 'DM Sans', fontWeight: 600, fontSize: 11, cursor: 'pointer', padding: '5px 12px', borderRadius: 9999,
  background: on ? 'rgba(var(--theme-rgb),0.16)' : 'rgba(255,255,255,0.03)',
  border: `1px solid ${on ? 'rgba(var(--theme-rgb),0.45)' : 'rgba(255,255,255,0.07)'}`,
  color: on ? 'var(--theme)' : 'rgba(240,235,224,0.65)',
});
const LABEL = { fontFamily: 'DM Mono, monospace', fontSize: 9.5, color: 'rgba(240,235,224,0.7)', textTransform: 'uppercase', letterSpacing: '0.07em', marginRight: 4 };

export default function CubeHistoriaView() {
  const [tier, setTier] = useState('colonia');
  const [measure, setMeasure] = useState('demand_interactions');
  const [gran, setGran] = useState('week');
  const [entity, setEntity] = useState('');
  const [disponibles, setDisponibles] = useState(null);
  const [serie, setSerie] = useState(null);
  const [err, setErr] = useState(null);

  // 1) Entidades con serie disponible para (tier × medida × gran)
  useEffect(() => {
    let alive = true;
    setDisponibles(null); setSerie(null); setErr(null);
    getCubeTimeseries({ tier, measure, gran })
      .then((d) => {
        if (!alive) return;
        const disp = d.disponibles || [];
        setDisponibles(disp);
        setEntity((cur) => (disp.includes(cur) ? cur : (disp[0] || '')));
      })
      .catch((e) => { if (alive) setErr(e?.message || 'No se pudo cargar.'); });
    return () => { alive = false; };
  }, [tier, measure, gran]);

  // 2) La serie de la entidad elegida
  useEffect(() => {
    if (!entity) return undefined;
    let alive = true;
    setSerie(null);
    getCubeTimeseries({ tier, tierId: entity, measure, gran })
      .then((d) => { if (alive) setSerie(d.serie || []); })
      .catch((e) => { if (alive) setErr(e?.message || 'No se pudo cargar la serie.'); });
    return () => { alive = false; };
  }, [tier, measure, gran, entity]);

  const data = useMemo(() => (serie || []).map((s) => ({ period: s.period, value: s.value })), [serie]);
  const measureLabel = (MEASURES.find(([k]) => k === measure) || [])[1] || measure;
  const last = data.length ? data[data.length - 1] : null;
  const prev = data.length > 1 ? data[data.length - 2] : null;
  const delta = last && prev && prev.value ? ((last.value - prev.value) / prev.value) * 100 : null;

  return (
    <div data-testid="cube-historia-view">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
        <History size={15} color="var(--theme)" />
        <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15, color: 'var(--cream)' }}>Cómo evoluciona el mercado</span>
      </div>
      <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.55)', marginBottom: 12 }}>
        La historia real de cada colonia y cada desarrollo — interés, visitantes e interacciones en el tiempo. Se alimenta sola cada noche.
      </div>

      {/* Pickers hipergranulares: nivel × medida × granularidad × entidad */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 8, padding: '9px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
        <span style={LABEL}>Nivel:</span>
        {TIERS.map(([k, l]) => <button key={k} data-testid={`hist-tier-${k}`} onClick={() => setTier(k)} style={pill(tier === k)}>{l}</button>)}
        <span style={{ ...LABEL, marginLeft: 10 }}>Medida:</span>
        {MEASURES.map(([k, l, tip]) => <button key={k} title={tip} data-testid={`hist-measure-${k}`} onClick={() => setMeasure(k)} style={pill(measure === k)}>{l}</button>)}
        <span style={{ ...LABEL, marginLeft: 10 }}>Cada:</span>
        {GRANS.map(([k, l]) => <button key={k} data-testid={`hist-gran-${k}`} onClick={() => setGran(k)} style={pill(gran === k)}>{l}</button>)}
      </div>

      {err && <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#fecaca', fontFamily: 'DM Sans', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}><AlertCircle size={14} /> {err}</div>}

      {!err && disponibles === null && <div style={{ padding: 22, fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.7)' }}>Buscando series…</div>}

      {!err && disponibles !== null && disponibles.length === 0 && (
        <div style={{ padding: 22, borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.7)' }}>
          Aún no hay historia con esta combinación — el cron nocturno la va acumulando (privacidad: solo se guardan grupos de 3+ personas).
        </div>
      )}

      {!err && disponibles !== null && disponibles.length > 0 && (
        <>
          {/* Entidades (el drill: CADA colonia / CADA desarrollo con serie propia) */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 12 }}>
            <span style={LABEL}>{tier === 'colonia' ? 'Colonia:' : 'Desarrollo:'}</span>
            {disponibles.map((d) => (
              <button key={d} data-testid={`hist-ent-${d}`} onClick={() => setEntity(d)} style={pill(entity === d)}>{tc(d)}</button>
            ))}
          </div>

          {entity && serie === null && <div style={{ padding: 18, fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.7)' }}>Cargando serie…</div>}

          {entity && serie !== null && data.length === 0 && (
            <div style={{ padding: 18, fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.7)' }}>Sin puntos todavía para {tc(entity)}.</div>
          )}

          {entity && data.length > 0 && (
            <div className="dmx-card" style={{ padding: '16px 18px 8px', borderRadius: 16, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 15, color: 'var(--cream)' }}>{tc(entity)} · {measureLabel}</span>
                {last && <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 20, color: 'var(--theme)', fontVariantNumeric: 'tabular-nums' }}>{Number(last.value).toLocaleString('es-MX')}</span>}
                {delta != null && (
                  <span style={{ fontFamily: 'DM Sans', fontSize: 11.5, fontWeight: 800, color: delta >= 0 ? '#4ADE80' : '#F87171' }}>
                    {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(0)}% vs {GRANS.find(([k]) => k === gran)?.[1]?.toLowerCase()} anterior
                  </span>
                )}
                <span style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240,235,224,0.45)', marginLeft: 'auto' }}>{data.length} periodos</span>
              </div>
              <div style={{ width: '100%', height: 220 }}>
                <ResponsiveContainer>
                  <AreaChart data={data} margin={{ top: 6, right: 8, left: -14, bottom: 0 }}>
                    <defs>
                      <linearGradient id="histFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--theme, #6D4AFF)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="var(--theme, #6D4AFF)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="period" tick={{ fontFamily: 'DM Mono, monospace', fontSize: 9, fill: 'rgba(240,235,224,0.45)' }} tickLine={false} axisLine={false} minTickGap={22} />
                    <YAxis tick={{ fontFamily: 'DM Mono, monospace', fontSize: 9, fill: 'rgba(240,235,224,0.45)' }} tickLine={false} axisLine={false} width={54} />
                    <Tooltip contentStyle={{ background: 'rgba(10,12,20,0.95)', border: '1px solid rgba(240,235,224,0.15)', borderRadius: 10, fontFamily: 'DM Sans', fontSize: 12, color: '#F0EBE0' }}
                      formatter={(v) => [Number(v).toLocaleString('es-MX'), measureLabel]} />
                    <Area type="monotone" dataKey="value" stroke="var(--theme, #6D4AFF)" strokeWidth={2} fill="url(#histFill)" dot={data.length <= 40} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240,235,224,0.4)', padding: '6px 0 4px' }}>
                Serie materializada cada noche desde la conducta real de compradores (grupos de 3+ personas — privacidad k-anon).
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
