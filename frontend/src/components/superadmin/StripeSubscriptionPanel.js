// W3.5 — StripeSubscriptionPanel (mounted in tenant drawer)
import React, { useEffect, useState } from 'react';
import { CreditCard, ExternalLink } from 'lucide-react';
import { fetchStripeStatus, stripeSubscribe, stripeCancel } from '../../api/superadminApiKeys';

const STATUS_TONE = {
  active: '#86efac', trialing: '#a5b4fc', past_due: '#fcd34d', canceled: '#fca5a5',
};

export default function StripeSubscriptionPanel({ tenantId, contactEmail = '' }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tier, setTier] = useState('pro');

  const refresh = async () => {
    if (!tenantId) return;
    try { const r = await fetchStripeStatus(tenantId); setData(r); }
    catch { setData({ available: false }); }
  };
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [tenantId]);

  const onSubscribe = async () => {
    if (busy) return; setBusy(true);
    try {
      await stripeSubscribe(tenantId, { plan_tier: tier, email: contactEmail });
      await refresh();
    } finally { setBusy(false); }
  };
  const onCancel = async () => {
    if (busy) return; setBusy(true);
    try { await stripeCancel(tenantId); await refresh(); } finally { setBusy(false); }
  };

  if (!data) return <div style={{ color: 'var(--cream-3)', fontFamily: 'DM Sans' }}>Cargando…</div>;

  if (!data.available) {
    return (
      <div data-testid="stripe-panel-empty" style={{ padding: 16 }}>
        <h3 style={{ fontFamily: 'Outfit', color: 'var(--cream)', fontSize: 16, fontWeight: 700, margin: '0 0 8px' }}>
          <CreditCard size={14} style={{ marginRight: 6 }} />
          Sin suscripción Stripe
        </h3>
        <p style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-3)', marginBottom: 14 }}>
          Crea una suscripción Stripe para este tenant. Modo test (trial 7 días).
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select data-testid="stripe-panel-tier-select"
            value={tier} onChange={e => setTier(e.target.value)}
            style={{
              padding: '7px 12px', borderRadius: 9999,
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)',
              color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12,
            }}>
            <option value="pro">Pro · $499/mes</option>
            <option value="enterprise">Enterprise · $2999/mes</option>
          </select>
          <button data-testid="stripe-panel-subscribe-btn"
            onClick={onSubscribe} disabled={busy}
            style={{
              padding: '7px 16px', borderRadius: 9999,
              background: busy ? 'rgba(255,255,255,0.06)' : 'linear-gradient(90deg,#6366F1,#EC4899)',
              border: '1px solid rgba(255,255,255,0.16)',
              color: '#fff', cursor: busy ? 'not-allowed' : 'pointer',
              fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12,
            }}>{busy ? '…' : 'Crear customer + suscripción'}</button>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="stripe-panel" style={{ padding: 16 }}>
      <h3 style={{ fontFamily: 'Outfit', color: 'var(--cream)', fontSize: 16, fontWeight: 700, margin: '0 0 12px' }}>
        <CreditCard size={14} style={{ marginRight: 6 }} />
        Suscripción Stripe
      </h3>
      <div style={{ display: 'grid', gap: 8 }}>
        <Row label="Plan" value={data.plan_tier || '—'} />
        <Row label="Status" value={<span style={{ color: STATUS_TONE[data.status] || 'var(--cream)' }}>{data.status}</span>} />
        <Row label="Monthly amount" value={data.monthly_amount_usd != null ? `$${data.monthly_amount_usd} USD` : '—'} />
        <Row label="Current period end" value={(data.current_period_end || '').slice(0, 10) || '—'} />
        <Row label="Customer ID" value={<code style={{ fontSize: 11, color: 'var(--cream-3)' }}>{data.stripe_customer_id || '—'}</code>} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        <a data-testid="stripe-panel-dashboard-link"
          href={`https://dashboard.stripe.com/test/customers/${data.stripe_customer_id || ''}`}
          target="_blank" rel="noreferrer"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '6px 14px', borderRadius: 9999,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.14)',
            color: 'var(--cream)', textDecoration: 'none',
            fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12,
          }}>
          <ExternalLink size={11} /> Stripe Dashboard
        </a>
        {data.status !== 'canceled' && (
          <button data-testid="stripe-panel-cancel-btn" onClick={onCancel} disabled={busy}
            style={{
              padding: '6px 14px', borderRadius: 9999,
              background: 'rgba(239,68,68,0.10)',
              border: '1px solid rgba(239,68,68,0.34)',
              color: '#fca5a5', cursor: busy ? 'not-allowed' : 'pointer',
              fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12,
            }}>Cancelar</button>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '5px 0', borderBottom: '1px dashed rgba(255,255,255,0.06)' }}>
      <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>{label}</span>
      <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream)', fontWeight: 600 }}>{value}</span>
    </div>
  );
}
