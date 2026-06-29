// Superadmin · COMPARATIVAS (¿por qué?) — la capa del PORQUÉ.
// Parte los desarrollos por un atributo (split) y compara una métrica de resultado (outcome) entre grupos
// para ver qué mueve qué ("con amenidades vende más", "sin terraza menos demanda").
//   A) "El porqué automático": hallazgos de /compare/insights ordenados por impacto.
//   B) "Comparar tú mismo": arma split × outcome (+geo opcional) y corre /compare/run.
import React, { useEffect, useMemo, useState } from 'react';
import { Card, Badge } from '../advisor/primitives';
import { getCompareCatalog, getCompareRun, getCompareInsights } from '../../api/superadminDemandIntel';

const card = { padding: '14px 18px' };
const lbl = { fontSize: 11, color: '#888', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 };
const selStyle = {
  background: 'rgba(255,255,255,0.04)', color: '#ddd', fontSize: 12.5,
  border: '1px solid rgba(255,255,255,0.14)', borderRadius: 8, padding: '6px 9px', minWidth: 150,
};
const inputStyle = { ...selStyle };
const btnStyle = {
  padding: '7px 16px', borderRadius: 9999, border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer',
  background: 'var(--theme, #6366f1)', color: '#fff', fontSize: 12.5, fontWeight: 600,
};

const GEO_NIVELES = ['colonia', 'alcaldia'];

const fmtN = (v) => (v == null ? '—' : (typeof v === 'number' ? v.toLocaleString('es-MX') : String(v)));
// Valor de outcome con su unidad ("83%", "5.2 meses", "$54k/m²", "120").
const fmtVal = (v, unidad) => {
  if (v == null) return '—';
  const u = unidad || '';
  if (u === '%') return `${typeof v === 'number' ? +(+v).toFixed(1) : v}%`;
  if (u === '$/m²' || u === '$') return `$${Math.round(v).toLocaleString('es-MX')}${u === '$/m²' ? '/m²' : ''}`;
  const num = typeof v === 'number' ? +(+v).toFixed(1) : v;
  return u ? `${num} ${u}` : `${num}`;
};

const confTone = (c) => {
  const v = String(c || '').toLowerCase();
  if (v.includes('alta')) return 'ok';
  if (v.includes('media')) return 'warn';
  return 'neutral';
};

// "menos" → gana el grupo de MENOR valor · "más" → gana el de MAYOR valor · "—" → neutro.
function bestGrupoValor(grupos, mejorEs) {
  const conDato = (grupos || []).filter((g) => g && g.valor != null);
  if (conDato.length === 0 || mejorEs === '—' || !mejorEs) return null;
  if (mejorEs === 'menos') return conDato.reduce((a, b) => (b.valor < a.valor ? b : a)).valor;
  return conDato.reduce((a, b) => (b.valor > a.valor ? b : a)).valor; // "más"
}

export default function CompararPanel() {
  const [catalog, setCatalog] = useState(null);
  const [catErr, setCatErr] = useState(null);

  // feed de hallazgos automáticos
  const [insights, setInsights] = useState(null);
  const [insErr, setInsErr] = useState(null);

  // controles "comparar tú mismo"
  const [split, setSplit] = useState('');
  const [outcome, setOutcome] = useState('');
  const [geoNivel, setGeoNivel] = useState('colonia');
  const [geoValor, setGeoValor] = useState('');

  // resultado run
  const [data, setData] = useState(null);
  const [runErr, setRunErr] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getCompareCatalog()
      .then((d) => {
        setCatalog(d);
        if ((d?.splits || []).length > 0) setSplit(d.splits[0]);
        if ((d?.outcomes || []).length > 0) setOutcome(d.outcomes[0].id);
      })
      .catch((e) => setCatErr(e.message));
    getCompareInsights(15)
      .then(setInsights)
      .catch((e) => setInsErr(e.message));
  }, []);

  const outcomes = catalog?.outcomes || [];
  const outcomeById = useMemo(() => Object.fromEntries(outcomes.map((o) => [o.id, o])), [outcomes]);

  const comparar = () => {
    if (!split || !outcome) return;
    setLoading(true); setRunErr(null);
    getCompareRun({ split, outcome, geo_nivel: geoValor ? geoNivel : undefined, geo_valor: geoValor || undefined })
      .then((d) => setData(d))
      .catch((e) => { setData(null); setRunErr(e.message); })
      .finally(() => setLoading(false));
  };

  if (catErr) return <Card style={{ ...card, color: '#dc2626' }}>{catErr}</Card>;
  if (!catalog) return <Card style={card}>Cargando catálogo de comparativas…</Card>;

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div style={{ fontSize: 12.5, color: '#aaa' }}>
        La capa del <strong style={{ color: '#ddd' }}>porqué</strong>: parte los desarrollos por un atributo y compara métricas de resultado para ver <span style={{ color: 'var(--theme)' }}>qué mueve qué</span>.
      </div>

      {/* ── SECCIÓN A · EL PORQUÉ AUTOMÁTICO ───────────────────────────────── */}
      <InsightsSection insights={insights} insErr={insErr} />

      {/* ── SECCIÓN B · COMPARAR TÚ MISMO ──────────────────────────────────── */}
      <div>
        <div style={{ ...lbl, fontSize: 12, marginBottom: 10 }}>Comparar tú mismo</div>
        <Card style={card}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
            <Field label="Partir por (atributo)">
              <select style={{ ...selStyle, minWidth: 170 }} value={split} onChange={(e) => setSplit(e.target.value)}>
                {(catalog.splits || []).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Métrica de resultado">
              <select style={{ ...selStyle, minWidth: 190 }} value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                {outcomes.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="Nivel geo">
              <select style={selStyle} value={geoNivel} onChange={(e) => setGeoNivel(e.target.value)}>
                {GEO_NIVELES.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </Field>
            <Field label="Valor geo (opcional)">
              <input style={inputStyle} value={geoValor} placeholder="p.ej. polanco"
                onChange={(e) => setGeoValor(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') comparar(); }} />
            </Field>
            <button style={btnStyle} onClick={comparar} disabled={loading || !split || !outcome}>
              {loading ? 'Comparando…' : 'Comparar'}
            </button>
          </div>
          {outcome && outcomeById[outcome]?.mejor_es && outcomeById[outcome].mejor_es !== '—' && (
            <div style={{ fontSize: 11, color: '#777', marginTop: 8 }}>
              Para esta métrica, <strong style={{ color: '#aaa' }}>mejor es {outcomeById[outcome].mejor_es}</strong>.
            </div>
          )}
          {runErr && <div style={{ color: '#dc2626', fontSize: 12.5, marginTop: 12 }}>{runErr}</div>}
        </Card>

        {loading && <Card style={{ ...card, marginTop: 16 }}>Partiendo y comparando…</Card>}
        {data && !runErr && !loading && <RunResult data={data} />}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 10.5, color: '#888' }}>{label}</span>
      {children}
    </div>
  );
}

// ── SECCIÓN A: hallazgos automáticos ─────────────────────────────────────────
function InsightsSection({ insights, insErr }) {
  const hallazgos = insights?.hallazgos || [];
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ ...lbl, fontSize: 12, marginBottom: 0 }}>El porqué automático · qué mueve qué</div>
        <Badge tone="brand">ordenado por impacto</Badge>
      </div>
      {insErr && <Card style={{ ...card, color: '#dc2626', fontSize: 12.5 }}>{insErr}</Card>}
      {!insErr && insights == null && <Card style={card}>Buscando los porqués…</Card>}
      {!insErr && insights && hallazgos.length === 0 && (
        <Card style={card}><span style={{ fontSize: 12.5, color: '#666' }}>Sin hallazgos con datos suficientes todavía. Se llenan con más desarrollos y comportamiento.</span></Card>
      )}
      {hallazgos.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 14 }}>
          {hallazgos.map((h, i) => <InsightCard key={i} h={h} />)}
        </div>
      )}
      {insights?.lectura && (
        <div style={{ fontSize: 12.5, color: '#bbb', marginTop: 10, fontStyle: 'italic' }}>{insights.lectura}</div>
      )}
    </div>
  );
}

function InsightCard({ h }) {
  const unidad = h.unidad;
  const best = bestGrupoValor(h.grupos, h.mejor_es);
  const mx = Math.max(1, ...(h.grupos || []).map((g) => Math.abs(g.valor || 0)));
  return (
    <Card style={card}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#eee', lineHeight: 1.35 }}>{h.lectura || `${h.split} → ${h.outcome}`}</div>
        {h.confianza != null && h.confianza !== '' && <Badge tone={confTone(h.confianza)}>{h.confianza}</Badge>}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 11, color: '#888', marginBottom: 10 }}>
        <span>partido por <strong style={{ color: '#aaa' }}>{h.split}</strong></span>
        <span>·</span>
        <span><strong style={{ color: '#aaa' }}>{h.outcome}</strong></span>
        {h.delta != null && (
          <>
            <span>·</span>
            <span style={{ color: 'var(--theme)' }}>Δ {fmtVal(h.delta, unidad)}{h.rel != null ? ` (${h.rel})` : ''}</span>
          </>
        )}
      </div>
      <GruposBars grupos={h.grupos} unidad={unidad} best={best} compact />
    </Card>
  );
}

// ── Mini-barras por grupo (grupo → valor); el "mejor" resaltado verde ─────────
function GruposBars({ grupos, unidad, best, compact }) {
  const list = (grupos || []);
  if (list.length === 0) return <div style={{ fontSize: 12, color: '#666' }}>Sin grupos.</div>;
  const mx = Math.max(1, ...list.map((g) => Math.abs(g.valor || 0)));
  const sorted = [...list].sort((a, b) => (b.valor || 0) - (a.valor || 0));
  return (
    <div style={{ display: 'grid', gap: compact ? 6 : 8 }}>
      {sorted.map((g, i) => {
        const isBest = best != null && g.valor === best;
        const accent = isBest ? '#22c55e' : 'var(--theme)';
        return (
          <div key={g.grupo ?? i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: compact ? 12 : 12.5 }}>
            <span style={{ width: compact ? 110 : 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: isBest ? '#22c55e' : '#ddd', fontWeight: isBest ? 700 : 400 }}>
              {g.grupo ?? '—'}
            </span>
            <span style={{ flex: 1, height: compact ? 9 : 11, borderRadius: 2, background: accent, opacity: isBest ? 0.9 : 0.6, width: `${(Math.abs(g.valor || 0) / mx) * 100}%`, minWidth: 2 }} />
            <strong style={{ width: 86, textAlign: 'right', color: isBest ? '#22c55e' : '#ddd' }}>{fmtVal(g.valor, unidad)}</strong>
            {!compact && (
              <span style={{ width: 92, textAlign: 'right', fontSize: 11, color: '#888' }}>
                {g.n_desarrollos != null ? `${fmtN(g.n_desarrollos)} desarr.` : ''}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── SECCIÓN B: resultado de /compare/run ─────────────────────────────────────
function RunResult({ data }) {
  const proc = data.procedencia || {};
  const grupos = data.grupos || [];
  const best = bestGrupoValor(grupos, data.mejor_es);

  return (
    <Card style={{ ...card, marginTop: 16 }}>
      {/* encabezado: split × outcome (+geo) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
        <div style={lbl}>
          {data.split} → {data.outcome_label || data.outcome}
          {data.geo && (data.geo.valor || data.geo.geo_valor) ? <span style={{ color: '#888', fontWeight: 400 }}> · {data.geo.nivel || data.geo.geo_nivel || ''} {data.geo.valor || data.geo.geo_valor}</span> : ''}
        </div>
        {data.mejor_es && data.mejor_es !== '—' && (
          <span style={{ fontSize: 11, color: '#777' }}>mejor es <strong style={{ color: '#aaa' }}>{data.mejor_es}</strong></span>
        )}
      </div>

      {/* delta grande */}
      {data.delta != null && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 34, fontWeight: 800, color: 'var(--theme)', letterSpacing: '-0.02em', lineHeight: 1 }}>
            {fmtVal(data.delta, data.unidad)}
          </span>
          <span style={{ fontSize: 12.5, color: '#888' }}>de diferencia entre grupos</span>
        </div>
      )}

      {/* LATENTE → aviso ámbar, NO error */}
      {data.latente === true ? (
        <div style={{
          fontSize: 12.5, color: '#fcd34d', background: 'rgba(245,158,11,0.10)',
          border: '1px solid rgba(245,158,11,0.35)', borderRadius: 10, padding: '11px 14px', lineHeight: 1.5,
        }}>
          <strong style={{ color: '#f59e0b' }}>Aún sin señal suficiente.</strong> {data.razon_latente || 'Faltan datos para comparar estos grupos de forma confiable.'}
        </div>
      ) : (
        <>
          {grupos.length === 0 ? (
            <div style={{ fontSize: 12.5, color: '#666' }}>Sin grupos para este corte.</div>
          ) : (
            <GruposBars grupos={grupos} unidad={data.unidad} best={best} />
          )}
          {best != null && data.mejor_es && data.mejor_es !== '—' && (
            <div style={{ fontSize: 11, color: '#777', marginTop: 8 }}>
              <span style={{ color: '#22c55e' }}>verde</span> = el grupo que mejor sale en esta métrica.
            </div>
          )}
        </>
      )}

      {/* lectura redactada */}
      {data.lectura && (
        <div style={{ fontSize: 13, color: '#ddd', lineHeight: 1.5, marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)', fontStyle: 'italic' }}>
          {data.lectura}
        </div>
      )}

      {/* procedencia */}
      {(proc.fuente || proc.metodo || proc.cautela) && (
        <div style={{ fontSize: 11, color: '#777', marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)', lineHeight: 1.6 }}>
          {proc.fuente && <div>fuente: {proc.fuente}</div>}
          {proc.metodo && <div>método: {proc.metodo}</div>}
          {proc.cautela && <div style={{ color: '#b08968' }}>cautela: {proc.cautela}</div>}
        </div>
      )}
    </Card>
  );
}
