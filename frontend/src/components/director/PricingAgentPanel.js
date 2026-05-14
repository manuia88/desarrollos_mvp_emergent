/**
 * W4.5 Y.2A — PricingAgentPanel
 * Panel de Pricing Sub-Agent para el TenantDrawer (tab Sub-Agents).
 * Permite analizar, ver y gestionar recomendaciones de pricing por proyecto.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { TrendingDown, TrendingUp, Zap, CheckCircle, XCircle, Clock, BarChart2 } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

// ─── API helpers ─────────────────────────────────────────────────────────────
async function runPricingAnalysis(projectId) {
  const res = await fetch(`${API}/api/subagents/pricing/analyze`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_id: projectId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Error al analizar pricing');
  return data;
}

async function fetchRecommendations(projectId, status) {
  const params = new URLSearchParams({ project_id: projectId, limit: 50 });
  if (status && status !== 'all') params.append('status', status);
  const res = await fetch(`${API}/api/subagents/pricing/recommendations?${params}`, {
    credentials: 'include',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Error al cargar recomendaciones');
  return data;
}

async function applyRec(recId) {
  const res = await fetch(`${API}/api/subagents/pricing/recommendations/${recId}/apply`, {
    method: 'POST',
    credentials: 'include',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Error al aplicar');
  return data;
}

async function rejectRec(recId) {
  const res = await fetch(`${API}/api/subagents/pricing/recommendations/${recId}/reject`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: 'Rechazada manualmente por superadmin' }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Error al rechazar');
  return data;
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function LayerBadge({ layer }) {
  const map = { llm: ['var(--theme)', 'LLM'], cache: ['#F59E0B', 'Caché'], heuristic: ['#10B981', 'Heurística'], none: ['#6B7280', 'Sin datos'] };
  const [color, label] = map[layer] || ['#6B7280', layer || '—'];
  return (
    <span style={{ padding: '1px 7px', borderRadius: 9999, fontSize: 10, fontFamily: 'DM Sans', fontWeight: 700, background: `${color}22`, border: `1px solid ${color}44`, color }}>
      {label}
    </span>
  );
}

function ConfidenceBadge({ score }) {
  const color = score >= 75 ? '#4ADE80' : score >= 50 ? '#F59E0B' : '#F87171';
  return (
    <span style={{ padding: '1px 7px', borderRadius: 9999, fontSize: 10, fontFamily: 'DM Sans', fontWeight: 700, background: `${color}22`, border: `1px solid ${color}44`, color }}>
      {score}%
    </span>
  );
}

function DeltaChip({ delta }) {
  if (delta == null) return null;
  const negative = delta < 0;
  const color = negative ? '#4ADE80' : '#F87171';
  const Icon = negative ? TrendingDown : TrendingUp;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '1px 7px', borderRadius: 9999, fontSize: 10.5, fontFamily: 'DM Sans', fontWeight: 700, background: `${color}1A`, border: `1px solid ${color}44`, color }}>
      <Icon size={10} />
      {delta > 0 ? '+' : ''}{delta}%
    </span>
  );
}

function StatusBadge({ status }) {
  const map = {
    pending: ['#F59E0B', 'Pendiente'],
    applied: ['#4ADE80', 'Aplicada'],
    rejected: ['#F87171', 'Rechazada'],
    expired: ['#6B7280', 'Vencida'],
  };
  const [color, label] = map[status] || ['#6B7280', status];
  return (
    <span style={{ padding: '1px 7px', borderRadius: 9999, fontSize: 10, fontFamily: 'DM Sans', fontWeight: 700, background: `${color}22`, border: `1px solid ${color}44`, color }}>
      {label}
    </span>
  );
}

function fmtMxn(v) {
  if (!v && v !== 0) return '—';
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(v);
}

function fmtRel(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return 'ahora';
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  return `hace ${Math.floor(hrs / 24)}d`;
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function PricingAgentPanel({ orgId, projectsSummary }) {
  const [selectedProject, setSelectedProject] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState(null);
  const [lastRun, setLastRun] = useState(null);
  const [recs, setRecs] = useState([]);
  const [recsTotal, setRecsTotal] = useState(0);
  const [recsLoading, setRecsLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [actionBusy, setActionBusy] = useState({});
  const [toast, setToast] = useState(null);

  // Auto-select first project
  useEffect(() => {
    if (!selectedProject && (projectsSummary || []).length > 0) {
      setSelectedProject(projectsSummary[0].id);
    }
  }, [projectsSummary, selectedProject]);

  const loadRecs = useCallback(async (pid, sf) => {
    if (!pid) return;
    setRecsLoading(true);
    try {
      const data = await fetchRecommendations(pid, sf);
      setRecs(data.items || []);
      setRecsTotal(data.total || 0);
    } catch (err) {
      setRecs([]);
    } finally {
      setRecsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecs(selectedProject, statusFilter);
  }, [selectedProject, statusFilter, loadRecs]);

  const handleAnalyze = async () => {
    if (!selectedProject || analyzing) return;
    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      const result = await runPricingAnalysis(selectedProject);
      setLastRun(result);
      showToast(`Análisis completado · ${result.recommendations_count} recomendaciones · layer=${result.layer_used}`);
      await loadRecs(selectedProject, statusFilter);
    } catch (err) {
      setAnalyzeError(err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleApply = async (recId) => {
    setActionBusy(prev => ({ ...prev, [recId]: 'apply' }));
    try {
      await applyRec(recId);
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
      await rejectRec(recId);
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

  const projects = projectsSummary || [];
  const filterTabs = [
    ['all', 'Todas'],
    ['pending', 'Pendientes'],
    ['applied', 'Aplicadas'],
    ['rejected', 'Rechazadas'],
  ];

  return (
    <div data-testid="pricing-agent-panel" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Toast */}
      {toast && (
        <div data-testid="pricing-toast" style={{
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
        <BarChart2 size={14} color="var(--theme)" />
        <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: 'var(--cream)' }}>Sub-agente de Pricing</span>
        <span style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240,235,224,0.45)', marginLeft: 'auto' }}>org: {orgId}</span>
      </div>

      {/* Project selector + Analyze button */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <select
          data-testid="pricing-project-select"
          value={selectedProject}
          onChange={e => setSelectedProject(e.target.value)}
          style={{
            flex: 1, padding: '7px 10px', borderRadius: 9999, background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.12)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12,
            cursor: 'pointer', outline: 'none',
          }}
        >
          {projects.length === 0 ? (
            <option value="">Sin proyectos disponibles</option>
          ) : (
            projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))
          )}
        </select>
        <button
          data-testid="pricing-analyze-btn"
          onClick={handleAnalyze}
          disabled={analyzing || !selectedProject}
          style={{
            padding: '7px 16px', borderRadius: 9999, fontSize: 12, fontFamily: 'DM Sans', fontWeight: 700,
            background: analyzing ? 'rgba(var(--theme-rgb),0.30)' : 'linear-gradient(90deg, var(--theme), var(--theme-3))',
            border: 'none', color: '#fff', cursor: analyzing ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
          }}
        >
          <Zap size={12} />
          {analyzing ? 'Analizando…' : 'Analizar pricing'}
        </button>
      </div>

      {/* Analyze error */}
      {analyzeError && (
        <div data-testid="pricing-analyze-error" style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)', color: '#F87171', fontFamily: 'DM Sans', fontSize: 12 }}>
          {analyzeError}
        </div>
      )}

      {/* Last run summary */}
      {lastRun && (
        <div data-testid="pricing-last-run" style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(var(--theme-rgb),0.06)', border: '1px solid rgba(var(--theme-rgb),0.20)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Clock size={11} color="rgba(240,235,224,0.40)" />
          <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.55)' }}>
            {lastRun.recommendations_count} recomendaciones generadas
          </span>
          <LayerBadge layer={lastRun.layer_used} />
          {lastRun.cost_usd > 0 && (
            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10.5, color: 'rgba(240,235,224,0.35)' }}>
              ${(lastRun.cost_usd * 17.5).toFixed(4)} MXN
            </span>
          )}
          {lastRun.simulation_mode && (
            <span style={{ padding: '1px 7px', borderRadius: 9999, fontSize: 10, background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.30)', color: '#F59E0B', fontFamily: 'DM Sans', fontWeight: 700 }}>SIMULACIÓN</span>
          )}
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {filterTabs.map(([k, l]) => (
          <button
            key={k}
            data-testid={`pricing-filter-${k}`}
            onClick={() => setStatusFilter(k)}
            style={{
              padding: '4px 11px', borderRadius: 9999, fontSize: 11, fontFamily: 'DM Sans', fontWeight: 600,
              cursor: 'pointer',
              background: statusFilter === k ? 'rgba(var(--theme-rgb),0.16)' : 'transparent',
              border: statusFilter === k ? '1px solid rgba(var(--theme-rgb),0.55)' : '1px solid rgba(255,255,255,0.08)',
              color: statusFilter === k ? 'var(--theme)' : 'rgba(240,235,224,0.50)',
            }}
          >
            {l}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240,235,224,0.35)', alignSelf: 'center' }}>
          {recsTotal} total
        </span>
      </div>

      {/* Recommendations list */}
      {recsLoading ? (
        <div style={{ padding: '20px 0', textAlign: 'center', color: 'rgba(240,235,224,0.35)', fontFamily: 'DM Sans', fontSize: 12 }}>
          Cargando recomendaciones…
        </div>
      ) : recs.length === 0 ? (
        <div data-testid="pricing-no-recs" style={{ padding: '24px 0', textAlign: 'center', color: 'rgba(240,235,224,0.40)', fontFamily: 'DM Sans', fontSize: 12 }}>
          No se detectaron unidades con pricing sub-óptimo en este proyecto.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {recs.map(rec => (
            <RecCard
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

// ─── RecCard ─────────────────────────────────────────────────────────────────
function RecCard({ rec, busy, onApply, onReject }) {
  const [expanded, setExpanded] = useState(false);
  const isPending = rec.status === 'pending';

  return (
    <div
      data-testid={`pricing-rec-${rec.id}`}
      style={{
        padding: '10px 12px', borderRadius: 10,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
        {/* Unit ID */}
        <div style={{ flex: 1, minWidth: 120 }}>
          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 12.5, color: 'var(--cream)', marginBottom: 2 }}>
            {rec.unit_id || '—'}
          </div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
            <StatusBadge status={rec.status} />
            <LayerBadge layer={rec.layer_used} />
            <ConfidenceBadge score={rec.confidence_score || 0} />
          </div>
        </div>

        {/* Prices */}
        <div style={{ textAlign: 'right', minWidth: 130 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end', marginBottom: 3 }}>
            <span style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'rgba(240,235,224,0.40)' }}>actual</span>
            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'rgba(240,235,224,0.70)' }}>
              {fmtMxn(rec.current_price_per_m2)}/m²
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end' }}>
            <span style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'rgba(240,235,224,0.40)' }}>sugerido</span>
            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11.5, color: 'var(--theme)', fontWeight: 700 }}>
              {fmtMxn(rec.suggested_price_per_m2)}/m²
            </span>
          </div>
          <div style={{ marginTop: 3, display: 'flex', justifyContent: 'flex-end' }}>
            <DeltaChip delta={rec.delta_pct} />
          </div>
        </div>
      </div>

      {/* Rationale (collapsible) */}
      {rec.rationale_text && (
        <div style={{ marginTop: 7 }}>
          <div
            style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.50)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
            onClick={() => setExpanded(e => !e)}
          >
            <span style={{ fontSize: 10 }}>{expanded ? '▲' : '▼'}</span>
            Fundamento
          </div>
          {expanded && (
            <div data-testid={`pricing-rec-rationale-${rec.id}`} style={{ marginTop: 4, padding: '6px 9px', borderRadius: 7, background: 'rgba(var(--theme-rgb),0.06)', border: '1px solid rgba(var(--theme-rgb),0.15)', fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.70)', lineHeight: 1.55 }}>
              {rec.rationale_text}
            </div>
          )}
        </div>
      )}

      {/* Actions (only if pending) */}
      {isPending && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button
            data-testid={`pricing-apply-${rec.id}`}
            onClick={onApply}
            disabled={!!busy}
            style={{
              padding: '5px 13px', borderRadius: 9999, fontSize: 11, fontFamily: 'DM Sans', fontWeight: 700,
              background: busy === 'apply' ? 'rgba(74,222,128,0.20)' : 'rgba(74,222,128,0.12)',
              border: '1px solid rgba(74,222,128,0.35)', color: '#4ADE80', cursor: busy ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <CheckCircle size={10} />
            {busy === 'apply' ? '…' : 'Aplicar'}
          </button>
          <button
            data-testid={`pricing-reject-${rec.id}`}
            onClick={onReject}
            disabled={!!busy}
            style={{
              padding: '5px 13px', borderRadius: 9999, fontSize: 11, fontFamily: 'DM Sans', fontWeight: 700,
              background: busy === 'reject' ? 'rgba(248,113,113,0.20)' : 'rgba(248,113,113,0.08)',
              border: '1px solid rgba(248,113,113,0.25)', color: '#F87171', cursor: busy ? 'not-allowed' : 'pointer',
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
