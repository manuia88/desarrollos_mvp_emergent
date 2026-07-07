// W3.8 — /superadmin/partners — Partner management dashboard
import React, { useEffect, useState } from 'react';
import { HeartHandshake, Plus, RefreshCw, Copy, Check, ExternalLink } from 'lucide-react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { PageHeader } from '../../components/advisor/primitives';
import {
  listPartners,
  createPartner,
  updatePartner,
  getPartnerDetail,
} from '../../api/superadminPartners';
import { Z } from '../../styles/zIndex';

const PARTNER_TYPES = [
  { id: 'mortgage_broker',  label: 'Bróker Hipotecario' },
  { id: 'insurance_broker', label: 'Bróker Seguros' },
  { id: 'notaria',          label: 'Notaría' },
  { id: 'avaluo',           label: 'Avalúo' },
  { id: 'moving',           label: 'Post-Cierre/Mudanza' },
  { id: 'construction',     label: 'Construcción' },
];

const STATUS_CONFIG = {
  pending_partnership: { label: 'Pendiente firma',   color: '#9CA3AF' },
  active:              { label: 'Activo',             color: '#10B981' },
  paused:              { label: 'Pausado',            color: '#F59E0B' },
  terminated:          { label: 'Terminado',          color: '#EF4444' },
};

const pill = (active) => ({
  padding: '5px 14px', borderRadius: 9999,
  fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12, cursor: 'pointer',
  border: active ? 'none' : '1px solid rgba(255,255,255,0.12)',
  background: active ? 'linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))' : 'rgba(255,255,255,0.04)',
  color: 'var(--cream)',
});

const kpiCard = (label, value, sub) => (
  <div key={label} style={{
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 10, padding: '14px 18px',
  }}>
    <p style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</p>
    <p style={{ fontFamily: 'Outfit', fontWeight: 900, fontSize: 26, color: 'var(--cream)', margin: 0 }}>{value ?? '—'}</p>
    {sub && <p style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', margin: '4px 0 0' }}>{sub}</p>}
  </div>
);

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cream-3)', marginLeft: 6 }}
    >
      {copied ? <Check size={13} color="#10B981" /> : <Copy size={13} />}
    </button>
  );
}

const inputStyle = {
  width: '100%', background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8,
  color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13,
  padding: '8px 12px', outline: 'none', boxSizing: 'border-box',
};

export default function SuperadminPartners({ embedded }) {
  const [data, setData] = useState({ items: [], kpis: {} });
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [activating, setActivating] = useState(null);
  const [createForm, setCreateForm] = useState({
    name: '', type: 'mortgage_broker', contact_email: '',
    commission_pct: '', notes: '',
  });
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await listPartners({ status: filterStatus || undefined, days: 30 });
      setData(r);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filterStatus]);

  const openDetail = async (id) => {
    setSelectedId(id);
    const d = await getPartnerDetail(id);
    setDetail(d);
  };

  const handleActivate = async (id, newStatus) => {
    if (!window.confirm(`¿Cambiar status a "${newStatus}"?`)) return;
    setActivating(id);
    try {
      await updatePartner(id, { status: newStatus });
      await load();
      if (selectedId === id) openDetail(id);
    } finally {
      setActivating(null);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      await createPartner({
        ...createForm,
        commission_pct: createForm.commission_pct ? Number(createForm.commission_pct) : null,
      });
      setShowCreate(false);
      setCreateForm({ name: '', type: 'mortgage_broker', contact_email: '', commission_pct: '', notes: '' });
      await load();
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setCreating(false);
    }
  };

  const kpis = data.kpis || {};

  return (
    <SuperadminLayout bare={embedded}>
      <PageHeader
        eyebrow="W3.8 · Cross-sell Intelligence"
        title="Partners"
        sub="Network de partners · lead routing · revenue tracking"
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={load} disabled={loading} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
              color: 'var(--cream-2)', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13,
              padding: '8px 16px', borderRadius: 9999, cursor: 'pointer',
            }}>
              <RefreshCw size={13} /> Actualizar
            </button>
            <button
              data-testid="create-partner-btn"
              onClick={() => setShowCreate(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))',
                border: 'none', color: '#fff',
                fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13,
                padding: '8px 18px', borderRadius: 9999, cursor: 'pointer',
              }}
            >
              <Plus size={13} /> Nuevo partner
            </button>
          </div>
        }
      />

      {/* KPI strip */}
      <div data-testid="partners-kpi-strip" style={{
        display: 'grid', gap: 10,
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        marginBottom: 20,
      }}>
        {kpiCard('Total partners', kpis.total_partners)}
        {kpiCard('Activos', kpis.active, 'Buyer-facing')}
        {kpiCard('Pendiente firma', kpis.pending_partnership, 'Sin activar')}
        {kpiCard('Revenue 30d (MXN)', kpis.revenue_30d_mxn ? `$${Math.round(kpis.revenue_30d_mxn).toLocaleString('es-MX')}` : '$0')}
        {kpiCard('Leads 30d', kpis.leads_30d)}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {[{id:'',label:'Todos'}, ...Object.entries(STATUS_CONFIG).map(([id,c])=>({id,label:c.label}))].map(s => (
          <button key={s.id} onClick={() => setFilterStatus(s.id)} style={pill(filterStatus === s.id)}>
            {s.label}
          </button>
        ))}
      </div>

      {/* Partner table */}
      <div style={{ overflowX: 'auto' }}>
        <table data-testid="partners-table" style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Sans', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.10)' }}>
              {['Partner', 'Tipo', 'Status', 'Comisión', 'Leads 30d', 'Revenue 30d', ''].map(h => (
                <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--cream-3)', fontWeight: 700, textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.06em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding: 20, color: 'var(--cream-3)', textAlign: 'center' }}>Cargando…</td></tr>
            ) : data.items?.map((p, i) => {
              const sc = STATUS_CONFIG[p.status] || STATUS_CONFIG.pending_partnership;
              return (
                <tr key={p.id} data-testid={`partner-row-${p.id}`}
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer',
                    background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}
                  onClick={() => openDetail(p.id)}
                >
                  <td style={{ padding: '10px 10px' }}>
                    <span style={{ fontFamily: 'Outfit', fontWeight: 700, color: 'var(--cream)' }}>{p.name}</span>
                    {p.website && <a href={p.website} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ marginLeft: 6, color: 'var(--cream-3)' }}><ExternalLink size={11} /></a>}
                  </td>
                  <td style={{ padding: '10px 10px' }}>
                    <span style={{ background: 'rgba(var(--theme-rgb),0.12)', color: 'var(--theme)', borderRadius: 6, padding: '3px 8px', fontSize: 11 }}>
                      {PARTNER_TYPES.find(t => t.id === p.type)?.label || p.type}
                    </span>
                  </td>
                  <td style={{ padding: '10px 10px' }}>
                    <span style={{ background: `${sc.color}18`, color: sc.color, borderRadius: 9999, padding: '3px 10px', fontWeight: 700, fontSize: 11 }}>
                      {sc.label}
                    </span>
                  </td>
                  <td style={{ padding: '10px 10px', color: 'var(--cream-2)' }}>{p.commission_pct ? `${p.commission_pct}%` : '—'}</td>
                  <td style={{ padding: '10px 10px', color: 'var(--cream-2)', textAlign: 'right' }}>{p.offers_30d ?? 0}</td>
                  <td style={{ padding: '10px 10px', color: 'var(--cream-2)', textAlign: 'right' }}>
                    {p.revenue_30d_mxn ? `$${Math.round(p.revenue_30d_mxn).toLocaleString('es-MX')}` : '—'}
                  </td>
                  <td style={{ padding: '10px 10px' }}>
                    {p.status === 'pending_partnership' && (
                      <button
                        data-testid={`activate-btn-${p.id}`}
                        onClick={e => { e.stopPropagation(); handleActivate(p.id, 'active'); }}
                        disabled={activating === p.id}
                        style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.35)', color: '#6ee7b7', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 11, padding: '5px 12px', borderRadius: 9999, cursor: 'pointer' }}
                      >
                        {activating === p.id ? '…' : 'Activar'}
                      </button>
                    )}
                    {p.status === 'active' && (
                      <button
                        onClick={e => { e.stopPropagation(); handleActivate(p.id, 'paused'); }}
                        style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', color: '#FCD34D', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 11, padding: '5px 12px', borderRadius: 9999, cursor: 'pointer' }}
                      >
                        Pausar
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Detail drawer */}
      {detail && (
        <div
          onClick={e => { if (e.target === e.currentTarget) { setDetail(null); setSelectedId(null); }}}
          style={{ position: 'fixed', inset: 0, zIndex: Z.DROPDOWN, background: 'rgba(6,8,15,0.7)', backdropFilter: 'blur(4px)' }}
        >
          <div style={{
            position: 'fixed', right: 0, top: 0, bottom: 0, width: 480,
            background: '#0E1220', borderLeft: '1px solid rgba(255,255,255,0.10)',
            overflowY: 'auto', padding: 28,
          }}>
            <button onClick={() => { setDetail(null); setSelectedId(null); }}
              style={{ background: 'none', border: 'none', color: 'var(--cream-3)', cursor: 'pointer', marginBottom: 12, fontFamily: 'DM Sans' }}>
              ← Cerrar
            </button>

            <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 20, color: 'var(--cream)', margin: '0 0 6px' }}>{detail.name}</h2>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              <span style={{ background: 'rgba(var(--theme-rgb),0.12)', color: 'var(--theme)', borderRadius: 6, padding: '3px 8px', fontSize: 11, fontFamily: 'DM Sans' }}>
                {detail.type}
              </span>
              <span style={{ background: `${(STATUS_CONFIG[detail.status]?.color||'#9CA3AF')}18`, color: STATUS_CONFIG[detail.status]?.color||'#9CA3AF', borderRadius: 9999, padding: '3px 10px', fontWeight: 700, fontSize: 11, fontFamily: 'DM Sans' }}>
                {STATUS_CONFIG[detail.status]?.label || detail.status}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
              <div><span style={{ fontSize: 11, color: 'var(--cream-3)', fontFamily: 'DM Sans' }}>Email</span>
                <p style={{ margin: '2px 0', fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)' }}>{detail.contact_email}</p></div>
              <div><span style={{ fontSize: 11, color: 'var(--cream-3)', fontFamily: 'DM Sans' }}>Comisión</span>
                <p style={{ margin: '2px 0', fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)' }}>{detail.commission_pct ? `${detail.commission_pct}%` : '—'}</p></div>
            </div>

            {detail.notes && (
              <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '10px 12px', marginBottom: 16 }}>
                <p style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', margin: 0 }}>{detail.notes}</p>
              </div>
            )}

            {/* Status actions */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              {detail.status === 'pending_partnership' && (
                <button
                  data-testid="drawer-activate-btn"
                  onClick={() => handleActivate(detail.id, 'active')}
                  style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.35)', color: '#6ee7b7', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, padding: '8px 18px', borderRadius: 9999, cursor: 'pointer' }}
                >
                  Activar partner
                </button>
              )}
              {detail.status === 'active' && (
                <button
                  onClick={() => handleActivate(detail.id, 'paused')}
                  style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', color: '#FCD34D', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, padding: '8px 18px', borderRadius: 9999, cursor: 'pointer' }}
                >
                  Pausar
                </button>
              )}
              {detail.status === 'paused' && (
                <button
                  onClick={() => handleActivate(detail.id, 'active')}
                  style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.35)', color: '#6ee7b7', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, padding: '8px 18px', borderRadius: 9999, cursor: 'pointer' }}
                >
                  Reactivar
                </button>
              )}
            </div>

            {/* Webhook section */}
            {detail.webhook_instructions && (
              <div style={{ background: 'rgba(var(--theme-rgb),0.06)', border: '1px solid rgba(var(--theme-rgb),0.2)', borderRadius: 10, padding: '14px 16px', marginBottom: 20 }}>
                <p style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)', margin: '0 0 8px' }}>
                  Webhook H2 (integración futura)
                </p>
                <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>
                  <p style={{ margin: '0 0 6px' }}>Endpoint:</p>
                  <code style={{ background: 'rgba(0,0,0,0.3)', padding: '4px 8px', borderRadius: 4, color: 'var(--theme)', display: 'block', wordBreak: 'break-all', marginBottom: 10 }}>
                    {detail.webhook_instructions.endpoint}
                    <CopyButton text={`${process.env.REACT_APP_BACKEND_URL}${detail.webhook_instructions.endpoint}`} />
                  </code>
                  <p style={{ margin: '0 0 4px' }}>HMAC Secret (solo visible una vez — guardar):</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <code style={{ background: 'rgba(0,0,0,0.3)', padding: '4px 8px', borderRadius: 4, color: '#fbbf24', fontSize: 11, wordBreak: 'break-all' }}>
                      {detail.webhook_instructions.hmac_secret}
                    </code>
                    <CopyButton text={detail.webhook_instructions.hmac_secret} />
                  </div>
                  <p style={{ margin: '10px 0 0', fontSize: 11 }}>
                    Header requerido: <code>X-DMX-Signature: hmac_sha256(body, secret)</code>
                  </p>
                </div>
              </div>
            )}

            {/* Recent offers timeline */}
            {detail.recent_offers?.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <p style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)', margin: '0 0 10px' }}>
                  Ofertas recientes (30d)
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {detail.recent_offers.slice(0,5).map(o => (
                    <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 6 }}>
                      <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>{o.offer_type}</span>
                      <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>{o.offer_status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Revenue ledger */}
            {detail.revenue_ledger?.length > 0 && (
              <div>
                <p style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)', margin: '0 0 10px' }}>
                  Eventos de ingreso
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {detail.revenue_ledger.map(r => (
                    <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', background: 'rgba(16,185,129,0.05)', borderRadius: 6, border: '1px solid rgba(16,185,129,0.12)' }}>
                      <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: '#6ee7b7' }}>+${r.revenue_dmx_mxn?.toLocaleString('es-MX')} MXN</span>
                      <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>{new Date(r.event_at).toLocaleDateString('es-MX')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create partner modal */}
      {showCreate && (
        <div onClick={e => { if (e.target === e.currentTarget) setShowCreate(false); }}
          style={{ position: 'fixed', inset: 0, zIndex: Z.DROPDOWN, background: 'rgba(6,8,15,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        >
          <div style={{ background: '#0E1220', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 16, padding: '24px 28px', width: '100%', maxWidth: 440 }}>
            <h3 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: 'var(--cream)', margin: '0 0 18px' }}>Nuevo partner</h3>
            <form onSubmit={handleCreate}>
              {[
                { id: 'name', label: 'Nombre *', type: 'text', placeholder: 'Ej: Bróker Hipotecario ABC', required: true },
                { id: 'contact_email', label: 'Email de contacto *', type: 'email', placeholder: 'partner@ejemplo.com', required: true },
                { id: 'commission_pct', label: 'Comisión (%)', type: 'number', placeholder: 'Ej: 0.75' },
              ].map(f => (
                <div key={f.id} style={{ marginBottom: 12 }}>
                  <label style={{ ...labelStyleFn() }}>{f.label}</label>
                  <input type={f.type} required={f.required} placeholder={f.placeholder}
                    value={createForm[f.id]}
                    onChange={e => setCreateForm(cf => ({ ...cf, [f.id]: e.target.value }))}
                    style={modalInputStyle} />
                </div>
              ))}
              <div style={{ marginBottom: 12 }}>
                <label style={{ ...labelStyleFn() }}>Tipo</label>
                <select value={createForm.type} onChange={e => setCreateForm(cf => ({ ...cf, type: e.target.value }))} style={modalInputStyle}>
                  {PARTNER_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ ...labelStyleFn() }}>Notas internas</label>
                <textarea rows={2} value={createForm.notes} onChange={e => setCreateForm(cf => ({ ...cf, notes: e.target.value }))} placeholder="Estado negociación, objetivo H2, etc." style={{ ...modalInputStyle, resize: 'vertical' }} />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" onClick={() => setShowCreate(false)}
                  style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--cream-2)', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, padding: '10px 0', borderRadius: 9999, cursor: 'pointer' }}>
                  Cancelar
                </button>
                <button type="submit" disabled={creating}
                  style={{ flex: 2, background: creating ? 'rgba(var(--theme-rgb),0.4)' : 'linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))', border: 'none', color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, padding: '10px 0', borderRadius: 9999, cursor: 'pointer' }}>
                  {creating ? 'Guardando…' : 'Crear partner'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </SuperadminLayout>
  );
}

const labelStyleFn = () => ({ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', display: 'block', marginBottom: 5 });
const modalInputStyle = { width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13, padding: '8px 12px', outline: 'none', boxSizing: 'border-box' };
