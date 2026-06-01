/**
 * W4.13.A Sub-C — AsesorOutbound (/asesor/outbound)
 * KPIs strip · tabla leads disponibles · bulk re-route + pause-nurture · 1-click claim.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Z } from '../../styles/zIndex';
import PortalLayout from '../../components/shared/PortalLayout';

const API = process.env.REACT_APP_BACKEND_URL;

const FILTERS_ORIGEN = [
  { k: 'all',    label: 'Todos' },
  { k: 'form',   label: 'Form' },
  { k: 'atlax',  label: 'Atlax' },
  { k: 'prensa', label: 'Prensa' },
  { k: 'social', label: 'Social' },
];
const FILTERS_DISC = [
  { k: 'all', label: 'Todos' },
  { k: 'D',   label: 'D' },
  { k: 'I',   label: 'I' },
  { k: 'S',   label: 'S' },
  { k: 'C',   label: 'C' },
  { k: 'unknown', label: '?' },
];

function AsesorOutboundBody({ user }) {
  const navigate = useNavigate();
  const [leads, setLeads] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [origenFilter, setOrigenFilter] = useState('all');
  const [discFilter, setDiscFilter] = useState('all');
  const [selected, setSelected] = useState([]);
  const [toast, setToast] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [leadsRes, statsRes] = await Promise.all([
        fetch(`${API}/api/lead-journey/outbound-available?limit=200`, { credentials: 'include' }),
        fetch(`${API}/api/lead-journey/stats?period_days=30`, { credentials: 'include' }),
      ]);
      if (leadsRes.status === 401 || leadsRes.status === 403) { navigate('/'); return; }
      const d1 = await leadsRes.json();
      const d2 = await statsRes.json();
      setLeads(d1.leads || []);
      setStats(d2);
    } finally { setLoading(false); }
  }, [navigate]);

  useEffect(() => {
    if (!user) { navigate('/'); return; }
    const role = (user.role || '').toLowerCase();
    if (!['advisor', 'asesor', 'tenant_admin', 'developer_admin', 'broker', 'superadmin'].includes(role)) {
      navigate('/');
      return;
    }
    document.title = 'Outbound · Captura proactiva · DesarrollosMX';
    reload();
  }, [user, navigate, reload]);

  const filtered = useMemo(() => {
    return (leads || []).filter(l => {
      if (origenFilter !== 'all') {
        const src = (l.source || l.origen || 'form').toLowerCase();
        if (!src.includes(origenFilter)) return false;
      }
      if (discFilter !== 'all') {
        const d = (l.disc_bucket || l.disc || 'unknown').toUpperCase();
        if (discFilter === 'unknown') {
          if (['D', 'I', 'S', 'C'].includes(d)) return false;
        } else if (d !== discFilter) return false;
      }
      return true;
    });
  }, [leads, origenFilter, discFilter]);

  const handleClaim = async (leadId) => {
    try {
      const r = await fetch(`${API}/api/leads/${leadId}/outbound-claim`, {
        method: 'POST', credentials: 'include',
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setToast({ type: 'success', text: `Lead ${leadId} reclamado` });
      reload();
    } catch (e) {
      setToast({ type: 'error', text: String(e.message || e) });
    } finally {
      setTimeout(() => setToast(null), 3000);
    }
  };

  const handleBulkReroute = async () => {
    if (selected.length === 0) return;
    try {
      const r = await fetch(`${API}/api/lead-journey/bulk-reroute`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_ids: selected }),
      });
      const d = await r.json();
      setToast({ type: 'success', text: `${d.ok_count} ruteados · ${d.failed_count} fallaron` });
      setSelected([]);
      reload();
    } catch (e) {
      setToast({ type: 'error', text: String(e.message || e) });
    } finally {
      setTimeout(() => setToast(null), 3000);
    }
  };

  const handleBulkPauseNurture = async () => {
    if (selected.length === 0) return;
    try {
      await Promise.all(selected.map(id =>
        fetch(`${API}/api/leads/${id}/pause-nurture`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        })
      ));
      setToast({ type: 'success', text: `${selected.length} leads · nurture pausado` });
      setSelected([]);
      reload();
    } catch (e) {
      setToast({ type: 'error', text: String(e.message || e) });
    } finally {
      setTimeout(() => setToast(null), 3000);
    }
  };

  return (
    <div data-testid="asesor-outbound-page" style={{ background: '#06080F', minHeight: '100vh', color: '#F0EBE0', padding: '32px 24px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#a5b4fc', marginBottom: 8 }}>
          OUTBOUND
        </div>
        <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 32, margin: '0 0 22px', letterSpacing: '-0.02em' }}>
          Captura proactiva
        </h1>

        {/* KPIs strip */}
        <div data-testid="outbound-kpis" style={{ display: 'flex', gap: 14, marginBottom: 22, flexWrap: 'wrap' }}>
          <KpiCard label="Leads disponibles" value={leads.length} />
          <KpiCard label="Tu conversión 30d" value={`${stats?.conversion_rate || 0}%`} />
          <KpiCard label="Avg pasos al cierre" value={stats?.avg_steps_to_close || 0} />
          <KpiCard
            label="Drop-off step"
            value={stats?.drop_off_step || '—'}
            warn={stats?.drop_off_step}
          />
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 14, marginBottom: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={LBL}>Origen</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {FILTERS_ORIGEN.map(f => (
                <button key={f.k} onClick={() => setOrigenFilter(f.k)} style={chip(origenFilter === f.k)}>{f.label}</button>
              ))}
            </div>
          </div>
          <div>
            <div style={LBL}>DISC</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {FILTERS_DISC.map(f => (
                <button key={f.k} onClick={() => setDiscFilter(f.k)} style={chip(discFilter === f.k)}>{f.label}</button>
              ))}
            </div>
          </div>
          {selected.length > 0 && (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'rgba(240,235,224,0.6)' }}>{selected.length} seleccionados</span>
              <button data-testid="outbound-bulk-reroute" onClick={handleBulkReroute} style={btnGradient()}>Re-rutear</button>
              <button data-testid="outbound-bulk-pause-nurture" onClick={handleBulkPauseNurture} style={btnGhost()}>Pausar nurture</button>
            </div>
          )}
        </div>

        {/* Table */}
        <div data-testid="outbound-table" style={{
          padding: 0, borderRadius: 16, overflow: 'hidden',
          background: 'var(--surface)', backdropFilter: 'blur(24px)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}>
          {loading && <div style={{ padding: 24, textAlign: 'center', color: 'rgba(240,235,224,0.5)' }}>Cargando…</div>}
          {!loading && filtered.length === 0 && (
            <div data-testid="outbound-empty" style={{ padding: 50, textAlign: 'center' }}>
              <div style={{ fontFamily: 'Outfit', fontSize: 18, fontWeight: 700, marginBottom: 6 }}>No hay leads disponibles</div>
              <div style={{ fontSize: 13, color: 'rgba(240,235,224,0.5)' }}>Vuelve mañana o ajusta los filtros.</div>
            </div>
          )}
          {!loading && filtered.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, fontFamily: 'DM Sans' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: 'rgba(240,235,224,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 10 }}>
                    <th style={{ padding: '12px 14px', width: 40 }}>
                      <input type="checkbox" checked={selected.length === filtered.length && filtered.length > 0}
                        onChange={e => setSelected(e.target.checked ? filtered.map(l => l.id) : [])} />
                    </th>
                    <th style={{ textAlign: 'left', padding: '12px 8px' }}>Lead</th>
                    <th style={{ textAlign: 'left', padding: '12px 8px' }}>Origen</th>
                    <th style={{ textAlign: 'left', padding: '12px 8px' }}>DISC</th>
                    <th style={{ textAlign: 'left', padding: '12px 8px' }}>Zona</th>
                    <th style={{ textAlign: 'left', padding: '12px 8px' }}>Estado</th>
                    <th style={{ padding: '12px 14px', textAlign: 'right' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(l => (
                    <tr key={l.id} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '12px 14px' }}>
                        <input
                          type="checkbox"
                          checked={selected.includes(l.id)}
                          onChange={e => setSelected(prev =>
                            e.target.checked ? [...prev, l.id] : prev.filter(x => x !== l.id)
                          )}
                        />
                      </td>
                      <td style={{ padding: '12px 8px' }}>
                        <div style={{ fontWeight: 700, color: '#F0EBE0' }}>{l.name || l.email || l.id}</div>
                        <div style={{ fontSize: 10, color: 'rgba(240,235,224,0.4)' }}>{l.id}</div>
                      </td>
                      <td style={{ padding: '12px 8px', color: 'rgba(240,235,224,0.6)' }}>{l.source || l.origen || 'form'}</td>
                      <td style={{ padding: '12px 8px', color: 'rgba(240,235,224,0.6)' }}>{(l.disc_bucket || l.disc || '?').toUpperCase()}</td>
                      <td style={{ padding: '12px 8px', color: 'rgba(240,235,224,0.6)' }}>{l.zona_interes || l.colonia || '—'}</td>
                      <td style={{ padding: '12px 8px', color: 'rgba(240,235,224,0.6)' }}>
                        {l.assigned_to ? 'asignado' : 'libre'}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                        <button
                          data-testid={`outbound-claim-btn-${l.id}`}
                          onClick={() => handleClaim(l.id)}
                          style={{
                            padding: '7px 14px', borderRadius: 9999, border: 'none',
                            background: 'linear-gradient(90deg,#6366F1,#EC4899)', color: '#fff',
                            fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                          }}
                        >Reclamar &amp; contactar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: Z.STICKY,
          padding: '12px 18px', borderRadius: 9999,
          background: toast.type === 'success' ? 'rgba(34,197,94,0.18)' : 'rgba(239,68,68,0.18)',
          border: `1px solid ${toast.type === 'success' ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}`,
          color: toast.type === 'success' ? '#4ade80' : '#fca5a5',
          fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 600,
          backdropFilter: 'blur(16px)',
        }}>{toast.text}</div>
      )}
    </div>
  );
}

function KpiCard({ label, value, warn }) {
  return (
    <div style={{
      padding: '16px 20px', borderRadius: 16, minWidth: 160,
      background: 'var(--surface)', border: '1px solid rgba(255,255,255,0.08)',
    }}>
      <div style={{ fontSize: 10.5, color: 'rgba(240,235,224,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'DM Sans' }}>
        {label}
      </div>
      <div style={{
        fontFamily: 'Outfit', fontSize: 26, fontWeight: 800, color: warn ? '#fca5a5' : '#F0EBE0', marginTop: 4,
      }}>{value}</div>
    </div>
  );
}

const LBL = { fontSize: 10.5, color: 'rgba(240,235,224,0.5)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'DM Sans' };

const chip = (active) => ({
  padding: '6px 12px', borderRadius: 9999,
  background: active ? 'rgba(99,102,241,0.18)' : 'rgba(255,255,255,0.03)',
  border: `1px solid ${active ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.08)'}`,
  color: active ? '#a5b4fc' : 'rgba(240,235,224,0.6)',
  fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600, cursor: 'pointer',
});

const btnGradient = () => ({
  padding: '8px 16px', borderRadius: 9999, border: 'none',
  background: 'linear-gradient(90deg,#6366F1,#EC4899)', color: '#fff',
  fontFamily: 'DM Sans', fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
});

const btnGhost = () => ({
  padding: '8px 16px', borderRadius: 9999,
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
  color: '#F0EBE0', fontFamily: 'DM Sans', fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
});

// F1.5 · wrap en PortalLayout role-aware (sidebar consistente · persiste durante loading)
export default function AsesorOutbound(props) {
  return (
    <PortalLayout role={props.user?.role} user={props.user} onLogout={props.onLogout}>
      <AsesorOutboundBody {...props} />
    </PortalLayout>
  );
}
