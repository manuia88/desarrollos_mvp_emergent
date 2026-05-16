// W2.4 SA5 — Commercial Foundation page
import React, { useEffect, useState, useCallback } from 'react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import FeatureFlagsChecklist from '../../components/superadmin/FeatureFlagsChecklist';
import PlanTemplateCard from '../../components/superadmin/PlanTemplateCard';
import SnapshotCard from '../../components/superadmin/SnapshotCard';
import SnapshotApplyModal from '../../components/superadmin/SnapshotApplyModal';
import {
  Briefcase, Users, FileText, Camera, AlertTriangle, X, Save, Plus, ArrowRightCircle,
} from 'lucide-react';
import {
  getCatalog, getTenantFeatures, bulkUpsertFeatures, listTemplates, applyTemplate,
  listSnapshots, getExpiringTrials, createTemplate, createSnapshot,
} from '../../api/superadminCommercial';
import { listTenants } from '../../api/superadminTenants';
import { Z } from '../../styles/zIndex';

function fmtRel(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const sec = Math.floor((d.getTime() - Date.now()) / 1000);
    if (sec < 0) {
      const a = -sec;
      if (a < 86400) return `expira en ${Math.floor(a / 3600)}h`;
      return `en ${Math.floor(a / 86400)}d`;
    }
    if (sec < 86400) return `en ${Math.floor(sec / 3600)}h`;
    return `en ${Math.floor(sec / 86400)}d`;
  } catch { return '—'; }
}

function TenantDrawer({ tenantId, catalog, onClose, onChanged }) {
  const [features, setFeatures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('features');
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { setFeatures((await getTenantFeatures(tenantId)).items || []); }
    finally { setLoading(false); }
  }, [tenantId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(''), 2500); return () => clearTimeout(t); } }, [toast]);

  const save = async (items) => {
    await bulkUpsertFeatures(tenantId, items);
    setToast('Features guardadas');
    await load();
    onChanged && onChanged();
  };

  const trials = features.filter(f => f.expires_at && f.enabled);

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(6,8,15,0.65)', backdropFilter: 'blur(8px)', zIndex: Z.DRAWER, display: 'flex', justifyContent: 'flex-end' }}>
      <div data-testid="tenant-config-drawer" style={{
        width: '100%', maxWidth: 640, background: 'rgba(13,17,28,0.97)',
        borderLeft: '1px solid rgba(255,255,255,0.10)', padding: '24px 26px 80px', overflowY: 'auto',
      }}>
        {toast && (
          <div style={{ marginBottom: 10, padding: '7px 12px', borderRadius: 9999, background: 'rgba(74,222,128,0.10)', border: '1px solid rgba(74,222,128,0.28)', color: '#4ADE80', fontFamily: 'DM Sans', fontSize: 11.5, fontWeight: 600, alignSelf: 'flex-start', display: 'inline-block' }}>
            {toast}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 14 }}>
          <div>
            <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: 'var(--cream)', margin: '0 0 3px' }}>Configurar tenant</h2>
            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'rgba(240, 235, 224, 0.72)' }}>{tenantId}</div>
          </div>
          <button onClick={onClose} style={{ padding: '6px 12px', borderRadius: 9999, background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(240,235,224,0.55)', fontFamily: 'DM Sans', fontSize: 12, cursor: 'pointer' }}>Cerrar</button>
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.07)', paddingBottom: 4, flexWrap: 'wrap' }}>
          {[['features', 'Features'], ['trials', `Trials (${trials.length})`]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} data-testid={`tenant-tab-${k}`}
              style={{
                padding: '6px 12px', borderRadius: 9999, fontSize: 12,
                fontFamily: 'DM Sans', fontWeight: 600, cursor: 'pointer',
                border: tab === k ? '1px solid rgba(var(--theme-rgb),0.55)' : '1px solid transparent',
                background: tab === k ? 'rgba(var(--theme-rgb),0.16)' : 'transparent',
                color: tab === k ? 'var(--theme)' : 'rgba(240,235,224,0.55)',
              }}>{l}</button>
          ))}
        </div>
        {loading && <div style={{ padding: 20, color: 'rgba(240, 235, 224, 0.68)', fontFamily: 'DM Sans', fontSize: 12 }}>Cargando…</div>}
        {!loading && tab === 'features' && (
          <FeatureFlagsChecklist catalog={catalog} current={features} onSave={save} />
        )}
        {!loading && tab === 'trials' && (
          trials.length === 0 ? (
            <div style={{ padding: 20, fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240, 235, 224, 0.68)', textAlign: 'center' }}>Sin trials activos.</div>
          ) : trials.map(t => (
            <div key={t.feature_key} style={{ padding: '10px 12px', borderRadius: 9, background: 'rgba(250,204,21,0.05)', border: '1px solid rgba(250,204,21,0.22)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ flex: 1, fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream)' }}>{t.feature_key}</span>
              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10.5, color: '#FACC15' }}>{fmtRel(t.expires_at)}</span>
              <button onClick={() => save([{ feature_key: t.feature_key, enabled: false }])}
                style={{ padding: '4px 10px', borderRadius: 9999, background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.28)', color: '#F87171', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 10.5, cursor: 'pointer' }}>Revocar</button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function CreateTemplateModal({ catalog, onClose, onDone }) {
  const [name, setName] = useState(''); const [tier, setTier] = useState('custom');
  const [price, setPrice] = useState(0); const [feats, setFeats] = useState([]);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const submit = async () => {
    if (name.length < 2) { setErr('Nombre requerido'); return; }
    setBusy(true);
    try {
      await createTemplate({ name, plan_tier: tier, features: feats, price_mxn: Number(price) });
      onDone();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(6,8,15,0.65)', backdropFilter: 'blur(8px)', zIndex: Z.DRAWER, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div data-testid="create-tpl-modal" style={{ width: '100%', maxWidth: 480, maxHeight: '85vh', overflowY: 'auto', background: 'rgba(13,17,28,0.97)', border: '1px solid rgba(var(--theme-rgb),0.30)', borderRadius: 14, padding: 22, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h3 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--cream)', margin: 0 }}>Crear plan template</h3>
        <input data-testid="tpl-name" value={name} onChange={e => setName(e.target.value)} placeholder="Nombre" style={{ padding: '9px 14px', borderRadius: 9999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13, outline: 'none' }} />
        <select data-testid="tpl-tier" value={tier} onChange={e => setTier(e.target.value)} style={{ padding: '9px 14px', borderRadius: 9999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13, outline: 'none' }}>
          <option value="basic">Basic</option><option value="pro">Pro</option><option value="enterprise">Enterprise</option><option value="custom">Custom</option>
        </select>
        <input data-testid="tpl-price" type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="Precio MXN/mes" style={{ padding: '9px 14px', borderRadius: 9999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: 'var(--cream)', fontFamily: 'DM Mono, monospace', fontSize: 13, outline: 'none' }} />
        <div style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240, 235, 224, 0.70)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Features incluidos</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {catalog.map(f => (
            <button key={f.key} type="button" onClick={() => setFeats(s => s.includes(f.key) ? s.filter(x => x !== f.key) : [...s, f.key])}
              data-testid={`tpl-feat-${f.key}`}
              style={{ padding: '4px 10px', borderRadius: 9999, fontSize: 11, fontFamily: 'DM Sans', fontWeight: 600, cursor: 'pointer', border: feats.includes(f.key) ? '1px solid rgba(var(--theme-rgb),0.45)' : '1px solid rgba(255,255,255,0.10)', background: feats.includes(f.key) ? 'rgba(var(--theme-rgb),0.14)' : 'transparent', color: feats.includes(f.key) ? 'var(--theme)' : 'rgba(240,235,224,0.55)' }}>
              {f.key}
            </button>
          ))}
        </div>
        {err && <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: '#F87171' }}>{err}</div>}
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 9999, background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(240,235,224,0.55)', fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
          <button data-testid="tpl-create-btn" onClick={submit} disabled={busy} style={{ padding: '9px 20px', borderRadius: 9999, background: 'linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))', border: 'none', color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12.5, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1 }}>{busy ? 'Creando…' : 'Crear'}</button>
        </div>
      </div>
    </div>
  );
}

function CreateSnapshotModal({ tenants, onClose, onDone }) {
  const [name, setName] = useState(''); const [desc, setDesc] = useState('');
  const [fromTenant, setFromTenant] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const submit = async () => {
    if (name.length < 2) { setErr('Nombre requerido'); return; }
    setBusy(true);
    try {
      await createSnapshot({ name, description: desc, scope: 'developer', payload: {}, from_tenant_id: fromTenant || null });
      onDone();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(6,8,15,0.65)', backdropFilter: 'blur(8px)', zIndex: Z.DRAWER, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div data-testid="create-snap-modal" style={{ width: '100%', maxWidth: 480, background: 'rgba(13,17,28,0.97)', border: '1px solid rgba(var(--theme-rgb),0.30)', borderRadius: 14, padding: 22, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h3 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--cream)', margin: 0 }}>Crear snapshot</h3>
        <input data-testid="snap-name" value={name} onChange={e => setName(e.target.value)} placeholder="Nombre" style={{ padding: '9px 14px', borderRadius: 9999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13, outline: 'none' }} />
        <textarea data-testid="snap-desc" value={desc} onChange={e => setDesc(e.target.value)} placeholder="Descripción (opcional)" rows={2} style={{ padding: '9px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12.5, outline: 'none', resize: 'vertical' }} />
        <input data-testid="snap-from-tenant" value={fromTenant} onChange={e => setFromTenant(e.target.value)} placeholder="Capturar desde tenant ID (opcional)" list="tenants-snap-dl" style={{ padding: '9px 14px', borderRadius: 9999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: 'var(--cream)', fontFamily: 'DM Mono, monospace', fontSize: 12, outline: 'none' }} />
        <datalist id="tenants-snap-dl">{tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</datalist>
        {err && <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: '#F87171' }}>{err}</div>}
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 9999, background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(240,235,224,0.55)', fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
          <button data-testid="snap-create-btn" onClick={submit} disabled={busy} style={{ padding: '9px 20px', borderRadius: 9999, background: 'linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))', border: 'none', color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12.5, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1 }}>{busy ? 'Creando…' : 'Crear'}</button>
        </div>
      </div>
    </div>
  );
}

function ApplyTemplateModal({ template, tenants, onClose, onDone }) {
  const [tenantId, setTenantId] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [preview, setPreview] = useState(null);
  const submit = async () => {
    if (!tenantId.trim()) { setErr('Selecciona tenant'); return; }
    setBusy(true);
    try {
      const r = await applyTemplate(template.id, tenantId.trim());
      setPreview(r);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(6,8,15,0.65)', backdropFilter: 'blur(8px)', zIndex: Z.DRAWER, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div data-testid="apply-tpl-modal" style={{ width: '100%', maxWidth: 480, background: 'rgba(13,17,28,0.97)', border: '1px solid rgba(var(--theme-rgb),0.30)', borderRadius: 14, padding: 22, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h3 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--cream)', margin: 0 }}>Aplicar {template.name} a tenant</h3>
        {!preview ? (
          <>
            <input data-testid="apply-tpl-tenant" value={tenantId} onChange={e => setTenantId(e.target.value)} placeholder="dev_xyz…" list="tenants-apply-dl" style={{ padding: '9px 14px', borderRadius: 9999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: 'var(--cream)', fontFamily: 'DM Mono, monospace', fontSize: 12.5, outline: 'none' }} />
            <datalist id="tenants-apply-dl">{tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</datalist>
            <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.55)' }}>
              Features del template: {template.features?.join(', ') || '(ninguno)'}
            </div>
            {err && <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: '#F87171' }}>{err}</div>}
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 9999, background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(240,235,224,0.55)', fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
              <button data-testid="apply-tpl-confirm" onClick={submit} disabled={busy} style={{ padding: '9px 20px', borderRadius: 9999, background: 'linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))', border: 'none', color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12.5, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1 }}>{busy ? 'Aplicando…' : 'Aplicar'}</button>
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ padding: '11px 13px', borderRadius: 9, background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.22)' }}>
              <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: '#4ADE80', fontWeight: 700, marginBottom: 4 }}>Template aplicado</div>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'rgba(240,235,224,0.65)' }}>
                +{(preview.applied || []).length} habilitadas · -{(preview.removed || []).length} desactivadas · {(preview.kept || []).length} sin cambio
              </div>
            </div>
            <button onClick={() => { onDone(); onClose(); }} style={{ padding: '9px 20px', borderRadius: 9999, background: 'linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))', border: 'none', color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>Cerrar</button>
          </div>
        )}
      </div>
    </div>
  );
}

function TrialAlertsModal({ items, onClose }) {
  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(6,8,15,0.65)', backdropFilter: 'blur(8px)', zIndex: Z.DRAWER, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 520, maxHeight: '80vh', overflowY: 'auto', background: 'rgba(13,17,28,0.97)', border: '1px solid rgba(250,204,21,0.30)', borderRadius: 14, padding: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <AlertTriangle size={14} color="#FACC15" />
          <h3 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--cream)', margin: 0, flex: 1 }}>Trials expirando ({items.length})</h3>
          <button onClick={onClose} style={{ padding: 5, borderRadius: 9999, background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(240,235,224,0.55)' }}><X size={14} /></button>
        </div>
        {items.length === 0 ? <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240, 235, 224, 0.72)', padding: 18, textAlign: 'center' }}>Sin trials próximos a expirar.</div> :
          items.map(it => (
            <div key={it.id} style={{ padding: '8px 11px', borderRadius: 8, background: 'rgba(250,204,21,0.05)', border: '1px solid rgba(250,204,21,0.20)', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ flex: 1, fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream)' }}>{it.tenant_id} · <strong>{it.feature_key}</strong></span>
              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10.5, color: '#FACC15' }}>{fmtRel(it.expires_at)}</span>
            </div>
          ))}
      </div>
    </div>
  );
}

export default function SuperadminCommercial({ user, onLogout }) {
  const [tab, setTab] = useState('tenants');
  const [catalog, setCatalog] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [tenantFeatCounts, setTenantFeatCounts] = useState({});
  const [templates, setTemplates] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [trials, setTrials] = useState([]);
  const [drawerTenant, setDrawerTenant] = useState(null);
  const [applyTpl, setApplyTpl] = useState(null);
  const [applySnap, setApplySnap] = useState(null);
  const [showTrials, setShowTrials] = useState(false);
  const [showCreateTpl, setShowCreateTpl] = useState(false);
  const [showCreateSnap, setShowCreateSnap] = useState(false);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    try {
      const [cat, tplRes, snapRes, trialsRes, tenRes] = await Promise.all([
        getCatalog(), listTemplates(), listSnapshots(), getExpiringTrials(7),
        listTenants({ limit: 200 }).catch(() => ({ items: [] })),
      ]);
      setCatalog(cat.items || []);
      setTemplates(tplRes.items || []);
      setSnapshots(snapRes.items || []);
      setTrials(trialsRes.items || []);
      setTenants(tenRes.items || []);
      // Fetch feature counts per tenant in batch (parallel limited)
      const ids = (tenRes.items || []).slice(0, 50).map(t => t.id);
      const counts = await Promise.all(ids.map(id =>
        getTenantFeatures(id).then(r => [id, r.enabled_count || 0]).catch(() => [id, 0])
      ));
      setTenantFeatCounts(Object.fromEntries(counts));
    } catch (e) { setToast(e.message || 'Error'); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(''), 2500); return () => clearTimeout(t); } }, [toast]);

  const TABS = [['tenants', 'Por tenant', Users], ['templates', 'Templates', FileText], ['snapshots', 'Snapshots', Camera]];

  return (
    <SuperadminLayout user={user} onLogout={onLogout}>
      <div data-testid="superadmin-commercial">
        {toast && (
          <div data-testid="commercial-toast" style={{ position: 'fixed', top: 76, right: 20, zIndex: Z.TOAST, padding: '11px 18px', borderRadius: 10, background: 'rgba(var(--theme-rgb),0.18)', border: '1px solid rgba(var(--theme-rgb),0.35)', color: 'var(--theme)', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, backdropFilter: 'blur(24px)' }}>
            {toast}
          </div>
        )}

        <div style={{ marginBottom: 22, display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <Briefcase size={20} color="var(--theme)" />
              <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: 'var(--cream)', margin: 0, letterSpacing: '-0.025em' }}>Comercial</h1>
            </div>
            <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240, 235, 224, 0.72)', margin: 0 }}>
              Feature flags · plan templates · snapshots tipo GHL para onboarding rápido.
            </p>
          </div>
          <button data-testid="commercial-trials-btn" onClick={() => setShowTrials(true)}
            style={{ padding: '8px 16px', borderRadius: 9999, background: trials.length > 0 ? 'rgba(250,204,21,0.10)' : 'rgba(255,255,255,0.04)', border: `1px solid ${trials.length > 0 ? 'rgba(250,204,21,0.30)' : 'rgba(255,255,255,0.10)'}`, color: trials.length > 0 ? '#FACC15' : 'rgba(240,235,224,0.65)', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <AlertTriangle size={11} /> Trial alerts ({trials.length})
          </button>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 18, borderBottom: '1px solid rgba(255,255,255,0.07)', paddingBottom: 6, flexWrap: 'wrap' }}>
          {TABS.map(([k, l, Icon]) => (
            <button key={k} onClick={() => setTab(k)} data-testid={`commercial-tab-${k}`}
              style={{
                padding: '7px 14px', borderRadius: 9999, fontSize: 12.5,
                fontFamily: 'DM Sans', fontWeight: 600, cursor: 'pointer',
                border: tab === k ? '1px solid rgba(var(--theme-rgb),0.55)' : '1px solid transparent',
                background: tab === k ? 'rgba(var(--theme-rgb),0.16)' : 'transparent',
                color: tab === k ? 'var(--theme)' : 'rgba(240,235,224,0.55)',
                display: 'inline-flex', alignItems: 'center', gap: 5,
              }}><Icon size={11} /> {l}</button>
          ))}
        </div>

        {tab === 'tenants' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {tenants.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240, 235, 224, 0.68)' }}>Sin tenants disponibles.</div>
            ) : tenants.map(t => (
              <div key={t.id} data-testid={`commercial-tenant-${t.id}`}
                onClick={() => setDrawerTenant(t.id)}
                style={{
                  padding: '10px 13px', borderRadius: 10,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                  transition: 'background 180ms, transform 180ms',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(var(--theme-rgb),0.06)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.transform = 'translateY(0)'; }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream)', fontWeight: 600 }}>{t.name}</div>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10.5, color: 'rgba(240, 235, 224, 0.70)' }}>{t.id}</div>
                </div>
                <span style={{ padding: '3px 10px', borderRadius: 9999, fontSize: 11, fontFamily: 'DM Mono, monospace', background: 'rgba(var(--theme-rgb),0.10)', color: 'var(--theme)' }}>
                  {tenantFeatCounts[t.id] || 0}/{catalog.length}
                </span>
                <button data-testid={`commercial-tenant-config-${t.id}`} onClick={(e) => { e.stopPropagation(); setDrawerTenant(t.id); }}
                  style={{ padding: '5px 12px', borderRadius: 9999, background: 'rgba(var(--theme-rgb),0.10)', border: '1px solid rgba(var(--theme-rgb),0.28)', color: 'var(--theme)', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
                  Configurar
                </button>
              </div>
            ))}
          </div>
        )}

        {tab === 'templates' && (
          <>
            <div style={{ marginBottom: 12 }}>
              <button data-testid="commercial-create-tpl" onClick={() => setShowCreateTpl(true)}
                style={{ padding: '8px 16px', borderRadius: 9999, background: 'linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))', border: 'none', color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Plus size={11} /> Crear template
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
              {templates.map(t => (
                <PlanTemplateCard key={t.id} template={t}
                  onEdit={() => setToast('Editar templates aún WIP')}
                  onApply={() => setApplyTpl(t)} />
              ))}
            </div>
          </>
        )}

        {tab === 'snapshots' && (
          <>
            <div style={{ marginBottom: 12 }}>
              <button data-testid="commercial-create-snap" onClick={() => setShowCreateSnap(true)}
                style={{ padding: '8px 16px', borderRadius: 9999, background: 'linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))', border: 'none', color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Plus size={11} /> Crear snapshot
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
              {snapshots.map(s => (
                <SnapshotCard key={s.id} snapshot={s}
                  onEdit={() => setToast('Editar snapshots aún WIP')}
                  onApply={() => setApplySnap(s)} />
              ))}
            </div>
          </>
        )}
      </div>

      {drawerTenant && <TenantDrawer tenantId={drawerTenant} catalog={catalog} onClose={() => setDrawerTenant(null)} onChanged={load} />}
      {applyTpl && <ApplyTemplateModal template={applyTpl} tenants={tenants} onClose={() => setApplyTpl(null)} onDone={load} />}
      {applySnap && <SnapshotApplyModal snapshot={applySnap} tenants={tenants} onClose={() => setApplySnap(null)} onDone={load} />}
      {showTrials && <TrialAlertsModal items={trials} onClose={() => setShowTrials(false)} />}
      {showCreateTpl && <CreateTemplateModal catalog={catalog} onClose={() => setShowCreateTpl(false)} onDone={() => { setShowCreateTpl(false); load(); }} />}
      {showCreateSnap && <CreateSnapshotModal tenants={tenants} onClose={() => setShowCreateSnap(false)} onDone={() => { setShowCreateSnap(false); load(); }} />}
    </SuperadminLayout>
  );
}
