// Phase 7.9 (complement) — Units history timeline component.
// Used in Legajo (developer) + Superadmin dashboards.
import React, { useEffect, useState } from 'react';
import { Sparkle, FileText, Cloud, RefreshCw } from '../icons';

const API = process.env.REACT_APP_BACKEND_URL;

const SOURCE_BADGES = {
  manual_edit:   { label: 'manual',         bg: 'rgba(99,102,241,0.18)', fg: '#c7d2fe', border: 'rgba(99,102,241,0.32)' },
  auto_sync:     { label: 'auto-sync',      bg: 'rgba(34,197,94,0.16)',  fg: '#86efac', border: 'rgba(34,197,94,0.32)' },
  drive_sheets:  { label: 'sheets',         bg: 'rgba(59,130,246,0.16)', fg: '#93c5fd', border: 'rgba(59,130,246,0.32)' },
  drive_webhook: { label: 'drive · webhook', bg: 'rgba(236,72,153,0.16)', fg: '#f9a8d4', border: 'rgba(236,72,153,0.32)' },
  drive_watcher: { label: 'drive · cron',    bg: 'rgba(168,85,247,0.16)', fg: '#e9d5ff', border: 'rgba(168,85,247,0.32)' },
  bulk_upload:   { label: 'bulk',           bg: 'rgba(245,158,11,0.16)', fg: '#fcd34d', border: 'rgba(245,158,11,0.32)' },
  system:        { label: 'system',         bg: 'rgba(255,255,255,0.06)', fg: 'var(--cream-3)', border: 'var(--border)' },
};

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return iso.slice(0, 19); }
}

function fmtVal(v) {
  if (v === null || v === undefined) return <span style={{ color: 'var(--cream-3)', fontStyle: 'italic' }}>—</span>;
  if (typeof v === 'number') return v.toLocaleString('es-MX');
  return String(v);
}

export default function UnitsHistoryTimeline({ devId, role = 'developer_admin', limit = 50, compact = false }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const base = role === 'superadmin' ? '/api/superadmin' : '/api/desarrollador';
      const r = await fetch(`${API}${base}/developments/${encodeURIComponent(devId)}/units-history?limit=${limit}`, {
        credentials: 'include',
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.detail || `${r.status}`);
      }
      setData(await r.json());
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [devId, role]);

  if (loading) return <div data-testid="uh-loading" style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>Cargando histórico…</div>;
  if (error) return <div data-testid="uh-error" style={{ fontFamily: 'DM Sans', fontSize: 12, color: '#fca5a5' }}>Error: {error}</div>;

  const items = data?.history || [];

  if (items.length === 0) {
    return (
      <div data-testid="uh-empty" style={{
        padding: 22, textAlign: 'center', borderRadius: 12,
        border: '1px dashed var(--border)', background: 'rgba(255,255,255,0.02)',
      }}>
        <Sparkle size={18} color="var(--cream-3)" />
        <div style={{ fontFamily: 'Outfit', fontWeight: 600, fontSize: 14, color: 'var(--cream-2)', marginTop: 8 }}>
          Aún no hay cambios registrados
        </div>
        <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)', marginTop: 4 }}>
          Cada edición manual, sync de Drive o auto-sync de extracciones genera un registro auditable aquí.
        </div>
      </div>
    );
  }

  return (
    <div data-testid="uh-timeline">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div className="eyebrow">{compact ? 'Cambios recientes' : `${items.length} cambios registrados`}</div>
        <button onClick={load} data-testid="uh-refresh" style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '5px 10px', borderRadius: 9999,
          background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)',
          fontFamily: 'DM Sans', fontSize: 10.5, color: 'var(--cream-2)', cursor: 'pointer',
        }}>
          <RefreshCw size={10} /> Actualizar
        </button>
      </div>
      <div style={{
        borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden',
        background: 'rgba(255,255,255,0.02)',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: compact ? '1.4fr 1fr 1.6fr 0.9fr' : '1.4fr 0.9fr 1.4fr 1.4fr 0.9fr 1fr', gap: 0, padding: '8px 14px', background: 'rgba(99,102,241,0.06)', borderBottom: '1px solid var(--border)' }}>
          {(compact
              ? ['Unidad', 'Campo', 'Cambio', 'Origen']
              : ['Unidad', 'Campo', 'Antes', 'Después', 'Origen', 'Cuándo']
            ).map((h, i) => (
              <div key={i} className="eyebrow" style={{ fontSize: 9.5 }}>{h}</div>
            ))}
        </div>
        {items.map((h) => {
          const badge = SOURCE_BADGES[h.source] || SOURCE_BADGES.system;
          return (
            <div key={h.id} data-testid={`uh-row-${h.id}`} style={{
              display: 'grid',
              gridTemplateColumns: compact ? '1.4fr 1fr 1.6fr 0.9fr' : '1.4fr 0.9fr 1.4fr 1.4fr 0.9fr 1fr',
              gap: 0, padding: '10px 14px', borderBottom: '1px solid var(--border)',
              fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-2)', alignItems: 'center',
            }}>
              <div style={{ fontFamily: 'DM Mono', fontSize: 10.5, color: 'var(--cream)' }}>{h.unit_id}</div>
              <div style={{ fontWeight: 600 }}>{h.field_changed}</div>
              {compact ? (
                <div>
                  <span style={{ color: 'var(--cream-3)' }}>{fmtVal(h.old_value)}</span>
                  {' → '}
                  <span style={{ color: 'var(--cream)', fontWeight: 600 }}>{fmtVal(h.new_value)}</span>
                  <div style={{ fontFamily: 'DM Mono', fontSize: 9.5, color: 'var(--cream-3)', marginTop: 2 }}>{fmtDate(h.changed_at)}</div>
                </div>
              ) : (
                <>
                  <div style={{ color: 'var(--cream-3)' }}>{fmtVal(h.old_value)}</div>
                  <div style={{ color: 'var(--cream)', fontWeight: 600 }}>{fmtVal(h.new_value)}</div>
                </>
              )}
              <div>
                <span data-testid={`uh-badge-${h.source}`} style={{
                  display: 'inline-block', padding: '2px 8px', borderRadius: 9999,
                  background: badge.bg, border: `1px solid ${badge.border}`, color: badge.fg,
                  fontFamily: 'DM Sans', fontSize: 9.5, fontWeight: 600, letterSpacing: '0.04em',
                }}>{badge.label}</span>
                {h.source_doc_id && (
                  <a href={`#doc-${h.source_doc_id}`} title={`Doc fuente: ${h.source_doc_id}`} style={{
                    marginLeft: 6, fontFamily: 'DM Mono', fontSize: 9, color: '#a5b4fc',
                    textDecoration: 'none',
                  }}>
                    <FileText size={9} /> doc
                  </a>
                )}
              </div>
              {!compact && (
                <div style={{ fontFamily: 'DM Mono', fontSize: 9.5, color: 'var(--cream-3)' }}>
                  {fmtDate(h.changed_at)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
