// Superadmin · GRID DE MÉTRICAS — el mapa de TODAS las medidas (oferta/demanda/cruce) × dimensiones del cubo.
// Pivotea una medida + sus dimensiones aplicables → una celda con valor + PROCEDENCIA (de dónde sale el número).
// + Insights redactados + Ranking de zonas por medida.
import React, { useEffect, useMemo, useState } from 'react';
import { Card, Badge } from '../advisor/primitives';
import Indicador from './Indicador';
import { getGridOverview, getGridCell, getGridRanking, getGridInsights } from '../../api/superadminDemandIntel';

const card = { padding: '14px 18px' };
// Header de sección — contraste subido (consistente con los otros paneles del superadmin).
const lbl = { fontSize: 12, color: '#a8a8b3', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 };
// Etiqueta de selector — arriba del control, en lenguaje claro y legible (afordancia).
const fieldLbl = { fontSize: 11, color: '#a8a8b3', fontWeight: 600, marginBottom: 1 };
const selStyle = {
  background: 'rgba(255,255,255,0.04)', color: '#ddd', fontSize: 12.5,
  border: '1px solid rgba(255,255,255,0.14)', borderRadius: 8, padding: '6px 9px', minWidth: 130,
  cursor: 'pointer',
};
const inputStyle = { ...selStyle, cursor: 'text' };
const btnStyle = {
  padding: '7px 16px', borderRadius: 9999, border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer',
  background: 'var(--theme, #6366f1)', color: '#fff', fontSize: 12.5, fontWeight: 600,
};

// ── Skeleton de carga (pulso CSS, inyectado una vez · SSR-safe) ──────────────
const SKELETON_STYLE_ID = 'gridpanel-skeleton-keyframes';
function ensureSkeletonStyle() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(SKELETON_STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = SKELETON_STYLE_ID;
  el.textContent = '@keyframes gpPulse { 0%,100% { opacity: 0.35; } 50% { opacity: 0.85; } }';
  document.head.appendChild(el);
}
const skBlock = (w, h = 10, extra = {}) => ({
  width: w, height: h, borderRadius: 4,
  background: 'rgba(255,255,255,0.10)',
  animation: 'gpPulse 1.2s ease-in-out infinite',
  ...extra,
});
const srOnly = {
  position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
  overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0,
};

// Tarjeta-celda fantasma (insinúa nombre + valor grande + meta).
function SkeletonCell() {
  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.08)' }} role="status" aria-live="polite" aria-busy="true">
      <span style={srOnly}>Calculando la celda…</span>
      <div style={{ padding: '13px 16px', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 16, display: 'flex', flexDirection: 'column', gap: 8 }} aria-hidden="true">
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div style={skBlock(150, 12)} />
          <div style={skBlock(70, 16, { borderRadius: 9999 })} />
        </div>
        <div style={skBlock(110, 28, { marginTop: 2 })} />
        <div style={skBlock('70%', 9, { marginTop: 4 })} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <div style={skBlock(140, 9)} />
          <div style={skBlock(44, 9)} />
        </div>
      </div>
    </div>
  );
}

// Filas de ranking fantasma (insinúa número + zona + barra + valor).
function SkeletonRanking() {
  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)' }} role="status" aria-live="polite" aria-busy="true">
      <span style={srOnly}>Calculando el ranking…</span>
      <div style={skBlock(180, 9, { marginBottom: 12 })} aria-hidden="true" />
      <div style={{ display: 'grid', gap: 8 }} aria-hidden="true">
        {[82, 64, 90, 50, 72, 40].map((w, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={skBlock(14, 9)} />
            <div style={skBlock(130, 9)} />
            <div style={skBlock(`${w}%`, 9, { flex: 'none' })} />
            <div style={skBlock(44, 9, { marginLeft: 'auto' })} />
          </div>
        ))}
      </div>
    </div>
  );
}

// Etiquetas legibles por lado del cubo.
const LADO_LABEL = { oferta: 'Oferta (lo que existe)', demanda: 'Demanda (lo que se busca)', cruce: 'Cruce (oferta × demanda)' };
// Dimensiones que se piden con dropdown (vienen de overview.dimensiones); geo va aparte como texto.
const DIM_DROPDOWNS = ['tipologia', 'rango_m2', 'tier_precio', 'atributo', 'vista', 'etapa', 'ventana'];
const DIM_LABEL = {
  geo: 'Geografía', tipologia: 'Tipología', rango_m2: 'Rango m²', tier_precio: 'Tier de precio',
  atributo: 'Atributo', vista: 'Vista', etapa: 'Etapa', ventana: 'Ventana',
};
const GEO_NIVELES = ['colonia', 'alcaldia', 'corredor', 'desarrollo'];

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
    ensureSkeletonStyle();
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
            <span style={fieldLbl}>Medida a consultar</span>
            <select aria-label="Medida a consultar" style={{ ...selStyle, minWidth: 240 }} value={measureId}
              onChange={(e) => { setMeasureId(e.target.value); setCell(null); setCellErr(null); setDimVals({}); }}>
              {measureOptions}
            </select>
          </div>

          {/* Geo */}
          {measureDims.includes('geo') && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={fieldLbl}>Nivel geográfico</span>
                <select aria-label="Nivel geográfico" style={selStyle} value={geoNivel} onChange={(e) => setGeoNivel(e.target.value)}>
                  {GEO_NIVELES.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={fieldLbl}>Zona (escribe el nombre)</span>
                <input aria-label="Zona" style={inputStyle} value={geoValor} placeholder="p.ej. polanco"
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
                <span style={fieldLbl}>{DIM_LABEL[d] || d}</span>
                {opts ? (
                  <select aria-label={DIM_LABEL[d] || d} style={selStyle} value={dimVals[d] || ''}
                    onChange={(e) => setDimVals((v) => ({ ...v, [d]: e.target.value }))}>
                    <option value="">(todas)</option>
                    {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input aria-label={DIM_LABEL[d] || d} style={inputStyle} value={dimVals[d] || ''} placeholder="(todas)"
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
          <div style={{ fontSize: 11, color: '#a8a8b3', marginTop: 8 }}>
            {selectedMeasure.lado} · {selectedMeasure.celdas_teoricas != null ? `${Number(selectedMeasure.celdas_teoricas).toLocaleString('es-MX')} celdas teóricas` : ''}
            {selectedMeasure.n_minimo != null ? ` · n mínimo ${selectedMeasure.n_minimo}` : ''}
            {selectedMeasure.dims?.length ? ` · dims: ${selectedMeasure.dims.join(', ')}` : ''}
          </div>
        )}

        {/* Resultado de celda */}
        {cellLoading && <SkeletonCell />}
        {!cellLoading && cellErr && <div role="alert" style={{ color: '#dc2626', fontSize: 12.5, marginTop: 12 }}>{cellErr}</div>}
        {!cellLoading && cell && !cellErr && <CellResult cell={cell} />}
      </Card>

      {/* INSIGHTS */}
      <Card style={card}>
        <div style={lbl}>Insights del grid</div>
        {insights == null && (
          <div role="status" aria-live="polite" aria-busy="true">
            <span style={srOnly}>Cargando insights…</span>
            <div style={{ display: 'grid', gap: 10 }} aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <div key={i} style={{ borderLeft: '3px solid rgba(255,255,255,0.10)', paddingLeft: 12, display: 'grid', gap: 5 }}>
                  <div style={skBlock('85%', 11)} />
                  <div style={skBlock('45%', 9)} />
                </div>
              ))}
            </div>
          </div>
        )}
        {insights && insights.length === 0 && (
          <div style={{ fontSize: 12.5, color: '#a8a8b3', lineHeight: 1.45 }}>
            Aún no hay insights redactados. Aparecerán automáticamente cuando alguna medida acumule el volumen mínimo de datos.
          </div>
        )}
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
            <span style={fieldLbl}>Medida a rankear</span>
            <select aria-label="Medida a rankear" style={{ ...selStyle, minWidth: 240 }} value={rankMeasure} onChange={(e) => setRankMeasure(e.target.value)}>
              {measureOptions}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={fieldLbl}>Agrupar por</span>
            <select aria-label="Agrupar por" style={selStyle} value={rankPor} onChange={(e) => setRankPor(e.target.value)}>
              {GEO_NIVELES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <button style={btnStyle} onClick={consultarRanking} disabled={rankLoading}>
            {rankLoading ? 'Cargando…' : 'Ver ranking'}
          </button>
        </div>

        {rankLoading && <SkeletonRanking />}
        {!rankLoading && rankErr && <div role="alert" style={{ color: '#dc2626', fontSize: 12.5, marginTop: 12 }}>{rankErr}</div>}
        {!rankLoading && ranking && !rankErr && <RankingList ranking={ranking} />}
      </Card>
    </div>
  );
}

function CellResult({ cell }) {
  const p = cell.procedencia || {};
  const dimsObj = cell.dims || {};

  // Granularidad legible: si la celda trae geo, muéstrala; si no, ciudad por defecto.
  const granularidad = dimsObj.geo != null && String(dimsObj.geo).trim() !== ''
    ? `geo: ${dimsObj.geo}`
    : 'ciudad (CDMX)';

  // Dimensión legible: las dims activas que NO son geo, en lenguaje humano.
  const dimEntries = Object.entries(dimsObj)
    .filter(([k, v]) => k !== 'geo' && v != null && String(v).trim() !== '')
    .map(([k, v]) => `${DIM_LABEL[k] || k}: ${v}`);
  const dimension = dimEntries.length ? dimEntries.join(' · ') : '—';

  const fuente = Array.isArray(p.fuente) ? p.fuente.join(' + ') : p.fuente;

  const valorVacio = cell.valor == null || (typeof cell.valor === 'string' && cell.valor.trim() === '');
  const esLatente = !!cell.latente || valorVacio;

  const ind = {
    nombre: cell.medida,
    valor: cell.valor,
    unidad: cell.unidad,
    comparativo: { vs_ciudad: null, señal: '—', texto: p.cohorte ? `cohorte: ${p.cohorte}` : '' },
    granularidad,
    dimension,
    uso: p.formula ? `Cómo se calcula: ${p.formula}` : '',
    fuente,
    n: cell.n,
    confianza: cell.confianza,
    latente: esLatente,
    // Texto explícito acompaña al gris: "latente" + porqué (accesibilidad: no sólo color).
    razon_latente: esLatente ? 'n por debajo del mínimo — se activa cuando esta medida acumule volumen' : null,
  };

  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
      {esLatente && (
        <div style={{
          fontSize: 12, color: '#f59e0b', lineHeight: 1.45, marginBottom: 10,
          background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
          borderRadius: 8, padding: '8px 11px',
        }}>
          <strong>Medida latente.</strong>{' '}
          <span style={{ color: '#cbb792' }}>Todavía no tiene valor en esta celda: se activa cuando acumule el volumen mínimo de datos.</span>
        </div>
      )}
      <Indicador ind={ind} />
    </div>
  );
}

function RankingList({ ranking }) {
  const rows = ranking.ranking || [];
  const nums = rows.map((r) => (typeof r.valor === 'number' ? r.valor : null)).filter((v) => v != null);
  const mx = Math.max(1, ...nums.map(Math.abs));
  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
      <div style={{ fontSize: 11, color: '#a8a8b3', marginBottom: 10 }}>
        {ranking.medida || ''} · por {ranking.por || ''}
      </div>
      {rows.length === 0 && (
        <div style={{ fontSize: 12.5, color: '#a8a8b3', lineHeight: 1.45 }}>
          Esta medida está latente: no hay zonas con datos suficientes para rankear todavía. Se llenará cuando acumule volumen.
        </div>
      )}
      <div style={{ display: 'grid', gap: 6 }}>
        {rows.map((r, i) => {
          const num = typeof r.valor === 'number' ? r.valor : null;
          const w = num != null ? (Math.abs(num) / mx) * 100 : 0;
          const valTxt = num == null ? (r.valor ?? '—') : num.toLocaleString('es-MX');
          // Confianza: texto explícito acompaña al color (accesibilidad).
          const conf = r.confianza || '—';
          const confColor = conf === 'alta' ? '#22c55e' : conf === 'media' ? '#f59e0b' : '#a8a8b3';
          return (
            <div key={r.zona || i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
              <span style={{ width: 18, color: '#a8a8b3', textAlign: 'right' }}>{i + 1}</span>
              <span style={{ width: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#ddd' }}>{r.zona}</span>
              {/* La barra comunica magnitud por ancho; el aria-label da el equivalente textual. */}
              <span role="img" aria-label={`${r.zona}: ${valTxt}`} title={`${r.zona}: ${valTxt}`}
                style={{ flex: 1, height: 9, borderRadius: 2, background: 'var(--theme)', opacity: 0.7, width: `${w}%` }} />
              <strong style={{ width: 70, textAlign: 'right', color: 'var(--theme)' }}>{valTxt}</strong>
              <span style={{ width: 110, fontSize: 11, color: '#a8a8b3', textAlign: 'right' }}>
                n={r.n ?? '—'} · <span style={{ color: confColor, fontWeight: 600 }}>conf {conf}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
