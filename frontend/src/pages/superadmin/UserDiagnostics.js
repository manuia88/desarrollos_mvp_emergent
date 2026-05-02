/**
 * Phase 4 Batch 0.5 Sub-chunk D — UserDiagnostics page
 * /superadmin/user-diagnostics — list user problem reports + detail view.
 */
import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { listProblemReports, getProblemReport, patchProblemReport } from '../../api/diagnostic';
import { KPIStrip } from '../../components/shared/KPIStrip';
import { Activity, AlertTriangle, Check } from '../../components/icons';

const STATUS_CFG = {
  open:          { label: 'Abierto',       color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  investigating: { label: 'Investigando',  color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  resolved:      { label: 'Resuelto',      color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
};

function ReportDetail({ reportId, onClose, onChanged }) {
  const [report, setReport] = useState(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!reportId) return;
    getProblemReport(reportId).then(setReport).catch(() => setReport(null));
  }, [reportId]);

  if (!report) return null;

  const updateStatus = async (status) => {
    setSaving(true);
    try {
      await patchProblemReport(reportId, { status, notes });
      onChanged?.();
      await getProblemReport(reportId).then(setReport);
    } finally { setSaving(false); }
  };

  const cfg = STATUS_CFG[report.status] || STATUS_CFG.open;
  const diag = report.user_diagnostic || {};

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(6,8,15,0.92)', zIndex: 1500,
      display: 'flex', justifyContent: 'flex-end', padding: 20, overflowY: 'auto',
    }} onClick={onClose}>
      <div style={{
        background: 'var(--navy)', border: '1px solid rgba(240,235,224,0.18)',
        borderRadius: 14, padding: 24, width: '100%', maxWidth: 720,
        maxHeight: '95vh', overflowY: 'auto',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--cream-3)', marginBottom: 3 }}>Reporte de problema</div>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--cream)', fontFamily: 'Outfit,sans-serif' }}>
              {report.id}
            </h3>
          </div>
          <span style={{ background: cfg.bg, color: cfg.color, fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 6 }}>
            {cfg.label}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--cream-3)' }}>Usuario</div>
            <div style={{ fontSize: 12, color: 'var(--cream)' }}>{report.user_email}</div>
            <div style={{ fontSize: 10, color: 'var(--cream-3)' }}>{report.user_role}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--cream-3)' }}>URL</div>
            <div style={{ fontSize: 11, color: 'var(--cream-2)', fontFamily: 'monospace', wordBreak: 'break-all' }}>
              {report.current_url || '—'}
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: 'var(--cream-3)', marginBottom: 3 }}>Descripción</div>
          <div style={{
            padding: '10px 12px', background: 'rgba(240,235,224,0.04)',
            border: '1px solid rgba(240,235,224,0.1)', borderRadius: 8,
            fontSize: 12, color: 'var(--cream-2)', lineHeight: 1.5,
          }}>
            {report.description}
          </div>
        </div>

        {/* User diagnostic result */}
        {diag.probes_results && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: 'var(--cream-3)', marginBottom: 6, textTransform: 'uppercase' }}>
              Diagnóstico usuario ({diag.passed}/{diag.total_probes} pass)
            </div>
            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
              {diag.probes_results.map((p, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0',
                  borderBottom: '1px solid rgba(240,235,224,0.05)', fontSize: 11,
                }}>
                  {p.passed
                    ? <Check size={11} color="#22c55e" />
                    : <AlertTriangle size={11} color={p.severity === 'critical' ? '#ef4444' : '#f59e0b'} />}
                  <span style={{ color: 'var(--cream-2)', flex: 1 }}>{p.description}</span>
                  {!p.passed && <span style={{ color: 'var(--cream-3)', fontSize: 10 }}>{p.severity}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Audit trail */}
        {report.audit_trail && report.audit_trail.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: 'var(--cream-3)', marginBottom: 6, textTransform: 'uppercase' }}>
              Audit trail (últimas {report.audit_trail.length})
            </div>
            <div style={{ maxHeight: 180, overflowY: 'auto', fontSize: 10, color: 'var(--cream-3)' }}>
              {report.audit_trail.slice(0, 20).map((a, i) => (
                <div key={i} style={{ padding: '3px 0', borderBottom: '1px solid rgba(240,235,224,0.05)' }}>
                  <span style={{ color: 'var(--cream-2)' }}>{a.action}</span>
                  &nbsp;·&nbsp;{a.entity_type}:{a.entity_id?.slice(0, 24)}
                  &nbsp;·&nbsp;{a.created_at?.slice(0, 16)}
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginBottom: 14 }}>
          <textarea
            value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Notas de investigación (opcional)…"
            rows={3}
            style={{
              width: '100%', background: 'rgba(240,235,224,0.06)',
              border: '1px solid rgba(240,235,224,0.14)', borderRadius: 8,
              padding: 10, fontSize: 12, color: 'var(--cream)',
              resize: 'vertical', fontFamily: 'DM Sans,sans-serif', boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={onClose} disabled={saving}
            style={{ background: 'none', border: '1px solid rgba(240,235,224,0.12)', color: 'var(--cream-3)', borderRadius: 7, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>
            Cerrar
          </button>
          {report.status === 'open' && (
            <button onClick={() => updateStatus('investigating')} disabled={saving}
              style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              Marcar investigando
            </button>
          )}
          {report.status !== 'resolved' && (
            <button onClick={() => updateStatus('resolved')} disabled={saving}
              style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              Resolver
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function UserDiagnosticsPage({ user, onLogout }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('open');
  const activeReport = searchParams.get('report');

  const load = () => {
    setLoading(true);
    listProblemReports(statusFilter === 'all' ? null : statusFilter)
      .then(d => setReports(d.items || []))
      .catch(() => setReports([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [statusFilter]);

  const openReport = (id) => {
    const next = new URLSearchParams(searchParams);
    next.set('report', id);
    setSearchParams(next, { replace: true });
  };
  const closeReport = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('report');
    setSearchParams(next, { replace: true });
  };

  const counts = {
    open: reports.filter(r => r.status === 'open').length,
    investigating: reports.filter(r => r.status === 'investigating').length,
    resolved: reports.filter(r => r.status === 'resolved').length,
    total: reports.length,
  };

  return (
    <SuperadminLayout user={user} onLogout={onLogout}>
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: 24 }}>
      <h1 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 800, color: 'var(--cream)', fontFamily: 'Outfit,sans-serif' }}>
        User Diagnostics & Reportes
      </h1>
      <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--cream-3)' }}>
        Reportes de problemas + diagnósticos automáticos por usuario.
      </p>

      <div style={{ marginBottom: 20 }}>
        <KPIStrip items={[
          { label: 'Total', value: counts.total },
          { label: 'Abiertos', value: counts.open },
          { label: 'Investigando', value: counts.investigating },
          { label: 'Resueltos', value: counts.resolved },
        ]} />
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {['open', 'investigating', 'resolved', 'all'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            data-testid={`status-filter-${s}`}
            style={{
              background: statusFilter === s ? 'var(--cream)' : 'rgba(240,235,224,0.06)',
              color: statusFilter === s ? 'var(--navy)' : 'var(--cream-2)',
              border: statusFilter === s ? 'none' : '1px solid rgba(240,235,224,0.1)',
              borderRadius: 7, padding: '5px 12px', fontSize: 11,
              fontWeight: statusFilter === s ? 700 : 400, cursor: 'pointer',
            }}>
            {s === 'all' ? 'Todos' : STATUS_CFG[s]?.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: 'var(--cream-3)', fontSize: 13 }}>Cargando…</div>
      ) : reports.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--cream-3)', fontSize: 13 }}>
          <Activity size={28} color="rgba(240,235,224,0.2)" />
          <p style={{ marginTop: 10 }}>Sin reportes con este filtro.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {reports.map(r => {
            const cfg = STATUS_CFG[r.status] || STATUS_CFG.open;
            return (
              <button key={r.id}
                data-testid={`report-row-${r.id}`}
                onClick={() => openReport(r.id)}
                style={{
                  display: 'grid', gridTemplateColumns: '130px 1fr 100px 100px',
                  gap: 12, padding: '12px 16px', textAlign: 'left',
                  background: 'rgba(240,235,224,0.04)',
                  border: '1px solid rgba(240,235,224,0.1)',
                  borderRadius: 10, cursor: 'pointer',
                  color: 'var(--cream)', fontFamily: 'DM Sans,sans-serif',
                }}
              >
                <div>
                  <div style={{ fontSize: 10, color: 'var(--cream-3)' }}>ID</div>
                  <div style={{ fontSize: 11, fontFamily: 'monospace' }}>{r.id}</div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 10, color: 'var(--cream-3)' }}>{r.user_email} ({r.user_role})</div>
                  <div style={{ fontSize: 12, color: 'var(--cream-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.description}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--cream-3)' }}>Creado</div>
                  <div style={{ fontSize: 11, color: 'var(--cream-2)' }}>
                    {r.created_at?.slice(0, 10)}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ background: cfg.bg, color: cfg.color, fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 5 }}>
                    {cfg.label}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {activeReport && (
        <ReportDetail
          reportId={activeReport}
          onClose={closeReport}
          onChanged={load}
        />
      )}
    </div>
    </SuperadminLayout>
  );
}
