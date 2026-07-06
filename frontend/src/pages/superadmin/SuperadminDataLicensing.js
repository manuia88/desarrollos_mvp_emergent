// W3.6 — Superadmin Data Licensing Bundles page.
import React, { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { PageHeader, Card, Empty, Badge } from '../../components/advisor/primitives';
import DataLicensingBundleCard from '../../components/superadmin/DataLicensingBundleCard';
import {
  listBundleTemplates, listSubscriptions,
  createSubscription, patchSubscription,
} from '../../api/dataLicensing';
import { Z } from '../../styles/zIndex';

export default function SuperadminDataLicensing({ embedded }) {
  const [bundles, setBundles] = useState([]);
  const [subs, setSubs] = useState([]);
  const [kpis, setKpis] = useState({});
  const [loading, setLoading] = useState(true);
  const [createBundle, setCreateBundle] = useState(null);
  const [drawerSub, setDrawerSub] = useState(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const [t, s] = await Promise.all([
        listBundleTemplates(),
        listSubscriptions(),
      ]);
      setBundles(t.items || []);
      setSubs(s.items || []);
      setKpis(s.kpis || {});
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { refresh(); }, []);

  return (
    <SuperadminLayout bare={embedded}>
      <PageHeader
        eyebrow="W3.6 · Phase Z.4"
        title="Data Licensing Bundles"
        sub="Suscripciones institucionales B2B. ARR target $2M+ con 5 bundles preset + custom."
      />

      <div data-testid="data-licensing-kpis" style={{
        display: 'grid', gap: 12,
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        marginBottom: 22,
      }}>
        <Kpi label="ARR total"
          value={`$${(kpis.total_arr_usd || 0).toLocaleString('en-US')} USD`}
          tone="brand" />
        <Kpi label="Subs activas" value={kpis.active_subscriptions ?? 0} tone="ok" />
        <Kpi label="Renovaciones 30d" value={kpis.upcoming_renewals_30d ?? 0} tone="warn" />
        <Kpi label="Riesgo churn" value={kpis.churn_risk_count ?? 0} tone="bad" />
      </div>

      <h2 style={{
        fontFamily: 'Outfit', color: 'var(--cream)', fontSize: 18, fontWeight: 700,
        margin: '8px 0 12px',
      }}>Bundle templates · 5 presets</h2>
      <div data-testid="data-licensing-bundles-grid" style={{
        display: 'grid', gap: 12,
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        marginBottom: 28,
      }}>
        {bundles.map(b => (
          <DataLicensingBundleCard key={b.key}
            bundle={b}
            onCreate={(bundle) => setCreateBundle(bundle)} />
        ))}
      </div>

      <h2 style={{
        fontFamily: 'Outfit', color: 'var(--cream)', fontSize: 18, fontWeight: 700,
        margin: '20px 0 12px',
      }}>Suscripciones activas</h2>
      {loading ? (
        <div style={{ color: 'var(--cream-3)', fontFamily: 'DM Sans' }}>Cargando…</div>
      ) : subs.length === 0 ? (
        <Empty title="Sin suscripciones" sub="Crea la primera arriba seleccionando un bundle." />
      ) : (
        <Card>
          <div style={{ overflowX: 'auto' }}>
            <table data-testid="data-licensing-subs-table" style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Sans' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.10)' }}>
                  <Th>Tenant</Th><Th>Bundle</Th><Th>Precio anual</Th>
                  <Th>SLA</Th><Th>Vigencia</Th><Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {subs.map(s => (
                  <tr key={s.id} data-testid={`data-licensing-sub-row-${s.id}`}
                    onClick={() => setDrawerSub(s)}
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer' }}>
                    <Td>
                      <div style={{ color: 'var(--cream)', fontWeight: 600 }}>{s.tenant_id}</div>
                      <div style={{ color: 'var(--cream-3)', fontSize: 11 }}>{s.contact_email}</div>
                    </Td>
                    <Td>
                      <div style={{ color: 'var(--cream-2)', fontSize: 12 }}>{s.bundle_name}</div>
                      <div style={{ color: 'var(--cream-3)', fontSize: 10.5 }}>{(s.scope || []).join(' · ')}</div>
                    </Td>
                    <Td>
                      <span style={{
                        fontFamily: 'Outfit', fontWeight: 700, color: 'var(--cream)',
                      }}>${(s.price_usd_annual || 0).toLocaleString('en-US')}</span>
                    </Td>
                    <Td>{s.sla_uptime_pct}%</Td>
                    <Td style={{ fontSize: 11 }}>
                      <div>{(s.started_at || '').slice(0, 10)}</div>
                      <div style={{ color: 'var(--cream-3)' }}>→ {(s.ends_at || '').slice(0, 10)}</div>
                    </Td>
                    <Td>
                      <Badge tone={
                        s.status === 'active' ? 'ok' :
                        s.status === 'trial' ? 'brand' :
                        s.status === 'expired' ? 'bad' : 'muted'
                      }>{s.status}</Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {createBundle && (
        <CreateModal
          bundle={createBundle}
          onClose={() => setCreateBundle(null)}
          onSubmit={async (body) => {
            try {
              await createSubscription(body);
              setCreateBundle(null);
              await refresh();
            } catch (e) {
              alert('Error: ' + (e?.detail || JSON.stringify(e)));
            }
          }}
        />
      )}

      {drawerSub && (
        <SubDrawer
          sub={drawerSub}
          onClose={() => setDrawerSub(null)}
          onPatch={async (update) => {
            try {
              await patchSubscription(drawerSub.id, update);
              setDrawerSub(null);
              await refresh();
            } catch (e) {
              alert('Error: ' + (e?.detail || JSON.stringify(e)));
            }
          }}
        />
      )}
    </SuperadminLayout>
  );
}

function CreateModal({ bundle, onClose, onSubmit }) {
  const isCustom = bundle.key === 'custom';
  const [form, setForm] = useState({
    tenant_id: '', contact_email: '',
    custom_pricing_usd_annual: isCustom ? '' : '',
    custom_terms: '',
    duration_months: 12,
    status: 'trial',
  });
  return (
    <div onClick={onClose}
      data-testid="data-licensing-create-modal"
      style={{ position: 'fixed', inset: 0, zIndex: Z.MODAL_CRITICAL, background: 'rgba(6,8,15,0.85)' }}>
      <form onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          const body = {
            tenant_id: form.tenant_id,
            bundle_key: bundle.key,
            contact_email: form.contact_email,
            duration_months: parseInt(form.duration_months || 12),
            status: form.status,
          };
          if (isCustom && form.custom_pricing_usd_annual) {
            body.custom_pricing_usd_annual = Number(form.custom_pricing_usd_annual);
          }
          if (form.custom_terms) body.custom_terms = form.custom_terms;
          onSubmit(body);
        }}
        style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: 'min(480px, 94vw)', background: 'rgba(13,16,23,0.98)',
          border: '1px solid rgba(255,255,255,0.10)', borderRadius: 16, padding: 22,
        }}>
        <h3 style={{ fontFamily: 'Outfit', color: 'var(--cream)', margin: 0, fontSize: 18 }}>
          Crear suscripción · {bundle.name}
        </h3>
        <div style={{ marginTop: 4, fontSize: 11.5, color: 'var(--cream-3)' }}>
          {isCustom ? 'Precio negociable' : `$${bundle.price_usd_annual.toLocaleString('en-US')} USD/año · SLA ${bundle.sla_uptime_pct}%`}
        </div>
        <Field label="Tenant ID" required>
          <input data-testid="data-licensing-form-tenant"
            required value={form.tenant_id}
            onChange={(e) => setForm({ ...form, tenant_id: e.target.value })}
            placeholder="bbva_mx" style={inputStyle} />
        </Field>
        <Field label="Email contacto" required>
          <input data-testid="data-licensing-form-email"
            required type="email" value={form.contact_email}
            onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
            placeholder="licensing@cliente.com" style={inputStyle} />
        </Field>
        {isCustom && (
          <Field label="Precio anual USD" required>
            <input data-testid="data-licensing-form-price"
              required type="number" min="1000"
              value={form.custom_pricing_usd_annual}
              onChange={(e) => setForm({ ...form, custom_pricing_usd_annual: e.target.value })}
              placeholder="100000" style={inputStyle} />
          </Field>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Duración (meses)">
            <input data-testid="data-licensing-form-duration"
              type="number" min="1" max="60"
              value={form.duration_months}
              onChange={(e) => setForm({ ...form, duration_months: e.target.value })}
              style={inputStyle} />
          </Field>
          <Field label="Status inicial">
            <select data-testid="data-licensing-form-status"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              style={inputStyle}>
              <option value="trial">Trial</option>
              <option value="active">Active</option>
            </select>
          </Field>
        </div>
        <Field label="Términos especiales (opcional)">
          <textarea data-testid="data-licensing-form-terms"
            rows={3} value={form.custom_terms}
            onChange={(e) => setForm({ ...form, custom_terms: e.target.value })}
            style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 12 }} />
        </Field>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button data-testid="data-licensing-form-cancel-btn" type="button"
            onClick={onClose} style={btnSecondary}>Cancelar</button>
          <button data-testid="data-licensing-form-submit-btn" type="submit"
            style={btnPrimary}>
            <Plus size={13} /> Crear
          </button>
        </div>
      </form>
    </div>
  );
}

function SubDrawer({ sub, onClose, onPatch }) {
  return (
    <div onClick={onClose}
      data-testid={`data-licensing-sub-drawer-${sub.id}`}
      style={{ position: 'fixed', inset: 0, zIndex: Z.MODAL_CRITICAL, background: 'rgba(6,8,15,0.78)' }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute', right: 0, top: 0, bottom: 0,
          width: 'min(560px, 96vw)', overflowY: 'auto',
          background: 'rgba(13,16,23,0.98)',
          borderLeft: '1px solid rgba(255,255,255,0.10)', padding: 24,
        }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div className="eyebrow">{sub.bundle_key}</div>
            <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, color: 'var(--cream)', margin: '4px 0', fontSize: 22 }}>
              {sub.tenant_id}
            </h2>
          </div>
          <button data-testid="data-licensing-drawer-close-btn"
            onClick={onClose} style={{
              padding: 6, borderRadius: 9999,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
              color: 'var(--cream)', cursor: 'pointer',
            }}><X size={16} /></button>
        </div>
        <Card style={{ marginTop: 14 }}>
          <Row label="Bundle" value={sub.bundle_name} />
          <Row label="Scope" value={(sub.scope || []).join(' · ')} />
          <Row label="Geo scope" value={(sub.geo_scope || []).join(' · ')} />
          <Row label="Frecuencia" value={sub.frequency} />
          <Row label="Precio anual"
            value={`$${(sub.price_usd_annual || 0).toLocaleString('en-US')} USD`} />
          <Row label="SLA Uptime" value={`${sub.sla_uptime_pct}%`} />
          <Row label="Vigencia"
            value={`${(sub.started_at || '').slice(0, 10)} → ${(sub.ends_at || '').slice(0, 10)}`} />
          <Row label="Status" value={sub.status} />
          {sub.custom_terms && <Row label="Términos" value={sub.custom_terms} />}
        </Card>

        <h3 style={{ fontFamily: 'Outfit', color: 'var(--cream)', fontSize: 14, fontWeight: 700, marginTop: 18 }}>
          Acciones
        </h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          {sub.status !== 'active' && (
            <button data-testid="data-licensing-drawer-activate-btn"
              onClick={() => onPatch({ status: 'active' })}
              style={btnPrimary}>Activar</button>
          )}
          {sub.status !== 'canceled' && (
            <button data-testid="data-licensing-drawer-cancel-btn"
              onClick={() => onPatch({ status: 'canceled' })}
              style={{ ...btnSecondary, color: '#fca5a5' }}>Cancelar</button>
          )}
          {sub.status !== 'expired' && (
            <button data-testid="data-licensing-drawer-expire-btn"
              onClick={() => onPatch({ status: 'expired' })}
              style={btnSecondary}>Marcar expirado</button>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between',
      padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
      fontSize: 12.5,
    }}>
      <span style={{ color: 'var(--cream-3)' }}>{label}</span>
      <span style={{ color: 'var(--cream)', fontWeight: 600, textAlign: 'right', maxWidth: '60%', wordBreak: 'break-word' }}>{value}</span>
    </div>
  );
}
function Th({ children }) {
  return (<th style={{ textAlign: 'left', padding: '10px 8px', fontSize: 10.5, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{children}</th>);
}
function Td({ children, style }) {
  return (<td style={{ padding: '10px 8px', fontSize: 12.5, color: 'var(--cream-2)', verticalAlign: 'middle', ...style }}>{children}</td>);
}
function Field({ label, required, children }) {
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
  backgroundImage: 'linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))',
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
    <div data-testid={`data-licensing-kpi-${tone}`}
      style={{ background: colors.bg, border: `1px solid ${colors.bd}`, borderRadius: 14, padding: 14 }}>
      <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 24, color: colors.fg, marginTop: 6 }}>{value}</div>
    </div>
  );
}
