/**
 * W4.5 Y.2C — LeadAgentPanel
 * Panel de Lead Sub-Agent — funnel de leads, stale, asesores, segmentos.
 * Mismo patrón visual que PricingAgentPanel / MarketingAgentPanel.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Users, CheckCircle, XCircle, Clock, Zap } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

// ─── API helpers ─────────────────────────────────────────────────────────────
async function runLeadAnalysis(periodDays) {
  const res = await fetch(`${API}/api/subagents/lead/analyze`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ period_days: periodDays }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Error al analizar funnel');
  return data;
}

async function fetchLeadRecs(status, targetType) {
  const params = new URLSearchParams({ limit: 50 });
  if (status && status !== 'all') params.append('status', status);
  if (targetType && targetType !== 'all') params.append('target_type', targetType);
  const res = await fetch(`${API}/api/subagents/lead/recommendations?${params}`, {
    credentials: 'include',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Error al cargar recomendaciones');
  return data;
}

async function applyLeadRec(recId) {
  const res = await fetch(`${API}/api/subagents/lead/recommendations/${recId}/apply`, {
    method: 'POST', credentials: 'include',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Error al aplicar');
  return data;
}

async function rejectLeadRec(recId) {
  const res = await fetch(`${API}/api/subagents/lead/recommendations/${recId}/reject`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: 'Rechazada manualmente por superadmin' }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Error al rechazar');
  return data;
}

// ─── Issue metadata ───────────────────────────────────────────────────────────
const ISSUE_META = {
  stale_lead:               { label: 'Lead sin contacto',      color: 'var(--red)' },
  low_conversion_asesor:    { label: 'Conv. asesor baja',      color: 'var(--amber)' },
  drop_at_stage:            { label: 'Drop-off en etapa',      color: 'var(--theme-3)' },
  underperforming_segment:  { label: 'Segmento bajo',          color: 'var(--theme)' },
  missing_followup:         { label: 'Sin seguimiento',        color: '#94A3B8' },
};

const TARGET_META = {
  lead:         { label: 'Lead',      color: 'var(--green)' },
  asesor:       { label: 'Asesor',    color: 'var(--theme)' },
  funnel_stage: { label: 'Etapa',     color: 'var(--amber)' },
  segment:      { label: 'Segmento',  color: 'var(--theme-3)' },
};

const SEVERITY_COLORS = { high: '#F87171', medium: '#F59E0B', low: '#4ADE80' };

// ─── Sub-components ───────────────────────────────────────────────────────────
function Badge({ label, color }) {
  return (
    <span style={{ padding: '1px 7px', borderRadius: 9999, fontSize: 10, fontFamily: 'DM Sans', fontWeight: 700, background: `${color}22`, border: `1px solid ${color}44`, color }}>
      {label}
    </span>
  );
}

function LayerBadge({ layer }) {
  const map = { llm: ['var(--theme)', 'LLM'], cache: ['#F59E0B', 'Caché'], heuristic: ['#10B981', 'Heurística'], none: ['#6B7280', 'Sin datos'] };
  const [color, label] = map[layer] || ['#6B7280', layer || '—'];
  return <Badge label={label} color={color} />;
}

function IssueBadge({ issue }) {
  const { label, color } = ISSUE_META[issue] || { label: issue, color: '#6B7280' };
  return <Badge label={label} color={color} />;
}

function TargetBadge({ targetType }) {
  const { label, color } = TARGET_META[targetType] || { label: targetType, color: '#6B7280' };
  return <Badge label={label} color={color} />;
}

function SeverityBadge({ severity }) {
  const label = { high: 'Alta', medium: 'Media', low: 'Baja' }[severity] || severity;
  const color = SEVERITY_COLORS[severity] || '#6B7280';
  return <Badge label={label} color={color} />;
}

function StatusBadge({ status }) {
  const map = { pending: ['#F59E0B', 'Pendiente'], applied: ['#4ADE80', 'Aplicada'], rejected: ['#F87171', 'Rechazada'], expired: ['#6B7280', 'Vencida'] };
  const [color, label] = map[status] || ['#6B7280', status];
  return <Badge label={label} color={color} />;
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function LeadAgentPanel({ orgId }) {
  const [periodDays, setPeriodDays] = useState(30);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState(null);
  const [lastRun, setLastRun] = useState(null);
  const [recs, setRecs] = useState([]);
  const [recsTotal, setRecsTotal] = useState(0);
  const [recsLoading, setRecsLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [actionBusy, setActionBusy] = useState({});
  const [toast, setToast] = useState(null);

  const loadRecs = useCallback(async (sf, tf) => {
    setRecsLoading(true);
    try {
      const data = await fetchLeadRecs(sf, tf);
      setRecs(data.items || []);
      setRecsTotal(data.total || 0);
    } catch {
      setRecs([]);
    } finally {
      setRecsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecs(statusFilter, typeFilter);
  }, [statusFilter, typeFilter, loadRecs]);

  const handleAnalyze = async () => {
    if (analyzing) return;
    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      const result = await runLeadAnalysis(periodDays);
      setLastRun(result);
      showToast(`Análisis completado · ${result.recommendations_count} recomendaciones · layer=${result.layer_used}`);
      await loadRecs(statusFilter, typeFilter);
    } catch (err) {
      setAnalyzeError(err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleApply = async (recId) => {
    setActionBusy(prev => ({ ...prev, [recId]: 'apply' }));
    try {
      await applyLeadRec(recId);
      showToast('Recomendación aplicada');
      setRecs(prev => prev.map(r => r.id === recId ? { ...r, status: 'applied' } : r));
    } catch (err) {
      showToast(err.message, true);
    } finally {
      setActionBusy(prev => ({ ...prev, [recId]: null }));
    }
  };

  const handleReject = async (recId) => {
    setActionBusy(prev => ({ ...prev, [recId]: 'reject' }));
    try {
      await rejectLeadRec(recId);
      showToast('Recomendación rechazada');
      setRecs(prev => prev.map(r => r.id === recId ? { ...r, status: 'rejected' } : r));
    } catch (err) {
      showToast(err.message, true);
    } finally {
      setActionBusy(prev => ({ ...prev, [recId]: null }));
    }
  };

  const showToast = (msg, isError = false) => {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), 3500);
  };

  const filterTabs = [['all', 'Todas'], ['pending', 'Pendientes'], ['applied', 'Aplicadas'], ['rejected', 'Rechazadas']];
  const typeTabs = [['all', 'Todos'], ['lead', 'Lead'], ['asesor', 'Asesor'], ['funnel_stage', 'Etapa'], ['segment', 'Segmento']];
  const periodOptions = [['14', '14 días'], ['30', '30 días'], ['60', '60 días'], ['90', '90 días']];

  return (
    <div data-testid="lead-agent-panel" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Toast */}
      {toast && (
        <div data-testid="lead-toast" style={{
          padding: '10px 14px', borderRadius: 9, fontSize: 12, fontFamily: 'DM Sans',
          background: toast.isError ? 'rgba(248,113,113,0.12)' : 'rgba(74,222,128,0.12)',
          border: `1px solid ${toast.isError ? 'rgba(248,113,113,0.30)' : 'rgba(74,222,128,0.30)'}`,
          color: toast.isError ? '#F87171' : '#4ADE80',
        }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 2 }}>
        <Users size={14} color="#4ADE80" />
        <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: 'var(--cream)' }}>Sub-agente de Leads</span>
        <span style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(var(--cream-rgb),0.45)', marginLeft: 'auto' }}>org: {orgId}</span>
      </div>

      {/* Period selector + Analyze button */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <select
          data-testid="lead-period-select"
          value={String(periodDays)}
          onChange={e => setPeriodDays(parseInt(e.target.value))}
          style={{
            padding: '7px 10px', borderRadius: 9999, background: 'rgba(var(--cream-rgb),0.05)',
            border: '1px solid rgba(var(--cream-rgb),0.12)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12,
            cursor: 'pointer', outline: 'none',
          }}
        >
          {periodOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button
          data-testid="lead-analyze-btn"
          onClick={handleAnalyze}
          disabled={analyzing}
          style={{
            flex: 1, padding: '7px 16px', borderRadius: 9999, fontSize: 12, fontFamily: 'DM Sans', fontWeight: 700,
            background: analyzing ? 'rgba(74,222,128,0.25)' : 'linear-gradient(90deg, var(--theme), var(--theme-3))',
            border: 'none', color: '#fff', cursor: analyzing ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          }}
        >
          <Zap size={12} />
          {analyzing ? 'Analizando…' : 'Analizar funnel'}
        </button>
      </div>

      {/* Error */}
      {analyzeError && (
        <div data-testid="lead-analyze-error" style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)', color: 'var(--red)', fontFamily: 'DM Sans', fontSize: 12 }}>
          {analyzeError}
        </div>
      )}

      {/* Last run summary */}
      {lastRun && (
        <div data-testid="lead-last-run" style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.20)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Clock size={11} color="rgba(var(--cream-rgb),0.40)" />
          <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(var(--cream-rgb),0.55)' }}>
            {lastRun.recommendations_count} issues del funnel detectados · {lastRun.period_days}d
          </span>
          <LayerBadge layer={lastRun.layer_used} />
          {lastRun.simulation_mode && (
            <span style={{ padding: '1px 7px', borderRadius: 9999, fontSize: 10, background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.30)', color: 'var(--amber)', fontFamily: 'DM Sans', fontWeight: 700 }}>SIMULACIÓN</span>
          )}
        </div>
      )}

      {/* Status filter tabs */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {filterTabs.map(([k, l]) => (
          <button key={k} data-testid={`lead-filter-${k}`} onClick={() => setStatusFilter(k)}
            style={{
              padding: '4px 10px', borderRadius: 9999, fontSize: 11, fontFamily: 'DM Sans', fontWeight: 600, cursor: 'pointer',
              background: statusFilter === k ? 'rgba(74,222,128,0.14)' : 'transparent',
              border: statusFilter === k ? '1px solid rgba(74,222,128,0.45)' : '1px solid rgba(var(--cream-rgb),0.08)',
              color: statusFilter === k ? '#4ADE80' : 'rgba(var(--cream-rgb),0.50)',
            }}
          >{l}</button>
        ))}
        <span style={{ marginLeft: 'auto', fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(var(--cream-rgb),0.35)', alignSelf: 'center' }}>{recsTotal} total</span>
      </div>

      {/* Target type filter */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {typeTabs.map(([k, l]) => (
          <button key={k} data-testid={`lead-type-filter-${k}`} onClick={() => setTypeFilter(k)}
            style={{
              padding: '3px 9px', borderRadius: 9999, fontSize: 10.5, fontFamily: 'DM Sans', fontWeight: 600, cursor: 'pointer',
              background: typeFilter === k ? 'rgba(var(--theme-rgb),0.14)' : 'transparent',
              border: typeFilter === k ? '1px solid rgba(var(--theme-rgb),0.40)' : '1px solid rgba(var(--cream-rgb),0.06)',
              color: typeFilter === k ? 'var(--theme)' : 'rgba(var(--cream-rgb),0.40)',
            }}
          >{l}</button>
        ))}
      </div>

      {/* Recommendations list */}
      {recsLoading ? (
        <div style={{ padding: '20px 0', textAlign: 'center', color: 'rgba(var(--cream-rgb),0.35)', fontFamily: 'DM Sans', fontSize: 12 }}>
          Cargando recomendaciones…
        </div>
      ) : recs.length === 0 ? (
        <div data-testid="lead-no-recs" style={{ padding: '24px 0', textAlign: 'center', color: 'rgba(var(--cream-rgb),0.40)', fontFamily: 'DM Sans', fontSize: 12 }}>
          No se detectaron issues en el funnel de leads.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {recs.map(rec => (
            <LeadRecCard
              key={rec.id}
              rec={rec}
              busy={actionBusy[rec.id]}
              onApply={() => handleApply(rec.id)}
              onReject={() => handleReject(rec.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── LeadRecCard ──────────────────────────────────────────────────────────────
function LeadRecCard({ rec, busy, onApply, onReject }) {
  const [expanded, setExpanded] = useState(false);
  const isPending = rec.status === 'pending';

  return (
    <div
      data-testid={`lead-rec-${rec.id}`}
      style={{
        padding: '10px 12px', borderRadius: 10,
        background: 'rgba(var(--cream-rgb),0.03)',
        border: '1px solid rgba(var(--cream-rgb),0.07)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
        {/* Target + badges */}
        <div style={{ flex: 1, minWidth: 130 }}>
          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 12.5, color: 'var(--cream)', marginBottom: 3 }}>
            {rec.target_id || '—'}
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            <StatusBadge status={rec.status} />
            <TargetBadge targetType={rec.target_type} />
            <IssueBadge issue={rec.issue_detected} />
            <SeverityBadge severity={rec.severity} />
            <LayerBadge layer={rec.layer_used} />
          </div>
        </div>

        {/* Lift + confidence */}
        <div style={{ textAlign: 'right', minWidth: 80 }}>
          {rec.expected_lift_pct != null && (
            <>
              <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'rgba(var(--cream-rgb),0.40)', marginBottom: 1 }}>lift esp.</div>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: 'var(--green)', fontWeight: 700 }}>+{rec.expected_lift_pct}%</div>
            </>
          )}
          <div style={{ marginTop: 2 }}>
            <Badge label={`${rec.confidence_score || 0}%`} color={rec.confidence_score >= 75 ? '#4ADE80' : rec.confidence_score >= 50 ? '#F59E0B' : '#F87171'} />
          </div>
        </div>
      </div>

      {/* Action text (collapsible) */}
      {rec.suggested_action_text && (
        <div style={{ marginTop: 7 }}>
          <div
            style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(var(--cream-rgb),0.50)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
            onClick={() => setExpanded(e => !e)}
          >
            <span style={{ fontSize: 10 }}>{expanded ? '▲' : '▼'}</span>
            Acción sugerida
          </div>
          {expanded && (
            <div data-testid={`lead-rec-action-${rec.id}`} style={{ marginTop: 4, padding: '6px 9px', borderRadius: 7, background: 'rgba(74,222,128,0.05)', border: '1px solid rgba(74,222,128,0.15)', fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(var(--cream-rgb),0.70)', lineHeight: 1.55 }}>
              {rec.suggested_action_text}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      {isPending && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button
            data-testid={`lead-apply-${rec.id}`}
            onClick={onApply}
            disabled={!!busy}
            style={{
              padding: '5px 13px', borderRadius: 9999, fontSize: 11, fontFamily: 'DM Sans', fontWeight: 700,
              background: busy === 'apply' ? 'rgba(74,222,128,0.20)' : 'rgba(74,222,128,0.12)',
              border: '1px solid rgba(74,222,128,0.35)', color: 'var(--green)', cursor: busy ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <CheckCircle size={10} />
            {busy === 'apply' ? '…' : 'Aplicar'}
          </button>
          <button
            data-testid={`lead-reject-${rec.id}`}
            onClick={onReject}
            disabled={!!busy}
            style={{
              padding: '5px 13px', borderRadius: 9999, fontSize: 11, fontFamily: 'DM Sans', fontWeight: 700,
              background: busy === 'reject' ? 'rgba(248,113,113,0.20)' : 'rgba(248,113,113,0.08)',
              border: '1px solid rgba(248,113,113,0.25)', color: 'var(--red)', cursor: busy ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <XCircle size={10} />
            {busy === 'reject' ? '…' : 'Rechazar'}
          </button>
        </div>
      )}
    </div>
  );
}
