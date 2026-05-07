// W2.5 SA6 — Granular Metrics Cube page
// Drill-down: city → alcaldia → colonia → development → unit
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import CubeBreadcrumb from '../../components/superadmin/CubeBreadcrumb';
import CubeKpiStrip from '../../components/superadmin/CubeKpiStrip';
import CubeHeatmap from '../../components/superadmin/CubeHeatmap';
import CubeDrilldownTable from '../../components/superadmin/CubeDrilldownTable';
import { Layers, RefreshCw, Map as MapIcon, ChevronDown, AlertCircle, Sparkles } from 'lucide-react';
import {
  getTierDetail, getTierChildren, getHeatmap, getComparables, getUnitDetail,
  refreshAggregations,
} from '../../api/superadminMetricsCube';

const PERIODS = [
  { key: 'current', label: 'Actual' },
  { key: '7d', label: '7d' },
  { key: '30d', label: '30d' },
  { key: '90d', label: '90d' },
];

const HEATMAP_METRICS = [
  { key: 'avg_price_per_m2', label: '$/m² promedio' },
  { key: 'avg_price_mxn', label: 'Precio promedio' },
  { key: 'leads_count', label: 'Leads' },
  { key: 'conversion_rate', label: 'Conversión %' },
  { key: 'units_total', label: 'Unidades totales' },
];

// Map current tier → next tier shown in heatmap (one level deeper)
const HEATMAP_TIER_BY_LEVEL = {
  city: 'alcaldia',
  alcaldia: 'colonia',
  colonia: 'development',
  development: 'development',
};

const ROOT = { tier: 'city', tier_id: 'cdmx', name: 'Ciudad de México' };

function fmtMxn(v) {
  if (v == null) return '—';
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}k`;
  return `$${Math.round(v).toLocaleString('es-MX')}`;
}

function ComparablesPanel({ tierId }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [radius, setRadius] = useState(2);

  useEffect(() => {
    if (!open || !tierId) return;
    setLoading(true);
    getComparables(tierId, { radiusKm: radius, limit: 20 })
      .then(r => setItems(r.items || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [open, tierId, radius]);

  if (!tierId) return null;

  return (
    <div data-testid="cube-comparables" style={{
      marginTop: 18, borderRadius: 14, background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden',
    }}>
      <button
        data-testid="cube-comparables-toggle"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', padding: '11px 14px', background: 'transparent', border: 'none',
          color: 'var(--cream)', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12.5,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer',
        }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Sparkles size={11} color="#818CF8" />
          Comparables a {radius}km
        </span>
        <ChevronDown size={13} style={{
          transform: open ? 'rotate(180deg)' : 'rotate(0)',
          transition: 'transform 180ms', opacity: 0.55,
        }} />
      </button>
      {open && (
        <div style={{ padding: '0 14px 14px' }}>
          <div style={{ display: 'flex', gap: 5, marginBottom: 10 }}>
            {[1, 2, 5, 10].map(km => (
              <button key={km} onClick={() => setRadius(km)}
                data-testid={`cube-comp-radius-${km}`}
                style={{
                  padding: '4px 10px', borderRadius: 9999,
                  background: radius === km ? 'rgba(99,102,241,0.16)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${radius === km ? 'rgba(99,102,241,0.45)' : 'rgba(255,255,255,0.10)'}`,
                  color: radius === km ? '#818CF8' : 'rgba(240,235,224,0.65)',
                  fontFamily: 'DM Sans', fontWeight: 600, fontSize: 11, cursor: 'pointer',
                }}>{km}km</button>
            ))}
          </div>
          {loading && <div style={{ padding: 14, fontFamily: 'DM Sans', fontSize: 12,
            color: 'rgba(240,235,224,0.45)' }}>Cargando…</div>}
          {!loading && items.length === 0 && (
            <div style={{ padding: 14, fontFamily: 'DM Sans', fontSize: 12,
              color: 'rgba(240,235,224,0.45)' }}>Sin comparables en este radio.</div>
          )}
          {!loading && items.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {items.map(c => (
                <div key={c.id} data-testid={`cube-comp-${c.id}`}
                  style={{
                    padding: '8px 11px', borderRadius: 9,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                  }}>
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 600,
                      color: 'var(--cream)' }}>{c.name}</div>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10.5,
                      color: 'rgba(240,235,224,0.45)' }}>
                      {c.colonia} · {c.distance_km}km · {c.units_total} u · {c.units_available} disp.
                    </div>
                  </div>
                  <span style={{ padding: '3px 10px', borderRadius: 9999,
                    background: 'rgba(99,102,241,0.10)', color: '#818CF8',
                    fontFamily: 'DM Mono, monospace', fontSize: 10.5 }}>
                    {fmtMxn(c.avg_price_per_m2)}/m²
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function UnitDetailView({ unitId, onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!unitId) return;
    setLoading(true); setErr('');
    getUnitDetail(unitId)
      .then(setData)
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, [unitId]);

  if (loading) return <div data-testid="cube-unit-loading" style={{
    padding: 30, fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.45)',
  }}>Cargando unidad…</div>;
  if (err) return <div data-testid="cube-unit-error" style={{
    padding: 14, fontFamily: 'DM Sans', fontSize: 12.5, color: '#F87171',
  }}>{err}</div>;
  if (!data) return null;
  const u = data.unit || {};
  const dev = data.development || {};
  const ph = data.price_history || [];

  // Sparkline path (W2.3 pattern reuse)
  const phVals = ph.map(p => p.price || p.value || 0).filter(v => v > 0);
  let sparkPath = '';
  if (phVals.length > 1) {
    const min = Math.min(...phVals);
    const max = Math.max(...phVals);
    const range = max - min || 1;
    const W = 220, H = 50;
    sparkPath = phVals.map((v, i) => {
      const x = (i / (phVals.length - 1)) * W;
      const y = H - ((v - min) / range) * H;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');
  }

  return (
    <div data-testid="cube-unit-detail" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{
        padding: 18, borderRadius: 14,
        background: 'rgba(99,102,241,0.05)',
        border: '1px solid rgba(99,102,241,0.20)',
      }}>
        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10.5,
          color: 'rgba(240,235,224,0.55)', marginBottom: 4 }}>
          {dev.name || u.development_id}
        </div>
        <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 24,
          color: 'var(--cream)', margin: '0 0 6px' }}>
          Unidad {u.unit_number || u.id}
        </h2>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap',
          fontFamily: 'DM Sans', fontSize: 12.5, color: 'rgba(240,235,224,0.65)' }}>
          <span>{u.bedrooms} rec · {u.bathrooms} baños · {u.parking_spots} estac.</span>
          <span>{u.m2_privative || u.size_m2 || '—'} m² priv.</span>
          <span>Estado: <strong style={{ color: '#4ADE80' }}>{u.status}</strong></span>
          <span style={{ fontFamily: 'DM Mono, monospace', color: '#818CF8' }}>
            {u.price_display || fmtMxn(u.price || u.price_mxn)}
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14,
        gridAutoRows: 'auto' }} className="cube-unit-grid">
        <div style={{ padding: 14, borderRadius: 12,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.07)',
        }}>
          <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.07em',
            color: 'rgba(240,235,224,0.55)', marginBottom: 8 }}>
            Histórico de precios
          </div>
          {sparkPath ? (
            <svg viewBox="0 0 220 50" width="100%" height="50"
              data-testid="cube-unit-sparkline">
              <path d={sparkPath} stroke="url(#cubeSparkGrad)" strokeWidth="2.5"
                fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <defs>
                <linearGradient id="cubeSparkGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#6366F1" />
                  <stop offset="100%" stopColor="#EC4899" />
                </linearGradient>
              </defs>
            </svg>
          ) : (
            <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.40)' }}>
              Sin histórico disponible.
            </div>
          )}
        </div>
        <div style={{ padding: 14, borderRadius: 12,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.07)',
        }}>
          <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.07em',
            color: 'rgba(240,235,224,0.55)', marginBottom: 8 }}>
            Score IE zona
          </div>
          <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 30,
            color: data.ie_score_zone != null ? '#818CF8' : 'rgba(240,235,224,0.30)',
            letterSpacing: '-0.025em' }}>
            {data.ie_score_zone != null ? data.ie_score_zone.toFixed(1) : '—'}
          </div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 11.5,
            color: 'rgba(240,235,224,0.55)' }}>
            {dev.colonia} · {dev.alcaldia}
          </div>
        </div>
      </div>

      <div style={{ padding: 14, borderRadius: 12,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
      }}>
        <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '0.07em',
          color: 'rgba(240,235,224,0.55)', marginBottom: 8 }}>
          Leads asociados ({data.leads_count})
        </div>
        {data.leads.length === 0 ? (
          <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.40)' }}>
            Sin leads para esta unidad.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {data.leads.slice(0, 10).map((l, i) => (
              <div key={l.lead_id || i} style={{
                padding: '6px 10px', borderRadius: 8,
                background: 'rgba(255,255,255,0.02)',
                fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.65)',
              }}>
                {l.name || l.email || '—'} · <span style={{ fontFamily: 'DM Mono, monospace',
                  color: '#818CF8' }}>{l.status || 'nuevo'}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <button onClick={onBack} data-testid="cube-unit-back"
        style={{
          padding: '8px 16px', borderRadius: 9999, alignSelf: 'flex-start',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.10)',
          color: 'rgba(240,235,224,0.65)', fontFamily: 'DM Sans', fontWeight: 600,
          fontSize: 12, cursor: 'pointer',
        }}>← Volver al desarrollo</button>
    </div>
  );
}

export default function SuperadminMetricsCube({ user, onLogout }) {
  const [path, setPath] = useState([ROOT]);
  const [period, setPeriod] = useState('current');
  const [node, setNode] = useState(null);
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState('');
  const [heatmapMetric, setHeatmapMetric] = useState('avg_price_per_m2');
  const [heatmapPoints, setHeatmapPoints] = useState([]);
  const [unitDetailId, setUnitDetailId] = useState(null);
  const [search, setSearch] = useState('');

  const cur = path[path.length - 1];
  const isUnit = cur.tier === 'unit';
  const isDev = cur.tier === 'development';

  const heatmapTier = useMemo(() => {
    if (isUnit) return null;
    return HEATMAP_TIER_BY_LEVEL[cur.tier] || 'colonia';
  }, [cur.tier, isUnit]);

  const loadDetail = useCallback(async () => {
    if (isUnit) return;
    setLoading(true);
    try {
      const r = await getTierDetail(cur.tier, cur.tier_id, { period });
      setNode(r.node);
      setChildren(r.children || []);
    } catch (e) {
      setToast(e.message || 'Error al cargar nodo');
    } finally {
      setLoading(false);
    }
  }, [cur.tier, cur.tier_id, period, isUnit]);

  const loadHeatmap = useCallback(async () => {
    if (!heatmapTier) { setHeatmapPoints([]); return; }
    try {
      const r = await getHeatmap({ metric: heatmapMetric, tier: heatmapTier, period });
      setHeatmapPoints(r.items || []);
    } catch {
      setHeatmapPoints([]);
    }
  }, [heatmapMetric, heatmapTier, period]);

  useEffect(() => { loadDetail(); }, [loadDetail]);
  useEffect(() => { loadHeatmap(); }, [loadHeatmap]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(''), 2500);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const drillTo = (childRow) => {
    const next = childRow.tier;
    if (next === 'unit') {
      setUnitDetailId(childRow.tier_id);
      return;
    }
    setPath(p => [...p, { tier: childRow.tier, tier_id: childRow.tier_id, name: childRow.name }]);
  };

  const onBreadcrumb = (i) => {
    setPath(p => p.slice(0, i + 1));
    setUnitDetailId(null);
  };

  const onHeatmapDrill = async (pt) => {
    // Each heatmap dot represents the heatmapTier; if it differs from cur, push it
    setPath(p => [...p, { tier: pt.tier, tier_id: pt.tier_id, name: pt.name }]);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      const r = await refreshAggregations();
      setToast(`Agregados recomputados (${r.elapsed_s || 0}s)`);
      await loadDetail();
      await loadHeatmap();
    } catch (e) {
      setToast(e.message || 'Error');
    } finally {
      setRefreshing(false);
    }
  };

  // Filter children by search
  const filteredChildren = useMemo(() => {
    if (!search.trim()) return children;
    const q = search.toLowerCase();
    return children.filter(c => (c.name || '').toLowerCase().includes(q));
  }, [children, search]);

  return (
    <SuperadminLayout user={user} onLogout={onLogout}>
      <div data-testid="superadmin-metrics-cube">
        {toast && (
          <div data-testid="cube-toast" style={{
            position: 'fixed', top: 76, right: 20, zIndex: 2000,
            padding: '11px 18px', borderRadius: 10,
            background: 'rgba(99,102,241,0.18)',
            border: '1px solid rgba(99,102,241,0.35)',
            color: '#818CF8', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600,
            backdropFilter: 'blur(24px)',
          }}>{toast}</div>
        )}

        <div style={{
          marginBottom: 20, display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap',
        }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <Layers size={20} color="#818CF8" />
              <h1 style={{
                fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: 'var(--cream)',
                margin: 0, letterSpacing: '-0.025em',
              }}>Cubo de métricas</h1>
            </div>
            <p style={{
              fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.50)', margin: 0,
            }}>
              Vista nano→macro · alcaldía → colonia → desarrollo → unidad · drill-down geo + tabla.
            </p>
          </div>

          {/* Period switcher */}
          <div style={{ display: 'flex', gap: 4 }}>
            {PERIODS.map(p => (
              <button key={p.key} data-testid={`cube-period-${p.key}`}
                onClick={() => setPeriod(p.key)}
                style={{
                  padding: '7px 14px', borderRadius: 9999,
                  background: period === p.key ? 'rgba(99,102,241,0.16)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${period === p.key ? 'rgba(99,102,241,0.45)' : 'rgba(255,255,255,0.07)'}`,
                  color: period === p.key ? '#818CF8' : 'rgba(240,235,224,0.55)',
                  fontFamily: 'DM Sans', fontWeight: 600, fontSize: 11.5, cursor: 'pointer',
                }}>{p.label}</button>
            ))}
          </div>

          <button onClick={onRefresh} disabled={refreshing}
            data-testid="cube-refresh-btn"
            style={{
              padding: '8px 14px', borderRadius: 9999,
              background: 'rgba(99,102,241,0.10)',
              border: '1px solid rgba(99,102,241,0.30)',
              color: '#818CF8', fontFamily: 'DM Sans', fontWeight: 600,
              fontSize: 11.5, cursor: refreshing ? 'wait' : 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 5,
              opacity: refreshing ? 0.6 : 1,
            }}>
            <RefreshCw size={11} style={{
              animation: refreshing ? 'spin 1s linear infinite' : 'none',
            }} />
            {refreshing ? 'Refrescando…' : 'Refrescar agregados'}
          </button>
        </div>

        <CubeBreadcrumb path={path} onNavigate={onBreadcrumb} />

        {unitDetailId ? (
          <UnitDetailView unitId={unitDetailId} onBack={() => setUnitDetailId(null)} />
        ) : (
          <>
            {loading && (
              <div data-testid="cube-loading" style={{
                padding: 30, fontFamily: 'DM Sans', fontSize: 13,
                color: 'rgba(240,235,224,0.45)',
              }}>Cargando agregados…</div>
            )}

            {!loading && node && (
              <CubeKpiStrip kpis={node.kpis} />
            )}

            {!loading && (
              <div className="cube-grid" style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
              }}>
                <div>
                  {/* Heatmap header: metric selector */}
                  <div style={{
                    marginBottom: 8, display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap',
                  }}>
                    <MapIcon size={11} style={{ color: 'rgba(240,235,224,0.55)' }} />
                    <span style={{
                      fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 700,
                      textTransform: 'uppercase', letterSpacing: '0.07em',
                      color: 'rgba(240,235,224,0.55)', marginRight: 4,
                    }}>Heatmap · {heatmapTier || '—'}</span>
                    {HEATMAP_METRICS.map(m => (
                      <button key={m.key} data-testid={`cube-heatmap-metric-${m.key}`}
                        onClick={() => setHeatmapMetric(m.key)}
                        style={{
                          padding: '3px 9px', borderRadius: 9999,
                          background: heatmapMetric === m.key
                            ? 'rgba(99,102,241,0.16)' : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${heatmapMetric === m.key
                            ? 'rgba(99,102,241,0.45)' : 'rgba(255,255,255,0.07)'}`,
                          color: heatmapMetric === m.key ? '#818CF8' : 'rgba(240,235,224,0.65)',
                          fontFamily: 'DM Sans', fontWeight: 600, fontSize: 10.5, cursor: 'pointer',
                        }}>{m.label}</button>
                    ))}
                  </div>
                  {heatmapTier ? (
                    <CubeHeatmap points={heatmapPoints} metric={heatmapMetric}
                      onDrill={onHeatmapDrill} />
                  ) : (
                    <div style={{
                      height: 300, borderRadius: 14,
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.07)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.45)',
                    }}>
                      <AlertCircle size={14} style={{ marginRight: 6 }} />
                      Sin mapa para este nivel.
                    </div>
                  )}
                </div>

                <div>
                  <div style={{
                    marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center',
                  }}>
                    <input
                      data-testid="cube-search"
                      value={search} onChange={e => setSearch(e.target.value)}
                      placeholder={`Buscar ${node?.next_tier || ''}…`}
                      style={{
                        flex: 1, padding: '6px 12px', borderRadius: 9999,
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.10)',
                        color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12,
                        outline: 'none',
                      }} />
                    <span style={{
                      padding: '4px 10px', borderRadius: 9999,
                      background: 'rgba(99,102,241,0.10)', color: '#818CF8',
                      fontFamily: 'DM Mono, monospace', fontSize: 10.5,
                    }}>{filteredChildren.length} {node?.next_tier || ''}</span>
                  </div>
                  <CubeDrilldownTable
                    items={filteredChildren}
                    onDrill={drillTo}
                    density="compact"
                  />
                </div>
              </div>
            )}

            {!loading && isDev && cur.tier_id && (
              <ComparablesPanel tierId={cur.tier_id} />
            )}
          </>
        )}
      </div>

      <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
        @media (max-width: 900px) {
          .cube-grid { grid-template-columns: 1fr !important; }
          .cube-unit-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </SuperadminLayout>
  );
}
