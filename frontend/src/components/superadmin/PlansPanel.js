// Fase 3.1 · Control plane — Planes/Snapshots estilo GoHighLevel.
// El superadmin asigna un PLAN (bundle de features) a un tenant: aplicar = snapshot
// que prende todas las features del plan de un jalón. Backend /api/superadmin/features/plans.
import React, { useEffect, useState } from 'react';
import { Layers } from 'lucide-react';
import { listPlans, getTenantPlan, assignPlan } from '../../api/feature_visibility';

const TIER_C = { free: '#6b7280', pro: '#6366F1', enterprise: '#A78BFA' };

export default function PlansPanel() {
  const [plans, setPlans] = useState([]);
  const [tenantId, setTenantId] = useState('');
  const [planId, setPlanId] = useState('pro');
  const [current, setCurrent] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => { listPlans().then(r => setPlans(r.plans || [])).catch(() => {}); }, []);

  const loadCurrent = async (tid) => {
    const t = (tid || tenantId).trim();
    if (!t) { setCurrent(null); return; }
    try { setCurrent(await getTenantPlan(t)); } catch { setCurrent(null); }
  };
  const apply = async () => {
    const t = tenantId.trim();
    if (!t) { setMsg({ ok: false, text: 'Escribe un tenant_id.' }); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await assignPlan({ tenant_id: t, plan_id: planId });
      const on = (r.enabled || []).length || r.feature_count || 0;
      const off = (r.disabled || []).length;
      setMsg({ ok: true, text: `Plan «${planId}» aplicado a ${t} · ${on} features ON${off ? ` · ${off} OFF` : ''}.` });
      await loadCurrent(t);
    } catch (e) { setMsg({ ok: false, text: 'Error: ' + (e.message || 'falló') }); }
    setBusy(false);
  };

  const inp = {
    padding: '8px 12px', borderRadius: 9, background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.12)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12.5,
  };

  return (
    <div data-testid="plans-panel" style={{
      marginBottom: 22, padding: '16px 18px', borderRadius: 14,
      background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.08)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Layers size={16} color="var(--theme)" />
        <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 15, color: 'var(--cream)' }}>Planes · Snapshots</span>
      </div>
      <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.55)', marginBottom: 14 }}>
        Asigna un plan a un tenant (estilo GoHighLevel): prende todas sus features de un jalón.
      </div>

      {/* catálogo de planes */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, marginBottom: 16 }}>
        {plans.map(p => {
          const sel = planId === p.plan_id;
          const c = TIER_C[p.tier] || 'var(--theme)';
          return (
            <button key={p.plan_id} onClick={() => setPlanId(p.plan_id)} data-testid={`plan-${p.plan_id}`}
              style={{
                textAlign: 'left', cursor: 'pointer', padding: '11px 13px', borderRadius: 11,
                background: sel ? `${c}22` : 'rgba(255,255,255,0.02)',
                border: `1px solid ${sel ? c : 'rgba(255,255,255,0.08)'}`,
              }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 14, color: 'var(--cream)' }}>{p.name}</span>
                <span style={{ fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', color: c, letterSpacing: '.05em' }}>{p.tier}</span>
              </div>
              <div style={{ fontSize: 11, color: 'rgba(240,235,224,0.6)', marginTop: 3 }}>{p.feature_count} features · ${p.monthly_price_mxn || 0}/mes</div>
            </button>
          );
        })}
      </div>

      {/* asignar a tenant */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={tenantId} onChange={e => setTenantId(e.target.value)} onBlur={() => loadCurrent()}
          placeholder="tenant_id (ej. constructora_ariel)" data-testid="plan-tenant-input"
          style={{ ...inp, flex: 1, minWidth: 220 }} />
        <select value={planId} onChange={e => setPlanId(e.target.value)} style={inp}>
          {plans.map(p => <option key={p.plan_id} value={p.plan_id}>{p.name}</option>)}
        </select>
        <button onClick={apply} disabled={busy} data-testid="plan-assign-btn"
          style={{
            padding: '8px 16px', borderRadius: 9, fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 800,
            cursor: busy ? 'wait' : 'pointer', color: '#fff', border: 'none',
            background: 'var(--grad, linear-gradient(120deg,#6366F1,#EC4899))', opacity: busy ? 0.6 : 1,
          }}>{busy ? 'Aplicando…' : 'Aplicar plan'}</button>
      </div>

      {current && (
        <div style={{ marginTop: 10, fontSize: 11.5, color: 'rgba(240,235,224,0.72)', fontFamily: 'DM Sans' }}>
          Plan actual de <b style={{ color: 'var(--cream)' }}>{current.tenant_id}</b>: <b style={{ color: 'var(--theme)' }}>{current.plan_id}</b> · {current.active_count} features activas.
        </div>
      )}
      {msg && (
        <div style={{ marginTop: 10, fontSize: 12, fontWeight: 600, fontFamily: 'DM Sans', color: msg.ok ? '#1FA06A' : '#F2635B' }}>{msg.text}</div>
      )}
    </div>
  );
}
