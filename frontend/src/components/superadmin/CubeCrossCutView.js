/**
 * CubeCrossCutView — vista de CORTE CRUZADO del cubo de métricas (surfacea queryCrossCut + getCacheStats,
 * que estaban en el api sin UI). Cruza hasta 3 dimensiones del cubo (tipo × rango × década, etc.) y muestra
 * la matriz OLAP resultante: cada fila = una celda única (combo de dims) con sus KPIs agregados.
 *
 * Backend: GET /api/superadmin/metrics-cube/cross-cut?dimensions=a,b,c&period=&property_type=&price_tier=
 *          GET /api/superadmin/metrics-cube/cache-stats  (telemetría de la caché in-process del cubo)
 * Tema oscuro, mismas convenciones visuales que SuperadminMetricsCube.
 */
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { LayoutGrid, AlertCircle, Database } from 'lucide-react';
import { queryCrossCut, getCacheStats } from '../../api/superadminMetricsCube';

// Dimensiones cortables del cubo (cube_olap_engine · máx 3 simultáneas) con etiqueta humana.
const DIMS = [
  { key: 'property_type', label: 'Tipo' },
  { key: 'price_tier', label: 'Rango de precio' },
  { key: 'zone', label: 'Colonia' },
  { key: 'year_built_decade', label: 'Década' },
  { key: 'tipologia', label: 'Tipología' },
  { key: 'recamaras', label: 'Recámaras' },
  { key: 'banda_m2', label: 'Rango m²' },
  { key: 'parking_type', label: 'Estacionamiento' },
  { key: 'has_roof', label: 'Roof garden' },
  { key: 'has_bodega', label: 'Bodega' },
];
const DIM_LABEL = Object.fromEntries(DIMS.map((d) => [d.key, d.label]));
const MAX_DIMS = 3;

// Filtros pre-query (property_type / price_tier). null = todos.
const PT_FILTER = [['all', 'Todos', null], ['depto', 'Depto', 'depto'], ['casa', 'Casa', 'casa'], ['loft', 'Loft', 'loft'], ['town', 'Town', 'town'], ['ph', 'PH', 'ph']];
const PZ_FILTER = [['all', 'Todos', null], ['entry', 'Entrada', 'entry'], ['mid', 'Medio', 'mid'], ['luxury', 'Luxury', 'luxury'], ['ultraluxury', 'Ultra', 'ultraluxury']];

// Formatters.
const nf0 = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 });
const money = (v) => (v == null ? '—' : `$${nf0.format(Math.round(v))}`);
const moneyShort = (v) => {
  if (v == null) return '—';
  if (v >= 1e6) return `$${nf1.format(v / 1e6)}M`;
  if (v >= 1e3) return `$${nf0.format(v / 1e3)}K`;
  return `$${nf0.format(v)}`;
};
const int = (v) => (v == null ? '—' : nf0.format(v));
const pct = (v) => (v == null ? '—' : `${nf1.format(v)}%`);
const num1 = (v) => (v == null ? '—' : nf1.format(v));

// KPIs conocidos (orden + etiqueta + formato). Solo se muestran los presentes en la data.
const MEASURES = [
  { key: 'units_total', label: 'Unidades', fmt: int },
  { key: 'units_available', label: 'Disponibles', fmt: int },
  { key: 'units_sold', label: 'Vendidas', fmt: int },
  { key: 'units_reserved', label: 'Apartadas', fmt: int },
  { key: 'absorcion_pct', label: 'Absorción', fmt: pct },
  { key: 'avg_price_per_m2', label: '$/m²', fmt: money },
  { key: 'avg_price_mxn', label: 'Precio prom', fmt: money },
  { key: 'avg_m2', label: 'm² prom', fmt: num1 },
  { key: 'conversion_rate', label: 'Conversión', fmt: pct },
  { key: 'por_cobrar_mxn', label: 'Por cobrar', fmt: moneyShort },
  { key: 'demand_interactions', label: 'Interacciones', fmt: int },
  { key: 'demand_visitors', label: 'Visitantes', fmt: int },
  { key: 'interest_score', label: 'Interés', fmt: num1 },
];

const tc = (s) => String(s ?? '—').replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const dimCellText = (key, val) => {
  if (val == null || val === '') return '—';
  if (key === 'has_roof' || key === 'has_bodega') return (val === true || val === 'true' || val === 1 || val === '1') ? 'Sí' : 'No';
  return tc(val);
};

const CTRL = { fontFamily: 'DM Sans', fontWeight: 600, fontSize: 10.5, cursor: 'pointer', padding: '4px 10px', borderRadius: 9999 };
const pill = (on) => ({
  ...CTRL,
  background: on ? 'rgba(var(--theme-rgb),0.16)' : 'rgba(255,255,255,0.03)',
  border: `1px solid ${on ? 'rgba(var(--theme-rgb),0.45)' : 'rgba(255,255,255,0.07)'}`,
  color: on ? 'var(--theme)' : 'rgba(240,235,224,0.65)',
});
const LABEL = { fontFamily: 'DM Mono, monospace', fontSize: 9.5, color: 'rgba(240,235,224,0.70)', textTransform: 'uppercase', letterSpacing: '0.07em', marginRight: 4 };

export default function CubeCrossCutView({ period = 'current' }) {
  const [dims, setDims] = useState(['property_type', 'price_tier']);
  const [propertyType, setPropertyType] = useState(null);
  const [priceTier, setPriceTier] = useState(null);
  const [data, setData] = useState(null);
  const [cache, setCache] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [sort, setSort] = useState({ key: 'units_total', dir: 'desc' });

  const toggleDim = useCallback((k) => {
    setDims((cur) => {
      if (cur.includes(k)) return cur.filter((x) => x !== k);
      if (cur.length >= MAX_DIMS) return cur;   // tope 3
      return [...cur, k];
    });
  }, []);

  useEffect(() => {
    if (!dims.length) { setData({ matrix: [] }); return undefined; }
    let alive = true;
    setLoading(true); setErr(null);
    Promise.all([
      queryCrossCut({ dimensions: dims, period, propertyType, priceTier }),
      getCacheStats().catch(() => null),
    ]).then(([res, cs]) => {
      if (!alive) return;
      setData(res || { matrix: [] });
      setCache(cs);
    }).catch((e) => { if (alive) setErr(e?.message || 'No se pudo cargar el corte cruzado.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [dims, period, propertyType, priceTier]);

  const matrix = data?.matrix || [];

  // Measures presentes en la data (intersección con el catálogo conocido).
  const cols = useMemo(() => {
    const present = new Set();
    matrix.forEach((r) => Object.keys(r.kpis || {}).forEach((k) => present.add(k)));
    return MEASURES.filter((m) => present.has(m.key));
  }, [matrix]);

  // Clave de orden EFECTIVA: si sort.key ya no está presente (dimensión deseleccionada o KPI ausente en la data),
  // cae a la primera columna disponible → el orden nunca queda "roto en silencio" apuntando a una columna fantasma.
  const sortKey = useMemo(() => {
    const validKpi = cols.some((c) => c.key === sort.key);
    if (dims.includes(sort.key) || validKpi) return sort.key;
    return dims[0] || (cols[0] && cols[0].key) || null;
  }, [sort.key, dims, cols]);

  const rows = useMemo(() => {
    const arr = [...matrix];
    if (!sortKey) return arr;
    const isDim = dims.includes(sortKey);
    arr.sort((a, b) => {
      const va = isDim ? a[sortKey] : (a.kpis || {})[sortKey];
      const vb = isDim ? b[sortKey] : (b.kpis || {})[sortKey];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'es');
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [matrix, sortKey, sort.dir, dims]);

  const clickSort = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }));
  const arrow = (key) => (sortKey === key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '');

  const th = { fontFamily: 'DM Mono, monospace', fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(240,235,224,0.55)', padding: '8px 10px', textAlign: 'right', cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none', borderBottom: '1px solid rgba(255,255,255,0.08)' };
  const thL = { ...th, textAlign: 'left' };
  const td = { fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.88)', padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };
  const tdL = { ...td, textAlign: 'left', fontWeight: 700, color: 'var(--cream)' };

  return (
    <div data-testid="cube-crosscut-view">
      {/* Controles: dimensiones (máx 3) + filtros */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 10, padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
        <LayoutGrid size={12} style={{ color: 'var(--theme)' }} />
        <span style={LABEL}>Cruzar (máx {MAX_DIMS}):</span>
        {DIMS.map((d) => {
          const on = dims.includes(d.key);
          const disabled = !on && dims.length >= MAX_DIMS;
          return (
            <button key={d.key} data-testid={`cc-dim-${d.key}`} onClick={() => toggleDim(d.key)} disabled={disabled}
              style={{ ...pill(on), opacity: disabled ? 0.35 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}>
              {on ? `${dims.indexOf(d.key) + 1} · ` : ''}{d.label}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 14, padding: '8px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
        <span style={LABEL}>Filtrar tipo:</span>
        {PT_FILTER.map(([k, label, val]) => (
          <button key={`ccpt-${k}`} data-testid={`cc-pt-${k}`} onClick={() => setPropertyType(val)} style={pill(propertyType === val)}>{label}</button>
        ))}
        <span style={{ ...LABEL, marginLeft: 8 }}>Rango:</span>
        {PZ_FILTER.map(([k, label, val]) => (
          <button key={`ccpz-${k}`} data-testid={`cc-pz-${k}`} onClick={() => setPriceTier(val)} style={pill(priceTier === val)}>{label}</button>
        ))}
      </div>

      {/* Telemetría de la caché del cubo */}
      {cache && (
        <div data-testid="cube-cache-stats" style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', marginBottom: 14, padding: '8px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, ...LABEL, marginRight: 2 }}><Database size={11} style={{ color: 'rgba(240,235,224,0.55)' }} /> Caché del cubo</span>
          {[['Aciertos', int(cache.hits)], ['Fallos', int(cache.misses)], ['Tasa', cache.hit_rate == null ? '—' : `${nf1.format(cache.hit_rate * 100)}%`], ['Entradas', `${int(cache.size)}${cache.maxsize ? ` / ${int(cache.maxsize)}` : ''}`], ['TTL', cache.ttl == null ? '—' : `${cache.ttl}s`]].map(([l, v]) => (
            <span key={l} style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.72)' }}>
              {l}: <b style={{ color: 'var(--cream)', fontVariantNumeric: 'tabular-nums' }}>{v}</b>
            </span>
          ))}
        </div>
      )}

      {loading && <div data-testid="cc-loading" style={{ padding: 26, fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.70)' }}>Calculando corte cruzado…</div>}

      {!loading && err && (
        <div style={{ padding: '16px 18px', borderRadius: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#fecaca', fontFamily: 'DM Sans', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertCircle size={15} /> {err}
        </div>
      )}

      {!loading && !err && dims.length === 0 && (
        <div style={{ padding: 26, fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.70)' }}>Elige al menos una dimensión para cruzar.</div>
      )}

      {!loading && !err && dims.length > 0 && rows.length === 0 && (
        <div style={{ padding: 26, borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.70)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertCircle size={14} /> Sin celdas para esta combinación en el periodo elegido.
        </div>
      )}

      {!loading && !err && rows.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.72)' }}>
              {rows.length} {rows.length === 1 ? 'celda' : 'celdas'} · {dims.map((d) => DIM_LABEL[d] || d).join(' × ')}
            </div>
            {data?.cache && <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 9.5, color: data.cache === 'hit' ? '#22c55e' : 'rgba(240,235,224,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{data.cache === 'hit' ? '● caché' : '○ recalculado'}</span>}
          </div>
          <div style={{ overflowX: 'auto', borderRadius: 14, border: '1px solid rgba(255,255,255,0.07)' }}>
            <table data-testid="cc-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
              <thead>
                <tr>
                  {dims.map((d) => (
                    <th key={d} style={thL} onClick={() => clickSort(d)}>{DIM_LABEL[d] || d}{arrow(d)}</th>
                  ))}
                  {cols.map((m) => (
                    <th key={m.key} style={th} onClick={() => clickSort(m.key)}>{m.label}{arrow(m.key)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ background: i % 2 ? 'rgba(255,255,255,0.015)' : 'transparent' }}>
                    {dims.map((d) => (
                      <td key={d} style={tdL}>{dimCellText(d, r[d])}</td>
                    ))}
                    {cols.map((m) => (
                      <td key={m.key} style={td}>{m.fmt((r.kpis || {})[m.key])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240,235,224,0.45)', marginTop: 8 }}>
            Cada fila es una celda del cubo (combo único de las dimensiones cruzadas), con sus KPIs agregados a nivel unidad. Máximo {MAX_DIMS} dimensiones.
          </div>
        </>
      )}
    </div>
  );
}
