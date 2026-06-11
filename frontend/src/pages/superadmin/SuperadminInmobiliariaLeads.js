// SuperadminInmobiliariaLeads — "Leads de Mi Inmobiliaria": el pool de marketplace.
// Regla inviolable: el comprador que pide visita NO va al dev, va a MI inmobiliaria (dmx_root).
// El dueño (founder) ve TODO el pool y asigna/reasigna a un asesor de la casa (o round-robin).
// Reusa /api/superadmin/inmobiliaria/* · sin motor nuevo.
import React, { useEffect, useState, useCallback } from 'react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { Building2, RefreshCw, Users } from 'lucide-react';
import { fetchInmobiliariaLeads, fetchHouseAsesores, assignHouseLead } from '../../api/superadminDevmaster';

const ST = {
  requested: { label: 'En el pool', color: '#FACC15' },
  assigned: { label: 'Asignada', color: '#60A5FA' },
  accepted: { label: 'Confirmada', color: '#4ADE80' },
  declined: { label: 'Descartada', color: '#F87171' },
};

export default function SuperadminInmobiliariaLeads({ user, onLogout }) {
  const [data, setData] = useState(null);
  const [asesores, setAsesores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, a] = await Promise.all([
        fetchInmobiliariaLeads('all').catch(() => ({ leads: [] })),
        fetchHouseAsesores().catch(() => ({ asesores: [] })),
      ]);
      setData(d); setAsesores(a?.asesores || []);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(''), 2600); };

  const assign = async (leadId, asesorId) => {
    setBusy(leadId);
    try { const r = await assignHouseLead(leadId, asesorId); flash(r?.mensaje || 'Asignado.'); await load(); }
    catch { flash('No se pudo asignar.'); } finally { setBusy(null); }
  };

  const leads = data?.leads || [];
  const cell = { padding: '10px 12px', fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream)', borderBottom: '1px solid rgba(255,255,255,0.06)' };
  const th = { ...cell, fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(240,235,224,0.5)' };

  return (
    <SuperadminLayout user={user} onLogout={onLogout}>
      <div data-testid="superadmin-inmobiliaria-leads">
        {toast && (
          <div style={{ position: 'fixed', top: 76, right: 20, zIndex: 50, padding: '11px 18px', borderRadius: 10,
            background: 'rgba(var(--theme-rgb),0.18)', border: '1px solid rgba(var(--theme-rgb),0.35)',
            color: 'var(--theme)', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600 }}>{toast}</div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <Building2 size={20} color="var(--theme)" />
          <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 24, color: 'var(--cream)', margin: 0 }}>Leads de mi inmobiliaria</h1>
          <button onClick={load} style={{ marginLeft: 'auto', padding: '7px 12px', borderRadius: 9999, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(240,235,224,0.65)', cursor: 'pointer' }}>
            <RefreshCw size={12} />
          </button>
        </div>
        <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.7)', margin: '0 0 18px' }}>
          {loading ? 'Cargando…' : (data?.lectura || 'Compradores del marketplace que pidieron visita. Son de tu inmobiliaria — asígnalos a un asesor de la casa.')}
        </p>

        {!loading && leads.length === 0 ? (
          <div style={{ padding: 30, borderRadius: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', textAlign: 'center', color: 'rgba(240,235,224,0.6)', fontSize: 13 }}>
            Aún no hay leads de marketplace. Cuando un comprador pida una visita, aparecerá aquí.
          </div>
        ) : (
          <div style={{ overflowX: 'auto', borderRadius: 14, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <thead><tr>
                <th style={th}>Comprador</th><th style={th}>Propiedad</th><th style={th}>Estado</th>
                <th style={th}>Asesor</th><th style={th}>Asignar</th>
              </tr></thead>
              <tbody>
                {leads.map((l) => {
                  const st = ST[l.status] || ST.requested;
                  return (
                    <tr key={l.id}>
                      <td style={cell}>
                        <div style={{ fontWeight: 600 }}>{l.buyer?.name || 'Comprador'}</div>
                        <div style={{ fontSize: 11, color: 'rgba(240,235,224,0.5)' }}>{l.buyer?.email || ''}</div>
                      </td>
                      <td style={cell}>{l.property_name || l.property_id}</td>
                      <td style={cell}><span style={{ color: st.color, fontWeight: 700, fontSize: 12 }}>{st.label}</span></td>
                      <td style={cell}>{l.assigned_asesor_name || <span style={{ color: 'rgba(240,235,224,0.4)' }}>—</span>}</td>
                      <td style={cell}>
                        <select disabled={busy === l.id} defaultValue=""
                          onChange={(e) => { const v = e.target.value; if (v) assign(l.id, v === '__auto__' ? null : v); }}
                          style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--cream)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '6px 8px', fontSize: 12, cursor: 'pointer' }}>
                          <option value="">Asignar…</option>
                          <option value="__auto__">⚡ Automático (round-robin)</option>
                          {asesores.map((a) => <option key={a.user_id} value={a.user_id}>{a.name}</option>)}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && asesores.length === 0 && (
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'rgba(240,235,224,0.55)' }}>
            <Users size={14} /> Aún no hay asesores de la casa. En cuanto registres asesores DMX, podrás asignarles estos leads (o se reparten solos).
          </div>
        )}
      </div>
    </SuperadminLayout>
  );
}
