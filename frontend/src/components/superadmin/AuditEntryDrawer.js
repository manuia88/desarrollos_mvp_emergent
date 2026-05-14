// W2.2 SA3 — AuditEntryDrawer
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Globe, Hash, User, Clock, ListTree, GitBranch, Edit3, History } from 'lucide-react';
import { getEntry, entityTimeline } from '../../api/superadminAudit';
import BeforeAfterDiff from './BeforeAfterDiff';

function fmtRel(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const sec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (sec < 60) return `hace ${sec}s`;
    if (sec < 3600) return `hace ${Math.floor(sec / 60)}m`;
    if (sec < 86400) return `hace ${Math.floor(sec / 3600)}h`;
    return `hace ${Math.floor(sec / 86400)}d`;
  } catch { return '—'; }
}

const SEVERITY_CFG = {
  critical: { color: '#F87171', bg: 'rgba(239,68,68,0.12)' },
  warning:  { color: '#FACC15', bg: 'rgba(250,204,21,0.12)' },
  info:     { color: 'var(--theme)', bg: 'rgba(var(--theme-rgb),0.12)' },
};

function SeverityPill({ severity }) {
  if (!severity) return null;
  const cfg = SEVERITY_CFG[severity] || SEVERITY_CFG.info;
  return (
    <span style={{
      padding: '1px 8px', borderRadius: 9999, fontSize: 10,
      background: cfg.bg, color: cfg.color, fontFamily: 'DM Sans', fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: '0.05em',
    }}>{severity}</span>
  );
}

function InlineEditRow({ ov, ai }) {
  const patch = ov.patch || {};
  return (
    <div data-testid={`override-row-${ov.ts}`} style={{
      padding: '8px 11px', borderRadius: 9,
      background: 'rgba(var(--theme-rgb),0.05)', border: '1px solid rgba(var(--theme-rgb),0.20)',
      display: 'flex', flexDirection: 'column', gap: 5,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'DM Mono, monospace', fontSize: 10.5, color: 'rgba(240,235,224,0.55)' }}>
        <Edit3 size={10} color="var(--theme)" />
        <span>{fmtRel(ov.ts)}</span>
        <span>· {ov.user_id || '—'}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {Object.entries(patch).map(([k, v]) => (
          <div key={k} style={{ fontFamily: 'DM Mono, monospace', fontSize: 10.5, color: 'var(--cream)' }}>
            <span style={{ color: 'rgba(240, 235, 224, 0.72)' }}>{k}:</span>{' '}
            <span style={{ color: '#F87171', textDecoration: 'line-through' }}>
              {JSON.stringify(ai?.[k])}
            </span>
            {' → '}
            <span style={{ color: '#4ADE80' }}>{JSON.stringify(v)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AuditEntryDrawer({ entryId, onClose }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('detail');
  const [tl, setTl] = useState(null);
  const [tlLoading, setTlLoading] = useState(false);

  useEffect(() => {
    if (!entryId) return;
    setLoading(true);
    getEntry(entryId).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [entryId]);

  useEffect(() => {
    if (tab !== 'timeline' || !data?.entity_type || !data?.entity_id) return;
    setTlLoading(true);
    entityTimeline(data.entity_type, data.entity_id)
      .then(setTl).catch(() => setTl(null)).finally(() => setTlLoading(false));
  }, [tab, data]);

  if (!entryId) return null;

  const isBulkIngest = data?.entity_type === 'bulk_ingest_item' && data?.enrichment?.bulk_ingest_item;
  const overrides = data?.enrichment?.bulk_ingest_item?.extracted_overrides || [];
  const history = data?.enrichment?.bulk_ingest_item?.extraction_history || [];
  const aiExtracted = data?.enrichment?.bulk_ingest_item?.ai_extracted || {};

  const tabs = [['detail', 'Detalle']];
  tabs.push(['diff', 'Diff']);
  if (isBulkIngest) tabs.push(['inline', `Edición inline (${overrides.length})`]);
  if (data?.entity_id) tabs.push(['timeline', 'Timeline entidad']);

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(6,8,15,0.65)', backdropFilter: 'blur(8px)', zIndex: 1300, display: 'flex', justifyContent: 'flex-end' }}>
      <div data-testid="audit-drawer" style={{
        width: '100%', maxWidth: 720, background: 'rgba(13,17,28,0.97)',
        borderLeft: '1px solid rgba(255,255,255,0.10)', padding: '24px 26px 80px',
        overflowY: 'auto',
      }}>
        {loading && <div style={{ padding: 30, color: 'rgba(240, 235, 224, 0.68)', fontFamily: 'DM Sans', fontSize: 13 }}>Cargando…</div>}
        {!loading && !data && (
          <div style={{ padding: 30, color: '#F87171', fontFamily: 'DM Sans', fontSize: 13 }}>No se pudo cargar la entrada.</div>
        )}
        {data && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                  <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: 'var(--cream)', margin: 0 }}>
                    {data.action}
                  </h2>
                  <SeverityPill severity={data.severity} />
                  <span style={{ padding: '1px 8px', borderRadius: 9999, fontSize: 10, background: 'rgba(255,255,255,0.05)', color: 'rgba(240,235,224,0.65)', border: '1px solid rgba(255,255,255,0.10)', fontFamily: 'DM Mono, monospace' }}>
                    {data.entity_type}
                  </span>
                </div>
                {data.entity_id && (
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'rgba(240, 235, 224, 0.72)', wordBreak: 'break-all' }}>
                    {data.entity_id}
                  </div>
                )}
              </div>
              <button onClick={onClose} data-testid="audit-drawer-close"
                style={{ padding: '6px 12px', borderRadius: 9999, background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(240,235,224,0.55)', fontFamily: 'DM Sans', fontSize: 12, cursor: 'pointer' }}>
                <X size={11} style={{ marginRight: 4, verticalAlign: 'middle' }} />Cerrar
              </button>
            </div>

            <div style={{ display: 'flex', gap: 6, marginBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.07)', paddingBottom: 4, flexWrap: 'wrap' }}>
              {tabs.map(([k, l]) => (
                <button key={k} onClick={() => setTab(k)} data-testid={`drawer-tab-${k}`}
                  style={{
                    padding: '6px 12px', borderRadius: 9999, fontSize: 12,
                    fontFamily: 'DM Sans', fontWeight: 600, cursor: 'pointer',
                    border: tab === k ? '1px solid rgba(var(--theme-rgb),0.55)' : '1px solid transparent',
                    background: tab === k ? 'rgba(var(--theme-rgb),0.16)' : 'transparent',
                    color: tab === k ? 'var(--theme)' : 'rgba(240,235,224,0.55)',
                  }}>{l}</button>
              ))}
            </div>

            {tab === 'detail' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                  <DetailItem Icon={Clock} label="Timestamp" value={data.ts} mono />
                  <DetailItem Icon={User} label="Actor" value={`${data.actor?.user_id || '—'} (${data.actor?.role || '—'})`} />
                  <DetailItem Icon={Hash} label="Tenant" value={data.actor?.tenant_id || data.actor?.org_id || '—'} mono />
                  <DetailItem Icon={Globe} label="IP" value={data.ip || '—'} mono />
                  <DetailItem Icon={ListTree} label="Route" value={data.route || '—'} mono />
                  <DetailItem Icon={GitBranch} label="Request ID" value={data.request_id || '—'} mono />
                </div>
                {data.diff_keys && data.diff_keys.length > 0 && (
                  <div>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240, 235, 224, 0.70)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>
                      Campos modificados ({data.diff_keys.length})
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {data.diff_keys.map(k => (
                        <span key={k} style={{ padding: '2px 8px', borderRadius: 9999, fontSize: 10.5, fontFamily: 'DM Mono, monospace', background: 'rgba(250,204,21,0.10)', color: '#FACC15', border: '1px solid rgba(250,204,21,0.28)' }}>{k}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {tab === 'diff' && (
              <BeforeAfterDiff before={data.before} after={data.after} />
            )}

            {tab === 'inline' && isBulkIngest && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.55)', lineHeight: 1.5 }}>
                  Cada override muestra el cambio aplicado por el founder vs. el valor original extraído por Claude.
                  {history.length > 0 && ` La extracción AI se ha re-computado ${history.length} ${history.length === 1 ? 'vez' : 'veces'}.`}
                </div>
                {overrides.length === 0 ? (
                  <div style={{ padding: 18, textAlign: 'center', fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240, 235, 224, 0.68)', borderRadius: 9, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    Sin overrides aplicados a este item.
                  </div>
                ) : (
                  overrides.map((ov, i) => <InlineEditRow key={i} ov={ov} ai={aiExtracted} />)
                )}
                {history.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240, 235, 224, 0.70)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <History size={11} /> Historial AI ({history.length})
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {history.map((h, i) => (
                        <div key={i} style={{ padding: '7px 11px', borderRadius: 8, background: 'rgba(var(--theme-rgb),0.05)', border: '1px solid rgba(var(--theme-rgb),0.20)' }}>
                          <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10.5, color: 'rgba(240,235,224,0.55)' }}>
                            {fmtRel(h.ts)} · {(h.ai_cost_mxn || 0).toFixed(2)} MXN
                          </div>
                          <pre style={{ margin: '4px 0 0', fontFamily: 'DM Mono, monospace', fontSize: 10.5, color: 'rgba(240,235,224,0.65)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 90, overflow: 'auto' }}>
                            {JSON.stringify(h.extracted, null, 2)}
                          </pre>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {tab === 'timeline' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {tlLoading && <div style={{ padding: 20, color: 'rgba(240, 235, 224, 0.68)', fontFamily: 'DM Sans', fontSize: 12 }}>Cargando timeline…</div>}
                {!tlLoading && tl && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                      <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.55)' }}>
                        {tl.total} {tl.total === 1 ? 'evento' : 'eventos'}{tl.truncated ? ' (truncado a 500)' : ''}
                      </span>
                      <button data-testid="timeline-filter-link" onClick={() => {
                        onClose();
                        navigate(`/superadmin/audit-log?entity_type=${encodeURIComponent(data.entity_type)}&entity_id=${encodeURIComponent(data.entity_id)}`);
                      }} style={{ padding: '5px 12px', borderRadius: 9999, background: 'rgba(var(--theme-rgb),0.10)', border: '1px solid rgba(var(--theme-rgb),0.30)', color: 'var(--theme)', fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                        Ver historial completo
                      </button>
                    </div>
                    {tl.items.map(it => (
                      <div key={it.id} style={{
                        padding: '7px 11px', borderRadius: 8,
                        background: it.id === entryId ? 'rgba(var(--theme-rgb),0.10)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${it.id === entryId ? 'rgba(var(--theme-rgb),0.40)' : 'rgba(255,255,255,0.07)'}`,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'DM Mono, monospace', fontSize: 10.5 }}>
                          <span style={{ padding: '1px 6px', borderRadius: 9999, fontSize: 9.5, fontWeight: 700, background: 'rgba(var(--theme-rgb),0.15)', color: 'var(--theme)' }}>
                            {it.action}
                          </span>
                          <span style={{ color: 'rgba(240,235,224,0.55)' }}>{fmtRel(it.ts)}</span>
                          <span style={{ color: 'rgba(240, 235, 224, 0.70)' }}>· {it.actor?.user_id || '—'}</span>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function DetailItem({ Icon, label, value, mono }) {
  return (
    <div style={{ padding: '9px 11px', borderRadius: 9, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
        <Icon size={10} color="rgba(240, 235, 224, 0.70)" />
        <span style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'rgba(240, 235, 224, 0.70)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</span>
      </div>
      <div style={{ fontFamily: mono ? 'DM Mono, monospace' : 'DM Sans', fontSize: 11.5, color: 'var(--cream)', wordBreak: 'break-all' }}>{value}</div>
    </div>
  );
}
