/**
 * W4.8 Y.5 — SuperadminObservability
 * Dashboard global Phase Y · 4 tabs:
 *   1. KPIs        — events totales, cost, top orgs ROI
 *   2. Audit Replay— timeline cronológica por target (lead/project/asesor/org)
 *   3. ML Accuracy — features ML con MAPE, hit_rate, adoption
 *   4. Replay Debugger — re-ejecuta evento Phase Y en simulation_mode
 *   5. AI ROI Matrix — cross-org sorted por ratio
 *
 * Strict design system:
 *   - rounded-full · gradient var(--theme)→var(--theme) · cero emojis · fonts Outfit + DM Sans
 *   - sin shadow-2xl → border + backdrop-blur(24px) + rgba bg
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import {
  Activity, BarChart2, GitBranch, Layers, RefreshCw,
  Loader2, AlertCircle, Search, Filter, Zap, ChevronRight,
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

async function apiFetch(path, opts = {}) {
  const r = await fetch(`${API}${path}`, { credentials: 'include', ...opts });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.detail || data.error || `HTTP ${r.status}`);
  return data;
}

function fmtUSD(n) {
  if (n == null) return '—';
  if (Math.abs(n) < 0.01) return `$${n.toFixed(6)}`;
  return `$${Number(n).toFixed(2)}`;
}
function fmtMXN(n) {
  if (n == null) return '—';
  const num = Number(n);
  if (Math.abs(num) >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
  if (Math.abs(num) >= 1_000)     return `$${(num / 1_000).toFixed(0)}K`;
  return `$${num.toFixed(0)}`;
}

// ─── Tab buttons ───────────────────────────────────────────────────────────────
const TABS = [
  { key: 'kpis',     label: 'KPIs Globales',     Icon: BarChart2 },
  { key: 'audit',    label: 'Audit Replay',      Icon: GitBranch },
  { key: 'ml',       label: 'ML Accuracy',       Icon: Activity },
  { key: 'replay',   label: 'Replay Debugger',   Icon: Layers },
  { key: 'roi',      label: 'AI ROI Matrix',     Icon: Zap },
];

function TabButton({ tab, active, onClick }) {
  const Icon = tab.Icon;
  return (
    <button
      data-testid={`obs-tab-${tab.key}`}
      onClick={onClick}
      style={{
        padding: '8px 16px', borderRadius: 9999,
        background: active
          ? 'linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))'
          : 'rgba(255,255,255,0.04)',
        border: active ? 'none' : '1px solid rgba(255,255,255,0.10)',
        color: active ? '#fff' : 'rgba(240,235,224,0.65)',
        fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 600,
        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7,
        transition: 'background 0.18s',
      }}
    >
      <Icon size={13} /> {tab.label}
    </button>
  );
}

function PageEyebrow({ label }) {
  return (
    <div className="eyebrow" style={{
      fontFamily: 'DM Sans', fontSize: 10,
      letterSpacing: '0.18em', textTransform: 'uppercase',
      color: 'rgba(240, 235, 224, 0.70)', fontWeight: 700, marginBottom: 6,
    }}>{label}</div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab 1: KPIs
// ═══════════════════════════════════════════════════════════════════════════════
function KpisTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await apiFetch(`/api/superadmin/observability/dashboard?days=${days}`);
      setData(res);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div data-testid="obs-kpis-loading" style={{ padding: 28, color: 'rgba(240,235,224,0.4)', fontFamily: 'DM Sans' }}><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Cargando…</div>;
  if (error) return <div style={{ padding: 14, color: '#F87171', fontFamily: 'DM Sans', fontSize: 13 }}><AlertCircle size={13} /> {error}</div>;

  const counts = data?.event_counts_period || {};
  const top = data?.top_orgs_by_roi || [];

  return (
    <div data-testid="obs-kpis-tab" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <PageEyebrow label="Phase Y · Vista global" />
        <select
          value={days} onChange={(e) => setDays(Number(e.target.value))}
          data-testid="obs-kpis-days"
          style={{
            padding: '6px 12px', borderRadius: 9999,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.12)',
            color: 'var(--cream)', fontFamily: 'DM Sans',
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}
        >
          <option value={7}>7 días</option>
          <option value={30}>30 días</option>
          <option value={90}>90 días</option>
        </select>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))',
        gap: 12,
      }}>
        <KpiCard label="Orgs Phase Y activas" value={data?.orgs_phase_y_active || 0} />
        <KpiCard label="Eventos totales" value={data?.total_events?.toLocaleString() || 0} />
        <KpiCard label="Sub-agent runs" value={(counts.subagent_runs || 0).toLocaleString()} />
        <KpiCard label="Lead routings" value={(counts.lead_routings || 0).toLocaleString()} />
        <KpiCard label="Visit dossiers" value={(counts.visit_prep_dossiers || 0).toLocaleString()} />
        <KpiCard label="Replies clasificadas" value={(counts.email_replies || 0).toLocaleString()} />
        <KpiCard label="Argumentarios" value={(counts.argumentario_scripts || 0).toLocaleString()} />
        <KpiCard label="DISC profiles" value={(counts.disc_profiles || 0).toLocaleString()} />
      </div>

      <div>
        <PageEyebrow label="Top orgs · ROI desc" />
        {top.length === 0 ? (
          <div style={{ padding: 18, textAlign: 'center', color: 'rgba(240,235,224,0.4)', fontFamily: 'DM Sans', fontSize: 13 }}>
            Sin datos (cron diario aún no ejecutó o no hay orgs T1+).
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {top.map((row, i) => (
              <RoiMatrixRow key={row.org_id} row={row} rank={i + 1} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({ label, value }) {
  return (
    <div style={{
      padding: '12px 14px', borderRadius: 14,
      background: 'rgba(255,255,255,0.025)',
      border: '1px solid rgba(255,255,255,0.08)',
      backdropFilter: 'blur(24px)',
    }}>
      <div style={{
        fontFamily: 'DM Sans', fontSize: 10,
        letterSpacing: '0.1em', textTransform: 'uppercase',
        color: 'rgba(240, 235, 224, 0.70)', marginBottom: 6, fontWeight: 700,
      }}>{label}</div>
      <div style={{
        fontFamily: 'Outfit', fontWeight: 800, fontSize: 22,
        color: 'var(--cream)', letterSpacing: '-0.02em',
      }}>{value}</div>
    </div>
  );
}

function RoiMatrixRow({ row, rank }) {
  const positive = (row.roi_ratio || 0) >= 1;
  return (
    <div data-testid={`obs-roi-row-${row.org_id}`} style={{
      padding: '10px 14px', borderRadius: 11,
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.07)',
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <span style={{
        fontFamily: 'Outfit', fontWeight: 800, fontSize: 12,
        color: 'rgba(240, 235, 224, 0.68)', minWidth: 28,
      }}>#{rank}</span>
      <span style={{ fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, color: 'var(--cream)', flex: 1 }}>
        {row.org_id}
      </span>
      <span style={{
        padding: '3px 10px', borderRadius: 9999, fontSize: 10.5,
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.10)',
        color: 'rgba(240,235,224,0.65)',
        fontFamily: 'DM Sans', fontWeight: 700,
      }}>{row.tier}</span>
      <span style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.55)' }}>
        Lift {fmtMXN(row.lift_mxn)}
      </span>
      <span style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.55)' }}>
        Cost {fmtMXN(row.cost_mxn)}
      </span>
      <span style={{
        padding: '4px 12px', borderRadius: 9999,
        background: positive ? 'rgba(52,211,153,0.12)' : 'rgba(239,68,68,0.12)',
        border: `1px solid ${positive ? 'rgba(52,211,153,0.35)' : 'rgba(239,68,68,0.35)'}`,
        color: positive ? '#4ADE80' : '#F87171',
        fontFamily: 'Outfit', fontWeight: 700, fontSize: 11.5,
        minWidth: 60, textAlign: 'center',
      }}>{row.roi_ratio != null ? `${row.roi_ratio}x` : '—'}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab 2: Audit Replay
// ═══════════════════════════════════════════════════════════════════════════════
function AuditTab() {
  const [orgId, setOrgId] = useState('agencia_demo');
  const [targetType, setTargetType] = useState('lead');
  const [targetId, setTargetId] = useState('');
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const search = async () => {
    if (!targetId) return;
    setLoading(true); setError(''); setData(null);
    try {
      const res = await apiFetch(
        `/api/superadmin/observability/audit-replay?org_id=${encodeURIComponent(orgId)}&target_type=${targetType}&target_id=${encodeURIComponent(targetId)}&days=${days}`
      );
      setData(res);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div data-testid="obs-audit-tab" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <PageEyebrow label="Audit Replay · timeline cronológica" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr)) auto', gap: 8 }}>
        <input
          data-testid="audit-org-input"
          value={orgId} onChange={(e) => setOrgId(e.target.value)}
          placeholder="org_id"
          style={inputStyle}
        />
        <select
          data-testid="audit-target-type"
          value={targetType} onChange={(e) => setTargetType(e.target.value)}
          style={inputStyle}
        >
          <option value="lead">Lead</option>
          <option value="project">Project</option>
          <option value="asesor">Asesor</option>
          <option value="org">Org</option>
        </select>
        <input
          data-testid="audit-target-input"
          value={targetId} onChange={(e) => setTargetId(e.target.value)}
          placeholder="target_id (lead_xxx, project slug, etc.)"
          style={inputStyle}
        />
        <select
          value={days} onChange={(e) => setDays(Number(e.target.value))}
          style={inputStyle}
        >
          <option value={7}>7d</option>
          <option value={30}>30d</option>
          <option value={90}>90d</option>
        </select>
        <button
          data-testid="audit-search-btn"
          onClick={search}
          disabled={!targetId || loading}
          style={{
            padding: '10px 18px', borderRadius: 9999,
            background: 'linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))',
            color: '#fff', border: 'none', cursor: !targetId || loading ? 'not-allowed' : 'pointer',
            fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 700,
            display: 'flex', alignItems: 'center', gap: 6,
            opacity: !targetId || loading ? 0.5 : 1,
          }}
        >
          <Search size={12} /> Buscar
        </button>
      </div>

      {error && (
        <div style={{ padding: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, color: '#F87171', fontFamily: 'DM Sans', fontSize: 13 }}>
          <AlertCircle size={13} style={{ marginRight: 6 }} />{error}
        </div>
      )}

      {loading && <div style={{ padding: 14, color: 'rgba(240,235,224,0.4)' }}><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Buscando…</div>}

      {data && (
        <div>
          <div style={{ display: 'flex', gap: 14, marginBottom: 12, fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.55)' }}>
            <span><strong style={{ color: 'var(--cream)' }}>{data.total_events}</strong> eventos</span>
            <span>Costo total <strong style={{ color: 'var(--cream)' }}>{fmtUSD(data.total_cost_usd)}</strong></span>
            {Object.entries(data.by_event_type || {}).map(([type, n]) => (
              <span key={type}>{type}: {n}</span>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(data.events || []).map((e) => (
              <TimelineRow key={e._id || `${e.event_type}-${e.created_at}`} event={e} />
            ))}
            {(data.events || []).length === 0 && (
              <div style={{ padding: 22, textAlign: 'center', color: 'rgba(240,235,224,0.4)', fontFamily: 'DM Sans', fontSize: 13 }}>
                Sin eventos en este target/periodo.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const inputStyle = {
  padding: '10px 14px', borderRadius: 9999,
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.10)',
  color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13,
  outline: 'none',
};

const TYPE_COLORS = {
  smart_routing:    { bg: 'rgba(var(--theme-rgb),0.10)',  border: 'rgba(var(--theme-rgb),0.30)',  color: 'var(--theme)' },
  visit_prep:       { bg: 'rgba(52,211,153,0.10)',  border: 'rgba(52,211,153,0.30)',  color: '#4ADE80' },
  reply_classifier: { bg: 'rgba(251,191,36,0.10)',  border: 'rgba(251,191,36,0.30)',  color: '#FBBF24' },
  disc:             { bg: 'rgba(var(--theme-rgb),0.10)',  border: 'rgba(var(--theme-rgb),0.30)',  color: '#F472B6' },
  argumentario:     { bg: 'rgba(167,139,250,0.10)', border: 'rgba(167,139,250,0.30)', color: '#A78BFA' },
  nurture_sequence: { bg: 'rgba(56,189,248,0.10)',  border: 'rgba(56,189,248,0.30)',  color: '#38BDF8' },
  director_call:    { bg: 'rgba(244,114,182,0.10)', border: 'rgba(244,114,182,0.30)', color: '#F472B6' },
  atlax_message:    { bg: 'rgba(147,197,253,0.10)', border: 'rgba(147,197,253,0.30)', color: '#93C5FD' },
  sub_agent_run:    { bg: 'rgba(var(--theme-rgb),0.10)',  border: 'rgba(var(--theme-rgb),0.30)',  color: 'var(--theme)' },
  whatif:           { bg: 'rgba(239,68,68,0.10)',   border: 'rgba(239,68,68,0.30)',   color: '#F87171' },
};

function TimelineRow({ event }) {
  const c = TYPE_COLORS[event.event_type] || { bg: 'rgba(107,114,128,0.10)', border: 'rgba(107,114,128,0.30)', color: '#9CA3AF' };
  return (
    <div data-testid={`obs-timeline-${event.event_type}`} style={{
      padding: '10px 14px', borderRadius: 12,
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.07)',
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
    }}>
      <span style={{
        padding: '3px 10px', borderRadius: 9999,
        background: c.bg, border: `1px solid ${c.border}`,
        color: c.color, fontSize: 10.5, fontFamily: 'DM Sans', fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: '0.05em',
      }}>{event.event_type}</span>
      {event.event_subtype && (
        <span style={{
          padding: '2px 8px', borderRadius: 9999, fontSize: 10,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          color: 'rgba(240,235,224,0.55)', fontFamily: 'DM Sans', fontWeight: 600,
        }}>{event.event_subtype}</span>
      )}
      <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.65)', flex: 1, minWidth: 200 }}>
        {event.input_summary || event.agent_name}
        {event.output_summary && <> → <span style={{ color: 'rgba(240, 235, 224, 0.70)' }}>{event.output_summary}</span></>}
      </span>
      {event.layer_used && (
        <span style={{
          padding: '2px 8px', borderRadius: 9999, fontSize: 9.5,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          color: 'rgba(240,235,224,0.55)', fontFamily: 'DM Sans', fontWeight: 600,
        }}>{event.layer_used}</span>
      )}
      {event.cost_usd > 0 && (
        <span style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240, 235, 224, 0.68)' }}>
          {fmtUSD(event.cost_usd)}
        </span>
      )}
      <span style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240, 235, 224, 0.68)', fontVariantNumeric: 'tabular-nums' }}>
        {(event.created_at || '').slice(0, 19).replace('T', ' ')}
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab 3: ML Accuracy
// ═══════════════════════════════════════════════════════════════════════════════
function MLAccuracyTab() {
  const [orgId, setOrgId] = useState('');
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const url = `/api/superadmin/observability/ml-accuracy?days=${days}${orgId ? `&org_id=${encodeURIComponent(orgId)}` : ''}`;
      setData(await apiFetch(url));
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [days]);

  return (
    <div data-testid="obs-ml-tab" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <PageEyebrow label="ML Accuracy · features con predicción medible" />

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          value={orgId} onChange={(e) => setOrgId(e.target.value)}
          placeholder="org_id (vacío = global)"
          style={{ ...inputStyle, flex: 1 }}
          data-testid="ml-org-input"
        />
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={inputStyle}>
          <option value={30}>30 días</option>
          <option value={90}>90 días</option>
          <option value={180}>180 días</option>
        </select>
        <button
          onClick={load} disabled={loading}
          data-testid="ml-load-btn"
          style={{
            padding: '10px 18px', borderRadius: 9999,
            background: 'linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))',
            color: '#fff', border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 700,
            display: 'flex', alignItems: 'center', gap: 6,
            opacity: loading ? 0.5 : 1,
          }}
        ><RefreshCw size={12} /> Recargar</button>
      </div>

      {error && <div style={{ padding: 12, background: 'rgba(239,68,68,0.08)', borderRadius: 10, color: '#F87171', fontFamily: 'DM Sans', fontSize: 13 }}>{error}</div>}

      {loading && <div style={{ padding: 14, color: 'rgba(240,235,224,0.4)' }}><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Calculando accuracies…</div>}

      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
          {Object.entries(data.features || {}).map(([feat, payload]) => (
            <MLFeatureCard key={feat} feature={feat} data={payload} />
          ))}
        </div>
      )}
    </div>
  );
}

function MLFeatureCard({ feature, data }) {
  const m = data.metrics || {};
  return (
    <div data-testid={`ml-card-${feature}`} style={{
      padding: '14px 16px', borderRadius: 14,
      background: 'rgba(255,255,255,0.025)',
      border: '1px solid rgba(255,255,255,0.08)',
      backdropFilter: 'blur(24px)',
      display: 'flex', flexDirection: 'column', gap: 9,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          fontFamily: 'Outfit', fontWeight: 800, fontSize: 14,
          color: 'var(--cream)',
        }}>{feature}</span>
        <span style={{
          padding: '2px 8px', borderRadius: 9999, fontSize: 10,
          background: 'rgba(var(--theme-rgb),0.10)',
          border: '1px solid rgba(var(--theme-rgb),0.30)',
          color: 'var(--theme)', fontFamily: 'DM Sans', fontWeight: 700,
        }}>n={data.sample_size || 0}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {Object.entries(m).map(([k, v]) => {
          const display = (v == null || v === '') ? '—'
            : (typeof v === 'object') ? JSON.stringify(v)
            : String(v);
          return (
            <div key={k} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '5px 0', borderBottom: '1px dashed rgba(255,255,255,0.05)',
            }}>
              <span style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.55)' }}>{k}</span>
              <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream)', fontWeight: 600, maxWidth: '60%', textAlign: 'right' }}>{display}</span>
            </div>
          );
        })}
        {Object.keys(m).length === 0 && (
          <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.4)', padding: '6px 0' }}>Sin métricas en periodo.</div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab 4: Replay Debugger
// ═══════════════════════════════════════════════════════════════════════════════
function ReplayTab() {
  const [orgId, setOrgId] = useState('agencia_demo');
  const [days, setDays] = useState(7);
  const [list, setList] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [replayResult, setReplayResult] = useState(null);
  const [replaying, setReplaying] = useState(false);
  const [error, setError] = useState('');

  const loadList = async () => {
    setLoading(true); setError('');
    try {
      const res = await apiFetch(`/api/superadmin/observability/replay/list?org_id=${encodeURIComponent(orgId)}&days=${days}`);
      setList(res);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const replay = async (event) => {
    setReplaying(true); setReplayResult(null); setError('');
    try {
      const res = await apiFetch(
        `/api/superadmin/observability/replay/${encodeURIComponent(event.event_id)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ org_id: orgId, event_type: event.event_type }),
        }
      );
      setReplayResult(res);
    } catch (e) { setError(e.message); }
    finally { setReplaying(false); }
  };

  useEffect(() => { loadList(); /* eslint-disable-next-line */ }, []);

  return (
    <div data-testid="obs-replay-tab" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <PageEyebrow label="Replay Debugger · re-ejecuta evento Phase Y en simulation" />

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={orgId} onChange={(e) => setOrgId(e.target.value)}
          placeholder="org_id" style={{ ...inputStyle, flex: 1 }}
          data-testid="replay-org-input"
        />
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={inputStyle}>
          <option value={7}>7d</option>
          <option value={14}>14d</option>
          <option value={30}>30d</option>
        </select>
        <button onClick={loadList} disabled={loading} data-testid="replay-list-btn" style={primaryBtn}><Search size={12} /> Listar</button>
      </div>

      {error && <div style={{ padding: 12, background: 'rgba(239,68,68,0.08)', borderRadius: 10, color: '#F87171', fontFamily: 'DM Sans', fontSize: 13 }}>{error}</div>}

      {loading && <div style={{ padding: 14, color: 'rgba(240,235,224,0.4)' }}><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Cargando…</div>}

      {list && (
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 480, overflowY: 'auto' }}>
            <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240, 235, 224, 0.70)', marginBottom: 4 }}>
              {list.total} eventos replayables
            </div>
            {(list.events || []).map((e) => (
              <button
                key={e.event_id}
                data-testid={`replay-event-${e.event_id}`}
                onClick={() => { setSelected(e); replay(e); }}
                style={{
                  padding: '10px 14px', borderRadius: 11,
                  background: selected?.event_id === e.event_id
                    ? 'rgba(var(--theme-rgb),0.10)'
                    : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${selected?.event_id === e.event_id ? 'rgba(var(--theme-rgb),0.40)' : 'rgba(255,255,255,0.07)'}`,
                  color: 'var(--cream)', cursor: 'pointer', textAlign: 'left',
                  display: 'flex', flexDirection: 'column', gap: 4,
                }}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{
                    padding: '2px 8px', borderRadius: 9999, fontSize: 10,
                    background: (TYPE_COLORS[e.event_type] || {}).bg,
                    border: `1px solid ${(TYPE_COLORS[e.event_type] || {}).border}`,
                    color: (TYPE_COLORS[e.event_type] || {}).color,
                    fontFamily: 'DM Sans', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
                  }}>{e.event_type}</span>
                  {e.subtype && (
                    <span style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240,235,224,0.55)' }}>{e.subtype}</span>
                  )}
                  {e.layer_used && (
                    <span style={{
                      padding: '1px 6px', borderRadius: 9999, fontSize: 9.5,
                      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                      color: 'rgba(240,235,224,0.55)', fontFamily: 'DM Sans', fontWeight: 600,
                      marginLeft: 'auto',
                    }}>{e.layer_used}</span>
                  )}
                </div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240, 235, 224, 0.70)' }}>
                  {e.target_id} · {(e.created_at || '').slice(0, 19).replace('T', ' ')}
                </div>
              </button>
            ))}
            {(list.events || []).length === 0 && (
              <div style={{ padding: 20, color: 'rgba(240,235,224,0.4)', fontFamily: 'DM Sans', fontSize: 12.5, textAlign: 'center' }}>
                Sin eventos replayables.
              </div>
            )}
          </div>

          <div data-testid="replay-detail-panel" style={{
            padding: '12px 14px', borderRadius: 14,
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.07)',
            backdropFilter: 'blur(24px)',
            minHeight: 240, maxHeight: 480, overflowY: 'auto',
          }}>
            {!selected && !replaying && (
              <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'rgba(240, 235, 224, 0.70)', padding: 12 }}>
                Selecciona un evento para re-ejecutarlo en simulation_mode.
              </div>
            )}
            {replaying && (
              <div style={{ padding: 14, color: 'rgba(240,235,224,0.55)', fontFamily: 'DM Sans', fontSize: 13 }}>
                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Re-ejecutando…
              </div>
            )}
            {replayResult && <ReplayResult res={replayResult} />}
          </div>
        </div>
      )}
    </div>
  );
}

const primaryBtn = {
  padding: '10px 18px', borderRadius: 9999,
  background: 'linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))',
  color: '#fff', border: 'none', cursor: 'pointer',
  fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 700,
  display: 'flex', alignItems: 'center', gap: 6,
};

function ReplayResult({ res }) {
  const diff = res.diff || {};
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontFamily: 'DM Sans' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          fontFamily: 'Outfit', fontWeight: 800, fontSize: 14, color: 'var(--cream)',
        }}>{res.event_type}</span>
        <span style={{ fontSize: 11, color: 'rgba(240,235,224,0.5)' }}>{res.event_id}</span>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {Object.entries(diff).map(([k, v]) => (
          <span key={k} style={{
            padding: '3px 10px', borderRadius: 9999, fontSize: 10.5,
            background: typeof v === 'boolean' ? (v ? 'rgba(239,68,68,0.10)' : 'rgba(52,211,153,0.10)') : 'rgba(255,255,255,0.04)',
            border: `1px solid ${typeof v === 'boolean' ? (v ? 'rgba(239,68,68,0.30)' : 'rgba(52,211,153,0.30)') : 'rgba(255,255,255,0.10)'}`,
            color: typeof v === 'boolean' ? (v ? '#F87171' : '#4ADE80') : 'rgba(240,235,224,0.65)',
            fontWeight: 700,
          }}>{k}: {String(v)}</span>
        ))}
      </div>

      <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(240,235,224,0.4)', fontWeight: 700, marginTop: 4 }}>Steps</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {(res.steps || []).map((s, i) => (
          <div key={i} style={{
            padding: '7px 10px', borderRadius: 8,
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)',
            fontSize: 11.5, color: 'rgba(240,235,224,0.65)',
          }}>
            <strong style={{ color: 'var(--theme)' }}>{s.step}.</strong> {s.phase} — <span style={{ color: 'rgba(240, 235, 224, 0.70)' }}>{JSON.stringify(s.data || {}).slice(0, 200)}</span>
          </div>
        ))}
      </div>

      <details>
        <summary style={{ cursor: 'pointer', fontSize: 11, color: 'rgba(240,235,224,0.55)', fontWeight: 700, marginTop: 6 }}>Ver original + replay raw</summary>
        <pre style={{
          marginTop: 8, padding: 10, borderRadius: 8,
          background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.08)',
          fontSize: 10.5, color: 'rgba(240,235,224,0.7)', maxHeight: 200, overflow: 'auto',
        }}>{JSON.stringify({ original: res.original, replay: res.replay }, null, 2)}</pre>
      </details>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab 5: ROI Matrix
// ═══════════════════════════════════════════════════════════════════════════════
function RoiMatrixTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [tier, setTier] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const url = `/api/superadmin/observability/ai-roi/matrix?days=${days}${tier ? `&tier=${tier}` : ''}`;
      setData(await apiFetch(url));
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [days, tier]);

  useEffect(() => { load(); }, [load]);

  return (
    <div data-testid="obs-roi-tab" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <PageEyebrow label="AI ROI Matrix · cross-org sorted por ratio" />

      <div style={{ display: 'flex', gap: 8 }}>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={inputStyle}>
          <option value={7}>7d</option>
          <option value={30}>30d</option>
          <option value={90}>90d</option>
          <option value={180}>180d</option>
        </select>
        <select value={tier} onChange={(e) => setTier(e.target.value)} style={inputStyle} data-testid="roi-tier-filter">
          <option value="">Todos los tiers</option>
          <option value="T1">Solo T1</option>
          <option value="T2">Solo T2</option>
          <option value="T3">Solo T3</option>
          <option value="T4">Solo T4</option>
        </select>
        <button onClick={load} disabled={loading} style={primaryBtn} data-testid="roi-load-btn"><RefreshCw size={12} /> Recargar</button>
      </div>

      {error && <div style={{ padding: 12, background: 'rgba(239,68,68,0.08)', borderRadius: 10, color: '#F87171', fontFamily: 'DM Sans', fontSize: 13 }}>{error}</div>}

      {loading && <div style={{ padding: 14, color: 'rgba(240,235,224,0.4)' }}><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Cargando matrix…</div>}

      {data && (
        <div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.55)', marginBottom: 10 }}>
            <strong style={{ color: 'var(--cream)' }}>{data.total_orgs}</strong> orgs en matrix.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(data.rows || []).map((r, i) => (
              <RoiMatrixRow key={r.org_id} row={r} rank={i + 1} />
            ))}
          </div>
          {(data.rows || []).length === 0 && (
            <div style={{ padding: 20, color: 'rgba(240,235,224,0.4)', fontFamily: 'DM Sans', fontSize: 13, textAlign: 'center' }}>
              Sin orgs · ejecutar cron <code>ai_roi_daily_rollup</code>.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Page wrapper
// ═══════════════════════════════════════════════════════════════════════════════
export default function SuperadminObservability({ user, onLogout }) {
  const [tab, setTab] = useState('kpis');

  return (
    <SuperadminLayout user={user} onLogout={onLogout}>
      <div data-testid="superadmin-observability" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <div className="eyebrow" style={{ fontFamily: 'DM Sans', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(240, 235, 224, 0.70)', fontWeight: 700, marginBottom: 6 }}>
            Phase Y · Observability
          </div>
          <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 30, color: 'var(--cream)', letterSpacing: '-0.028em', margin: '4px 0 6px' }}>
            Visión global de inteligencia agentic
          </h1>
          <p style={{ fontFamily: 'DM Sans', fontSize: 13.5, color: 'rgba(240,235,224,0.55)', maxWidth: 700 }}>
            Auditoría · accuracy ML · replay debugger · ROI monetario por desarrollador.
            Cierra el ciclo de transparencia y compliance Phase Y.
          </p>
        </div>

        <div style={{
          display: 'flex', gap: 8, flexWrap: 'wrap',
          padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}>
          {TABS.map((t) => (
            <TabButton key={t.key} tab={t} active={tab === t.key} onClick={() => setTab(t.key)} />
          ))}
        </div>

        <div style={{ paddingTop: 8 }}>
          {tab === 'kpis'   && <KpisTab />}
          {tab === 'audit'  && <AuditTab />}
          {tab === 'ml'     && <MLAccuracyTab />}
          {tab === 'replay' && <ReplayTab />}
          {tab === 'roi'    && <RoiMatrixTab />}
        </div>

        <style>{'@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}'}</style>
      </div>
    </SuperadminLayout>
  );
}
