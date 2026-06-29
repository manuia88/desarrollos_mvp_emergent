// Superadmin · COMPARATIVAS (¿por qué?) — la capa del PORQUÉ.
// Parte los desarrollos por un atributo (split) y compara una métrica de resultado (outcome) entre grupos
// para ver qué mueve qué ("con amenidades vende más", "sin terraza menos demanda").
//   A) "El porqué automático": hallazgos de /compare/insights ordenados por impacto.
//   B) "Comparar tú mismo": arma split × outcome (+geo opcional) y corre /compare/run.
import React, { useEffect, useMemo, useState } from 'react';
import { Card, Badge } from '../advisor/primitives';
import { getCompareCatalog, getCompareRun, getCompareInsights, getLaunchCoverage, setLaunch } from '../../api/superadminDemandIntel';

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
const th = {
  textAlign: 'left', fontSize: 10.5, color: '#888', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: 0.4, padding: '6px 10px 8px', borderBottom: '1px solid rgba(255,255,255,0.10)', whiteSpace: 'nowrap',
};
const td = { fontSize: 12, color: '#bbb', padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.05)', verticalAlign: 'middle' };

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

      {/* ── SECCIÓN 0 · FECHAS DE LANZAMIENTO (base de la velocidad) ────────── */}
      <LaunchDatesSection />

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

// ── SECCIÓN 0: fechas de lanzamiento (cobertura + captura) ────────────────────
const YYYYMM_RE = /^\d{4}-(0[1-9]|1[0-2])$/; // AAAA-MM válido (mes 01-12)

// tono del chip por categoría de cobertura: capturado=verde · estimado=ámbar · sin dato=rojo.
function coverageTone(key) {
  const k = String(key || '').toLowerCase();
  if (k.includes('capturado')) return { bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.40)', fg: '#22c55e' };
  if (k.includes('sin dato')) return { bg: 'rgba(220,38,38,0.12)', border: 'rgba(220,38,38,0.40)', fg: '#f87171' };
  return { bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.35)', fg: '#f59e0b' }; // estimado
}

// badge de método por fila (mismo criterio de color que los chips de cobertura).
function metodoTone(metodo) {
  const m = String(metodo || '').toLowerCase();
  if (m.includes('capturado')) return 'ok';
  if (m.includes('sin dato') || m === '') return 'bad';
  return 'warn';
}

function LaunchDatesSection() {
  const [cov, setCov] = useState(null);
  const [err, setErr] = useState(null);
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState({});   // dev_id → valor AAAA-MM en edición
  const [rowErr, setRowErr] = useState({});    // dev_id → mensaje de error
  const [saving, setSaving] = useState({});    // dev_id → bool

  const load = () => {
    getLaunchCoverage().then((d) => { setCov(d); setErr(null); }).catch((e) => setErr(e.message));
  };
  useEffect(() => { load(); }, []);

  const guardar = (dev_id) => {
    const val = (drafts[dev_id] || '').trim();
    if (!YYYYMM_RE.test(val)) {
      setRowErr((p) => ({ ...p, [dev_id]: 'Formato AAAA-MM (p.ej. 2024-09)' }));
      return;
    }
    setRowErr((p) => ({ ...p, [dev_id]: null }));
    setSaving((p) => ({ ...p, [dev_id]: true }));
    setLaunch(dev_id, val)
      .then((d) => {
        if (d && d.ok === false) { setRowErr((p) => ({ ...p, [dev_id]: d.error || 'No se pudo guardar.' })); return; }
        setDrafts((p) => { const n = { ...p }; delete n[dev_id]; return n; });
        load();
      })
      .catch((e) => setRowErr((p) => ({ ...p, [dev_id]: e.message })))
      .finally(() => setSaving((p) => ({ ...p, [dev_id]: false })));
  };

  const cobertura = cov?.cobertura || {};
  const detalle = cov?.detalle || [];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ ...lbl, fontSize: 12, marginBottom: 0 }}>Fechas de lanzamiento (base de la velocidad)</div>
        <button
          style={{ ...btnStyle, padding: '5px 13px', fontSize: 11.5, background: 'rgba(255,255,255,0.05)', color: '#bbb' }}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? 'Ocultar' : 'Ver / capturar'}
        </button>
      </div>

      {err && <Card style={{ ...card, color: '#dc2626', fontSize: 12.5 }}>{err}</Card>}
      {!err && cov == null && <Card style={card}>Cargando cobertura de fechas…</Card>}

      {!err && cov && (
        <Card style={card}>
          {/* chips de cobertura */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
            {Object.entries(cobertura).map(([k, n]) => {
              const t = coverageTone(k);
              return (
                <span key={k} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12,
                  background: t.bg, border: `1px solid ${t.border}`, color: t.fg,
                  borderRadius: 9999, padding: '4px 11px', fontWeight: 600,
                }}>
                  <strong style={{ color: t.fg }}>{fmtN(n)}</strong>
                  <span style={{ color: '#aaa', fontWeight: 400 }}>{k}</span>
                </span>
              );
            })}
            {cov.total != null && (
              <span style={{ fontSize: 11.5, color: '#777', alignSelf: 'center' }}>· {fmtN(cov.total)} desarrollos</span>
            )}
          </div>
          <div style={{ fontSize: 11, color: '#777', lineHeight: 1.5 }}>
            la velocidad usa fecha capturada o estimada por avance de obra — no inventada.
          </div>

          {/* tabla detalle (colapsable) */}
          {open && (
            detalle.length === 0 ? (
              <div style={{ fontSize: 12.5, color: '#666', marginTop: 12 }}>Sin desarrollos para mostrar.</div>
            ) : (
              <div style={{ overflowX: 'auto', marginTop: 12 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      {['Desarrollo', 'Fecha', 'Método', 'Capturar (AAAA-MM)'].map((h) => (
                        <th key={h} style={th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {detalle.map((row) => {
                      const id = row.dev_id;
                      const e = rowErr[id];
                      return (
                        <tr key={id}>
                          <td style={{ ...td, color: '#ddd', whiteSpace: 'nowrap' }}>{id}</td>
                          <td style={{ ...td, color: row.fecha ? '#ddd' : '#666' }}>{row.fecha || '—'}</td>
                          <td style={td}>
                            <Badge tone={metodoTone(row.metodo)}>{row.metodo || 'sin dato'}</Badge>
                          </td>
                          <td style={td}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <input
                                style={{ ...inputStyle, minWidth: 0, width: 100, padding: '5px 8px' }}
                                value={drafts[id] ?? ''}
                                placeholder={row.fecha || 'AAAA-MM'}
                                onChange={(ev) => setDrafts((p) => ({ ...p, [id]: ev.target.value }))}
                                onKeyDown={(ev) => { if (ev.key === 'Enter') guardar(id); }}
                              />
                              <button
                                style={{ ...btnStyle, padding: '5px 12px', fontSize: 11.5 }}
                                onClick={() => guardar(id)}
                                disabled={!!saving[id]}
                              >
                                {saving[id] ? '…' : 'guardar'}
                              </button>
                            </div>
                            {e && <div style={{ color: '#dc2626', fontSize: 10.5, marginTop: 3 }}>{e}</div>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}
        </Card>
      )}
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
