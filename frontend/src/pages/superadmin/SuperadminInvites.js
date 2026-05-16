/**
 * W4.18.3 Sub-C — SuperadminInvites (/superadmin/invites)
 * Tabs: Códigos invitación | Waitlist compradores.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { Z } from '../../styles/zIndex';

const API = process.env.REACT_APP_BACKEND_URL;

const STATUS_COLOR = {
  active:  { bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.4)',  fg: '#4ade80' },
  used:    { bg: 'rgba(var(--theme-rgb),0.10)', border: 'rgba(var(--theme-rgb),0.35)', fg: 'var(--theme)' },
  revoked: { bg: 'rgba(239,68,68,0.10)',  border: 'rgba(239,68,68,0.35)',  fg: '#fca5a5' },
};

function StatusBadge({ status }) {
  const c = STATUS_COLOR[status] || STATUS_COLOR.active;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 9999,
      background: c.bg, border: `1px solid ${c.border}`, color: c.fg,
      fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
      fontFamily: 'DM Sans',
    }}>{status}</span>
  );
}

export default function SuperadminInvites({ user }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState('codes');

  // Codes
  const [statusFilter, setStatusFilter] = useState(null);
  const [codes, setCodes] = useState([]);
  const [codesLoading, setCodesLoading] = useState(false);
  const [codesPage, setCodesPage] = useState(1);
  const [codesTotal, setCodesTotal] = useState(0);
  const [genOpen, setGenOpen] = useState(false);

  // Waitlist
  const [waitlist, setWaitlist] = useState([]);
  const [waitlistKpis, setWaitlistKpis] = useState([]);
  const [waitlistLoading, setWaitlistLoading] = useState(false);

  const loadCodes = useCallback(async () => {
    setCodesLoading(true);
    const params = new URLSearchParams({ page: codesPage, limit: 20 });
    if (statusFilter) params.set('status', statusFilter);
    try {
      const r = await fetch(`${API}/api/superadmin/invites?${params}`, { credentials: 'include' });
      if (r.status === 401 || r.status === 403) { navigate('/'); return; }
      const d = await r.json();
      setCodes(d.items || []);
      setCodesTotal(d.total || 0);
    } finally { setCodesLoading(false); }
  }, [statusFilter, codesPage, navigate]);

  const loadWaitlist = useCallback(async () => {
    setWaitlistLoading(true);
    try {
      const r = await fetch(`${API}/api/superadmin/waitlist?page=1&limit=200`, { credentials: 'include' });
      if (r.status === 401 || r.status === 403) { navigate('/'); return; }
      const d = await r.json();
      setWaitlist(d.items || []);
      setWaitlistKpis(d.by_utm_source || []);
    } finally { setWaitlistLoading(false); }
  }, [navigate]);

  useEffect(() => {
    if (!user) { navigate('/'); return; }
    if ((user.role || '').toLowerCase() !== 'superadmin') { navigate('/'); return; }
    document.title = 'Private Beta · Invites & Waitlist';
    if (tab === 'codes') loadCodes();
    else loadWaitlist();
  }, [tab, user, navigate, loadCodes, loadWaitlist]);

  const handleRevoke = async (code) => {
    if (!window.confirm(`¿Revocar código ${code}? Esta acción es definitiva.`)) return;
    await fetch(`${API}/api/superadmin/invites/${encodeURIComponent(code)}/revoke`, {
      method: 'POST', credentials: 'include',
    });
    loadCodes();
  };

  const exportWaitlistCSV = () => {
    const headers = ['email', 'utm_source', 'utm_medium', 'utm_campaign', 'locale', 'created_at'];
    const rows = waitlist.map(w => headers.map(h => `"${(w[h] || '').toString().replace(/"/g, '""')}"`).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dmx-waitlist-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <SuperadminLayout><div data-testid="superadmin-invites-page" style={{ color: 'var(--cream)', padding: '32px 24px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--theme)', marginBottom: 8 }}>
          SUPERADMIN
        </div>
        <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 32, margin: '0 0 22px', letterSpacing: '-0.02em' }}>
          Private Beta · Invites & Waitlist
        </h1>

        {/* Tabs */}
        <div style={{
          display: 'inline-flex', gap: 6, padding: 5, borderRadius: 9999,
          background: 'rgba(13,16,23,0.92)', border: '1px solid rgba(255,255,255,0.08)',
          marginBottom: 22,
        }}>
          {[
            { k: 'codes',    label: 'Códigos invitación', testid: 'codes-tab' },
            { k: 'waitlist', label: 'Waitlist compradores', testid: 'waitlist-tab' },
          ].map(t => (
            <button
              key={t.k}
              data-testid={t.testid}
              onClick={() => setTab(t.k)}
              style={{
                padding: '8px 18px', borderRadius: 9999, border: 'none',
                background: tab === t.k ? 'linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))' : 'transparent',
                color: tab === t.k ? '#fff' : 'rgba(240,235,224,0.6)',
                fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
              }}
            >{t.label}</button>
          ))}
        </div>

        {/* CODES TAB */}
        {tab === 'codes' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, marginBottom: 16, flexWrap: 'wrap' }}>
              {/* Filter chips */}
              <div style={{ display: 'flex', gap: 8 }}>
                {[null, 'active', 'used', 'revoked'].map(s => (
                  <button
                    key={s || 'all'}
                    onClick={() => { setStatusFilter(s); setCodesPage(1); }}
                    style={{
                      padding: '6px 14px', borderRadius: 9999,
                      background: statusFilter === s ? 'rgba(var(--theme-rgb),0.18)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${statusFilter === s ? 'rgba(var(--theme-rgb),0.4)' : 'rgba(255,255,255,0.08)'}`,
                      color: statusFilter === s ? 'var(--theme)' : 'rgba(240,235,224,0.6)',
                      fontFamily: 'DM Sans', fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
                    }}
                  >{s || 'todos'}</button>
                ))}
              </div>
              <button
                data-testid="invites-generate-btn"
                onClick={() => setGenOpen(true)}
                style={{
                  padding: '9px 18px', borderRadius: 9999, border: 'none',
                  background: 'linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))', color: '#fff',
                  fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                }}
              >+ Generar códigos</button>
            </div>

            {/* Table */}
            <div data-testid="invites-table" style={{
              padding: '8px 0', borderRadius: 16, overflow: 'hidden',
              background: 'rgba(13,16,23,0.92)', backdropFilter: 'blur(24px)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}>
              {codesLoading && <div style={{ padding: 24, textAlign: 'center', color: 'rgba(240,235,224,0.5)' }}>Cargando…</div>}
              {!codesLoading && codes.length === 0 && (
                <div style={{ padding: 40, textAlign: 'center' }}>
                  <div style={{ fontFamily: 'Outfit', fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Aún no has generado códigos</div>
                  <div style={{ fontSize: 13, color: 'rgba(240,235,224,0.5)' }}>Haz clic en "Generar códigos" para crear el primero.</div>
                </div>
              )}
              {!codesLoading && codes.length > 0 && (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, fontFamily: 'DM Sans' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: 'rgba(240,235,224,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 10 }}>
                        <th style={{ textAlign: 'left', padding: '12px 16px' }}>Código</th>
                        <th style={{ textAlign: 'left', padding: '12px 8px' }}>Status</th>
                        <th style={{ textAlign: 'left', padding: '12px 8px' }}>Used by</th>
                        <th style={{ textAlign: 'left', padding: '12px 8px' }}>Expires</th>
                        <th style={{ textAlign: 'left', padding: '12px 8px' }}>Created</th>
                        <th style={{ textAlign: 'right', padding: '12px 16px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {codes.map(c => (
                        <tr key={c.code} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: '12px 16px', fontFamily: 'DM Mono, monospace', cursor: 'copy' }}
                              onClick={() => navigator.clipboard?.writeText(c.code)}
                              title="Click para copiar">
                            {c.code}
                          </td>
                          <td style={{ padding: '12px 8px' }}><StatusBadge status={c.status} /></td>
                          <td style={{ padding: '12px 8px', color: 'rgba(240,235,224,0.6)' }}>{c.used_by || '—'}</td>
                          <td style={{ padding: '12px 8px', color: 'rgba(240,235,224,0.5)' }}>{(c.expires_at || '').slice(0, 10)}</td>
                          <td style={{ padding: '12px 8px', color: 'rgba(240,235,224,0.5)' }}>{(c.created_at || '').slice(0, 10)}</td>
                          <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                            {c.status === 'active' && (
                              <button
                                data-testid={`invites-revoke-${c.code}`}
                                onClick={() => handleRevoke(c.code)}
                                style={{
                                  padding: '6px 12px', borderRadius: 9999, border: 'none',
                                  background: 'rgba(239,68,68,0.15)', color: '#fca5a5',
                                  fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                }}
                              >Revocar</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Pagination */}
            {codesTotal > 20 && (
              <div style={{ marginTop: 14, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  disabled={codesPage <= 1}
                  onClick={() => setCodesPage(p => p - 1)}
                  style={{ padding: '6px 12px', borderRadius: 9999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#F0EBE0', fontSize: 12, cursor: codesPage <= 1 ? 'not-allowed' : 'pointer', opacity: codesPage <= 1 ? 0.5 : 1 }}
                >Anterior</button>
                <span style={{ padding: '6px 12px', fontSize: 12, color: 'rgba(240,235,224,0.5)' }}>
                  {codesPage} / {Math.ceil(codesTotal / 20)}
                </span>
                <button
                  disabled={codesPage * 20 >= codesTotal}
                  onClick={() => setCodesPage(p => p + 1)}
                  style={{ padding: '6px 12px', borderRadius: 9999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#F0EBE0', fontSize: 12, cursor: 'pointer' }}
                >Siguiente</button>
              </div>
            )}

            {/* Generate Modal */}
            {genOpen && (
              <GenerateCodesModal
                onClose={() => setGenOpen(false)}
                onSaved={() => { setGenOpen(false); loadCodes(); }}
              />
            )}
          </div>
        )}

        {/* WAITLIST TAB */}
        {tab === 'waitlist' && (
          <div>
            <div style={{ display: 'flex', gap: 14, marginBottom: 16, flexWrap: 'wrap' }}>
              <div style={{ padding: '14px 20px', borderRadius: 16, background: 'rgba(13,16,23,0.92)', border: '1px solid rgba(255,255,255,0.08)', minWidth: 160 }}>
                <div style={{ fontSize: 10.5, color: 'rgba(240,235,224,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total emails</div>
                <div style={{ fontFamily: 'Outfit', fontSize: 26, fontWeight: 800, color: '#F0EBE0' }}>{waitlist.length}</div>
              </div>
              {waitlistKpis.slice(0, 3).map((k, i) => (
                <div key={i} style={{ padding: '14px 20px', borderRadius: 16, background: 'rgba(13,16,23,0.92)', border: '1px solid rgba(255,255,255,0.08)', minWidth: 140 }}>
                  <div style={{ fontSize: 10.5, color: 'rgba(240,235,224,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{k.utm_source}</div>
                  <div style={{ fontFamily: 'Outfit', fontSize: 22, fontWeight: 800 }}>{k.count}</div>
                </div>
              ))}
              <div style={{ flex: 1 }} />
              <button
                data-testid="waitlist-export-csv"
                onClick={exportWaitlistCSV}
                disabled={waitlist.length === 0}
                style={{
                  padding: '10px 18px', borderRadius: 9999, border: 'none',
                  background: 'linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))', color: '#fff',
                  fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 700,
                  cursor: waitlist.length === 0 ? 'not-allowed' : 'pointer',
                  opacity: waitlist.length === 0 ? 0.5 : 1,
                }}
              >Exportar CSV</button>
            </div>

            <div data-testid="waitlist-table" style={{
              padding: '8px 0', borderRadius: 16, overflow: 'hidden',
              background: 'rgba(13,16,23,0.92)', backdropFilter: 'blur(24px)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}>
              {waitlistLoading && <div style={{ padding: 24, textAlign: 'center', color: 'rgba(240,235,224,0.5)' }}>Cargando…</div>}
              {!waitlistLoading && waitlist.length === 0 && (
                <div style={{ padding: 40, textAlign: 'center' }}>
                  <div style={{ fontFamily: 'Outfit', fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Waitlist vacía</div>
                  <div style={{ fontSize: 13, color: 'rgba(240,235,224,0.5)' }}>Aún no hay emails registrados.</div>
                </div>
              )}
              {!waitlistLoading && waitlist.length > 0 && (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, fontFamily: 'DM Sans' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: 'rgba(240,235,224,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 10 }}>
                        <th style={{ textAlign: 'left', padding: '12px 16px' }}>Email</th>
                        <th style={{ textAlign: 'left', padding: '12px 8px' }}>UTM source</th>
                        <th style={{ textAlign: 'left', padding: '12px 8px' }}>Medium</th>
                        <th style={{ textAlign: 'left', padding: '12px 8px' }}>Campaign</th>
                        <th style={{ textAlign: 'left', padding: '12px 8px' }}>Locale</th>
                        <th style={{ textAlign: 'left', padding: '12px 16px' }}>Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {waitlist.map((w, i) => (
                        <tr key={i} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: '12px 16px', color: '#F0EBE0' }}>{w.email}</td>
                          <td style={{ padding: '12px 8px', color: 'rgba(240,235,224,0.6)' }}>{w.utm_source || '—'}</td>
                          <td style={{ padding: '12px 8px', color: 'rgba(240,235,224,0.6)' }}>{w.utm_medium || '—'}</td>
                          <td style={{ padding: '12px 8px', color: 'rgba(240,235,224,0.6)' }}>{w.utm_campaign || '—'}</td>
                          <td style={{ padding: '12px 8px', color: 'rgba(240,235,224,0.6)' }}>{w.locale || 'es-MX'}</td>
                          <td style={{ padding: '12px 16px', color: 'rgba(240,235,224,0.5)' }}>{(w.created_at || '').slice(0, 10)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div></SuperadminLayout>
  );
}

function GenerateCodesModal({ onClose, onSaved }) {
  const [count, setCount] = useState(10);
  const [expires, setExpires] = useState(90);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    setError(null); setSubmitting(true);
    try {
      const r = await fetch(`${API}/api/superadmin/invites/generate`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count, intended_role: 'broker', expires_days: expires, notes }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.detail || `Error ${r.status}`);
      }
      onSaved?.();
    } catch (e) { setError(String(e.message || e)); }
    finally { setSubmitting(false); }
  };

  return (
    <div
      data-testid="invites-modal"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: Z.STICKY,
        background: 'rgba(6,8,15,0.85)', backdropFilter: 'blur(16px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
    >
      <div onClick={e => e.stopPropagation()} style={{
        width: 460, maxWidth: '100%', padding: 26, borderRadius: 20,
        background: 'rgba(13,16,23,0.96)', backdropFilter: 'blur(24px)',
        border: '1px solid rgba(255,255,255,0.1)', color: '#F0EBE0', fontFamily: 'DM Sans',
      }}>
        <h2 style={{ fontFamily: 'Outfit', fontSize: 22, fontWeight: 800, margin: '0 0 18px' }}>Generar códigos broker</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label>
            <div style={{ fontSize: 11, color: 'rgba(240,235,224,0.5)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Cantidad (1-100)</div>
            <input data-testid="gen-codes-count" type="number" min={1} max={100} value={count} onChange={e => setCount(+e.target.value)}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 9999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#F0EBE0', fontFamily: 'DM Sans', fontSize: 13, outline: 'none' }} />
          </label>
          <label>
            <div style={{ fontSize: 11, color: 'rgba(240,235,224,0.5)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Expira en (días)</div>
            <input data-testid="gen-codes-expires" type="number" min={1} max={730} value={expires} onChange={e => setExpires(+e.target.value)}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 9999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#F0EBE0', fontFamily: 'DM Sans', fontSize: 13, outline: 'none' }} />
          </label>
          <label>
            <div style={{ fontSize: 11, color: 'rgba(240,235,224,0.5)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Notas (opcional)</div>
            <textarea data-testid="gen-codes-notes" value={notes} onChange={e => setNotes(e.target.value)} rows={3} maxLength={500}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 14, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#F0EBE0', fontFamily: 'DM Sans', fontSize: 13, outline: 'none', resize: 'vertical' }} />
          </label>
          {error && <div style={{ padding: '8px 12px', borderRadius: 10, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontSize: 12 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={onClose}
              style={{ padding: '9px 16px', borderRadius: 9999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#F0EBE0', fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >Cancelar</button>
            <button data-testid="gen-codes-submit" onClick={submit} disabled={submitting}
              style={{ padding: '9px 18px', borderRadius: 9999, border: 'none', background: 'linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))', color: '#fff', fontFamily: 'DM Sans', fontSize: 12, fontWeight: 700, cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.6 : 1 }}
            >{submitting ? 'Generando…' : 'Generar'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
