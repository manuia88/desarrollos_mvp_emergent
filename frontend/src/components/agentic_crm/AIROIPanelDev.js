/**
 * W4.8 Y.5 — AIROIPanelDev
 * Developer portal · ROI dashboard de Phase Y · monetización transparente.
 * Renderiza:
 *   - Hero card: "Tu Phase Y te entregó $X MXN este mes" + ROI ratio
 *   - 4 metric cards: Pricing · Marketing · Lead conversion · Time saved
 *   - Sección breakdown desplegable (counts por feature)
 *   - CTA upgrade tier si <T3 (omitido si tier no se conoce)
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  TrendingUp, DollarSign, Users, Clock, ChevronDown, ChevronUp,
  Loader2, AlertCircle, Zap, BarChart2,
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

async function apiFetch(path, opts = {}) {
  const r = await fetch(`${API}${path}`, { credentials: 'include', ...opts });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.detail || data.error || `HTTP ${r.status}`);
  return data;
}

function formatMXN(n) {
  if (n == null) return '—';
  const num = Number(n);
  if (Math.abs(num) >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
  if (Math.abs(num) >= 1_000)     return `$${(num / 1_000).toFixed(0)}K`;
  return `$${num.toFixed(0)}`;
}

function ROIRatioBadge({ ratio }) {
  if (ratio == null) {
    return (
      <span style={{
        padding: '4px 12px', borderRadius: 9999, fontSize: 11,
        fontFamily: 'DM Sans', fontWeight: 700,
        background: 'rgba(107,114,128,0.15)', border: '1px solid rgba(107,114,128,0.3)',
        color: '#9CA3AF',
      }}>Sin datos</span>
    );
  }
  const positive = ratio >= 1;
  return (
    <span data-testid="roi-ratio-badge" style={{
      padding: '5px 14px', borderRadius: 9999, fontSize: 13,
      fontFamily: 'Outfit', fontWeight: 800,
      background: positive
        ? 'linear-gradient(90deg, rgba(52,211,153,0.18), rgba(var(--theme-rgb),0.18))'
        : 'rgba(239,68,68,0.12)',
      border: `1px solid ${positive ? 'rgba(52,211,153,0.45)' : 'rgba(239,68,68,0.35)'}`,
      color: positive ? '#4ADE80' : '#F87171',
    }}>
      ROI {ratio}x
    </span>
  );
}

function MetricCard({ icon: Icon, label, value, sub, color = 'var(--theme)' }) {
  return (
    <div data-testid={`roi-metric-${label.toLowerCase().replace(/\s+/g, '-')}`} style={{
      padding: '14px 16px', borderRadius: 14,
      background: 'rgba(255,255,255,0.025)',
      border: '1px solid rgba(255,255,255,0.08)',
      backdropFilter: 'blur(24px)',
      display: 'flex', flexDirection: 'column', gap: 8, minHeight: 110,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon size={14} color={color} />
        <span style={{
          fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600,
          letterSpacing: '0.04em', textTransform: 'uppercase',
          color: 'rgba(240,235,224,0.55)',
        }}>{label}</span>
      </div>
      <div style={{
        fontFamily: 'Outfit', fontWeight: 800, fontSize: 22,
        color: 'var(--cream)', letterSpacing: '-0.02em',
      }}>{value}</div>
      {sub && (
        <div style={{
          fontFamily: 'DM Sans', fontSize: 11,
          color: 'rgba(240,235,224,0.45)',
        }}>{sub}</div>
      )}
    </div>
  );
}

function BreakdownRow({ label, value }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '7px 12px',
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.05)',
      borderRadius: 8, marginBottom: 5,
    }}>
      <span style={{
        fontFamily: 'DM Sans', fontSize: 12,
        color: 'rgba(240,235,224,0.65)',
      }}>{label}</span>
      <span style={{
        fontFamily: 'Outfit', fontWeight: 700, fontSize: 13,
        color: 'var(--cream)',
      }}>{value ?? 0}</span>
    </div>
  );
}

export default function AIROIPanelDev({ user }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [days, setDays] = useState(30);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch(`/api/dev/ai-roi?days=${days}`);
      setData(res);
    } catch (e) {
      setError(e.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  const totals = data?.totals || {};
  const breakdown = data?.breakdown || {};
  const heroValue = useMemo(() => formatMXN(totals.total_lift_mxn), [totals.total_lift_mxn]);

  if (loading) {
    return (
      <div data-testid="airoi-panel-loading" style={{
        padding: '36px 0', textAlign: 'center', color: 'rgba(240,235,224,0.45)',
        fontFamily: 'DM Sans', fontSize: 13,
      }}>
        <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', marginBottom: 8 }} />
        <div>Calculando tu ROI Phase Y…</div>
        <style>{'@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}'}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div data-testid="airoi-panel-error" style={{
        padding: '12px 14px', borderRadius: 12,
        background: 'rgba(239,68,68,0.08)',
        border: '1px solid rgba(239,68,68,0.25)',
        fontFamily: 'DM Sans', fontSize: 12.5, color: '#F87171',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <AlertCircle size={14} />
        {error.includes('tier') || error.includes('master switch')
          ? 'Activa Phase Y · Observability (T1+) en Configuración para ver tu ROI.'
          : error}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div data-testid="airoi-panel" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Hero card */}
      <div style={{
        padding: '20px 22px', borderRadius: 16,
        background: 'rgba(var(--theme-rgb),0.06)',
        border: '1px solid rgba(var(--theme-rgb),0.32)',
        backdropFilter: 'blur(24px)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 14,
      }}>
        <div style={{ flex: 1, minWidth: 280 }}>
          <div style={{
            fontFamily: 'DM Sans', fontSize: 11,
            letterSpacing: '0.12em', textTransform: 'uppercase',
            color: 'rgba(var(--theme-rgb),0.85)', marginBottom: 6, fontWeight: 700,
          }}>Tu ROI Phase Y · últimos {days} días</div>
          <div style={{
            fontFamily: 'Outfit', fontWeight: 800, fontSize: 32,
            color: 'var(--cream)', letterSpacing: '-0.03em', lineHeight: 1.1,
          }}>
            Phase Y te entregó <span style={{
              background: 'linear-gradient(90deg, var(--theme), var(--theme-3))',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>{heroValue} MXN</span>
          </div>
          <div style={{
            fontFamily: 'DM Sans', fontSize: 13,
            color: 'rgba(240,235,224,0.55)', marginTop: 8,
          }}>
            con un costo total de {formatMXN(totals.cost_phase_y_mxn)} MXN.
            Deal promedio: {formatMXN(data.avg_deal_mxn)}.
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
          <ROIRatioBadge ratio={totals.roi_ratio} />
          <select
            data-testid="airoi-period-select"
            value={days} onChange={(e) => setDays(Number(e.target.value))}
            style={{
              padding: '6px 12px', borderRadius: 9999,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.12)',
              color: 'var(--cream)', fontFamily: 'DM Sans',
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            <option value={7}>Últimos 7 días</option>
            <option value={30}>Últimos 30 días</option>
            <option value={60}>Últimos 60 días</option>
            <option value={90}>Últimos 90 días</option>
          </select>
        </div>
      </div>

      {/* Metric cards */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: 12,
      }}>
        <MetricCard
          icon={DollarSign} label="Pricing lift"
          value={`${formatMXN(totals.pricing_lift_mxn)} MXN`}
          sub={`${breakdown.pricing_recs_applied || 0} recomendaciones aplicadas`}
          color="var(--theme)"
        />
        <MetricCard
          icon={TrendingUp} label="Marketing lift"
          value={`${formatMXN(totals.marketing_lift_mxn)} MXN`}
          sub={`${breakdown.marketing_recs_applied || 0} recomendaciones aplicadas`}
          color="var(--theme-3)"
        />
        <MetricCard
          icon={Users} label="Lead conversion"
          value={`${formatMXN(totals.lead_conversion_lift_mxn)} MXN`}
          sub={`${breakdown.lead_recs_applied || 0} recomendaciones aplicadas`}
          color="#34D399"
        />
        <MetricCard
          icon={Clock} label="Tiempo asesor"
          value={`${(totals.time_saved_hours_asesor || 0).toFixed(1)}h`}
          sub={`Equivalente: ${formatMXN(totals.time_saved_value_mxn)} MXN`}
          color="#FBBF24"
        />
      </div>

      {/* Breakdown */}
      <button
        data-testid="airoi-breakdown-toggle"
        onClick={() => setExpanded(!expanded)}
        style={{
          padding: '10px 14px', borderRadius: 9999,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.10)',
          color: 'rgba(240,235,224,0.75)', cursor: 'pointer',
          fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 600,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BarChart2 size={13} color="var(--theme)" />
          Desglose de actividad Phase Y
        </span>
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {expanded && (
        <div data-testid="airoi-breakdown" style={{
          padding: '14px 16px', borderRadius: 12,
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.07)',
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14,
        }}>
          <div>
            <div style={{
              fontFamily: 'DM Sans', fontSize: 10,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              color: 'rgba(240,235,224,0.40)', marginBottom: 8, fontWeight: 700,
            }}>Recomendaciones AI</div>
            <BreakdownRow label="Pricing aplicadas"   value={breakdown.pricing_recs_applied} />
            <BreakdownRow label="Marketing aplicadas" value={breakdown.marketing_recs_applied} />
            <BreakdownRow label="Lead aplicadas"      value={breakdown.lead_recs_applied} />
          </div>
          <div>
            <div style={{
              fontFamily: 'DM Sans', fontSize: 10,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              color: 'rgba(240,235,224,0.40)', marginBottom: 8, fontWeight: 700,
            }}>Asistentes asesor</div>
            <BreakdownRow label="Smart routings"        value={breakdown.smart_routings} />
            <BreakdownRow label="Visit dossiers"        value={breakdown.visit_dossiers} />
            <BreakdownRow label="Planes venta IA"        value={breakdown.argumentarios_used} />
            <BreakdownRow label="Replies clasificadas"  value={breakdown.replies_classified} />
            <BreakdownRow label="Touches nurture"       value={breakdown.nurture_touches_sent} />
            <BreakdownRow label="Perfiles DISC"          value={breakdown.disc_profiles} />
          </div>
          <div>
            <div style={{
              fontFamily: 'DM Sans', fontSize: 10,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              color: 'rgba(240,235,224,0.40)', marginBottom: 8, fontWeight: 700,
            }}>Llamadas a IA</div>
            <BreakdownRow label="Sub-agent runs"     value={breakdown.subagent_runs} />
            <BreakdownRow label="Director messages"  value={breakdown.director_messages} />
            <BreakdownRow label="Atlax messages"     value={breakdown.atlax_messages} />
          </div>
        </div>
      )}

      {/* CTA upgrade — solo visible si ratio < 3 (sugerencia de upgrade) */}
      {totals.roi_ratio != null && totals.roi_ratio >= 1 && totals.roi_ratio < 3 && (
        <div data-testid="airoi-cta-upgrade" style={{
          padding: '12px 16px', borderRadius: 12,
          background: 'linear-gradient(90deg, rgba(var(--theme-rgb),0.10), rgba(var(--theme-rgb),0.10))',
          border: '1px solid rgba(var(--theme-rgb),0.30)',
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        }}>
          <Zap size={14} color="var(--theme-3)" />
          <span style={{
            fontFamily: 'DM Sans', fontSize: 13,
            color: 'var(--cream)', flex: 1, minWidth: 200,
          }}>
            Tu ROI puede multiplicarse con tier T2/T3. Activa más features Phase Y.
          </span>
        </div>
      )}
    </div>
  );
}
