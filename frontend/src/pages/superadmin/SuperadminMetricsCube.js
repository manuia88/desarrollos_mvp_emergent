// W2.5 SA6 — Granular Metrics Cube page
// Drill-down: city → alcaldia → colonia → development → unit
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import CubeBreadcrumb from '../../components/superadmin/CubeBreadcrumb';
import CubeKpiStrip from '../../components/superadmin/CubeKpiStrip';
import CubeHeatmap from '../../components/superadmin/CubeHeatmap';
import CubeDrilldownTable from '../../components/superadmin/CubeDrilldownTable';
import CubeIntelPanel from '../../components/superadmin/CubeIntelPanel';
import CubeCrossCutView from '../../components/superadmin/CubeCrossCutView';
import CubeActuarView from '../../components/superadmin/CubeActuarView';
import { Layers, RefreshCw, Map as MapIcon, ChevronDown, AlertCircle, Sparkles, LayoutGrid, Send } from 'lucide-react';
import {
  getTierDetail, getTierChildren, getHeatmap, getComparables, getUnitDetail,
  refreshAggregations, compareZones, triggerBackfill, getBackfillStatus, listTier,
} from '../../api/superadminMetricsCube';
import { Z } from '../../styles/zIndex';

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
          <Sparkles size={11} color="var(--theme)" />
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
                  background: radius === km ? 'rgba(var(--theme-rgb),0.16)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${radius === km ? 'rgba(var(--theme-rgb),0.45)' : 'rgba(255,255,255,0.10)'}`,
                  color: radius === km ? 'var(--theme)' : 'rgba(240,235,224,0.65)',
                  fontFamily: 'DM Sans', fontWeight: 600, fontSize: 11, cursor: 'pointer',
                }}>{km}km</button>
            ))}
          </div>
          {loading && <div style={{ padding: 14, fontFamily: 'DM Sans', fontSize: 12,
            color: 'rgba(240, 235, 224, 0.70)' }}>Cargando…</div>}
          {!loading && items.length === 0 && (
            <div style={{ padding: 14, fontFamily: 'DM Sans', fontSize: 12,
              color: 'rgba(240, 235, 224, 0.70)' }}>Sin comparables en este radio.</div>
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
                      color: 'rgba(240, 235, 224, 0.70)' }}>
                      {c.colonia} · {c.distance_km}km · {c.units_total} u · {c.units_available} disp.
                    </div>
                  </div>
                  <span style={{ padding: '3px 10px', borderRadius: 9999,
                    background: 'rgba(var(--theme-rgb),0.10)', color: 'var(--theme)',
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
    padding: 30, fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240, 235, 224, 0.70)',
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
        background: 'rgba(var(--theme-rgb),0.05)',
        border: '1px solid rgba(var(--theme-rgb),0.20)',
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
          <span style={{ fontFamily: 'DM Mono, monospace', color: 'var(--theme)' }}>
            {u.price_display || fmtMxn(u.price || u.price_mxn)}
          </span>
        </div>
      </div>

      {/* DEMANDA REAL por esta unidad (el moat granular): interés concreto del comprador, no solo su precio */}
      {data.demanda && (
        <div data-testid="cube-unit-demanda" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {[['👁️', 'Vistas', data.demanda.vistas], ['❤️', 'Guardados', data.demanda.guardados], ['🔥', 'Leads', data.demanda.leads]].map(([ic, l, v]) => (
            <div key={l} style={{ flex: '1 1 120px', padding: 14, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'rgba(240,235,224,0.55)', marginBottom: 6 }}>{ic} {l}</div>
              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: (v || 0) > 0 ? 'var(--theme)' : 'rgba(240,235,224,0.30)', letterSpacing: '-0.025em' }}>{v || 0}</div>
            </div>
          ))}
        </div>
      )}

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
                  <stop offset="0%" stopColor="var(--theme)" />
                  <stop offset="100%" stopColor="var(--theme)" />
                </linearGradient>
              </defs>
            </svg>
          ) : (
            <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240, 235, 224, 0.68)' }}>
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
            color: data.ie_score_zone != null ? 'var(--theme)' : 'rgba(240,235,224,0.30)',
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
          <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240, 235, 224, 0.68)' }}>
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
                  color: 'var(--theme)' }}>{l.status || 'nuevo'}</span>
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

// W2.8 Phase Z.1 — Compare modal: multi-select up to 5 zones + diff_pct cards
function CompareModal({ children_, selected, setSelected, data, loading,
                        onCompare, onClose, period }) {
  const toggle = (zid) => {
    setSelected(s => s.includes(zid) ? s.filter(x => x !== zid)
      : (s.length >= 5 ? s : [...s, zid]));
  };

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(6,8,15,0.65)',
        backdropFilter: 'blur(8px)', zIndex: Z.DRAWER,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '8vh 20px 20px',
      }}>
      <div data-testid="compare-modal" style={{
        width: '100%', maxWidth: 760,
        background: 'rgba(13,17,28,0.97)',
        border: '1px solid rgba(var(--theme-rgb),0.30)',
        borderRadius: 14, padding: 22, maxHeight: '80vh', overflowY: 'auto',
      }}>
        <h3 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18,
          color: 'var(--cream)', margin: '0 0 10px' }}>
          Comparar zonas ({selected.length}/5)
        </h3>
        {!data && (
          <>
            <div style={{ marginBottom: 10,
              fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.65)' }}>
              Selecciona 2 a 5 zonas para comparar:
            </div>
            <div style={{
              maxHeight: 280, overflowY: 'auto',
              padding: 10, borderRadius: 10,
              background: 'rgba(0,0,0,0.18)',
              display: 'flex', flexDirection: 'column', gap: 4,
            }}>
              {(children_ || []).map(c => {
                const active = selected.includes(c.tier_id);
                return (
                  <button key={c.tier_id}
                    data-testid={`compare-toggle-${c.tier_id}`}
                    onClick={() => toggle(c.tier_id)}
                    style={{
                      padding: '7px 11px', borderRadius: 9999,
                      background: active ? 'rgba(var(--theme-rgb),0.16)' : 'transparent',
                      border: `1px solid ${active ? 'rgba(var(--theme-rgb),0.45)'
                        : 'rgba(255,255,255,0.07)'}`,
                      color: active ? 'var(--theme)' : 'rgba(240,235,224,0.75)',
                      fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600,
                      cursor: 'pointer', textAlign: 'left',
                      display: 'flex', justifyContent: 'space-between',
                      alignItems: 'center',
                    }}>
                    <span>{c.name}</span>
                    <span style={{
                      fontFamily: 'DM Mono, monospace', fontSize: 10,
                      color: 'rgba(240, 235, 224, 0.70)',
                    }}>{(c.kpis?.units_total || 0)} u</span>
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end',
              marginTop: 14 }}>
              <button onClick={onClose}
                style={{
                  padding: '8px 16px', borderRadius: 9999,
                  background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
                  color: 'rgba(240,235,224,0.55)', fontFamily: 'DM Sans',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}>Cancelar</button>
              <button data-testid="compare-confirm"
                disabled={selected.length < 2 || loading}
                onClick={() => onCompare(selected)}
                style={{
                  padding: '9px 20px', borderRadius: 9999,
                  background: selected.length < 2
                    ? 'rgba(255,255,255,0.06)'
                    : 'linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))',
                  border: 'none', color: '#fff',
                  fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12.5,
                  cursor: selected.length < 2 ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.7 : 1,
                }}>{loading ? 'Comparando…' : 'Comparar'}</button>
            </div>
          </>
        )}
        {data && (
          <div data-testid="compare-results">
            <div style={{ display: 'grid',
              gridTemplateColumns: `repeat(${data.zones.length}, minmax(140px, 1fr))`,
              gap: 8, marginBottom: 14,
            }} className="compare-grid">
              {data.zones.map((z, i) => (
                <div key={z.zone_id} style={{
                  padding: 12, borderRadius: 10,
                  background: 'rgba(var(--theme-rgb),0.06)',
                  border: '1px solid rgba(var(--theme-rgb),0.20)',
                }}>
                  <div style={{
                    fontFamily: 'DM Mono, monospace', fontSize: 9.5,
                    color: 'rgba(240, 235, 224, 0.70)', textTransform: 'uppercase',
                    letterSpacing: '0.07em', marginBottom: 3,
                  }}>{z.tier}</div>
                  <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 14,
                    color: 'var(--cream)', marginBottom: 6 }}>{z.name}</div>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10.5,
                    color: 'rgba(240,235,224,0.65)', lineHeight: 1.55 }}>
                    {(['units_total', 'units_sold', 'avg_price_per_m2',
                       'conversion_rate', 'leads_count']).map(k => (
                      <div key={k}><span style={{ opacity: 0.55 }}>{k}:</span>{' '}
                        <strong style={{ color: 'var(--cream)' }}>
                          {z.kpis?.[k] != null ? (typeof z.kpis[k] === 'number'
                            ? z.kpis[k].toLocaleString('es-MX') : z.kpis[k]) : '—'}
                        </strong>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div style={{
              padding: 12, borderRadius: 10,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.07)',
            }}>
              <div style={{
                fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.07em',
                color: 'rgba(240,235,224,0.55)', marginBottom: 6,
              }}>Variación máx vs mín (%)</div>
              <div style={{ display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 6,
              }}>
                {Object.entries(data.diff_pct || {}).map(([k, v]) => (
                  <div key={k} style={{
                    padding: '6px 10px', borderRadius: 8,
                    background: v == null ? 'rgba(255,255,255,0.03)'
                      : v > 50 ? 'rgba(74,222,128,0.10)'
                      : 'rgba(var(--theme-rgb),0.06)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    fontFamily: 'DM Mono, monospace', fontSize: 11,
                  }}>
                    <span style={{ color: 'rgba(240,235,224,0.55)' }}>{k}:</span>{' '}
                    <strong style={{ color: v == null ? 'rgba(240, 235, 224, 0.68)'
                      : v > 50 ? '#4ADE80' : 'var(--theme)' }}>
                      {v != null ? `${v}%` : '—'}
                    </strong>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end',
              marginTop: 14 }}>
              <button onClick={onClose}
                style={{
                  padding: '8px 16px', borderRadius: 9999,
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: 'rgba(240,235,224,0.55)', fontFamily: 'DM Sans',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}>Cerrar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// W2.8 Phase Z.1 — Backfill modal: date range + polling status
function BackfillModal({ onClose, onToast }) {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);
  const [job, setJob] = useState(null);
  const [busy, setBusy] = useState(false);

  // Polling effect
  useEffect(() => {
    if (!job || job.status !== 'running') return;
    const id = setInterval(async () => {
      try {
        const r = await getBackfillStatus(job.job_id || job.id);
        setJob(r);
        if (r.status !== 'running') {
          clearInterval(id);
          onToast(`Backfill ${r.status}: ${r.zones_processed} zonas en ${r.duration_seconds}s`);
        }
      } catch (e) { /* ignore */ }
    }, 5000);
    return () => clearInterval(id);
  }, [job, onToast]);

  const onTrigger = async () => {
    setBusy(true);
    try {
      const r = await triggerBackfill(`${from}T00:00:00Z`, `${to}T00:00:00Z`);
      setJob(r);
    } catch (e) {
      if (e.status === 409) {
        onToast('Ya hay un backfill activo. Espera a que termine.');
      } else {
        onToast(e.message || 'Error backfill');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(6,8,15,0.65)',
        backdropFilter: 'blur(8px)', zIndex: Z.DRAWER,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}>
      <div data-testid="backfill-modal" style={{
        width: '100%', maxWidth: 480,
        background: 'rgba(13,17,28,0.97)',
        border: '1px solid rgba(250,204,21,0.30)',
        borderRadius: 14, padding: 22,
      }}>
        <h3 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16,
          color: 'var(--cream)', margin: '0 0 12px' }}>
          Backfill histórico
        </h3>
        <p style={{ fontFamily: 'DM Sans', fontSize: 12.5,
          color: 'rgba(240,235,224,0.65)', lineHeight: 1.5, marginTop: 0 }}>
          Genera snapshots <code>facts_daily_zone</code> retroactivos. Máx 90 días.
          Solo 1 backfill simultáneo permitido.
        </p>
        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <label style={{ flex: 1, fontFamily: 'DM Sans', fontSize: 11,
            color: 'rgba(240,235,224,0.55)' }}>
            Desde
            <input data-testid="backfill-from" type="date" value={from}
              onChange={e => setFrom(e.target.value)}
              style={{
                width: '100%', padding: '7px 10px', borderRadius: 8,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.10)',
                color: 'var(--cream)', fontFamily: 'DM Mono, monospace',
                fontSize: 12, marginTop: 4, outline: 'none',
              }} />
          </label>
          <label style={{ flex: 1, fontFamily: 'DM Sans', fontSize: 11,
            color: 'rgba(240,235,224,0.55)' }}>
            Hasta
            <input data-testid="backfill-to" type="date" value={to}
              onChange={e => setTo(e.target.value)}
              style={{
                width: '100%', padding: '7px 10px', borderRadius: 8,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.10)',
                color: 'var(--cream)', fontFamily: 'DM Mono, monospace',
                fontSize: 12, marginTop: 4, outline: 'none',
              }} />
          </label>
        </div>
        {job && (
          <div data-testid="backfill-status" style={{
            padding: 10, borderRadius: 8,
            background: 'rgba(var(--theme-rgb),0.06)',
            border: '1px solid rgba(var(--theme-rgb),0.20)',
            marginBottom: 10, fontFamily: 'DM Mono, monospace', fontSize: 11.5,
            color: 'rgba(240,235,224,0.85)',
          }}>
            <div>Job: <strong>{job.job_id || job.id}</strong></div>
            <div>Status: <strong style={{
              color: job.status === 'ok' ? '#4ADE80'
                : job.status === 'failed' ? '#F87171'
                : '#FACC15',
            }}>{job.status}</strong></div>
            {job.days_done != null && <div>Días: {job.days_done}</div>}
            {job.zones_processed != null && <div>Zonas: {job.zones_processed}</div>}
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <button onClick={onClose}
            style={{
              padding: '8px 16px', borderRadius: 9999,
              background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
              color: 'rgba(240,235,224,0.55)', fontFamily: 'DM Sans',
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}>{job && job.status !== 'running' ? 'Cerrar' : 'Cancelar'}</button>
          {(!job || job.status !== 'running') && (
            <button data-testid="backfill-confirm" onClick={onTrigger} disabled={busy}
              style={{
                padding: '9px 20px', borderRadius: 9999,
                background: 'linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))',
                border: 'none', color: '#fff', fontFamily: 'DM Sans',
                fontWeight: 700, fontSize: 12.5,
                cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1,
              }}>{busy ? 'Disparando…' : 'Iniciar backfill'}</button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SuperadminMetricsCube({ user, onLogout }) {
  const [path, setPath] = useState([ROOT]);
  const [period, setPeriod] = useState('current');
  const [vista, setVista] = useState('drill');   // 'drill' (jerárquico) | 'crosscut' (corte cruzado OLAP)
  const [node, setNode] = useState(null);
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState('');
  const [heatmapMetric, setHeatmapMetric] = useState('avg_price_per_m2');
  const [heatmapPoints, setHeatmapPoints] = useState([]);
  const [unitDetailId, setUnitDetailId] = useState(null);
  const [search, setSearch] = useState('');
  // W2.8 Phase Z.1 — slice/property/price filters + compare/backfill modals
  const [sliceBy, setSliceBy] = useState(null);
  const [propertyType, setPropertyType] = useState(null);
  const [priceTier, setPriceTier] = useState(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareSelected, setCompareSelected] = useState([]);
  const [compareData, setCompareData] = useState(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [backfillOpen, setBackfillOpen] = useState(false);

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
      // W2.8 — when filters active, fetch via listTier (with slice_by) for breakdown rows
      let r;
      if (sliceBy || propertyType || priceTier) {
        const next = { city: 'alcaldia', alcaldia: 'colonia',
                       colonia: 'development', development: 'unit' }[cur.tier];
        const detail = await getTierDetail(cur.tier, cur.tier_id, {
          period, sliceBy, propertyType, priceTier,
        });
        // Also fetch the children list with slice_by populated
        if (next && next !== 'unit') {
          const list = await listTier(next, {
            parentId: cur.tier_id, period,
            sliceBy, propertyType, priceTier, limit: 200,
          });
          setNode(detail.node);
          setChildren(list.items || []);
        } else {
          setNode(detail.node);
          setChildren(detail.children || []);
        }
      } else {
        r = await getTierDetail(cur.tier, cur.tier_id, { period });
        setNode(r.node);
        setChildren(r.children || []);
      }
    } catch (e) {
      setToast(e.message || 'Error al cargar nodo');
    } finally {
      setLoading(false);
    }
  }, [cur.tier, cur.tier_id, period, isUnit, sliceBy, propertyType, priceTier]);

  const loadHeatmap = useCallback(async () => {
    if (!heatmapTier) { setHeatmapPoints([]); return; }
    try {
      const r = await getHeatmap({ metric: heatmapMetric, tier: heatmapTier, period });
      setHeatmapPoints(r.items || []);
    } catch {
      setHeatmapPoints([]);
    }
  }, [heatmapMetric, heatmapTier, period]);

  // Solo cargan datos del drill cuando esa vista está activa (evita fetches inútiles en 'crosscut'; refetch al volver).
  useEffect(() => { if (vista === 'drill') loadDetail(); }, [loadDetail, vista]);
  useEffect(() => { if (vista === 'drill') loadHeatmap(); }, [loadHeatmap, vista]);
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
            position: 'fixed', top: 76, right: 20, zIndex: Z.TOAST,
            padding: '11px 18px', borderRadius: 10,
            background: 'rgba(var(--theme-rgb),0.18)',
            border: '1px solid rgba(var(--theme-rgb),0.35)',
            color: 'var(--theme)', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600,
            backdropFilter: 'blur(24px)',
          }}>{toast}</div>
        )}

        <div style={{
          marginBottom: 20, display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap',
        }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <Layers size={20} color="var(--theme)" />
              <h1 style={{
                fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: 'var(--cream)',
                margin: 0, letterSpacing: '-0.025em',
              }}>Cubo de métricas</h1>
            </div>
            <p style={{
              fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240, 235, 224, 0.72)', margin: 0,
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
                  background: period === p.key ? 'rgba(var(--theme-rgb),0.16)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${period === p.key ? 'rgba(var(--theme-rgb),0.45)' : 'rgba(255,255,255,0.07)'}`,
                  color: period === p.key ? 'var(--theme)' : 'rgba(240,235,224,0.55)',
                  fontFamily: 'DM Sans', fontWeight: 600, fontSize: 11.5, cursor: 'pointer',
                }}>{p.label}</button>
            ))}
          </div>

          <button onClick={onRefresh} disabled={refreshing}
            data-testid="cube-refresh-btn"
            style={{
              padding: '8px 14px', borderRadius: 9999,
              background: 'rgba(var(--theme-rgb),0.10)',
              border: '1px solid rgba(var(--theme-rgb),0.30)',
              color: 'var(--theme)', fontFamily: 'DM Sans', fontWeight: 600,
              fontSize: 11.5, cursor: refreshing ? 'wait' : 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 5,
              opacity: refreshing ? 0.6 : 1,
            }}>
            <RefreshCw size={11} style={{
              animation: refreshing ? 'spin 1s linear infinite' : 'none',
            }} />
            {refreshing ? 'Refrescando…' : 'Refrescar'}
          </button>

          {/* Comparar/Backfill son del drill (operan sobre zonas jerárquicas) → ocultos en 'crosscut' */}
          {vista === 'drill' && (<>
          <button onClick={() => setCompareOpen(true)}
            data-testid="cube-compare-btn"
            style={{
              padding: '8px 14px', borderRadius: 9999,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.10)',
              color: 'rgba(240,235,224,0.65)', fontFamily: 'DM Sans', fontWeight: 600,
              fontSize: 11.5, cursor: 'pointer',
            }}>Comparar zonas</button>

          <button onClick={() => setBackfillOpen(true)}
            data-testid="cube-backfill-btn"
            style={{
              padding: '8px 14px', borderRadius: 9999,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.10)',
              color: 'rgba(240,235,224,0.65)', fontFamily: 'DM Sans', fontWeight: 600,
              fontSize: 11.5, cursor: 'pointer',
            }}>Backfill histórico</button>
          </>)}
        </div>

        {/* Selector de vista: Drill-down jerárquico vs Corte cruzado OLAP (surfacea queryCrossCut/getCacheStats) */}
        <div data-testid="cube-vista-tabs" style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {[['drill', 'Drill-down', Layers], ['crosscut', 'Corte cruzado', LayoutGrid], ['actuar', 'Actuar', Send]].map(([k, label, Icon]) => (
            <button key={k} data-testid={`cube-vista-${k}`} onClick={() => setVista(k)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 11,
                background: vista === k ? 'rgba(var(--theme-rgb),0.16)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${vista === k ? 'rgba(var(--theme-rgb),0.45)' : 'rgba(255,255,255,0.08)'}`,
                color: vista === k ? 'var(--theme)' : 'rgba(240,235,224,0.6)',
                fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, cursor: 'pointer',
              }}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        {vista === 'crosscut' && <CubeCrossCutView period={period} />}

        {vista === 'actuar' && <CubeActuarView onToast={setToast} />}

        {vista === 'drill' && (<>
        {/* W2.8 Filters strip — slice_by + property_type + price_tier */}
        <div data-testid="cube-filter-strip" style={{
          display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center',
          marginBottom: 14, padding: '8px 12px', borderRadius: 12,
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.05)',
        }}>
          <span style={{
            fontFamily: 'DM Mono, monospace', fontSize: 9.5,
            color: 'rgba(240, 235, 224, 0.70)', textTransform: 'uppercase',
            letterSpacing: '0.07em', marginRight: 4,
          }}>Agrupar:</span>
          {[['none', 'Sin agrupar', null],
            ['property_type', 'Por tipo', 'property_type'],
            ['price_tier', 'Por rango precio', 'price_tier'],
            ['year_built_decade', 'Por década', 'year_built_decade']].map(([k, label, val]) => (
            <button key={k} data-testid={`cube-slice-${k}`}
              onClick={() => setSliceBy(val)}
              style={{
                padding: '4px 10px', borderRadius: 9999,
                background: sliceBy === val ? 'rgba(var(--theme-rgb),0.16)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${sliceBy === val ? 'rgba(var(--theme-rgb),0.45)' : 'rgba(255,255,255,0.07)'}`,
                color: sliceBy === val ? 'var(--theme)' : 'rgba(240,235,224,0.65)',
                fontFamily: 'DM Sans', fontWeight: 600, fontSize: 10.5, cursor: 'pointer',
              }}>{label}</button>
          ))}

          <span style={{
            fontFamily: 'DM Mono, monospace', fontSize: 9.5,
            color: 'rgba(240, 235, 224, 0.70)', textTransform: 'uppercase',
            letterSpacing: '0.07em', marginLeft: 8, marginRight: 4,
          }}>Tipo:</span>
          {[['all', 'Todos', null], ['depto', 'Depto', 'depto'],
            ['casa', 'Casa', 'casa'], ['loft', 'Loft', 'loft'],
            ['town', 'Town', 'town'], ['ph', 'PH', 'ph']].map(([k, label, val]) => (
            <button key={`pt-${k}`} data-testid={`cube-pt-${k}`}
              onClick={() => setPropertyType(val)}
              style={{
                padding: '4px 10px', borderRadius: 9999,
                background: propertyType === val ? 'rgba(var(--theme-rgb),0.16)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${propertyType === val ? 'rgba(var(--theme-rgb),0.45)' : 'rgba(255,255,255,0.07)'}`,
                color: propertyType === val ? 'var(--theme)' : 'rgba(240,235,224,0.65)',
                fontFamily: 'DM Sans', fontWeight: 600, fontSize: 10.5, cursor: 'pointer',
              }}>{label}</button>
          ))}

          <span style={{
            fontFamily: 'DM Mono, monospace', fontSize: 9.5,
            color: 'rgba(240, 235, 224, 0.70)', textTransform: 'uppercase',
            letterSpacing: '0.07em', marginLeft: 8, marginRight: 4,
          }}>Rango:</span>
          {[['all', 'Todos', null], ['entry', 'Entry', 'entry'],
            ['mid', 'Mid', 'mid'], ['luxury', 'Luxury', 'luxury'],
            ['ultraluxury', 'Ultra', 'ultraluxury']].map(([k, label, val]) => (
            <button key={`pr-${k}`} data-testid={`cube-pr-${k}`}
              onClick={() => setPriceTier(val)}
              style={{
                padding: '4px 10px', borderRadius: 9999,
                background: priceTier === val ? 'rgba(var(--theme-rgb),0.16)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${priceTier === val ? 'rgba(var(--theme-rgb),0.45)' : 'rgba(255,255,255,0.07)'}`,
                color: priceTier === val ? 'var(--theme)' : 'rgba(240,235,224,0.65)',
                fontFamily: 'DM Sans', fontWeight: 600, fontSize: 10.5, cursor: 'pointer',
              }}>{label}</button>
          ))}
        </div>

        {/* Fase 3.1 · capas IA sobre el cubo crudo (hedónico + demand-gap) */}
        <CubeIntelPanel />

        <CubeBreadcrumb path={path} onNavigate={onBreadcrumb} />

        {unitDetailId ? (
          <UnitDetailView unitId={unitDetailId} onBack={() => setUnitDetailId(null)} />
        ) : (
          <>
            {loading && (
              <div data-testid="cube-loading" style={{
                padding: 30, fontFamily: 'DM Sans', fontSize: 13,
                color: 'rgba(240, 235, 224, 0.70)',
              }}>Cargando agregados…</div>
            )}

            {!loading && node && (
              <>
                <CubeKpiStrip kpis={node.kpis} />
                {/* N5 · LINEAJE: de dónde sale cada número (auditoría N1: "falta lineaje de datos") */}
                <div data-testid="cube-lineage" style={{
                  fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'rgba(240,235,224,0.45)',
                  margin: '2px 2px 12px', display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <span>ℹ</span>
                  <span>
                    Basado en {(node.kpis?.units_total ?? 0).toLocaleString('es-MX')} unidades
                    {node.computed_at ? ` · actualizado ${new Date(node.computed_at).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}
                    {' · fuente: cubo DMX (unidades reales + ediciones del desarrollador)'}
                  </span>
                </div>
              </>
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
                            ? 'rgba(var(--theme-rgb),0.16)' : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${heatmapMetric === m.key
                            ? 'rgba(var(--theme-rgb),0.45)' : 'rgba(255,255,255,0.07)'}`,
                          color: heatmapMetric === m.key ? 'var(--theme)' : 'rgba(240,235,224,0.65)',
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
                      fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240, 235, 224, 0.70)',
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
                      aria-label={`Buscar ${node?.next_tier || 'en la tabla'}`}
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
                      background: 'rgba(var(--theme-rgb),0.10)', color: 'var(--theme)',
                      fontFamily: 'DM Mono, monospace', fontSize: 10.5,
                    }}>{filteredChildren.length} {node?.next_tier || ''}</span>
                  </div>
                  <CubeDrilldownTable
                    items={filteredChildren}
                    onDrill={drillTo}
                    density="compact"
                    breakdownKeys={
                      sliceBy === 'property_type'
                        ? ['depto', 'casa', 'loft', 'town', 'ph']
                        : sliceBy === 'price_tier'
                          ? ['entry', 'mid', 'luxury', 'ultraluxury']
                          : null
                    }
                  />
                </div>
              </div>
            )}

            {!loading && isDev && cur.tier_id && (
              <ComparablesPanel tierId={cur.tier_id} />
            )}
          </>
        )}
        </>)}

        {/* W2.8 Compare modal */}
        {compareOpen && (
          <CompareModal
            children_={children}
            selected={compareSelected}
            setSelected={setCompareSelected}
            data={compareData}
            loading={compareLoading}
            onCompare={async (ids) => {
              setCompareLoading(true);
              try {
                const r = await compareZones(ids, period);
                setCompareData(r);
              } catch (e) { setToast(e.message || 'Error compare'); }
              finally { setCompareLoading(false); }
            }}
            onClose={() => {
              setCompareOpen(false);
              setCompareData(null);
              setCompareSelected([]);
            }}
            period={period}
          />
        )}

        {/* W2.8 Backfill modal */}
        {backfillOpen && (
          <BackfillModal
            onClose={() => setBackfillOpen(false)}
            onToast={setToast}
          />
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
