/**
 * Phase 4 Batch 11 — Sub-chunk C
 * UnitDrawerContent — 7 secciones colapsables para drawer de unidad
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  getUnitPriceHistory, getUnitComparables, getUnitMarketComparables,
  getUnitAIPrediction, patchUnit, getUnitEngagement,
} from '../../api/developer';
import InlineEditField from '../shared/InlineEditField';
import useInlineSaver from '../../hooks/useInlineSaver';
import { ChevronRight, TrendUp, BarChart, Users, Building, FileText, Star } from '../../components/icons';

const fmtMXN = (v) => {
  if (!v || v === 0) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  return `$${(v / 1_000).toFixed(0)}K`;
};
const fmtMXNm2 = (v) => v ? `$${(v / 1_000).toFixed(0)}K/m²` : '—';

const STATUS_CONFIG = {
  disponible: { label: 'Disponible', color: '#22c55e', bg: 'rgba(34,197,94,0.15)' },
  apartado:   { label: 'Apartado',   color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
  reservado:  { label: 'Reservado',  color: '#60a5fa', bg: 'rgba(96,165,250,0.15)' },
  vendido:    { label: 'Vendido',    color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
  bloqueado:  { label: 'Bloqueado',  color: 'rgba(240,235,224,0.3)', bg: 'rgba(240,235,224,0.06)' },
};

// ─── Collapsible Section ───────────────────────────────────────────────────
function DrawerSection({ id, title, defaultOpen = false, loading, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderBottom: '1px solid rgba(240,235,224,0.08)' }}>
      <button
        data-testid={`drawer-section-${id}`}
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 0', background: 'none', border: 'none', cursor: 'pointer',
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--cream)', fontFamily: 'Outfit,sans-serif', letterSpacing: '0.02em' }}>{title}</span>
        <ChevronRight size={14} color="var(--cream-3)" style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }} />
      </button>
      {open && (
        <div style={{ paddingBottom: 16 }}>
          {loading ? (
            <div style={{ fontSize: 12, color: 'var(--cream-3)', padding: '8px 0' }}>Cargando…</div>
          ) : children}
        </div>
      )}
    </div>
  );
}

// ─── Micro sparkline for price history ────────────────────────────────────
function PriceSparkline({ history }) {
  if (!history || history.length < 2) return null;
  const prices = history.map(h => h.price_after || h.price_before || 0).filter(Boolean);
  if (prices.length < 2) return null;
  const max = Math.max(...prices);
  const min = Math.min(...prices);
  const range = max - min || 1;
  const W = 120, H = 32;
  const pts = prices.map((p, i) => {
    const x = (i / (prices.length - 1)) * W;
    const y = H - ((p - min) / range) * (H - 4) - 2;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <polyline points={pts} fill="none" stroke="var(--cream)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// ─── Section 1: Estado y precio ───────────────────────────────────────────
function EstadoPrecioSection({ unit, devId, user, onUnitUpdated }) {
  const [priceData, setPriceData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const isAdmin = user?.role === 'developer_admin' || user?.role === 'superadmin';

  useEffect(() => {
    if (!unit) return;
    setLoading(true);
    getUnitPriceHistory(devId, unit.id || unit.unit_number)
      .then(d => setPriceData(d))
      .catch(() => setPriceData(null))
      .finally(() => setLoading(false));
  }, [devId, unit]);

  if (!unit) return null;
  const st = STATUS_CONFIG[unit.status] || STATUS_CONFIG.disponible;
  const area = unit.area_total || unit.area;
  const priceM2 = unit.price && area ? Math.round(unit.price / area) : null;

  // Batch 17 — saver via generic inline endpoint (adds activity log + undo)
  const unitId = unit.id || unit.unit_id || unit.unit_number;
  const inlineSave = useInlineSaver('unit', unitId, {
    onUpdated: () => onUnitUpdated?.(),
    toastMessage: 'Unidad actualizada',
  });

  const handleSave = async (field, value) => {
    setSaving(true);
    try {
      const v = field === 'price' && typeof value === 'string'
        ? parseFloat(value.replace(/[^0-9.]/g, ''))
        : value;
      await inlineSave(field, v);
    } catch (e) {
      // Fallback to legacy patchUnit if inline endpoint fails (e.g., legacy data)
      try {
        await patchUnit(devId, unitId, {
          [field]: field === 'price' && typeof value === 'string'
            ? parseFloat(value.replace(/[^0-9.]/g, ''))
            : value,
        });
        onUnitUpdated?.();
      } catch (err) { console.error('Patch unit (fallback):', err); throw err; }
    } finally { setSaving(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--cream-3)', marginBottom: 4 }}>Estado</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ background: st.bg, color: st.color, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 6 }}>{st.label}</span>
            {isAdmin && (
              <InlineEditField
                value={unit.status} type="select"
                options={Object.entries(STATUS_CONFIG).map(([k, v]) => ({ value: k, label: v.label }))}
                onSave={v => handleSave('status', v)}
                canEdit={isAdmin}
                style={{ fontSize: 11, color: 'var(--cream-3)' }}
              />
            )}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--cream-3)', marginBottom: 4 }}>Precio</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            {isAdmin ? (
              <InlineEditField
                value={String(unit.price || 0)}
                type="number"
                onSave={v => handleSave('price', v)}
                canEdit={isAdmin}
                style={{ fontSize: 18, fontWeight: 800, color: 'var(--cream)', fontFamily: 'Outfit,sans-serif' }}
              />
            ) : (
              <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--cream)', fontFamily: 'Outfit,sans-serif' }}>
                {fmtMXN(unit.price)}
              </span>
            )}
            {priceM2 && <span style={{ fontSize: 11, color: 'var(--cream-3)' }}>{fmtMXNm2(priceM2)}</span>}
          </div>
        </div>
      </div>

      {/* Price history mini chart */}
      {!loading && priceData?.history?.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 10, color: 'var(--cream-3)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Historial de precios</span>
            <PriceSparkline history={priceData.history} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {priceData.history.slice(-4).reverse().map((h, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--cream-2)' }}>
                <span style={{ color: 'var(--cream-3)' }}>{h.date ? new Date(h.date).toLocaleDateString('es-MX', { month: 'short', year: '2-digit' }) : '—'}</span>
                <span>
                  {fmtMXN(h.price_before)} → <strong>{fmtMXN(h.price_after)}</strong>
                  {h.price_after > h.price_before && <span style={{ color: '#22c55e', marginLeft: 4 }}>↑</span>}
                  {h.price_after < h.price_before && <span style={{ color: '#ef4444', marginLeft: 4 }}>↓</span>}
                </span>
              </div>
            ))}
          </div>
          {priceData.colonia_avg_price_m2 && priceM2 && (
            <div style={{ marginTop: 10, padding: '8px 10px', background: 'rgba(240,235,224,0.05)', borderRadius: 8, display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, color: 'var(--cream-3)' }}>vs. promedio colonia</span>
              <span style={{
                fontSize: 11, fontWeight: 700,
                color: priceM2 > priceData.colonia_avg_price_m2 ? '#f59e0b' : '#22c55e',
              }}>
                {priceM2 > priceData.colonia_avg_price_m2 ? '+' : ''}{Math.round((priceM2 / priceData.colonia_avg_price_m2 - 1) * 100)}%
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Section 2: Engagement ────────────────────────────────────────────────
function EngagementSection({ unit, devId }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!unit) return;
    getUnitEngagement(devId, unit.id || unit.unit_number)
      .then(setData).catch(() => setData(null));
  }, [devId, unit]);

  if (!data) return <div style={{ fontSize: 12, color: 'var(--cream-3)' }}>Sin datos de engagement todavía.</div>;

  const MetricRow = ({ label, asesor, cliente }) => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, fontSize: 12, padding: '5px 0', borderBottom: '1px solid rgba(240,235,224,0.05)' }}>
      <span style={{ color: 'var(--cream-3)' }}>{label}</span>
      <span style={{ color: 'var(--cream-2)', textAlign: 'center' }}>{asesor ?? '—'}</span>
      <span style={{ color: 'var(--cream-2)', textAlign: 'center' }}>{cliente ?? '—'}</span>
    </div>
  );

  return (
    <div>
      {data.is_stub && <div style={{ fontSize: 10, color: 'rgba(245,158,11,0.7)', marginBottom: 8, padding: '3px 8px', background: 'rgba(245,158,11,0.08)', borderRadius: 5 }}>ESTIMADO · datos analíticos activan en producción</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 10, color: 'var(--cream-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Métrica</span>
        <span style={{ fontSize: 10, color: 'var(--cream-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center' }}>Asesores</span>
        <span style={{ fontSize: 10, color: 'var(--cream-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center' }}>Clientes</span>
      </div>
      <MetricRow label="Vistas" asesor={data.asesores?.vistas} cliente={data.clientes?.vistas} />
      <MetricRow label="Clicks fotos" asesor={data.asesores?.clicks_fotos} cliente={data.clientes?.clicks_fotos} />
      <MetricRow label="Tiempo prom. (seg)" asesor={data.asesores?.tiempo_promedio_seg} cliente={data.clientes?.tiempo_promedio_seg} />
      <MetricRow label="Compartidos" asesor={data.asesores?.compartidos} cliente={data.clientes?.compartidos} />
      <MetricRow label="Citas agendadas" asesor={data.asesores?.citas_agendadas} cliente="—" />
      <MetricRow label="Intent score" asesor={`${data.asesores?.intent_score ?? '—'}`} cliente={`${data.clientes?.intent_score_avg ?? '—'}`} />

      {data.funnel && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 10, color: 'var(--cream-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Funnel de conversión</div>
          {data.funnel.map((f, i) => (
            <div key={f.stage} style={{ marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                <span style={{ color: 'var(--cream-3)' }}>{f.stage}</span>
                <span style={{ color: 'var(--cream-2)', fontWeight: 600 }}>{f.count}</span>
              </div>
              <div style={{ height: 4, borderRadius: 2, background: 'rgba(240,235,224,0.08)' }}>
                <div style={{
                  height: '100%', borderRadius: 2,
                  width: `${(f.count / (data.funnel[0]?.count || 1)) * 100}%`,
                  background: `hsl(${200 - i * 30}, 70%, 60%)`,
                  transition: 'width 0.5s',
                }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Section 3: Comparables internos ─────────────────────────────────────
function ComparablesInternosSection({ unit, devId }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!unit) return;
    getUnitComparables(devId, unit.id || unit.unit_number).then(setData).catch(() => {});
  }, [devId, unit]);

  if (!data) return <div style={{ fontSize: 12, color: 'var(--cream-3)' }}>Cargando comparables…</div>;
  const others = (data.units || []).filter(u => !u.is_current).slice(0, 6);

  return (
    <div>
      <div style={{ display: 'flex', gap: 14, marginBottom: 12 }}>
        <div style={{ padding: '8px 12px', background: 'rgba(240,235,224,0.05)', borderRadius: 8, flex: 1 }}>
          <div style={{ fontSize: 10, color: 'var(--cream-3)', marginBottom: 2 }}>Misma prototipo</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--cream)' }}>{data.total_count}</div>
        </div>
        <div style={{ padding: '8px 12px', background: 'rgba(34,197,94,0.06)', borderRadius: 8, flex: 1 }}>
          <div style={{ fontSize: 10, color: 'var(--cream-3)', marginBottom: 2 }}>Vendidas</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#22c55e' }}>{data.sold_count}</div>
        </div>
        {data.avg_price_sold && (
          <div style={{ padding: '8px 12px', background: 'rgba(240,235,224,0.05)', borderRadius: 8, flex: 1 }}>
            <div style={{ fontSize: 10, color: 'var(--cream-3)', marginBottom: 2 }}>Precio prom. vendida</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--cream)' }}>{fmtMXN(data.avg_price_sold)}</div>
          </div>
        )}
      </div>
      {others.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr>
                {['Unidad', 'Estado', 'Precio', 'Nivel'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--cream-3)', fontWeight: 600, borderBottom: '1px solid rgba(240,235,224,0.07)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {others.map(u => {
                const st = STATUS_CONFIG[u.status] || STATUS_CONFIG.disponible;
                return (
                  <tr key={u.unit_number} style={{ borderBottom: '1px solid rgba(240,235,224,0.04)' }}>
                    <td style={{ padding: '5px 8px', color: 'var(--cream)' }}>{u.unit_number}</td>
                    <td style={{ padding: '5px 8px' }}><span style={{ background: st.bg, color: st.color, fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4 }}>{st.label}</span></td>
                    <td style={{ padding: '5px 8px', color: 'var(--cream-2)' }}>{fmtMXN(u.price)}</td>
                    <td style={{ padding: '5px 8px', color: 'var(--cream-3)' }}>{u.level ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Section 4: Comparables externos ─────────────────────────────────────
function ComparablesExternosSection({ unit, devId }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!unit) return;
    getUnitMarketComparables(devId, unit.id || unit.unit_number).then(setData).catch(() => {});
  }, [devId, unit]);

  if (!data) return <div style={{ fontSize: 12, color: 'var(--cream-3)' }}>Cargando mercado…</div>;

  return (
    <div>
      {data.market_avg_price_m2 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <div style={{ padding: '8px 12px', background: 'rgba(240,235,224,0.05)', borderRadius: 8, flex: 1 }}>
            <div style={{ fontSize: 10, color: 'var(--cream-3)', marginBottom: 2 }}>Avg. colonia ($/m²)</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--cream)' }}>{fmtMXNm2(data.market_avg_price_m2)}</div>
          </div>
          <div style={{ padding: '8px 12px', background: 'rgba(240,235,224,0.05)', borderRadius: 8, flex: 1 }}>
            <div style={{ fontSize: 10, color: 'var(--cream-3)', marginBottom: 2 }}>Tu precio ($/m²)</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--cream)' }}>{fmtMXNm2(data.my_price_m2)}</div>
          </div>
          {data.vs_market_pct != null && (
            <div style={{ padding: '8px 12px', background: data.vs_market_pct > 0 ? 'rgba(245,158,11,0.08)' : 'rgba(34,197,94,0.08)', borderRadius: 8, flex: 1 }}>
              <div style={{ fontSize: 10, color: 'var(--cream-3)', marginBottom: 2 }}>vs. mercado</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: data.vs_market_pct > 5 ? '#f59e0b' : data.vs_market_pct < -5 ? '#22c55e' : 'var(--cream)' }}>
                {data.vs_market_pct > 0 ? '+' : ''}{data.vs_market_pct}%
              </div>
            </div>
          )}
        </div>
      )}
      {data.comparables?.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {data.comparables.slice(0, 5).map((c, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '4px 0', borderBottom: '1px solid rgba(240,235,224,0.04)' }}>
              <span style={{ color: 'var(--cream-3)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.project_name}</span>
              <span style={{ color: 'var(--cream-2)' }}>{c.area_total}m² · {fmtMXN(c.price)}</span>
            </div>
          ))}
        </div>
      )}
      {!data.comparables?.length && (
        <p style={{ fontSize: 12, color: 'var(--cream-3)', margin: 0 }}>Sin comparables externos en la misma colonia.</p>
      )}
    </div>
  );
}

// ─── Section 5: Predicción IA ─────────────────────────────────────────────
function AIPredSection({ unit, devId, user }) {
  const [pred, setPred] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);

  const load = useCallback(() => {
    if (!unit) return;
    setLoading(true);
    getUnitAIPrediction(devId, unit.id || unit.unit_number)
      .then(d => { setPred(d); setLastRefresh(new Date()); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [devId, unit]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ fontSize: 12, color: 'var(--cream-3)' }}>Generando predicción con IA…</div>;
  if (!pred) return <div style={{ fontSize: 12, color: 'var(--cream-3)' }}>Sin predicción disponible.</div>;

  const CONF_COLOR = { alta: '#22c55e', media: '#f59e0b', baja: 'rgba(240,235,224,0.4)' };

  return (
    <div>
      {(pred.stub || !pred.prob_cierre_90d_pct) ? (
        <div style={{ fontSize: 11, color: 'rgba(245,158,11,0.8)', marginBottom: 10, padding: '4px 10px', background: 'rgba(245,158,11,0.08)', borderRadius: 6 }}>
          ESTIMADO · predicción basada en datos históricos internos (IA deshabilitada temporalmente)
        </div>
      ) : null}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        <div style={{ padding: '10px 12px', background: 'rgba(34,197,94,0.08)', borderRadius: 8 }}>
          <div style={{ fontSize: 10, color: 'var(--cream-3)', marginBottom: 4 }}>Prob. cierre 90 días</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#22c55e', fontFamily: 'Outfit,sans-serif' }}>{pred.prob_cierre_90d_pct}%</div>
        </div>
        <div style={{ padding: '10px 12px', background: 'rgba(96,165,250,0.08)', borderRadius: 8 }}>
          <div style={{ fontSize: 10, color: 'var(--cream-3)', marginBottom: 4 }}>Si bajas 3% → prob.</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#60a5fa', fontFamily: 'Outfit,sans-serif' }}>{pred.prob_si_baja_3pct}%</div>
        </div>
      </div>
      {pred.recomendaciones?.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: 'var(--cream-3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Recomendaciones</div>
          {pred.recomendaciones.map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 4 }}>
              <div style={{ width: 16, height: 16, borderRadius: 4, background: 'rgba(240,235,224,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                <span style={{ fontSize: 9, color: 'var(--cream-3)' }}>{i + 1}</span>
              </div>
              <span style={{ fontSize: 12, color: 'var(--cream-2)' }}>{r}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ fontSize: 10, color: 'var(--cream-3)', padding: '6px 8px', background: 'rgba(240,235,224,0.04)', borderRadius: 6 }}>
        Confianza:&nbsp;
        <span style={{ color: CONF_COLOR[pred.nivel_confianza] || 'var(--cream-3)', fontWeight: 600 }}>
          {pred.nivel_confianza}
        </span>
        &nbsp;· {pred.cierres_base_historicos} cierres base. {pred.disclaimer}
      </div>
      <button
        onClick={load} disabled={loading}
        style={{ marginTop: 8, background: 'none', border: '1px solid rgba(240,235,224,0.1)', color: 'var(--cream-3)', borderRadius: 6, padding: '4px 10px', fontSize: 10, cursor: loading ? 'default' : 'pointer' }}>
        {loading ? 'Actualizando…' : 'Refrescar (1×/hora)'}
      </button>
      {lastRefresh && <span style={{ fontSize: 9, color: 'rgba(240,235,224,0.3)', marginLeft: 8 }}>{lastRefresh.toLocaleTimeString('es-MX')}</span>}
    </div>
  );
}

// ─── Section 6: Características ──────────────────────────────────────────
function CaracteristicasSection({ unit, devId, user, onUnitUpdated }) {
  const isAdmin = user?.role === 'developer_admin' || user?.role === 'superadmin';
  if (!unit) return null;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      {[
        ['Vista', unit.view || 'Sin info'],
        ['Orientación', unit.orientation || '—'],
        ['Nivel', unit.level ?? '—'],
        ['m² total', unit.area_total ? `${unit.area_total}m²` : '—'],
        ['Recámaras', unit.bedrooms ?? '—'],
        ['Baños', unit.bathrooms ?? '—'],
      ].map(([label, value]) => (
        <div key={label}>
          <div style={{ fontSize: 10, color: 'var(--cream-3)', marginBottom: 2 }}>{label}</div>
          <div style={{ fontSize: 13, color: 'var(--cream)' }}>{value}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Section 7: Documentos y assets ──────────────────────────────────────
function DocumentosSection({ unit, devId }) {
  if (!unit) return null;
  const hasAssets = unit.plan_url || unit.render_url || unit.tour_url;
  if (!hasAssets) {
    return <p style={{ fontSize: 12, color: 'var(--cream-3)', margin: 0 }}>Sin documentos o assets específicos para esta unidad.</p>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {unit.plan_url && (
        <a href={unit.plan_url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(240,235,224,0.05)', borderRadius: 8, color: 'var(--cream)', textDecoration: 'none', fontSize: 12 }}>
          <FileText size={14} color="var(--cream-3)" /> Plano de unidad
        </a>
      )}
      {unit.render_url && (
        <a href={unit.render_url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(240,235,224,0.05)', borderRadius: 8, color: 'var(--cream)', textDecoration: 'none', fontSize: 12 }}>
          <Star size={14} color="var(--cream-3)" /> Render
        </a>
      )}
      {unit.tour_url && (
        <a href={unit.tour_url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(240,235,224,0.05)', borderRadius: 8, color: 'var(--cream)', textDecoration: 'none', fontSize: 12 }}>
          <Building size={14} color="var(--cream-3)" /> Tour 360°
        </a>
      )}
    </div>
  );
}

// ─── Footer actions ───────────────────────────────────────────────────────
function DrawerFooter({ unit, devId, user, onClose, onUnitUpdated }) {
  const isAdmin = user?.role === 'developer_admin' || user?.role === 'superadmin';
  const [saving, setSaving] = useState(false);

  const doAction = async (field, value) => {
    setSaving(true);
    try {
      await patchUnit(devId, unit.id || unit.unit_number, { [field]: value });
      onUnitUpdated?.();
    } catch (e) { console.error('Footer action:', e); }
    finally { setSaving(false); }
  };

  if (!unit || !isAdmin) return null;
  return (
    <div style={{ padding: '14px 0 0', borderTop: '1px solid rgba(240,235,224,0.1)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {unit.status === 'disponible' && (
        <button onClick={() => doAction('status', 'apartado')} disabled={saving}
          style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 7, padding: '7px 12px', fontSize: 11, fontWeight: 600, cursor: saving ? 'default' : 'pointer' }}>
          Apartar (24h)
        </button>
      )}
      {unit.status === 'apartado' && (
        <button onClick={() => doAction('status', 'disponible')} disabled={saving}
          style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 7, padding: '7px 12px', fontSize: 11, fontWeight: 600, cursor: saving ? 'default' : 'pointer' }}>
          Liberar apartado
        </button>
      )}
      {(unit.status === 'disponible' || unit.status === 'apartado') && (
        <button onClick={() => doAction('status', 'reservado')} disabled={saving}
          style={{ background: 'rgba(96,165,250,0.12)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.2)', borderRadius: 7, padding: '7px 12px', fontSize: 11, fontWeight: 600, cursor: saving ? 'default' : 'pointer' }}>
          Marcar reservado
        </button>
      )}
      {unit.status !== 'vendido' && (
        <button onClick={() => doAction('status', 'vendido')} disabled={saving}
          style={{ background: 'rgba(239,68,68,0.12)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 7, padding: '7px 12px', fontSize: 11, fontWeight: 600, cursor: saving ? 'default' : 'pointer' }}>
          Marcar vendido
        </button>
      )}
    </div>
  );
}

// ─── Main UnitDrawerContent ───────────────────────────────────────────────
export default function UnitDrawerContent({ unit, devId, user, onUnitUpdated }) {
  if (!unit) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Unit title */}
      <div style={{ paddingBottom: 14, marginBottom: 4, borderBottom: '1px solid rgba(240,235,224,0.1)' }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--cream)', fontFamily: 'Outfit,sans-serif' }}>
          Unidad {unit.unit_number}
        </div>
        <div style={{ fontSize: 12, color: 'var(--cream-3)', marginTop: 2 }}>
          Prototipo {unit.prototype} · Nivel {unit.level ?? '—'}
        </div>
      </div>

      <DrawerSection id="estado" title="Estado y precio" defaultOpen>
        <EstadoPrecioSection unit={unit} devId={devId} user={user} onUnitUpdated={onUnitUpdated} />
      </DrawerSection>

      <DrawerSection id="engagement" title="Engagement">
        <EngagementSection unit={unit} devId={devId} />
      </DrawerSection>

      <DrawerSection id="comparables-internos" title="Comparables internos">
        <ComparablesInternosSection unit={unit} devId={devId} />
      </DrawerSection>

      <DrawerSection id="comparables-externos" title="Comparables de mercado (colonia)">
        <ComparablesExternosSection unit={unit} devId={devId} />
      </DrawerSection>

      <DrawerSection id="ai-pred" title="Predicción IA">
        <AIPredSection unit={unit} devId={devId} user={user} />
      </DrawerSection>

      <DrawerSection id="caracteristicas" title="Características">
        <CaracteristicasSection unit={unit} devId={devId} user={user} onUnitUpdated={onUnitUpdated} />
      </DrawerSection>

      <DrawerSection id="documentos" title="Documentos y assets">
        <DocumentosSection unit={unit} devId={devId} />
      </DrawerSection>

      <DrawerFooter unit={unit} devId={devId} user={user} onUnitUpdated={onUnitUpdated} />
    </div>
  );
}
