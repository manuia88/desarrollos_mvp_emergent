// Superadmin · GRID DE MÉTRICAS — el mapa de TODAS las medidas (oferta/demanda/cruce) × dimensiones del cubo.
// Pivotea una medida + sus dimensiones aplicables → una celda con valor + PROCEDENCIA (de dónde sale el número).
// + Insights redactados + Ranking de zonas por medida.
import React, { useEffect, useMemo, useState } from 'react';
import { Card, Badge } from '../advisor/primitives';
import { getGridOverview, getGridCell, getGridRanking, getGridInsights } from '../../api/superadminDemandIntel';

const card = { padding: '14px 18px' };
const lbl = { fontSize: 11, color: '#888', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 };
const selStyle = {
  background: 'rgba(255,255,255,0.04)', color: '#ddd', fontSize: 12.5,
  border: '1px solid rgba(255,255,255,0.14)', borderRadius: 8, padding: '6px 9px', minWidth: 130,
};
const inputStyle = { ...selStyle };
const btnStyle = {
  padding: '7px 16px', borderRadius: 9999, border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer',
  background: 'var(--theme, #6366f1)', color: '#fff', fontSize: 12.5, fontWeight: 600,
};

// Etiquetas legibles por lado del cubo.
const LADO_LABEL = { oferta: 'Oferta (lo que existe)', demanda: 'Demanda (lo que se busca)', cruce: 'Cruce (oferta × demanda)' };
// Dimensiones que se piden con dropdown (vienen de overview.dimensiones); geo va aparte como texto.
const DIM_DROPDOWNS = ['tipologia', 'rango_m2', 'tier_precio', 'atributo', 'vista', 'etapa', 'ventana'];
const DIM_LABEL = {
  geo: 'Geografía', tipologia: 'Tipología', rango_m2: 'Rango m²', tier_precio: 'Tier de precio',
  atributo: 'Atributo', vista: 'Vista', etapa: 'Etapa', ventana: 'Ventana',
};
const GEO_NIVELES = ['colonia', 'alcaldia', 'corredor', 'desarrollo'];

const confTone = (c) => {
  const v = String(c || '').toLowerCase();
  if (v.startsWith('alta')) return '#22c55e';
  if (v.startsWith('media')) return '#f59e0b';
  if (v.startsWith('baja')) return '#dc2626';
  return '#888';
};

export default function GridPanel() {
  const [overview, setOverview] = useState(null);
  const [insights, setInsights] = useState(null);
  const [err, setErr] = useState(null);

  // Pivot (celda)
  const [measureId, setMeasureId] = useState('');
  const [geoNivel, setGeoNivel] = useState('colonia');
  const [geoValor, setGeoValor] = useState('');
  const [dimVals, setDimVals] = useState({}); // {tipologia, rango_m2, ...}
  const [cell, setCell] = useState(null);
  const [cellErr, setCellErr] = useState(null);
  const [cellLoading, setCellLoading] = useState(false);

  // Ranking
  const [rankMeasure, setRankMeasure] = useState('');
  const [rankPor, setRankPor] = useState('colonia');
  const [ranking, setRanking] = useState(null);
  const [rankErr, setRankErr] = useState(null);
  const [rankLoading, setRankLoading] = useState(false);

  useEffect(() => {
    getGridOverview().then((d) => {
      setOverview(d);
      const first = (d?.detalle || [])[0];
      if (first) { setMeasureId(first.id); setRankMeasure(first.id); }
    }).catch((e) => setErr(e.message));
    getGridInsights().then((d) => setInsights(d?.insights || [])).catch(() => setInsights([]));
  }, []);

  // Agrupa las medidas por lado para el dropdown del pivot.
  const grouped = useMemo(() => {
    const g = {};
    (overview?.detalle || []).forEach((m) => { (g[m.lado] = g[m.lado] || []).push(m); });
    return g;
  }, [overview]);

  const selectedMeasure = useMemo(
    () => (overview?.detalle || []).find((m) => m.id === measureId) || null,
    [overview, measureId]
  );
  const dims = overview?.dimensiones || {};
  // Dimensiones que aplican a la medida seleccionada.
  const measureDims = selectedMeasure?.dims || [];

  const valuesFor = (dim) => {
    const v = dims[dim];
    if (Array.isArray(v)) return v;
    if (typeof v === 'number') return null; // sólo cuenta, sin lista → input libre
    return null;
  };

  const consultarCelda = () => {
    if (!measureId) return;
    setCellLoading(true); setCellErr(null);
    const params = { measure: measureId };
    if (measureDims.includes('geo')) { params.geo_nivel = geoNivel; params.geo_valor = geoValor; }
    DIM_DROPDOWNS.forEach((d) => { if (measureDims.includes(d) && dimVals[d]) params[d] = dimVals[d]; });
    getGridCell(params)
      .then((d) => setCell(d))
      .catch((e) => { setCell(null); setCellErr(e.message); })
      .finally(() => setCellLoading(false));
  };

  const consultarRanking = () => {
    if (!rankMeasure) return;
    setRankLoading(true); setRankErr(null);
    getGridRanking({ measure: rankMeasure, por: rankPor, top: 12 })
      .then((d) => setRanking(d))
      .catch((e) => { setRanking(null); setRankErr(e.message); })
      .finally(() => setRankLoading(false));
  };

  if (err) return <Card style={{ ...card, color: '#dc2626' }}>{err}</Card>;
  if (!overview) return <Card style={card}>Cargando grid…</Card>;

  const dimsStr = Object.entries(dims)
    .map(([k, v]) => `${DIM_LABEL[k] || k} ${typeof v === 'number' ? v : (Array.isArray(v) ? v.length : v)}`)
    .join(' · ');

  const measureOptions = (
    <>
      {Object.keys(grouped).map((lado) => (
        <optgroup key={lado} label={LADO_LABEL[lado] || lado}>
          {grouped[lado].map((m) => (
            <option key={m.id} value={m.id}>{m.medida}{m.fuente ? ` — ${m.fuente}` : ''}</option>
          ))}
        </optgroup>
      ))}
    </>
  );

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* STRIP — resumen del grid */}
      <div style={{ fontSize: 12.5, color: '#aaa', display: 'flex', flexWrap: 'wrap', gap: '4px 10px', alignItems: 'center' }}>
        <strong style={{ color: 'var(--theme)' }}>{overview.medidas_base}</strong> medidas base
        <span style={{ color: '#555' }}>·</span>
        <strong style={{ color: 'var(--theme)' }}>{(overview.celdas_teoricas_totales ?? 0).toLocaleString('es-MX')}</strong> celdas teóricas
        {dimsStr && <><span style={{ color: '#555' }}>·</span><span style={{ color: '#888' }}>{dimsStr}</span></>}
        {overview.por_lado && (
          <span style={{ marginLeft: 4, display: 'inline-flex', gap: 6 }}>
            {Object.entries(overview.por_lado).map(([k, v]) => (
              <Badge key={k} tone={k === 'oferta' ? 'ok' : k === 'demanda' ? 'brand' : 'warn'}>{k}: {v}</Badge>
            ))}
          </span>
        )}
      </div>

      {/* PIVOT — arma una celda */}
      <Card style={card}>
        <div style={lbl}>Pivot · consulta una celda del cubo</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          {/* Medida */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 10.5, color: '#888' }}>Medida</span>
            <select style={{ ...selStyle, minWidth: 240 }} value={measureId}
              onChange={(e) => { setMeasureId(e.target.value); setCell(null); setCellErr(null); setDimVals({}); }}>
              {measureOptions}
            </select>
          </div>

          {/* Geo */}
          {measureDims.includes('geo') && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 10.5, color: '#888' }}>Nivel geo</span>
                <select style={selStyle} value={geoNivel} onChange={(e) => setGeoNivel(e.target.value)}>
                  {GEO_NIVELES.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 10.5, color: '#888' }}>Valor geo</span>
                <input style={inputStyle} value={geoValor} placeholder="p.ej. polanco"
                  onChange={(e) => setGeoValor(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') consultarCelda(); }} />
              </div>
            </>
          )}

          {/* Dimensiones dropdown aplicables */}
          {DIM_DROPDOWNS.filter((d) => measureDims.includes(d)).map((d) => {
            const opts = valuesFor(d);
            return (
              <div key={d} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 10.5, color: '#888' }}>{DIM_LABEL[d] || d}</span>
                {opts ? (
                  <select style={selStyle} value={dimVals[d] || ''}
                    onChange={(e) => setDimVals((v) => ({ ...v, [d]: e.target.value }))}>
                    <option value="">(todas)</option>
                    {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input style={inputStyle} value={dimVals[d] || ''} placeholder="(todas)"
                    onChange={(e) => setDimVals((v) => ({ ...v, [d]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') consultarCelda(); }} />
                )}
              </div>
            );
          })}

          <button style={btnStyle} onClick={consultarCelda} disabled={cellLoading}>
            {cellLoading ? 'Consultando…' : 'Consultar'}
          </button>
        </div>

        {selectedMeasure && (
          <div style={{ fontSize: 11, color: '#777', marginTop: 8 }}>
            {selectedMeasure.lado} · {selectedMeasure.celdas_teoricas != null ? `${Number(selectedMeasure.celdas_teoricas).toLocaleString('es-MX')} celdas teóricas` : ''}
            {selectedMeasure.n_minimo != null ? ` · n mínimo ${selectedMeasure.n_minimo}` : ''}
            {selectedMeasure.dims?.length ? ` · dims: ${selectedMeasure.dims.join(', ')}` : ''}
          </div>
        )}

        {/* Resultado de celda */}
        {cellErr && <div style={{ color: '#dc2626', fontSize: 12.5, marginTop: 12 }}>{cellErr}</div>}
        {cell && !cellErr && <CellResult cell={cell} />}
      </Card>

      {/* INSIGHTS */}
      <Card style={card}>
        <div style={lbl}>Insights del grid</div>
        {insights == null && <div style={{ fontSize: 12.5, color: '#888' }}>Cargando insights…</div>}
        {insights && insights.length === 0 && <div style={{ fontSize: 12.5, color: '#666' }}>Sin insights por ahora.</div>}
        <div style={{ display: 'grid', gap: 10 }}>
          {(insights || []).map((it, i) => (
            <div key={i} style={{ borderLeft: '3px solid var(--theme)', paddingLeft: 12 }}>
              <div style={{ fontSize: 13, color: '#ddd', lineHeight: 1.45 }}>{it.insight}</div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 3 }}>
                {it.medida ? `${it.medida} · ` : ''}n={it.n ?? '—'} · cohorte: {it.cohorte || '—'} · fuente: {it.fuente || '—'}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* RANKING */}
      <Card style={card}>
        <div style={lbl}>Ranking de zonas por medida</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 10.5, color: '#888' }}>Medida</span>
            <select style={{ ...selStyle, minWidth: 240 }} value={rankMeasure} onChange={(e) => setRankMeasure(e.target.value)}>
              {measureOptions}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 10.5, color: '#888' }}>Por</span>
            <select style={selStyle} value={rankPor} onChange={(e) => setRankPor(e.target.value)}>
              {GEO_NIVELES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <button style={btnStyle} onClick={consultarRanking} disabled={rankLoading}>
            {rankLoading ? 'Cargando…' : 'Ver ranking'}
          </button>
        </div>

        {rankErr && <div style={{ color: '#dc2626', fontSize: 12.5, marginTop: 12 }}>{rankErr}</div>}
        {ranking && !rankErr && <RankingList ranking={ranking} />}
      </Card>
    </div>
  );
}

function CellResult({ cell }) {
  const p = cell.procedencia || {};
  const tone = confTone(cell.confianza);
  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        {cell.latente ? (
          <span style={{ fontSize: 30, fontWeight: 800, color: '#777', letterSpacing: '-0.02em' }}>LATENTE</span>
        ) : (
          <span style={{ fontSize: 34, fontWeight: 800, color: 'var(--theme)', letterSpacing: '-0.02em' }}>
            {cell.valor == null ? '—' : (typeof cell.valor === 'number' ? cell.valor.toLocaleString('es-MX') : String(cell.valor))}
          </span>
        )}
        {cell.unidad && <span style={{ fontSize: 14, color: '#aaa' }}>{cell.unidad}</span>}
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12.5, color: '#aaa', marginTop: 6 }}>
        <span>n: <strong style={{ color: '#ddd' }}>{cell.n ?? '—'}</strong></span>
        <span>confianza: <strong style={{ color: tone }}>{cell.confianza || '—'}</strong></span>
        {cell.medida && <span>medida: <strong style={{ color: '#ddd' }}>{cell.medida}</strong></span>}
        {cell.lado && <span>lado: <strong style={{ color: '#ddd' }}>{cell.lado}</strong></span>}
      </div>

      {/* PROCEDENCIA — de dónde sale el número (clave) */}
      <div style={{ marginTop: 12, padding: '12px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10 }}>
        <div style={{ fontSize: 10.5, color: '#777', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Procedencia · de dónde sale</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '5px 12px', fontSize: 12.5 }}>
          <span style={{ color: '#888' }}>Fuente</span><span style={{ color: '#ddd' }}>{p.fuente || '—'}</span>
          <span style={{ color: '#888' }}>Almacén</span>
          <span style={{ color: '#ddd' }}>{p.almacen_entrada || '—'} <span style={{ color: '#666' }}>→</span> {p.almacen_salida || '—'}</span>
          <span style={{ color: '#888' }}>Fórmula</span><span style={{ color: '#ccc', fontFamily: 'ui-monospace, monospace', fontSize: 11.5 }}>{p.formula || '—'}</span>
          <span style={{ color: '#888' }}>Cohorte</span><span style={{ color: '#ddd' }}>{p.cohorte || '—'}</span>
          <span style={{ color: '#888' }}>Actualizado</span><span style={{ color: '#ddd' }}>{p.actualizado || '—'}</span>
        </div>
      </div>
    </div>
  );
}

function RankingList({ ranking }) {
  const rows = ranking.ranking || [];
  const nums = rows.map((r) => (typeof r.valor === 'number' ? r.valor : null)).filter((v) => v != null);
  const mx = Math.max(1, ...nums.map(Math.abs));
  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 10 }}>
        {ranking.medida || ''} · por {ranking.por || ''}
      </div>
      {rows.length === 0 && <div style={{ fontSize: 12.5, color: '#666' }}>Sin datos para esta medida.</div>}
      <div style={{ display: 'grid', gap: 6 }}>
        {rows.map((r, i) => {
          const num = typeof r.valor === 'number' ? r.valor : null;
          const w = num != null ? (Math.abs(num) / mx) * 100 : 0;
          return (
            <div key={r.zona || i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
              <span style={{ width: 18, color: '#666', textAlign: 'right' }}>{i + 1}</span>
              <span style={{ width: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#ddd' }}>{r.zona}</span>
              <span style={{ flex: 1, height: 9, borderRadius: 2, background: 'var(--theme)', opacity: 0.7, width: `${w}%` }} />
              <strong style={{ width: 70, textAlign: 'right', color: 'var(--theme)' }}>
                {num == null ? (r.valor ?? '—') : num.toLocaleString('es-MX')}
              </strong>
              <span style={{ width: 96, fontSize: 11, color: '#888', textAlign: 'right' }}>
                n={r.n ?? '—'} · {r.confianza || '—'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
