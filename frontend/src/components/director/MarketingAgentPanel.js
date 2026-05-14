/**
 * W4.5 Y.2B — MarketingAgentPanel
 * Panel de Marketing Sub-Agent para el TenantDrawer (sub-tab Marketing).
 * Detecta performance digital sub-óptima y propone optimizaciones.
 * Sigue el mismo patrón visual que PricingAgentPanel.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Megaphone, CheckCircle, XCircle, Clock, Zap, AlertTriangle } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

// ─── API helpers ─────────────────────────────────────────────────────────────
async function runMarketingAnalysis(projectId) {
  const res = await fetch(`${API}/api/subagents/marketing/analyze`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_id: projectId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Error al analizar marketing');
  return data;
}

async function fetchMarketingRecs(projectId, status) {
  const params = new URLSearchParams({ project_id: projectId, limit: 50 });
  if (status && status !== 'all') params.append('status', status);
  const res = await fetch(`${API}/api/subagents/marketing/recommendations?${params}`, {
    credentials: 'include',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Error al cargar recomendaciones');
  return data;
}

async function applyMktRec(recId) {
  const res = await fetch(`${API}/api/subagents/marketing/recommendations/${recId}/apply`, {
    method: 'POST', credentials: 'include',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Error al aplicar');
  return data;
}

async function rejectMktRec(recId) {
  const res = await fetch(`${API}/api/subagents/marketing/recommendations/${recId}/reject`, {
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
  low_views:       { label: 'Visitas bajas',    color: '#F59E0B' },
  low_ctr:         { label: 'CTR bajo',         color: 'var(--theme-3)' },
  low_conversion:  { label: 'Conv. baja',       color: '#F87171' },
  missing_assets:  { label: 'Assets faltantes', color: 'var(--theme)' },
  stale_copy:      { label: 'Copy desactualizado', color: '#94A3B8' },
};

const SEVERITY_META = {
  high:   { label: 'Alta',   color: '#F87171' },
  medium: { label: 'Media',  color: '#F59E0B' },
  low:    { label: 'Baja',   color: '#4ADE80' },
};

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

function IssueBadge({ issue }) {
  const { label, color } = ISSUE_META[issue] || { label: issue, color: '#6B7280' };
  return (
    <span style={{ padding: '1px 7px', borderRadius: 9999, fontSize: 10, fontFamily: 'DM Sans', fontWeight: 700, background: `${color}22`, border: `1px solid ${color}44`, color }}>
      {label}
    </span>
  );
}

function SeverityBadge({ severity }) {
  const { label, color } = SEVERITY_META[severity] || { label: severity, color: '#6B7280' };
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

function StatusBadge({ status }) {
  const map = { pending: ['#F59E0B', 'Pendiente'], applied: ['#4ADE80', 'Aplicada'], rejected: ['#F87171', 'Rechazada'], expired: ['#6B7280', 'Vencida'] };
  const [color, label] = map[status] || ['#6B7280', status];
  return (
    <span style={{ padding: '1px 7px', borderRadius: 9999, fontSize: 10, fontFamily: 'DM Sans', fontWeight: 700, background: `${color}22`, border: `1px solid ${color}44`, color }}>
      {label}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function MarketingAgentPanel({ orgId, projectsSummary }) {
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

  useEffect(() => {
    if (!selectedProject && (projectsSummary || []).length > 0) {
      setSelectedProject(projectsSummary[0].id);
    }
  }, [projectsSummary, selectedProject]);

  const loadRecs = useCallback(async (pid, sf) => {
    if (!pid) return;
    setRecsLoading(true);
    try {
      const data = await fetchMarketingRecs(pid, sf);
      setRecs(data.items || []);
      setRecsTotal(data.total || 0);
    } catch {
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
      const result = await runMarketingAnalysis(selectedProject);
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
      await applyMktRec(recId);
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
      await rejectMktRec(recId);
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
  const filterTabs = [['all', 'Todas'], ['pending', 'Pendientes'], ['applied', 'Aplicadas'], ['rejected', 'Rechazadas']];

  return (
    <div data-testid="marketing-agent-panel" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Toast */}
      {toast && (
        <div data-testid="marketing-toast" style={{
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
        <Megaphone size={14} color="var(--theme-3)" />
        <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: 'var(--cream)' }}>Sub-agente de Marketing</span>
        <span style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240,235,224,0.45)', marginLeft: 'auto' }}>org: {orgId}</span>
      </div>

      {/* Project selector + Analyze button */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <select
          data-testid="marketing-project-select"
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
            projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)
          )}
        </select>
        <button
          data-testid="marketing-analyze-btn"
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
          {analyzing ? 'Analizando…' : 'Analizar marketing'}
        </button>
      </div>

      {/* Error */}
      {analyzeError && (
        <div data-testid="marketing-analyze-error" style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)', color: '#F87171', fontFamily: 'DM Sans', fontSize: 12 }}>
          {analyzeError}
        </div>
      )}

      {/* Last run summary */}
      {lastRun && (
        <div data-testid="marketing-last-run" style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(var(--theme-rgb),0.06)', border: '1px solid rgba(var(--theme-rgb),0.20)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Clock size={11} color="rgba(240,235,224,0.40)" />
          <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.55)' }}>
            {lastRun.recommendations_count} issues detectados
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
            data-testid={`marketing-filter-${k}`}
            onClick={() => setStatusFilter(k)}
            style={{
              padding: '4px 11px', borderRadius: 9999, fontSize: 11, fontFamily: 'DM Sans', fontWeight: 600,
              cursor: 'pointer',
              background: statusFilter === k ? 'rgba(var(--theme-rgb),0.16)' : 'transparent',
              border: statusFilter === k ? '1px solid rgba(var(--theme-rgb),0.55)' : '1px solid rgba(255,255,255,0.08)',
              color: statusFilter === k ? '#F472B6' : 'rgba(240,235,224,0.50)',
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
        <div data-testid="marketing-no-recs" style={{ padding: '24px 0', textAlign: 'center', color: 'rgba(240,235,224,0.40)', fontFamily: 'DM Sans', fontSize: 12 }}>
          No se detectaron issues de marketing digital en este proyecto.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {recs.map(rec => (
            <MktRecCard
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

// ─── MktRecCard ───────────────────────────────────────────────────────────────
function MktRecCard({ rec, busy, onApply, onReject }) {
  const [expanded, setExpanded] = useState(false);
  const isPending = rec.status === 'pending';
  const liftPct = rec.expected_lift_pct;

  return (
    <div
      data-testid={`marketing-rec-${rec.id}`}
      style={{
        padding: '10px 12px', borderRadius: 10,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
        {/* Target + badges */}
        <div style={{ flex: 1, minWidth: 140 }}>
          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 12.5, color: 'var(--cream)', marginBottom: 3 }}>
            {rec.target_id || '—'}
            <span style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'rgba(240,235,224,0.40)', marginLeft: 5 }}>
              {rec.target_type}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            <StatusBadge status={rec.status} />
            <IssueBadge issue={rec.issue_detected} />
            <SeverityBadge severity={rec.severity} />
            <ConfidenceBadge score={rec.confidence_score || 0} />
            <LayerBadge layer={rec.layer_used} />
          </div>
        </div>

        {/* Expected lift */}
        {liftPct != null && (
          <div style={{ textAlign: 'right', minWidth: 80 }}>
            <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'rgba(240,235,224,0.40)', marginBottom: 2 }}>lift esperado</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'flex-end' }}>
              <AlertTriangle size={10} color="#F59E0B" />
              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: '#F59E0B', fontWeight: 700 }}>
                +{liftPct}%
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Suggested action */}
      {rec.suggested_action_text && (
        <div style={{ marginTop: 7 }}>
          <div
            style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.50)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
            onClick={() => setExpanded(e => !e)}
          >
            <span style={{ fontSize: 10 }}>{expanded ? '▲' : '▼'}</span>
            Acción sugerida
          </div>
          {expanded && (
            <div data-testid={`marketing-rec-action-${rec.id}`} style={{ marginTop: 4, padding: '6px 9px', borderRadius: 7, background: 'rgba(var(--theme-rgb),0.05)', border: '1px solid rgba(var(--theme-rgb),0.15)', fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.70)', lineHeight: 1.55 }}>
              {rec.suggested_action_text}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      {isPending && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button
            data-testid={`marketing-apply-${rec.id}`}
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
            data-testid={`marketing-reject-${rec.id}`}
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
