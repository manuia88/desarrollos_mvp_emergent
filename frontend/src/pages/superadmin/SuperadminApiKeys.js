// W3.5 — Superadmin API Keys page
import React, { useEffect, useState } from 'react';
import { Key, Copy } from 'lucide-react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { PageHeader, Card, Empty } from '../../components/advisor/primitives';
import ApiKeyCard from '../../components/superadmin/ApiKeyCard';
import StripeSubscriptionPanel from '../../components/superadmin/StripeSubscriptionPanel';
import { listKeys, createKey, revokeKey, fetchUsage } from '../../api/superadminApiKeys';
import { Z } from '../../styles/zIndex';

export default function SuperadminApiKeys() {
  const [items, setItems] = useState([]);
  const [kpis, setKpis] = useState({});
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ tenant_id: '', tier: 'free', contact_email: '' });
  const [generated, setGenerated] = useState(null);
  const [drawerKey, setDrawerKey] = useState(null);
  const [drawerUsage, setDrawerUsage] = useState(null);
  const [copied, setCopied] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try { const r = await listKeys(); setItems(r.items || []); setKpis(r.kpis || {}); }
    finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);

  const onCreate = async (e) => {
    e?.preventDefault();
    try {
      const r = await createKey(createForm);
      setGenerated(r);
      setShowCreate(false);
      setCreateForm({ tenant_id: '', tier: 'free', contact_email: '' });
      await refresh();
    } catch (err) {
      alert('Error: ' + (err?.detail || JSON.stringify(err)));
    }
  };

  const onRevoke = async (k) => {
    if (!window.confirm(`¿Revocar key de ${k.tenant_id}?`)) return;
    await revokeKey(k.id);
    await refresh();
  };

  const onOpenDrawer = async (k) => {
    setDrawerKey(k); setDrawerUsage(null);
    try { const u = await fetchUsage(k.id); setDrawerUsage(u); } catch { setDrawerUsage(null); }
  };

  const onCopy = async () => {
    try { await navigator.clipboard.writeText(generated?.key_full_one_time || ''); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch {}
  };

  return (
    <SuperadminLayout>
      <PageHeader
        eyebrow="W3.5 · API Keys + Stripe Billing"
        title="Public API · llaves y suscripciones"
        sub="Genera keys de acceso al API REST v1. Stripe en modo test (sk_test_*)."
        actions={
          <button data-testid="api-keys-new-btn" onClick={() => setShowCreate(true)} style={btnPrimary}>
            <Key size={14} /> Generar nueva
          </button>
        }
      />

      <div data-testid="api-keys-kpi-strip" style={{
        display: 'grid', gap: 12,
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        marginBottom: 18,
      }}>
        <Kpi label="Activas" value={kpis.active ?? '—'} tone="brand" />
        <Kpi label="Free" value={(kpis.by_tier || {}).free ?? 0} tone="muted" />
        <Kpi label="Pro" value={(kpis.by_tier || {}).pro ?? 0} tone="brand" />
        <Kpi label="Enterprise" value={(kpis.by_tier || {}).enterprise ?? 0} tone="pink" />
        <Kpi label="Calls 30d" value={(kpis.calls_30d ?? 0).toLocaleString('es-MX')} tone="ok" />
      </div>

      {loading ? (
        <div style={{ color: 'var(--cream-3)', fontFamily: 'DM Sans' }}>Cargando…</div>
      ) : items.length === 0 ? (
        <Empty title="Sin API keys" sub="Genera la primera arriba." />
      ) : (
        <Card>
          <div style={{ overflowX: 'auto' }}>
            <table data-testid="api-keys-table" style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Sans' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.10)' }}>
                  <Th>Tenant</Th><Th>Tier</Th><Th>Quota</Th><Th>Email</Th>
                  <Th>Last used</Th><Th>Status</Th><Th>Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {items.map(k => (
                  <ApiKeyCard key={k.id} keyDoc={k} onClick={onOpenDrawer} onRevoke={onRevoke} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Create modal */}
      {showCreate && (
        <div onClick={() => setShowCreate(false)}
          style={{ position: 'fixed', inset: 0, zIndex: Z.MODAL_CRITICAL, background: 'rgba(6,8,15,0.85)' }}>
          <form onClick={e => e.stopPropagation()} onSubmit={onCreate}
            data-testid="api-keys-create-modal"
            style={{
              position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
              width: 'min(440px, 92vw)', background: 'rgba(13,16,23,0.98)',
              border: '1px solid rgba(255,255,255,0.10)', borderRadius: 16, padding: 22,
            }}>
            <h3 style={{ fontFamily: 'Outfit', color: 'var(--cream)', margin: 0, fontSize: 18 }}>Generar API key</h3>
            <FormField label="Tenant ID" required>
              <input data-testid="api-keys-form-tenant" required
                value={createForm.tenant_id}
                onChange={e => setCreateForm({ ...createForm, tenant_id: e.target.value })}
                style={inputStyle} placeholder="bbva_test" />
            </FormField>
            <FormField label="Tier">
              <select data-testid="api-keys-form-tier"
                value={createForm.tier}
                onChange={e => setCreateForm({ ...createForm, tier: e.target.value })}
                style={inputStyle}>
                <option value="free">Free · 1,000/mes</option>
                <option value="pro">Pro · 100,000/mes · $499</option>
                <option value="enterprise">Enterprise · 1M/mes · $2,999</option>
              </select>
            </FormField>
            <FormField label="Email contacto">
              <input data-testid="api-keys-form-email" type="email"
                value={createForm.contact_email}
                onChange={e => setCreateForm({ ...createForm, contact_email: e.target.value })}
                style={inputStyle} placeholder="api@empresa.com" />
            </FormField>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <button data-testid="api-keys-form-cancel-btn" type="button" onClick={() => setShowCreate(false)} style={btnSecondary}>Cancelar</button>
              <button data-testid="api-keys-form-submit-btn" type="submit" style={btnPrimary}>Generar</button>
            </div>
          </form>
        </div>
      )}

      {/* Generated modal — show key full ONCE */}
      {generated && (
        <div onClick={() => setGenerated(null)}
          style={{ position: 'fixed', inset: 0, zIndex: Z.MODAL_CRITICAL, background: 'rgba(6,8,15,0.92)' }}>
          <div onClick={e => e.stopPropagation()}
            data-testid="api-keys-generated-modal"
            style={{
              position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
              width: 'min(560px, 94vw)', background: 'rgba(13,16,23,0.98)',
              border: '1px solid rgba(var(--theme-rgb),0.40)', borderRadius: 16, padding: 22,
            }}>
            <div style={{
              fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700, letterSpacing: '0.18em',
              textTransform: 'uppercase',
              backgroundImage: 'linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>API KEY GENERADA</div>
            <h3 style={{ fontFamily: 'Outfit', color: 'var(--cream)', margin: '8px 0 12px', fontSize: 22, fontWeight: 800 }}>
              Guarda esta key AHORA
            </h3>
            <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: '#fcd34d', marginBottom: 14 }}>
              Esta key se muestra UNA SOLA VEZ. No se almacena completa en la base de datos.
            </p>
            <div data-testid="api-keys-generated-key"
              style={{
                background: 'rgba(0,0,0,0.45)', padding: 14, borderRadius: 10,
                fontFamily: 'monospace', fontSize: 13, color: 'var(--theme)',
                wordBreak: 'break-all', marginBottom: 12,
              }}>{generated.key_full_one_time}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button data-testid="api-keys-copy-btn" type="button" onClick={onCopy} style={btnPrimary}>
                <Copy size={13} /> {copied ? 'Copiado!' : 'Copiar al portapapeles'}
              </button>
              <button data-testid="api-keys-generated-close-btn" type="button" onClick={() => setGenerated(null)} style={btnSecondary}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Usage drawer */}
      {drawerKey && (
        <div onClick={() => { setDrawerKey(null); setDrawerUsage(null); }}
          style={{ position: 'fixed', inset: 0, zIndex: Z.MODAL_CRITICAL, background: 'rgba(6,8,15,0.78)' }}>
          <div onClick={e => e.stopPropagation()}
            data-testid="api-keys-usage-drawer"
            style={{
              position: 'absolute', right: 0, top: 0, bottom: 0,
              width: 'min(680px, 96vw)', overflowY: 'auto',
              background: 'rgba(13,16,23,0.98)',
              borderLeft: '1px solid rgba(255,255,255,0.10)', padding: 24,
            }}>
            <h3 style={{ fontFamily: 'Outfit', color: 'var(--cream)', margin: 0, fontWeight: 800 }}>
              {drawerKey.tenant_id}
            </h3>
            <p style={{ fontFamily: 'DM Sans', color: 'var(--cream-3)', fontSize: 12, marginTop: 4, marginBottom: 16 }}>
              <code>{drawerKey.key_prefix}…</code> · tier {drawerKey.tier} · {drawerKey.status}
            </p>
            <h4 style={{ fontFamily: 'Outfit', color: 'var(--cream)', fontSize: 13, fontWeight: 700, margin: '12px 0 6px' }}>Stripe</h4>
            <StripeSubscriptionPanel tenantId={drawerKey.tenant_id} contactEmail={drawerKey.contact_email} />
            <h4 style={{ fontFamily: 'Outfit', color: 'var(--cream)', fontSize: 13, fontWeight: 700, margin: '20px 0 6px' }}>Uso (30d)</h4>
            {!drawerUsage ? (
              <div style={{ color: 'var(--cream-3)', fontFamily: 'DM Sans' }}>Cargando…</div>
            ) : (drawerUsage.series || []).length === 0 ? (
              <div style={{ color: 'var(--cream-3)', fontFamily: 'DM Sans' }}>Sin actividad</div>
            ) : (
              <table style={{ width: '100%', fontFamily: 'DM Sans', fontSize: 12 }}>
                <thead><tr><Th>Día</Th><Th>Calls</Th><Th>Errores</Th><Th>Avg ms</Th></tr></thead>
                <tbody>
                  {drawerUsage.series.map((s, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <Td2>{s.date}</Td2><Td2>{s.calls}</Td2><Td2>{s.errors}</Td2><Td2>{s.avg_latency_ms}</Td2>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </SuperadminLayout>
  );
}

function Kpi({ label, value, tone }) {
  const colors = {
    bad:   { bg: 'rgba(239,68,68,0.10)',  bd: 'rgba(239,68,68,0.34)',  fg: '#fca5a5' },
    warn:  { bg: 'rgba(245,158,11,0.10)', bd: 'rgba(245,158,11,0.34)', fg: '#fcd34d' },
    ok:    { bg: 'rgba(16,185,129,0.10)', bd: 'rgba(16,185,129,0.34)', fg: '#86efac' },
    brand: { bg: 'rgba(var(--theme-rgb),0.10)', bd: 'rgba(var(--theme-rgb),0.34)', fg: 'var(--theme)' },
    pink:  { bg: 'rgba(var(--theme-rgb),0.10)', bd: 'rgba(var(--theme-rgb),0.34)', fg: 'rgba(var(--theme-rgb), 0.18)' },
    muted: { bg: 'rgba(255,255,255,0.04)',bd: 'rgba(255,255,255,0.10)', fg: 'var(--cream-3)' },
  }[tone] || {};
  return (
    <div data-testid={`api-keys-kpi-${tone}`} style={{ background: colors.bg, border: `1px solid ${colors.bd}`, borderRadius: 14, padding: 14 }}>
      <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 24, color: colors.fg, marginTop: 6 }}>{value}</div>
    </div>
  );
}

function FormField({ label, required, children }) {
  return (
    <label style={{ display: 'block', marginTop: 12 }}>
      <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {label}{required && ' *'}
      </span>
      {children}
    </label>
  );
}

const inputStyle = {
  width: '100%', padding: '8px 12px', marginTop: 6, borderRadius: 10,
  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)',
  color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13,
};
const btnPrimary = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '8px 16px', borderRadius: 9999,
  background: 'linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))',
  border: '1px solid rgba(255,255,255,0.16)',
  color: '#fff', cursor: 'pointer',
  fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13,
};
const btnSecondary = {
  padding: '8px 16px', borderRadius: 9999,
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.16)',
  color: 'var(--cream)', cursor: 'pointer',
  fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13,
};
function Th({ children }) {
  return (<th style={{ textAlign: 'left', padding: '10px 8px', fontSize: 10.5, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{children}</th>);
}
function Td2({ children }) {
  return (<td style={{ padding: '6px 8px', fontSize: 12, color: 'var(--cream-2)' }}>{children}</td>);
}
