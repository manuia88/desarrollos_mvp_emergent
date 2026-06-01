// W6.AS.1 · Workflow Builder · history page (ejecuciones + logs)
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { listWorkflowRuns, getWorkflow } from '../../../api/workflows';
import PortalLayout from '../../../components/shared/PortalLayout';

const BG = 'var(--bg)';
const CREAM = 'var(--cream)';
const INDIGO = '#6366F1';
const CARD_BG = 'var(--surface)';
const BORDER = '1px solid var(--border)';

const STATUS_COLORS = {
  done: '#10B981',
  running: '#F59E0B',
  failed: '#EF4444',
};

function WorkflowHistoryPageBody() {
  const { t } = useTranslation('common');
  const { workflowId } = useParams();
  const navigate = useNavigate();
  const [wf, setWf] = useState(null);
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [doc, r] = await Promise.all([
          getWorkflow(workflowId),
          listWorkflowRuns(workflowId, 30),
        ]);
        if (!mounted) return;
        setWf(doc);
        setRuns(r.items || []);
      } catch (e) {
        // fail-silent
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [workflowId]);

  const toggle = (id) => setExpanded((p) => ({ ...p, [id]: !p[id] }));

  return (
    <div style={{ minHeight: '100vh', background: BG, color: CREAM, fontFamily: 'DM Sans, sans-serif' }}>
      <div style={{ padding: '22px 30px', borderBottom: BORDER, display: 'flex', alignItems: 'center', gap: 14 }}>
        <button type="button" onClick={() => navigate(`/portal/asesor/workflows/${workflowId}`)}
          style={{ background: 'transparent', color: CREAM, border: '1px solid var(--border)', borderRadius: 9999, padding: '7px 14px', fontSize: 12, cursor: 'pointer' }}>
          ← {t('workflows.back')}
        </button>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{t('workflows.history_title')}</h1>
          <div style={{ fontSize: 13, color: 'var(--cream-2)', marginTop: 4 }}>{wf?.name || workflowId}</div>
        </div>
      </div>

      <div style={{ padding: '22px 30px' }}>
        {loading && <div style={{ color: 'var(--cream-2)' }}>…</div>}
        {!loading && runs.length === 0 && (
          <div style={{ color: 'var(--cream-2)', fontSize: 14 }}>{t('workflows.history_empty')}</div>
        )}
        {!loading && runs.length > 0 && (
          <div style={{ display: 'grid', gap: 10 }}>
            {runs.map((r) => {
              const color = STATUS_COLORS[r.status] || 'var(--cream-2)';
              const open = !!expanded[r.id];
              return (
                <div key={r.id} style={{
                  background: CARD_BG, border: BORDER, borderRadius: 18, padding: 14,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <span style={{
                      padding: '3px 10px', borderRadius: 9999, fontSize: 11, fontWeight: 700,
                      color, border: `1px solid ${color}55`, textTransform: 'uppercase', letterSpacing: '0.06em',
                    }}>
                      {t(`workflows.status_${r.status}`, { defaultValue: r.status })}
                    </span>
                    {r.dry_run && (
                      <span style={{
                        padding: '3px 10px', borderRadius: 9999, fontSize: 11, fontWeight: 700,
                        color: '#F59E0B', border: '1px solid #F59E0B55', textTransform: 'uppercase',
                      }}>
                        {t('workflows.history_dry_run')}
                      </span>
                    )}
                    <span style={{ fontSize: 12, color: 'var(--cream-2)' }}>{r.started_at}</span>
                    <span style={{ fontSize: 12, color: 'var(--cream-3)', marginLeft: 'auto' }}>
                      {(r.steps?.length || 0)} {t('workflows.history_steps').toLowerCase()}
                    </span>
                    <button type="button" onClick={() => toggle(r.id)} style={{
                      background: 'transparent', color: INDIGO, border: 'none',
                      cursor: 'pointer', fontSize: 12, fontWeight: 600,
                    }}>
                      {open ? '−' : '+'} {t('workflows.history_view_logs')}
                    </button>
                  </div>
                  {open && (
                    <div style={{ marginTop: 12, padding: 12, background: 'var(--surface-2)', borderRadius: 12 }}>
                      {(r.steps || []).map((s, i) => (
                        <div key={i} style={{
                          fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
                          color: 'var(--cream-2)', marginBottom: 4, wordBreak: 'break-word',
                        }}>
                          · [{s.type}] {s.node_id} {s.result ? `→ ${JSON.stringify(s.result).slice(0, 200)}` : ''}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// F1.5 · wrap en PortalLayout role-aware (sidebar consistente · persiste durante loading)
export default function WorkflowHistoryPage(props) {
  return (
    <PortalLayout role={props.user?.role} user={props.user} onLogout={props.onLogout}>
      <WorkflowHistoryPageBody {...props} />
    </PortalLayout>
  );
}
