/**
 * Phase 4 Batch 0.5 — DiagnosticReportContent
 * Renders inside EntityDrawer body. Shows probe results grouped by module.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  getLatestDiagnostic, runProjectDiagnostic, runAutoFix, aiRecommendProbe,
} from '../../api/diagnostic';
import { KPIStrip } from '../shared/KPIStrip';
import { Check, AlertTriangle, X, RefreshCw, Sparkle, Activity } from '../../components/icons';

const SEVERITY_COLOR = {
  critical: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', label: 'CRÍTICO' },
  high:     { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b', label: 'ALTO' },
  medium:   { bg: 'rgba(96,165,250,0.12)', color: '#60a5fa', label: 'MEDIO' },
  low:      { bg: 'rgba(240,235,224,0.08)', color: 'var(--cream-3)', label: 'BAJO' },
};

const ERROR_TYPE_LABELS = {
  schema_integrity: 'Integridad de esquema',
  wiring_broken: 'Cableado roto',
  sync_failure: 'Falla de sync',
  stale_data: 'Dato desactualizado',
  ai_failure: 'Falla IA',
  permission_issue: 'Problema de permisos',
  performance: 'Rendimiento',
  integration_external: 'Integración externa',
  data_quality: 'Calidad de datos',
  orphan_record: 'Registro huérfano',
};

function SeverityBadge({ severity }) {
  const cfg = SEVERITY_COLOR[severity] || SEVERITY_COLOR.medium;
  return (
    <span style={{
      background: cfg.bg, color: cfg.color,
      fontSize: 9, fontWeight: 700, padding: '2px 6px',
      borderRadius: 4, letterSpacing: '0.04em',
    }}>{cfg.label}</span>
  );
}

function ProbeRow({ probe, devId, onRefresh }) {
  const [expanded, setExpanded] = useState(false);
  const [aiRec, setAiRec] = useState(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [applyingFix, setApplyingFix] = useState(false);
  const [fixResult, setFixResult] = useState(null);
  const sev = SEVERITY_COLOR[probe.severity] || SEVERITY_COLOR.medium;

  const requestAi = async () => {
    setLoadingAi(true);
    try {
      const r = await aiRecommendProbe(devId, {
        probe_id: probe.probe_id,
        error_type: probe.error_type,
        location: probe.location,
        description: probe.description,
      });
      setAiRec(r.ai_available ? r.recommendation : r.fallback);
    } catch (e) { console.error(e); }
    finally { setLoadingAi(false); }
  };

  const applyFix = async () => {
    if (!probe.action_id) return;
    setApplyingFix(true);
    try {
      const r = await runAutoFix(devId, probe.action_id);
      setFixResult(r);
      if (r.ok) setTimeout(() => onRefresh?.(), 800);
    } catch (e) { setFixResult({ ok: false, error: e.message }); }
    finally { setApplyingFix(false); }
  };

  return (
    <div
      data-testid={`probe-row-${probe.probe_id}`}
      style={{
        borderLeft: `2px solid ${probe.passed ? 'rgba(34,197,94,0.4)' : sev.color}`,
        background: 'rgba(240,235,224,0.03)',
        borderRadius: 6, padding: '8px 12px', marginBottom: 6,
      }}
    >
      <div onClick={() => !probe.passed && setExpanded(e => !e)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: probe.passed ? 'default' : 'pointer' }}>
        {probe.passed ? (
          <Check size={13} color="#22c55e" />
        ) : (
          <AlertTriangle size={13} color={sev.color} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: probe.passed ? 'var(--cream-2)' : 'var(--cream)', fontWeight: 500 }}>
            {probe.description || probe.probe_id}
          </div>
          {probe.recurrence_count > 1 && !probe.passed && (
            <div style={{ fontSize: 10, color: 'var(--cream-3)', marginTop: 1 }}>
              Recurrente · {probe.recurrence_count}× · último: {
                probe.last_detected ? new Date(probe.last_detected).toLocaleDateString('es-MX') : '—'
              }
            </div>
          )}
        </div>
        {!probe.passed && <SeverityBadge severity={probe.severity} />}
      </div>

      {expanded && !probe.passed && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(240,235,224,0.08)' }}>
          {probe.error_type && (
            <div style={{ marginBottom: 6 }}>
              <span style={{ fontSize: 9, color: 'var(--cream-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Tipo de error</span>
              <div style={{ fontSize: 11, color: 'var(--cream-2)' }}>
                {ERROR_TYPE_LABELS[probe.error_type] || probe.error_type}
              </div>
            </div>
          )}
          {probe.location && (
            <div style={{ marginBottom: 6 }}>
              <span style={{ fontSize: 9, color: 'var(--cream-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Ubicación</span>
              <div style={{ fontSize: 11, color: 'var(--cream-2)', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                {probe.location}
              </div>
            </div>
          )}
          {probe.recommendation && (
            <div style={{ marginBottom: 6 }}>
              <span style={{ fontSize: 9, color: 'var(--cream-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Recomendación</span>
              <div style={{ fontSize: 11, color: 'var(--cream-2)', lineHeight: 1.45 }}>
                {probe.recommendation}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
            {probe.action_id && (
              <button
                data-testid={`fix-${probe.probe_id}`}
                onClick={applyFix} disabled={applyingFix}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  background: 'rgba(34,197,94,0.12)', color: '#22c55e',
                  border: '1px solid rgba(34,197,94,0.3)', borderRadius: 6,
                  padding: '4px 10px', fontSize: 10, fontWeight: 600,
                  cursor: applyingFix ? 'default' : 'pointer',
                }}
              >
                <RefreshCw size={11} /> {applyingFix ? 'Aplicando…' : 'Aplicar fix'}
              </button>
            )}
            {!aiRec && (
              <button
                onClick={requestAi} disabled={loadingAi}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  background: 'rgba(96,165,250,0.10)', color: '#60a5fa',
                  border: '1px solid rgba(96,165,250,0.25)', borderRadius: 6,
                  padding: '4px 10px', fontSize: 10, fontWeight: 600,
                  cursor: loadingAi ? 'default' : 'pointer',
                }}
              >
                <Sparkle size={11} /> {loadingAi ? 'Consultando IA…' : 'Recomendar con IA'}
              </button>
            )}
          </div>

          {aiRec && (
            <div style={{
              marginTop: 10, padding: '8px 10px',
              background: 'rgba(96,165,250,0.06)',
              border: '1px solid rgba(96,165,250,0.15)',
              borderRadius: 6,
            }}>
              <div style={{ fontSize: 9, color: '#60a5fa', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase' }}>
                IA sugiere
              </div>
              <div style={{ fontSize: 11, color: 'var(--cream-2)', lineHeight: 1.45 }}>
                {aiRec.recommendation || aiRec}
              </div>
              {aiRec.location && (
                <div style={{ fontSize: 10, color: 'var(--cream-3)', marginTop: 3, fontFamily: 'monospace' }}>
                  → {aiRec.location}
                </div>
              )}
            </div>
          )}

          {fixResult && (
            <div style={{
              marginTop: 8, padding: '6px 10px',
              background: fixResult.ok ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
              color: fixResult.ok ? '#22c55e' : '#ef4444',
              fontSize: 10, borderRadius: 5,
            }}>
              {fixResult.message || fixResult.error || (fixResult.ok ? 'Fix aplicado' : 'Fix falló')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DiagnosticReportContent({ devId, user }) {
  const [diag, setDiag] = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [severityFilter, setSeverityFilter] = useState(null);
  const [moduleFilter, setModuleFilter] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await getLatestDiagnostic(devId);
      setDiag(d.never_run ? null : d);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [devId]);

  useEffect(() => { load(); }, [load]);

  const handleRun = async () => {
    setRunning(true);
    try {
      const d = await runProjectDiagnostic(devId, 'all');
      setDiag(d);
    } catch (e) { console.error(e); }
    finally { setRunning(false); }
  };

  const handleExportJson = () => {
    if (!diag) return;
    const blob = new Blob([JSON.stringify(diag, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `diagnostico_${devId}_${diag.run_at?.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <div style={{ padding: 20, fontSize: 12, color: 'var(--cream-3)' }}>Cargando diagnóstico…</div>;
  }

  if (!diag) {
    return (
      <div style={{ padding: '40px 24px', textAlign: 'center' }}>
        <Activity size={32} color="rgba(240,235,224,0.2)" />
        <p style={{ margin: '14px 0 16px', fontSize: 13, color: 'var(--cream-3)' }}>
          Este proyecto no tiene diagnóstico previo.
        </p>
        <button
          data-testid="run-first-diagnostic"
          onClick={handleRun} disabled={running}
          style={{
            background: 'var(--cream)', color: 'var(--navy)',
            border: 'none', borderRadius: 8, padding: '8px 18px',
            fontSize: 12, fontWeight: 700,
            cursor: running ? 'default' : 'pointer',
          }}
        >
          {running ? 'Ejecutando…' : 'Ejecutar diagnóstico'}
        </button>
      </div>
    );
  }

  const runAt = new Date(diag.run_at);
  const probes = diag.probes_results || [];

  // Collect modules
  const modules = [...new Set(probes.map(p => p.module))];

  // Apply filters
  const filtered = probes.filter(p => {
    if (severityFilter && p.severity !== severityFilter) return false;
    if (moduleFilter && p.module !== moduleFilter) return false;
    return true;
  });

  // Group by module
  const byModule = {};
  filtered.forEach(p => {
    if (!byModule[p.module]) byModule[p.module] = [];
    byModule[p.module].push(p);
  });
  // Sort: failed first (critical→low), passed last
  const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  Object.keys(byModule).forEach(k => {
    byModule[k].sort((a, b) => {
      if (a.passed !== b.passed) return a.passed ? 1 : -1;
      return (sevOrder[a.severity] || 4) - (sevOrder[b.severity] || 4);
    });
  });

  return (
    <div data-testid="diagnostic-report-content">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--cream-3)' }}>Última ejecución</div>
          <div style={{ fontSize: 12, color: 'var(--cream-2)', marginTop: 2 }}>
            {runAt.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}
            &nbsp;·&nbsp;<span style={{ color: 'var(--cream-3)', fontSize: 11 }}>{diag.trigger}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            data-testid="export-json-btn"
            onClick={handleExportJson}
            style={{
              background: 'rgba(240,235,224,0.08)', color: 'var(--cream-2)',
              border: '1px solid rgba(240,235,224,0.14)', borderRadius: 7,
              padding: '5px 10px', fontSize: 10, cursor: 'pointer',
            }}
          >
            Exportar JSON
          </button>
          <button
            data-testid="run-diagnostic-btn"
            onClick={handleRun} disabled={running}
            style={{
              background: 'var(--cream)', color: 'var(--navy)',
              border: 'none', borderRadius: 7, padding: '5px 12px',
              fontSize: 10, fontWeight: 700,
              cursor: running ? 'default' : 'pointer',
            }}
          >
            {running ? 'Ejecutando…' : 'Ejecutar ahora'}
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div style={{ marginBottom: 14 }}>
        <KPIStrip items={[
          { label: 'Total', value: diag.total_probes },
          { label: 'Pass', value: diag.passed, subtext: `${Math.round(diag.passed / diag.total_probes * 100)}%` },
          { label: 'Fail', value: diag.failed },
          { label: 'Críticos', value: diag.criticals || 0 },
        ]} />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: 'var(--cream-3)', alignSelf: 'center' }}>Severidad:</span>
        {['critical', 'high', 'medium', 'low'].map(s => (
          <button key={s} data-testid={`sev-filter-${s}`}
            onClick={() => setSeverityFilter(severityFilter === s ? null : s)}
            style={{
              background: severityFilter === s ? SEVERITY_COLOR[s].color : 'rgba(240,235,224,0.04)',
              color: severityFilter === s ? 'var(--navy)' : 'var(--cream-3)',
              border: `1px solid ${severityFilter === s ? SEVERITY_COLOR[s].color : 'rgba(240,235,224,0.1)'}`,
              borderRadius: 5, padding: '2px 8px', fontSize: 10, cursor: 'pointer',
              fontWeight: severityFilter === s ? 700 : 400,
            }}>
            {SEVERITY_COLOR[s].label}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: 'var(--cream-3)', alignSelf: 'center' }}>Módulo:</span>
        {modules.map(m => (
          <button key={m}
            onClick={() => setModuleFilter(moduleFilter === m ? null : m)}
            style={{
              background: moduleFilter === m ? 'var(--cream)' : 'rgba(240,235,224,0.04)',
              color: moduleFilter === m ? 'var(--navy)' : 'var(--cream-3)',
              border: `1px solid ${moduleFilter === m ? 'var(--cream)' : 'rgba(240,235,224,0.1)'}`,
              borderRadius: 5, padding: '2px 8px', fontSize: 10, cursor: 'pointer',
              fontWeight: moduleFilter === m ? 700 : 400,
            }}>
            {m.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Groups */}
      {Object.entries(byModule).map(([mod, list]) => (
        <div key={mod} style={{ marginBottom: 14 }}>
          <h4 style={{ margin: '0 0 6px', fontSize: 10, color: 'var(--cream-3)',
            fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
          }}>
            {mod.replace('_', ' ')} ({list.filter(p => p.passed).length}/{list.length})
          </h4>
          {list.map(p => (
            <ProbeRow key={p.probe_id} probe={p} devId={devId} onRefresh={load} />
          ))}
        </div>
      ))}
    </div>
  );
}
