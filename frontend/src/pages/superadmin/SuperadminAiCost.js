// W2.3 SA4 — AI Cost Observatory page
import React, { useEffect, useState, useCallback } from 'react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import CostBreakdownTable from '../../components/superadmin/CostBreakdownTable';
import ModelMixChart from '../../components/superadmin/ModelMixChart';
import CapModal from '../../components/superadmin/CapModal';
import {
  DollarSign, Activity, Zap, TrendingUp, TrendingDown, AlertTriangle, X, RefreshCw,
} from 'lucide-react';
import {
  getOverview, getByTenant, getByFeature, getByModel, getTenantTimeseries, getForecast, listCaps,
} from '../../api/superadminAiCost';

function fmtMxn(v) {
  if (v == null) return '—';
  if (Math.abs(v) >= 1000) return `$${(v / 1000).toFixed(1)}K`;
  return `$${(v || 0).toFixed(2)}`;
}

// ─── Sparkline (inline SVG, no deps) ───────────────────────────────────────────
function Sparkline({ data, height = 110 }) {
  if (!data || data.length === 0) return <div style={{ height, color: 'rgba(240, 235, 224, 0.68)', fontFamily: 'DM Sans', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Sin datos</div>;
  const W = 800; const H = height;
  const pad = { l: 8, r: 8, t: 16, b: 24 };
  const innerW = W - pad.l - pad.r; const innerH = H - pad.t - pad.b;
  const max = Math.max(...data.map(d => d.mxn), 1);
  const xs = (i) => pad.l + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const ys = (v) => pad.t + innerH - (v / max) * innerH;

  // Total polyline + haiku/sonnet underlay polylines
  const totalPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xs(i)} ${ys(d.mxn)}`).join(' ');
  const haikuPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xs(i)} ${ys(d.by_model?.haiku || 0)}`).join(' ');
  const sonnetPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xs(i)} ${ys(d.by_model?.sonnet || 0)}`).join(' ');

  // Area fill for total
  const areaPath = `${totalPath} L ${xs(data.length - 1)} ${pad.t + innerH} L ${xs(0)} ${pad.t + innerH} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height }} data-testid="ai-cost-sparkline">
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(var(--theme-rgb),0.30)" />
          <stop offset="100%" stopColor="rgba(var(--theme-rgb),0.00)" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#sparkGrad)" />
      <path d={haikuPath} fill="none" stroke="#4ADE80" strokeWidth="1.4" opacity="0.7" />
      <path d={sonnetPath} fill="none" stroke="var(--theme)" strokeWidth="1.4" opacity="0.7" />
      <path d={totalPath} fill="none" stroke="var(--theme)" strokeWidth="2" />
      {data.map((d, i) => d.mxn > 0 && (
        <circle key={i} cx={xs(i)} cy={ys(d.mxn)} r="2.5" fill="var(--theme)">
          <title>{`${d.date}: ${fmtMxn(d.mxn)} (${d.calls} calls)`}</title>
        </circle>
      ))}
      {/* Y-axis labels (max + min) */}
      <text x={pad.l + 2} y={pad.t + 4} fill="rgba(240, 235, 224, 0.70)" fontFamily="DM Mono, monospace" fontSize="9">{fmtMxn(max)}</text>
      <text x={pad.l + 2} y={pad.t + innerH - 1} fill="rgba(240, 235, 224, 0.68)" fontFamily="DM Mono, monospace" fontSize="9">$0</text>
      {/* X-axis labels: first + last */}
      <text x={pad.l} y={H - 6} fill="rgba(240, 235, 224, 0.68)" fontFamily="DM Mono, monospace" fontSize="9">{data[0]?.date}</text>
      <text x={W - pad.r - 60} y={H - 6} fill="rgba(240, 235, 224, 0.68)" fontFamily="DM Mono, monospace" fontSize="9">{data[data.length - 1]?.date}</text>
    </svg>
  );
}

function KpiCard({ Icon, label, value, accent, sub }) {
  return (
    <div style={{ flex: '1 1 200px', padding: '14px 18px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
        <Icon size={11} color={accent} />
        <span style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240, 235, 224, 0.70)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</span>
      </div>
      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 24, color: accent || 'var(--cream)' }}>{value}</div>
      {sub && <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240, 235, 224, 0.72)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function CapsListModal({ caps, onClose, onEdit }) {
  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(6,8,15,0.65)', backdropFilter: 'blur(8px)', zIndex: 1450, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 560, maxHeight: '80vh', overflowY: 'auto', background: 'rgba(13,17,28,0.97)', border: '1px solid rgba(var(--theme-rgb),0.30)', borderRadius: 14, padding: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <DollarSign size={14} color="var(--theme)" />
          <h3 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--cream)', margin: 0, flex: 1 }}>
            Topes configurados ({caps.length})
          </h3>
          <button onClick={onClose} style={{ padding: 5, borderRadius: 9999, background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(240,235,224,0.55)' }}>
            <X size={14} />
          </button>
        </div>
        {caps.length === 0 && <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240, 235, 224, 0.72)', padding: 20, textAlign: 'center' }}>No hay topes configurados todavía.</div>}
        {caps.map(c => (
          <div key={c.tenant_id} style={{ padding: '10px 13px', borderRadius: 9, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--cream)' }}>{c.tenant_id}</div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.55)' }}>
                {fmtMxn(c.monthly_cap_mxn)} · alerta {c.alert_threshold_pct}%
                {c.hard_block && <span style={{ marginLeft: 6, padding: '0 6px', borderRadius: 9999, fontSize: 9, fontFamily: 'DM Mono, monospace', background: 'rgba(239,68,68,0.12)', color: '#F87171', fontWeight: 700 }}>BLOCK</span>}
              </div>
            </div>
            <button onClick={() => onEdit(c)} data-testid={`caps-edit-${c.tenant_id}`}
              style={{ padding: '5px 12px', borderRadius: 9999, background: 'rgba(var(--theme-rgb),0.10)', border: '1px solid rgba(var(--theme-rgb),0.28)', color: 'var(--theme)', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
              Editar
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SuperadminAiCost({ user, onLogout }) {
  const [period, setPeriod] = useState('month');
  const [overview, setOverview] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [features, setFeatures] = useState([]);
  const [models, setModels] = useState([]);
  const [sparkData, setSparkData] = useState([]);
  const [caps, setCaps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [capModal, setCapModal] = useState(null);
  const [capsListOpen, setCapsListOpen] = useState(false);
  const [alertOnly, setAlertOnly] = useState(false);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, byT, byF, byM, capsRes] = await Promise.all([
        getOverview(period),
        getByTenant({ period, limit: 50 }),
        getByFeature({ period }),
        getByModel(period),
        listCaps(),
      ]);
      setOverview(ov);
      setTenants(byT.items || []);
      setFeatures(byF.items || []);
      setModels(byM.items || []);
      setCaps(capsRes.items || []);
      // Aggregate sparkline: sum top 10 tenants' last 30d
      const top10 = (byT.items || []).slice(0, 10);
      const tsArr = await Promise.all(top10.map(t =>
        getTenantTimeseries(t.tenant_id, 30).catch(() => ({ items: [] }))
      ));
      const merged = {};
      tsArr.forEach(ts => (ts.items || []).forEach(d => {
        if (!merged[d.date]) merged[d.date] = { date: d.date, mxn: 0, calls: 0, by_model: { haiku: 0, sonnet: 0, other: 0 } };
        merged[d.date].mxn += d.mxn;
        merged[d.date].calls += d.calls;
        merged[d.date].by_model.haiku += d.by_model?.haiku || 0;
        merged[d.date].by_model.sonnet += d.by_model?.sonnet || 0;
        merged[d.date].by_model.other += d.by_model?.other || 0;
      }));
      const arr = Object.values(merged).sort((a, b) => a.date.localeCompare(b.date));
      arr.forEach(d => { d.mxn = Math.round(d.mxn * 100) / 100; });
      setSparkData(arr);
    } catch (e) { setToast(e.message || 'Error'); }
    finally { setLoading(false); }
  }, [period]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(''), 3000); return () => clearTimeout(t); } }, [toast]);

  const filteredTenants = alertOnly ? tenants.filter(t => t.alert_flag) : tenants;

  const PERIOD_CHIPS = [['month', 'Mes actual'], ['7d', '7d'], ['30d', '30d']];

  // Forecast cap bar color
  const forecast = overview?.forecast_end_of_month_mxn || 0;
  const trend = overview?.trend_pct_vs_prev_period || 0;
  const TrendIcon = trend >= 0 ? TrendingUp : TrendingDown;
  const trendColor = trend >= 0 ? '#F87171' : '#4ADE80';

  return (
    <SuperadminLayout user={user} onLogout={onLogout}>
      <div data-testid="superadmin-ai-cost">
        {toast && (
          <div data-testid="ai-cost-toast" style={{ position: 'fixed', top: 76, right: 20, zIndex: 2000, padding: '11px 18px', borderRadius: 10, background: 'rgba(var(--theme-rgb),0.18)', border: '1px solid rgba(var(--theme-rgb),0.35)', color: 'var(--theme)', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, backdropFilter: 'blur(24px)' }}>
            {toast}
          </div>
        )}

        <div style={{ marginBottom: 22, display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <DollarSign size={20} color="var(--theme)" />
              <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: 'var(--cream)', margin: 0, letterSpacing: '-0.025em' }}>
                Costos IA
              </h1>
            </div>
            <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240, 235, 224, 0.72)', margin: 0 }}>
              Gasto real per tenant + per feature · forecast EOM · topes configurables.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {PERIOD_CHIPS.map(([k, l]) => (
              <button key={k} data-testid={`period-${k}`} onClick={() => setPeriod(k)}
                style={{ padding: '7px 14px', borderRadius: 9999, fontSize: 12, fontFamily: 'DM Sans', fontWeight: 600, cursor: 'pointer', border: period === k ? '1px solid rgba(var(--theme-rgb),0.55)' : '1px solid rgba(255,255,255,0.10)', background: period === k ? 'rgba(var(--theme-rgb),0.14)' : 'transparent', color: period === k ? 'var(--theme)' : 'rgba(240,235,224,0.55)' }}>
                {l}
              </button>
            ))}
            <button data-testid="ai-cost-refresh" onClick={load} disabled={loading}
              style={{ padding: '7px 12px', borderRadius: 9999, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(240,235,224,0.65)', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12, cursor: loading ? 'wait' : 'pointer' }}>
              <RefreshCw size={11} className={loading ? 'animate-spin' : ''} style={{ verticalAlign: 'middle' }} />
            </button>
            <button data-testid="ai-cost-caps-btn" onClick={() => setCapsListOpen(true)}
              style={{ padding: '8px 16px', borderRadius: 9999, background: 'linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))', border: 'none', color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>
              Configurar topes ({caps.length})
            </button>
          </div>
        </div>

        {/* KPIs */}
        {overview && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
            <KpiCard Icon={DollarSign} label="Gasto período" value={fmtMxn(overview.total_mxn)} accent="var(--theme)" sub={`${overview.total_calls} calls`} />
            <KpiCard Icon={Activity} label="Llamadas" value={overview.total_calls} accent="#4ADE80" />
            <KpiCard Icon={Zap} label="Forecast EOM" value={fmtMxn(forecast)} accent={forecast > 10000 ? '#F87171' : forecast > 5000 ? '#FACC15' : '#4ADE80'} sub={`run-rate × ${overview.forecast_end_of_month_mxn ? '' : ''}días restantes`} />
            <KpiCard Icon={TrendIcon} label="vs período previo" value={`${trend > 0 ? '+' : ''}${trend}%`} accent={trendColor} />
          </div>
        )}

        {/* Sparkline */}
        <div style={{ padding: '16px 18px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
            <h3 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)', margin: 0 }}>
              Tendencia 30 días (top 10 tenants)
            </h3>
            <div style={{ display: 'flex', gap: 10, fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.55)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 14, height: 2, background: 'var(--theme)', display: 'inline-block' }} /> Total</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 14, height: 2, background: '#4ADE80', display: 'inline-block' }} /> Haiku</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 14, height: 2, background: 'var(--theme)', display: 'inline-block' }} /> Sonnet</span>
            </div>
          </div>
          <Sparkline data={sparkData} height={120} />
        </div>

        {/* Filter chip */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button data-testid="filter-alert-only" onClick={() => setAlertOnly(s => !s)}
            style={{ padding: '5px 12px', borderRadius: 9999, fontSize: 11.5, fontFamily: 'DM Sans', fontWeight: 600, cursor: 'pointer', border: alertOnly ? '1px solid rgba(250,204,21,0.45)' : '1px solid rgba(255,255,255,0.10)', background: alertOnly ? 'rgba(250,204,21,0.10)' : 'transparent', color: alertOnly ? '#FACC15' : 'rgba(240,235,224,0.55)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <AlertTriangle size={11} />
            Solo en alerta {alertOnly && `(${filteredTenants.length})`}
          </button>
        </div>

        {/* Two-col split */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 14, marginBottom: 18 }}>
          <CostBreakdownTable
            title="Por tenant"
            kind="tenant"
            rows={filteredTenants}
            testIdPrefix="tenant-table"
            onRowClick={() => {}}
            onConfigCap={(r) => setCapModal({ tenant: r, existing: caps.find(c => c.tenant_id === r.tenant_id) })}
          />
          <CostBreakdownTable
            title="Por feature"
            kind="feature"
            rows={features}
            testIdPrefix="feature-table"
          />
        </div>

        {/* Model mix */}
        {overview && (
          <ModelMixChart split={overview.haiku_vs_sonnet_split} total={overview.total_mxn} items={models} />
        )}
      </div>

      {capModal && (
        <CapModal tenant={capModal.tenant} existingCap={capModal.existing}
          onClose={() => setCapModal(null)}
          onSaved={() => { setCapModal(null); load(); setToast('Tope guardado'); }} />
      )}
      {capsListOpen && (
        <CapsListModal caps={caps} onClose={() => setCapsListOpen(false)}
          onEdit={(c) => { setCapsListOpen(false); setCapModal({ tenant: { tenant_id: c.tenant_id, name: c.tenant_id }, existing: c }); }} />
      )}
    </SuperadminLayout>
  );
}
