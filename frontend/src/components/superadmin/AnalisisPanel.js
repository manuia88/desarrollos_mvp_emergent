// Superadmin · ANÁLISIS AVANZADO — la caja de herramientas del analista del Terminal de Zona.
// 5 sub-secciones (sólo se ve la activa): Simulador (what-if) · Comparables (lookalike) · Simetría O↔D ·
// Sustitución (Sankey) · Mis vistas y alertas. Todas reusan las funciones de '../../api/superadminDemandIntel'.
// Cero dato inventado: cada número y lectura vienen del cubo. Verde = oportunidad/sube · ámbar = sobreoferta/baja ·
// morado = demanda. Estilo oscuro idéntico al resto de paneles del folder (Card/Badge, fontSize 12-13).
import React, { useEffect, useMemo, useState } from 'react';
import { Card, Badge } from '../advisor/primitives';
import {
  getWhatifOpciones, getWhatif,
  getLookalike,
  getSimetria,
  getSankey,
  getVistas, postVista, deleteVista, getVistasAlertas,
} from '../../api/superadminDemandIntel';

// ── tokens de estilo compartidos (mismos valores que HeatmapPanel/GridPanel) ──
const card = { padding: '14px 18px' };
const lbl = { fontSize: 11, color: '#888', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 };
const selStyle = {
  background: 'rgba(255,255,255,0.04)', color: '#ddd', fontSize: 12.5,
  border: '1px solid rgba(255,255,255,0.14)', borderRadius: 8, padding: '6px 9px',
};
const inputStyle = { ...selStyle };
const btnStyle = {
  padding: '7px 16px', borderRadius: 9999, border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer',
  background: 'var(--theme, #6366f1)', color: '#fff', fontSize: 12.5, fontWeight: 600,
};
const ghostBtn = {
  padding: '6px 12px', borderRadius: 9999, border: '1px solid rgba(255,255,255,0.16)', cursor: 'pointer',
  background: 'transparent', color: '#bbb', fontSize: 12, fontWeight: 600,
};
const subTab = (on) => ({
  padding: '7px 15px', borderRadius: 9999, border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer',
  background: on ? 'var(--theme, #6366f1)' : 'transparent', color: on ? '#fff' : '#aaa', fontSize: 12.5, fontWeight: 600,
  whiteSpace: 'nowrap',
});

// paleta semántica
const C_UP = '#22c55e';     // verde — oportunidad / sube
const C_DOWN = '#d9a312';   // ámbar — sobreoferta / baja
const C_DEM = '#a78bfa';    // morado — demanda

// ── helpers de formato (sin inventar: si no hay número, "—") ──
const fmtNum = (v) => (v == null || !isFinite(v) ? '—' : Math.round(v).toLocaleString('es-MX'));
const fmtM2 = (v) => (v == null || !isFinite(v) ? '—' : `$${Math.round(v).toLocaleString('es-MX')}/m²`);
const fmtPct = (v) => (v == null || !isFinite(v) ? '—' : `${v > 0 ? '+' : ''}${(+v).toFixed(1)}%`);
const fmtSigned = (v) => (v == null || !isFinite(v) ? '—' : `${v > 0 ? '+' : ''}${Math.round(v).toLocaleString('es-MX')}`);

const SUBS = [
  { id: 'simulador', label: 'Simulador' },
  { id: 'comparables', label: 'Comparables' },
  { id: 'simetria', label: 'Simetría O↔D' },
  { id: 'sustitucion', label: 'Sustitución' },
  { id: 'vistas', label: 'Mis vistas y alertas' },
];

export default function AnalisisPanel() {
  const [sub, setSub] = useState('simulador');

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      {/* ── INTRO ── */}
      <Card style={{ ...card, borderLeft: '3px solid var(--theme, #6366f1)' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#eee', marginBottom: 6 }}>Análisis avanzado</div>
        <div style={{ fontSize: 12.5, color: '#bbb', lineHeight: 1.55 }}>
          La caja de herramientas del analista: simula el efecto de un atributo, encuentra colonias parecidas,
          mide el balance de oferta y demanda, ve qué segmentos compiten entre sí, y guarda alertas que vigilan el cubo por ti.
        </div>
      </Card>

      {/* ── SELECTOR DE SUB-SECCIÓN ── */}
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        {SUBS.map((s) => (
          <button key={s.id} style={subTab(sub === s.id)} onClick={() => setSub(s.id)}>{s.label}</button>
        ))}
      </div>

      {/* ── SECCIÓN ACTIVA ── */}
      {sub === 'simulador' && <Simulador />}
      {sub === 'comparables' && <Comparables />}
      {sub === 'simetria' && <Simetria />}
      {sub === 'sustitucion' && <Sustitucion />}
      {sub === 'vistas' && <VistasAlertas />}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 1) SIMULADOR (what-if) — "¿cuánto vale agregar terraza en Polanco?"
// ════════════════════════════════════════════════════════════════════════════
function Simulador() {
  const [op, setOp] = useState(null);            // {atributos:[{id,label}], tipologias:[...]}
  const [opErr, setOpErr] = useState(null);

  const [colonia, setColonia] = useState('');
  const [tipologia, setTipologia] = useState('');
  const [atributo, setAtributo] = useState('');

  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getWhatifOpciones()
      .then((d) => {
        setOp(d);
        if (d?.atributos?.[0]) setAtributo(d.atributos[0].id);
        // tipología es opcional → arranca en "(todas)"
      })
      .catch((e) => setOpErr(e.message));
  }, []);

  const simular = () => {
    if (!colonia.trim() || !atributo) return;
    setLoading(true); setErr(null);
    getWhatif({ geo_valor: colonia.trim(), agregar: atributo, tipologia: tipologia || undefined })
      .then((d) => {
        if (d?.error) { setData(null); setErr(d.error); }
        else { setData(d); }
      })
      .catch((e) => { setData(null); setErr(e.message); })
      .finally(() => setLoading(false));
  };

  if (opErr) return <Card style={{ ...card, color: '#dc2626' }}>{opErr}</Card>;
  if (!op) return <Card style={card}>Cargando opciones del simulador…</Card>;

  const lift = data?.estimado?.lift_pct;
  const subiendo = lift != null && lift >= 0;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* controles */}
      <Card style={{ ...card, display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={lbl}>Colonia</span>
          <input
            style={{ ...inputStyle, minWidth: 180 }} placeholder="ej. polanco"
            value={colonia} onChange={(e) => setColonia(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') simular(); }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={lbl}>Tipología</span>
          <select style={{ ...selStyle, minWidth: 130 }} value={tipologia} onChange={(e) => setTipologia(e.target.value)}>
            <option value="">(todas)</option>
            {(op.tipologias || []).map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={lbl}>Agregar atributo</span>
          <select style={{ ...selStyle, minWidth: 170 }} value={atributo} onChange={(e) => setAtributo(e.target.value)}>
            {(op.atributos || []).map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
        </div>
        <button style={{ ...btnStyle, opacity: colonia.trim() && atributo ? 1 : 0.5 }} onClick={simular} disabled={!colonia.trim() || !atributo}>
          {loading ? 'Simulando…' : 'Simular'}
        </button>
      </Card>

      {err && <Card style={{ ...card, color: '#dc2626' }}>{err}</Card>}

      {/* resultado */}
      {data && (
        <Card style={card}>
          {/* lectura grande */}
          {data.lectura && (
            <div style={{ fontSize: 16, fontWeight: 700, color: '#eee', lineHeight: 1.4, marginBottom: 14 }}>
              {data.lectura}
            </div>
          )}

          {/* base → estimado con lift coloreado */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
            <div>
              <div style={lbl}>Precio actual</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#ddd' }}>{fmtM2(data.base?.precio_m2)}</div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{fmtNum(data.base?.n_unidades)} unidades base</div>
            </div>
            <div style={{ fontSize: 22, color: '#666' }}>→</div>
            <div>
              <div style={lbl}>Con {data.atributo || 'el atributo'}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: subiendo ? C_UP : C_DOWN }}>{fmtM2(data.estimado?.precio_m2)}</div>
              {lift != null && (
                <div style={{ fontSize: 13, fontWeight: 700, color: subiendo ? C_UP : C_DOWN, marginTop: 2 }}>
                  {fmtPct(lift)} {subiendo ? 'arriba' : 'abajo'}
                </div>
              )}
            </div>
            {data.cohorte_premium != null && (
              <div style={{ marginLeft: 'auto' }}>
                <Badge tone="neutral">cohorte premium {fmtNum(data.cohorte_premium)}</Badge>
              </div>
            )}
          </div>

          {/* demanda / oferta / gap del atributo */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 12 }}>
            <MiniStat label="Demanda del atributo" value={fmtNum(data.estimado?.demanda_atributo)} color={C_DEM} />
            <MiniStat label="Oferta del atributo" value={fmtNum(data.estimado?.oferta_atributo)} color="#9aa0b5" />
            <MiniStat
              label="Brecha (demanda − oferta)"
              value={fmtSigned(data.estimado?.gap_atributo)}
              color={data.estimado?.gap_atributo > 0 ? C_UP : data.estimado?.gap_atributo < 0 ? C_DOWN : '#9aa0b5'}
            />
          </div>

          {/* cautela + fuente en chico */}
          {data.cautela && (
            <div style={{ fontSize: 11, color: '#888', lineHeight: 1.5, fontStyle: 'italic' }}>
              ⚠ {data.cautela}
            </div>
          )}
          {data.fuente && (
            <div style={{ fontSize: 10.5, color: '#666', marginTop: 4 }}>Fuente: {data.fuente}</div>
          )}
        </Card>
      )}

      {!data && !err && !loading && (
        <Card style={{ ...card, color: '#888', fontSize: 12.5 }}>
          Escribe una colonia, elige un atributo y pulsa <strong style={{ color: '#aaa' }}>Simular</strong> para ver
          el premium estimado y la demanda revelada.
        </Card>
      )}
    </div>
  );
}

function MiniStat({ label, value, color }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '9px 12px' }}>
      <div style={{ fontSize: 10, color: '#888', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: color || '#ddd' }}>{value}</div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 2) COMPARABLES (lookalike) — colonias con perfil de mercado parecido
// ════════════════════════════════════════════════════════════════════════════
function Comparables() {
  const [colonia, setColonia] = useState('');
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);

  const buscar = () => {
    if (!colonia.trim()) return;
    setLoading(true); setErr(null);
    getLookalike({ colonia: colonia.trim(), top: 8 })
      .then((d) => {
        if (d?.error) { setData(null); setErr(d.error); }
        else { setData(d); }
      })
      .catch((e) => { setData(null); setErr(e.message); })
      .finally(() => setLoading(false));
  };

  const similares = data?.similares || [];

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card style={{ ...card, display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={lbl}>Colonia objetivo</span>
          <input
            style={{ ...inputStyle, minWidth: 200 }} placeholder="ej. polanco"
            value={colonia} onChange={(e) => setColonia(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') buscar(); }}
          />
        </div>
        <button style={{ ...btnStyle, opacity: colonia.trim() ? 1 : 0.5 }} onClick={buscar} disabled={!colonia.trim()}>
          {loading ? 'Buscando…' : 'Buscar'}
        </button>
      </Card>

      {err && <Card style={{ ...card, color: '#dc2626' }}>{err}</Card>}

      {data && (
        <Card style={card}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#eee' }}>Parecidas a {data.objetivo}</div>
          </div>
          {data.lectura && <div style={{ fontSize: 12, color: '#999', marginBottom: 14 }}>{data.lectura}</div>}

          {similares.length === 0 ? (
            <div style={{ fontSize: 12.5, color: '#888' }}>Sin colonias comparables para este objetivo.</div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {similares.map((s, i) => (
                <div key={(s.nombre || i) + '-' + i} style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 5, padding: '10px 0', borderTop: i ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: '#ddd' }}>{s.nombre}</span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--theme, #6366f1)', flexShrink: 0 }}>
                      {s.similitud_pct != null ? `${s.similitud_pct}%` : '—'}
                    </span>
                  </div>
                  {/* barra de similitud */}
                  <div style={{ height: 6, borderRadius: 4, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, s.similitud_pct || 0))}%`, background: 'var(--theme, #6366f1)' }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, color: '#999' }}>
                      se parece en: {(s.se_parece_en || []).length ? s.se_parece_en.join(' · ') : '—'}
                    </span>
                    <span style={{ fontSize: 11.5, color: '#aaa', flexShrink: 0 }}>{fmtM2(s.precio_m2)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {!data && !err && !loading && (
        <Card style={{ ...card, color: '#888', fontSize: 12.5 }}>
          Escribe una colonia para encontrar las que tienen un perfil de mercado parecido (precio, demanda, absorción).
        </Card>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 3) SIMETRÍA O↔D — balance oferta vs demanda por cada dimensión
// ════════════════════════════════════════════════════════════════════════════
function Simetria() {
  const [colonia, setColonia] = useState('');
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState({}); // {dimension: true}

  const ver = () => {
    setLoading(true); setErr(null);
    const args = colonia.trim() ? { geo_nivel: 'colonia', geo_valor: colonia.trim() } : {};
    getSimetria(args)
      .then((d) => {
        if (d?.error) { setData(null); setErr(d.error); }
        else { setData(d); setOpen({}); }
      })
      .catch((e) => { setData(null); setErr(e.message); })
      .finally(() => setLoading(false));
  };

  // primera carga: ciudad completa
  useEffect(() => { ver(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const dims = data?.dimensiones || [];
  const balanceTone = (b) => (b === 'demanda>oferta' ? 'ok' : b === 'oferta>demanda' ? 'warn' : 'neutral');

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card style={{ ...card, display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={lbl}>Colonia (vacío = toda la ciudad)</span>
          <input
            style={{ ...inputStyle, minWidth: 200 }} placeholder="ej. polanco"
            value={colonia} onChange={(e) => setColonia(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') ver(); }}
          />
        </div>
        <button style={btnStyle} onClick={ver}>{loading ? 'Cargando…' : 'Ver'}</button>
      </Card>

      {err && <Card style={{ ...card, color: '#dc2626' }}>{err}</Card>}

      {data && (
        <Card style={card}>
          {data.lectura && <div style={{ fontSize: 12.5, color: '#bbb', marginBottom: 14, lineHeight: 1.5 }}>{data.lectura}</div>}

          {dims.length === 0 ? (
            <div style={{ fontSize: 12.5, color: '#888' }}>Sin dimensiones con dato para esta selección.</div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {dims.map((d) => {
                const isOpen = !!open[d.dimension];
                return (
                  <div key={d.dimension} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, overflow: 'hidden' }}>
                    <button
                      onClick={() => setOpen((o) => ({ ...o, [d.dimension]: !o[d.dimension] }))}
                      style={{
                        width: '100%', textAlign: 'left', cursor: 'pointer', background: 'rgba(255,255,255,0.02)',
                        border: 'none', padding: '11px 14px', display: 'grid',
                        gridTemplateColumns: 'minmax(120px,1.4fr) auto auto auto', gap: 10, alignItems: 'center',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: '#666', fontSize: 11, width: 10 }}>{isOpen ? '▾' : '▸'}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#ddd' }}>{d.label}</span>
                      </span>
                      <span style={{ fontSize: 11.5, color: '#9aa0b5' }}>oferta {fmtNum(d.oferta_total)}</span>
                      <span style={{ fontSize: 11.5, color: C_DEM }}>demanda {fmtNum(d.demanda_total)}</span>
                      <span style={{ justifySelf: 'end' }}><Badge tone={balanceTone(d.balance)}>{d.balance}</Badge></span>
                    </button>

                    {/* oportunidad / sobreoferta */}
                    <div style={{ display: 'flex', gap: 10, padding: '0 14px 11px', flexWrap: 'wrap' }}>
                      {d.mayor_oportunidad && (
                        <span style={{ fontSize: 11.5, color: C_UP, fontWeight: 600 }}>
                          oportunidad: {d.mayor_oportunidad.segmento} {fmtSigned(d.mayor_oportunidad.gap)}
                        </span>
                      )}
                      {d.mayor_sobreoferta && (
                        <span style={{ fontSize: 11.5, color: C_DOWN, fontWeight: 600 }}>
                          sobreoferta: {d.mayor_sobreoferta.segmento} {fmtSigned(d.mayor_sobreoferta.gap)}
                        </span>
                      )}
                      {!d.mayor_oportunidad && !d.mayor_sobreoferta && (
                        <span style={{ fontSize: 11.5, color: '#777' }}>balance neutro</span>
                      )}
                    </div>

                    {/* expandible: valores por segmento */}
                    {isOpen && (
                      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '6px 14px 12px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(80px,1.4fr) auto auto auto', gap: 8, padding: '6px 0', fontSize: 10, color: '#777', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                          <span>Segmento</span><span style={{ textAlign: 'right' }}>Oferta</span><span style={{ textAlign: 'right' }}>Demanda</span><span style={{ textAlign: 'right' }}>Brecha</span>
                        </div>
                        {(d.valores || []).map((v, i) => (
                          <div key={(v.segmento || i) + '-' + i} style={{ display: 'grid', gridTemplateColumns: 'minmax(80px,1.4fr) auto auto auto', gap: 8, padding: '5px 0', borderTop: '1px solid rgba(255,255,255,0.04)', fontSize: 12 }}>
                            <span style={{ color: '#ccc' }}>{v.segmento}</span>
                            <span style={{ textAlign: 'right', color: '#9aa0b5' }}>{fmtNum(v.oferta)}</span>
                            <span style={{ textAlign: 'right', color: C_DEM }}>{fmtNum(v.demanda)}</span>
                            <span style={{ textAlign: 'right', fontWeight: 700, color: v.gap > 0 ? C_UP : v.gap < 0 ? C_DOWN : '#9aa0b5' }}>{fmtSigned(v.gap)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 4) SUSTITUCIÓN (Sankey legible) — flujos origen → destino por n
// ════════════════════════════════════════════════════════════════════════════
function Sustitucion() {
  const [por, setPor] = useState('tipologia'); // 'tipologia' | 'zona'
  const [colonia, setColonia] = useState('');
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);

  const ver = () => {
    setLoading(true); setErr(null);
    const args = { por };
    if (colonia.trim()) { args.geo_nivel = 'colonia'; args.geo_valor = colonia.trim(); }
    getSankey(args)
      .then((d) => {
        if (d?.error) { setData(null); setErr(d.error); }
        else { setData(d); }
      })
      .catch((e) => { setData(null); setErr(e.message); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { ver(); }, [por]); // eslint-disable-line react-hooks/exhaustive-deps

  const enlaces = useMemo(
    () => [...(data?.enlaces || [])].sort((a, b) => (b.n || 0) - (a.n || 0)),
    [data],
  );
  const maxN = enlaces.length ? Math.max(...enlaces.map((e) => e.n || 0), 1) : 1;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Card style={{ ...card, display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={lbl}>Sustitución por</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button style={subTab(por === 'tipologia')} onClick={() => setPor('tipologia')}>Tipología</button>
            <button style={subTab(por === 'zona')} onClick={() => setPor('zona')}>Zona</button>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={lbl}>Colonia (opcional)</span>
          <input
            style={{ ...inputStyle, minWidth: 180 }} placeholder="ej. polanco"
            value={colonia} onChange={(e) => setColonia(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') ver(); }}
          />
        </div>
        <button style={btnStyle} onClick={ver}>{loading ? 'Cargando…' : 'Ver'}</button>
      </Card>

      {err && <Card style={{ ...card, color: '#dc2626' }}>{err}</Card>}

      {data && (
        <Card style={card}>
          {data.lectura && <div style={{ fontSize: 12.5, color: '#bbb', marginBottom: 14, lineHeight: 1.5 }}>{data.lectura}</div>}

          {enlaces.length === 0 ? (
            <div style={{ fontSize: 12.5, color: '#888' }}>Sin flujos de sustitución para esta selección.</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {enlaces.map((e, i) => (
                <div key={`${e.origen}-${e.destino}-${i}`} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: '#ddd' }}>{e.origen}</span>
                      <span style={{ color: '#666', fontSize: 12 }}>→</span>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: '#ddd' }}>{e.destino}</span>
                    </div>
                    <div style={{ height: 7, borderRadius: 4, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.max(3, Math.round(100 * (e.n || 0) / maxN))}%`, background: 'var(--theme, #6366f1)' }} />
                    </div>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#fff', minWidth: 36, textAlign: 'right' }}>{fmtNum(e.n)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 5) MIS VISTAS Y ALERTAS — alertas disparadas + crear/listar/borrar vistas
// ════════════════════════════════════════════════════════════════════════════
const METRICAS_ALERTA = [
  { id: 'gap_terraza', label: 'Brecha terraza' },
  { id: 'gap_balcon', label: 'Brecha balcón' },
  { id: 'gap_roof_garden', label: 'Brecha roof garden' },
  { id: 'precio_m2', label: 'Precio por m²' },
  { id: 'absorcion', label: 'Absorción mensual' },
  { id: 'sell_through', label: '% vendido' },
  { id: 'gap_demanda', label: 'Brecha demanda-oferta' },
];
// op: clave que entiende el backend (_OPS/_OP_TXT) → símbolo que se muestra
const OPERADORES = [
  { id: 'gt', txt: '>' }, { id: 'lt', txt: '<' }, { id: 'gte', txt: '≥' }, { id: 'lte', txt: '≤' }, { id: 'eq', txt: '=' },
];

function VistasAlertas() {
  const [vistas, setVistas] = useState(null);
  const [alertas, setAlertas] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);

  // form
  const [nombre, setNombre] = useState('');
  const [colonia, setColonia] = useState('');
  const [metrica, setMetrica] = useState('gap_terraza');
  const [op, setOp] = useState('gt');
  const [valor, setValor] = useState('');
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState(null);

  const cargar = () => {
    setLoading(true); setErr(null);
    Promise.all([getVistas(), getVistasAlertas()])
      .then(([v, a]) => { setVistas(v); setAlertas(a); })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { cargar(); }, []);

  const crear = () => {
    if (!nombre.trim() || !colonia.trim() || valor === '' || isNaN(Number(valor))) {
      setFormErr('Completa nombre, colonia y un valor numérico.');
      return;
    }
    setSaving(true); setFormErr(null);
    const col = colonia.trim();
    postVista({
      nombre: nombre.trim(),
      tipo: 'alerta',
      definicion: { metrica, colonia: col },
      alerta: { metrica, op, valor: Number(valor), colonia: col },
    })
      .then(() => {
        setNombre(''); setColonia(''); setValor('');
        cargar();
      })
      .catch((e) => setFormErr(e.message))
      .finally(() => setSaving(false));
  };

  const borrar = (id) => {
    deleteVista(id).then(() => cargar()).catch((e) => setErr(e.message));
  };

  if (loading) return <Card style={card}>Cargando vistas y alertas…</Card>;
  if (err) return <Card style={{ ...card, color: '#dc2626' }}>{err}</Card>;

  const disparadas = alertas?.disparadas || [];
  const listaVistas = vistas?.vistas || [];
  const opTxt = (id) => (OPERADORES.find((o) => o.id === id) || {}).txt || id;
  const metLabel = (id) => (METRICAS_ALERTA.find((m) => m.id === id) || {}).label || id;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* ── ALERTAS DISPARADAS ── */}
      <Card style={{ ...card, borderLeft: `3px solid ${disparadas.length ? '#e0463d' : 'rgba(255,255,255,0.12)'}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: disparadas.length ? 12 : 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#eee' }}>Alertas disparadas</div>
          <Badge tone={disparadas.length ? 'bad' : 'neutral'}>{disparadas.length} activas</Badge>
        </div>
        {disparadas.length === 0 ? (
          <div style={{ fontSize: 12.5, color: '#888' }}>
            Ninguna alerta cumple su umbral ahora mismo. {alertas?.total_con_alerta ? `(${alertas.total_con_alerta} vigilando)` : ''}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {disparadas.map((d, i) => (
              <div key={(d.vista || i) + '-' + i} style={{ background: 'rgba(224,70,61,0.10)', border: '1px solid rgba(224,70,61,0.30)', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#fca5a5' }}>{d.vista}</span>
                  <span style={{ fontSize: 11.5, color: '#fda4a4' }}>
                    {d.metrica} en {d.colonia} = <strong>{fmtNum(d.valor_actual)}</strong> {d.umbral ? `(${d.umbral})` : ''}
                  </span>
                </div>
                {d.lectura && <div style={{ fontSize: 11.5, color: '#ddd', marginTop: 5, lineHeight: 1.45 }}>{d.lectura}</div>}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── CREAR ALERTA ── */}
      <Card style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#ddd', marginBottom: 12 }}>Crear alerta</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={lbl}>Nombre</span>
            <input style={{ ...inputStyle, minWidth: 160 }} placeholder="ej. terraza Roma caliente" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={lbl}>Colonia</span>
            <input style={{ ...inputStyle, minWidth: 140 }} placeholder="ej. polanco" value={colonia} onChange={(e) => setColonia(e.target.value)} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={lbl}>Métrica</span>
            <select style={{ ...selStyle, minWidth: 150 }} value={metrica} onChange={(e) => setMetrica(e.target.value)}>
              {METRICAS_ALERTA.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={lbl}>Operador</span>
            <select style={{ ...selStyle, minWidth: 70 }} value={op} onChange={(e) => setOp(e.target.value)}>
              {OPERADORES.map((o) => <option key={o.id} value={o.id}>{o.txt}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={lbl}>Valor</span>
            <input
              type="number" style={{ ...inputStyle, minWidth: 100 }} placeholder="0"
              value={valor} onChange={(e) => setValor(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') crear(); }}
            />
          </div>
          <button style={btnStyle} onClick={crear} disabled={saving}>{saving ? 'Guardando…' : 'Crear alerta'}</button>
        </div>
        {formErr && <div style={{ fontSize: 12, color: '#dc2626', marginTop: 8 }}>{formErr}</div>}
      </Card>

      {/* ── VISTAS GUARDADAS ── */}
      <Card style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#ddd', marginBottom: 12 }}>
          Vistas guardadas {listaVistas.length ? `(${listaVistas.length})` : ''}
        </div>
        {listaVistas.length === 0 ? (
          <div style={{ fontSize: 12.5, color: '#888' }}>Aún no has guardado ninguna vista ni alerta.</div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {listaVistas.map((v) => {
              const a = v.alerta;
              return (
                <div key={v.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#ddd' }}>{v.nombre}</span>
                      <Badge tone={v.disparada ? 'bad' : 'neutral'}>{v.disparada ? 'disparada' : 'vigilando'}</Badge>
                      {a == null && <Badge tone="neutral">{v.tipo || 'vista'}</Badge>}
                    </div>
                    {a && (
                      <div style={{ fontSize: 11.5, color: '#999', marginTop: 4 }}>
                        {metLabel(a.metrica)} {opTxt(a.op)} {a.valor}{a.colonia ? ` · ${a.colonia}` : ''}
                        {v.valor_actual != null && <span style={{ color: '#aaa' }}> · actual: {fmtNum(v.valor_actual)}</span>}
                      </div>
                    )}
                  </div>
                  <button style={ghostBtn} onClick={() => borrar(v.id)}>Borrar</button>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
