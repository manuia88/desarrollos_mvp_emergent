// W1.2 SA1.1 — Superadmin Tenants Management
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import {
  Users, Building2, Briefcase, RefreshCw, Search, X,
  Eye, UserCheck, AlertTriangle, ChevronRight, Activity, FolderOpen,
  DollarSign, Clock, Shield, BarChart2, MessageSquare, Scale,
} from 'lucide-react';
import {
  listTenants, getTenant, impersonateTenant, patchTenantStatus,
} from '../../api/superadminTenants';
import { startImpersonation } from '../../hooks/useImpersonation';
import StripeSubscriptionPanel from '../../components/superadmin/StripeSubscriptionPanel';
import { PhaseYControlsPanel } from '../../components/superadmin/PhaseYControlsPanel';
import PricingAgentPanel from '../../components/director/PricingAgentPanel';
import MarketingAgentPanel from '../../components/director/MarketingAgentPanel';
import LeadAgentPanel from '../../components/director/LeadAgentPanel';
import SmartRoutingPanel from '../../components/director/SmartRoutingPanel';
import NurtureIntelligentPanel from '../../components/agentic_crm/NurtureIntelligentPanel';
import AtlaxPersonaPanel from '../../components/superadmin/AtlaxPersonaPanel';
import MatchWeightsPanel from '../../components/agentic_crm/MatchWeightsPanel';
import { Z } from '../../styles/zIndex';

function fmtRel(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const days = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (days < 0) return '—';
    if (days === 0) return 'Hoy';
    if (days === 1) return 'Ayer';
    if (days < 30) return `Hace ${days}d`;
    if (days < 365) return `Hace ${Math.floor(days / 30)}m`;
    return `Hace ${Math.floor(days / 365)}a`;
  } catch { return '—'; }
}

function fmtMxn(n) {
  if (!n) return '$0';
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
}

const STATUS_CFG = {
  active:    { label: 'Activo',     color: '#4ADE80', bg: 'rgba(74,222,128,0.10)', bd: 'rgba(74,222,128,0.32)' },
  trial:     { label: 'Trial',      color: 'var(--theme)', bg: 'rgba(var(--theme-rgb),0.10)', bd: 'rgba(var(--theme-rgb),0.32)' },
  inactive:  { label: 'Inactivo',   color: 'rgba(240,235,224,0.55)', bg: 'rgba(255,255,255,0.04)', bd: 'rgba(255,255,255,0.12)' },
  suspended: { label: 'Suspendido', color: '#F87171', bg: 'rgba(239,68,68,0.10)', bd: 'rgba(239,68,68,0.32)' },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.active;
  return (
    <span style={{ padding: '2px 9px', borderRadius: 9999, fontSize: 10.5, fontFamily: 'DM Sans', fontWeight: 700, background: cfg.bg, border: `1px solid ${cfg.bd}`, color: cfg.color }}>
      {cfg.label}
    </span>
  );
}

function TypePill({ type }) {
  const isInm = type === 'inm';
  const Ic = isInm ? Briefcase : Building2;
  return (
    <span style={{
      padding: '2px 9px', borderRadius: 9999, fontSize: 10.5,
      fontFamily: 'DM Sans', fontWeight: 700,
      background: isInm ? 'rgba(var(--theme-rgb),0.10)' : 'rgba(var(--theme-rgb),0.10)',
      border: `1px solid ${isInm ? 'rgba(var(--theme-rgb),0.30)' : 'rgba(var(--theme-rgb),0.30)'}`,
      color: isInm ? 'var(--theme)' : 'var(--theme)',
      display: 'inline-flex', alignItems: 'center', gap: 4,
    }}>
      <Ic size={9} />{isInm ? 'Inmobiliaria' : 'Dev'}
    </span>
  );
}

function ChipGroup({ value, onChange, options, testid }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {options.map(([k, l]) => (
        <button key={k || 'all'} data-testid={`${testid}-${k || 'all'}`}
          onClick={() => onChange(k)}
          style={{
            padding: '6px 12px', borderRadius: 9999, fontSize: 11.5,
            fontFamily: 'DM Sans', fontWeight: 600, cursor: 'pointer',
            border: value === k ? '1px solid rgba(var(--theme-rgb),0.55)' : '1px solid rgba(255,255,255,0.10)',
            background: value === k ? 'rgba(var(--theme-rgb),0.16)' : 'transparent',
            color: value === k ? 'var(--theme)' : 'rgba(240,235,224,0.55)',
          }}>{l}</button>
      ))}
    </div>
  );
}

function ImpersonateConfirmModal({ tenant, onClose, onConfirm, busy }) {
  if (!tenant) return null;
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }} style={{ position: 'fixed', inset: 0, background: 'rgba(6,8,15,0.82)', backdropFilter: 'blur(8px)', zIndex: Z.DRAWER, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'rgba(13,17,28,0.97)', border: '1px solid rgba(250,204,21,0.30)', borderRadius: 18, width: '100%', maxWidth: 460, padding: 26 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
          <AlertTriangle size={18} color="#FACC15" />
          <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 17, color: 'var(--cream)', margin: 0 }}>
            Impersonar {tenant.name}
          </h2>
        </div>
        <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.70)', lineHeight: 1.55, marginBottom: 20 }}>
          Iniciarás sesión como el primer admin de <strong>{tenant.name}</strong>. Toda actividad será auditada.
          La sesión expira en <strong>30 minutos</strong>.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} data-testid="imp-cancel"
            style={{ padding: '9px 16px', borderRadius: 9999, background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(240,235,224,0.55)', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            Cancelar
          </button>
          <button data-testid="imp-confirm" onClick={onConfirm} disabled={busy}
            style={{ padding: '9px 20px', borderRadius: 9999, background: 'linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))', border: 'none', color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1 }}>
            {busy ? 'Iniciando…' : 'Confirmar impersonación'}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusChangeModal({ tenant, status, onClose, onConfirm, busy }) {
  const [reason, setReason] = useState('');
  if (!tenant || !status) return null;
  const danger = status === 'suspended';
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }} style={{ position: 'fixed', inset: 0, background: 'rgba(6,8,15,0.82)', backdropFilter: 'blur(8px)', zIndex: Z.DRAWER, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'rgba(13,17,28,0.97)', border: `1px solid ${danger ? 'rgba(239,68,68,0.30)' : 'rgba(255,255,255,0.10)'}`, borderRadius: 18, width: '100%', maxWidth: 460, padding: 26 }}>
        <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 17, color: 'var(--cream)', margin: '0 0 12px' }}>
          Cambiar estado de {tenant.name}
        </h2>
        <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.70)', marginBottom: 16 }}>
          Nuevo estado: <strong style={{ color: STATUS_CFG[status].color }}>{STATUS_CFG[status].label}</strong>
          {danger && <span style={{ display: 'block', marginTop: 6, color: '#F87171' }}>Esto bloqueará todos los logins de este tenant.</span>}
        </p>
        <label style={{ fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700, color: 'rgba(240, 235, 224, 0.72)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>Motivo (opcional)</label>
        <textarea data-testid="status-reason" value={reason} onChange={e => setReason(e.target.value)}
          maxLength={500} placeholder="Razón del cambio…"
          style={{ width: '100%', minHeight: 60, padding: '10px 13px', borderRadius: 9, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13, outline: 'none', boxSizing: 'border-box', resize: 'vertical', marginBottom: 18 }} />
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} data-testid="status-cancel"
            style={{ padding: '9px 16px', borderRadius: 9999, background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(240,235,224,0.55)', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
          <button data-testid="status-confirm" onClick={() => onConfirm(reason)} disabled={busy}
            style={{ padding: '9px 20px', borderRadius: 9999, background: danger ? 'rgba(239,68,68,0.85)' : 'linear-gradient(90deg, var(--theme), rgba(var(--theme-rgb), 0.7))', border: 'none', color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1 }}>
            {busy ? 'Aplicando…' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function TenantDrawer({ tenantId, onClose }) {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('resumen');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    getTenant(tenantId).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [tenantId]);

  if (!tenantId) return null;
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(6,8,15,0.65)', backdropFilter: 'blur(8px)', zIndex: Z.DRAWER, display: 'flex', justifyContent: 'flex-end' }}>
      <div data-testid="tenant-drawer" style={{ width: '100%', maxWidth: 540, background: 'rgba(13,17,28,0.97)', borderLeft: '1px solid rgba(255,255,255,0.10)', padding: '24px 26px 80px', overflowY: 'auto' }}>
        {loading && <div style={{ padding: 30, color: 'rgba(240, 235, 224, 0.68)', fontFamily: 'DM Sans', fontSize: 13 }}>Cargando…</div>}
        {data && (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, gap: 10 }}>
              <div>
                <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 20, color: 'var(--cream)', margin: 0, letterSpacing: '-0.02em' }}>{data.name}</h2>
                <div style={{ display: 'flex', gap: 7, marginTop: 5, flexWrap: 'wrap' }}>
                  <TypePill type={data.type} />
                  <StatusBadge status={data.status} />
                  <span style={{ padding: '2px 9px', borderRadius: 9999, fontSize: 10.5, fontFamily: 'DM Sans', fontWeight: 700, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(240,235,224,0.55)' }}>
                    Plan {data.plan_tier}
                  </span>
                </div>
              </div>
              <button onClick={onClose} data-testid="drawer-close"
                style={{ padding: '6px 12px', borderRadius: 9999, background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(240,235,224,0.55)', fontFamily: 'DM Sans', fontSize: 12, cursor: 'pointer' }}>
                Cerrar
              </button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.07)', paddingBottom: 4, flexWrap: 'wrap' }}>
              {[['resumen', 'Resumen'], ['equipo', `Equipo (${data.members_total})`], ['auditoria', 'Auditoría'], ['billing', 'Billing'], ['phase-y', 'IA agéntica'], ['sub-agents', 'Sub-Agents'], ['atlax-persona', 'Atlax Persona'], ['match-weights', 'Match Weights']].map(([k, l]) => (
                <button key={k} onClick={() => setTab(k)} data-testid={`drawer-tab-${k}`}
                  style={{
                    padding: '6px 12px', borderRadius: 9999, fontSize: 12,
                    fontFamily: 'DM Sans', fontWeight: 600, cursor: 'pointer',
                    border: tab === k ? '1px solid rgba(var(--theme-rgb),0.55)' : '1px solid transparent',
                    background: tab === k ? 'rgba(var(--theme-rgb),0.16)' : 'transparent',
                    color: tab === k ? 'var(--theme)' : 'rgba(240,235,224,0.55)',
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                  {k === 'sub-agents' && <BarChart2 size={11} />}
                  {k === 'atlax-persona' && <MessageSquare size={11} />}
                  {k === 'match-weights' && <Scale size={11} />}
                  {l}
                </button>
              ))}
            </div>

            {tab === 'resumen' && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 16 }}>
                  {[
                    [Users, 'Miembros', data.members_total, 'var(--theme)'],
                    [FolderOpen, 'Proyectos', data.projects_count, '#4ADE80'],
                    [DollarSign, 'AI mes (MXN)', fmtMxn(data.ai_usage_month_mxn), 'var(--theme)'],
                    [Clock, 'Última act.', fmtRel(data.last_activity_at), 'var(--cream)'],
                  ].map(([Ic, l, v, c]) => (
                    <div key={l} style={{ padding: '12px 14px', borderRadius: 11, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                        <Ic size={11} color={c} />
                        <span style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240, 235, 224, 0.70)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{l}</span>
                      </div>
                      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 18, color: c }}>{v}</div>
                    </div>
                  ))}
                </div>
                {(data.ai_usage_breakdown && (data.ai_usage_breakdown.haiku || data.ai_usage_breakdown.sonnet)) ? (
                  <div style={{ padding: '12px 14px', borderRadius: 11, background: 'rgba(var(--theme-rgb),0.06)', border: '1px solid rgba(var(--theme-rgb),0.22)' }}>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240, 235, 224, 0.72)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>AI breakdown (mes)</div>
                    <div style={{ display: 'flex', gap: 14, fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream)' }}>
                      <span>Haiku: <strong>{fmtMxn(data.ai_usage_breakdown.haiku)}</strong></span>
                      <span>Sonnet: <strong>{fmtMxn(data.ai_usage_breakdown.sonnet)}</strong></span>
                      <span>Otros: <strong>{fmtMxn(data.ai_usage_breakdown.other)}</strong></span>
                    </div>
                  </div>
                ) : null}
                {(data.projects_summary || []).length > 0 && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240, 235, 224, 0.72)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Proyectos</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {data.projects_summary.map(p => (
                        <div key={p.id} style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ flex: 1, fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: 'var(--cream)' }}>{p.name}</span>
                          <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240, 235, 224, 0.72)' }}>{p.units_count} unidades</span>
                          {p.status && <StatusBadge status={p.status === 'active' ? 'active' : 'inactive'} />}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {tab === 'equipo' && (
              <div>
                {(data.members || []).length === 0 ? (
                  <div style={{ padding: 30, textAlign: 'center', color: 'rgba(240, 235, 224, 0.68)', fontFamily: 'DM Sans', fontSize: 13 }}>Sin miembros</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {data.members.map(m => (
                      <div key={m.id} style={{ padding: '10px 12px', borderRadius: 9, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: 160 }}>
                          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: 'var(--cream)' }}>{m.name}</div>
                          <div style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240, 235, 224, 0.70)' }}>{m.email}</div>
                        </div>
                        <span style={{ padding: '1px 8px', borderRadius: 9999, fontSize: 10.5, background: 'rgba(var(--theme-rgb),0.10)', border: '1px solid rgba(var(--theme-rgb),0.22)', color: 'var(--theme)', fontFamily: 'DM Sans', fontWeight: 600 }}>
                          {m.role}
                        </span>
                        {m.account_blocked && <StatusBadge status="suspended" />}
                        <span style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: 'rgba(240, 235, 224, 0.68)' }}>{fmtRel(m.last_login_at)}</span>
                      </div>
                    ))}
                    {data.members_total > (data.members || []).length && (
                      <div style={{ padding: '8px 12px', textAlign: 'center', fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240, 235, 224, 0.70)' }}>
                        Mostrando {(data.members || []).length} de {data.members_total}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {tab === 'auditoria' && (
              <div>
                {(data.recent_audit || []).length === 0 ? (
                  <div style={{ padding: 30, textAlign: 'center', color: 'rgba(240, 235, 224, 0.68)', fontFamily: 'DM Sans', fontSize: 13 }}>Sin actividad reciente</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {data.recent_audit.map((a, i) => (
                      <div key={`${a.ts}-${i}`} style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Activity size={11} color="rgba(240, 235, 224, 0.72)" />
                        <span style={{ flex: 1, fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream)' }}>
                          {a.action} <span style={{ color: 'rgba(240, 235, 224, 0.70)' }}>· {a.entity_type}</span>
                        </span>
                        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10.5, color: 'rgba(240, 235, 224, 0.68)' }}>{fmtRel(a.ts)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === 'billing' && (
              <StripeSubscriptionPanel tenantId={data.tenant_id || data.id} />
            )}

            {tab === 'phase-y' && (
              <PhaseYControlsPanel orgId={data.tenant_id || tenantId} />
            )}
            {tab === 'sub-agents' && (
              <div data-testid="drawer-tab-subagents-content">
                <SubAgentsTabs
                  orgId={data.tenant_id || tenantId}
                  projectsSummary={data.projects_summary || []}
                />
              </div>
            )}
            {tab === 'atlax-persona' && (
              <div data-testid="drawer-tab-atlax-persona-content">
                <AtlaxPersonaPanel orgId={data.tenant_id || tenantId} />
              </div>
            )}
            {tab === 'match-weights' && (
              <div data-testid="drawer-tab-match-weights-content">
                <MatchWeightsPanel orgId={data.tenant_id || tenantId} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const STATUS_OPTIONS = [
  ['', 'Todos'], ['active', 'Activos'], ['trial', 'Trial'], ['suspended', 'Suspendidos'],
];
const TYPE_OPTIONS = [
  ['all', 'Todos'], ['dev', 'Devs'], ['inm', 'Inmobiliarias'],
];

export default function SuperadminTenants({ user, onLogout }) {
  const navigate = useNavigate();
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState('all');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [debSearch, setDebSearch] = useState('');
  const [skip, setSkip] = useState(0);
  const [drawer, setDrawer] = useState(null);
  const [impTarget, setImpTarget] = useState(null);
  const [impBusy, setImpBusy] = useState(false);
  const [statusEdit, setStatusEdit] = useState(null); // {tenant, newStatus}
  const [statusBusy, setStatusBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Debounce search
  useEffect(() => { const t = setTimeout(() => setDebSearch(search), 300); return () => clearTimeout(t); }, [search]);

  const params = useMemo(() => ({
    type, status: status || 'all', search: debSearch || undefined,
    sort: 'last_activity', limit: 50, skip,
  }), [type, status, debSearch, skip]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await listTenants(params);
      if (skip === 0) setData(r);
      else setData(prev => ({ ...r, items: [...prev.items, ...(r.items || [])] }));
    } catch (e) {
      setToast(e.message || 'Error al cargar tenants');
      if (skip === 0) setData({ items: [], total: 0 });
    } finally { setLoading(false); }
  }, [params, skip]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setSkip(0); }, [type, status, debSearch]);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(''), 3500); return () => clearTimeout(t); } }, [toast]);

  const doImpersonate = async () => {
    if (!impTarget) return;
    setImpBusy(true);
    try {
      const res = await impersonateTenant(impTarget.tenant_id);
      startImpersonation({
        target_user_id: res.target_user_id,
        target_role: res.target_role,
        target_tenant_id: res.target_tenant_id,
        target_name: res.target_name,
        expires_at: res.expires_at,
      });
      setImpTarget(null);
      // Redirect based on target role
      const dest = res.target_role === 'developer_admin' ? '/desarrollador' : '/inmobiliaria';
      window.location.href = dest;
    } catch (e) {
      setToast(e.message || 'Error al impersonar');
      setImpBusy(false);
    }
  };

  const doStatusChange = async (reason) => {
    if (!statusEdit) return;
    setStatusBusy(true);
    try {
      await patchTenantStatus(statusEdit.tenant.tenant_id, statusEdit.newStatus, reason || undefined);
      setToast(`Estado actualizado a ${STATUS_CFG[statusEdit.newStatus].label}`);
      setStatusEdit(null);
      setSkip(0); load();
    } catch (e) {
      setToast(e.message || 'Error al cambiar estado');
    } finally { setStatusBusy(false); }
  };

  return (
    <SuperadminLayout user={user} onLogout={onLogout}>
      <div data-testid="superadmin-tenants">
        {toast && (
          <div style={{ position: 'fixed', top: 76, right: 20, zIndex: Z.TOAST, padding: '11px 18px', borderRadius: 10, background: 'rgba(var(--theme-rgb),0.18)', border: '1px solid rgba(var(--theme-rgb),0.35)', color: 'var(--theme)', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 600, backdropFilter: 'blur(24px)' }}>
            {toast}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 22 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <Shield size={20} color="var(--theme)" />
              <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 26, color: 'var(--cream)', margin: 0, letterSpacing: '-0.025em' }}>
                Tenants
              </h1>
              <span data-testid="tenants-count" style={{ padding: '3px 10px', borderRadius: 9999, fontSize: 11.5, fontFamily: 'DM Sans', fontWeight: 700, background: 'rgba(var(--theme-rgb),0.10)', border: '1px solid rgba(var(--theme-rgb),0.30)', color: 'var(--theme)' }}>
                {data.total}
              </span>
            </div>
            <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240, 235, 224, 0.72)', margin: 0 }}>
              Desarrolladoras + inmobiliarias activas en la plataforma.
            </p>
          </div>
          <button data-testid="tenants-refresh" onClick={() => { setSkip(0); load(); }}
            style={{ padding: '8px 16px', borderRadius: 9999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(240,235,224,0.65)', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={12} /> Refrescar
          </button>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 14, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
          <ChipGroup value={type} onChange={setType} options={TYPE_OPTIONS} testid="filter-type" />
          <ChipGroup value={status} onChange={setStatus} options={STATUS_OPTIONS} testid="filter-status" />
          <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 360 }}>
            <Search size={13} color="rgba(240, 235, 224, 0.68)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
            <input data-testid="tenants-search" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar tenant…"
              style={{ width: '100%', padding: '8px 12px 8px 32px', borderRadius: 9999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12.5, outline: 'none', boxSizing: 'border-box' }} />
            {search && (
              <button onClick={() => setSearch('')} data-testid="tenants-search-clear"
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(240, 235, 224, 0.68)' }}>
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Table desktop / cards mobile */}
        {loading && skip === 0 ? (
          <div style={{ textAlign: 'center', padding: 70, color: 'rgba(240, 235, 224, 0.68)', fontFamily: 'DM Sans', fontSize: 13 }}>Cargando tenants…</div>
        ) : (data.items || []).length === 0 ? (
          <div data-testid="tenants-empty" style={{ textAlign: 'center', padding: 70, color: 'rgba(240, 235, 224, 0.68)', fontFamily: 'DM Sans' }}>
            <Shield size={38} color="rgba(240,235,224,0.18)" style={{ marginBottom: 12 }} />
            <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 16, color: 'var(--cream)', marginBottom: 5 }}>Sin tenants</div>
            <div>Ajusta los filtros o intenta otra búsqueda.</div>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            {!isMobile && (
            <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.07)' }}>
              <table data-testid="tenants-table" style={{ width: '100%', borderCollapse: 'collapse', background: 'rgba(255,255,255,0.02)' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                    {['Nombre', 'Tipo', 'Estado', 'Miembros', 'Proyectos', 'AI/mes', 'Última act.', 'Creado', ''].map(h => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 700, color: 'rgba(240, 235, 224, 0.72)', textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.items.map(t => (
                    <tr key={`${t.type}-${t.tenant_id}`} data-testid={`tenant-row-${t.tenant_id}`}
                      style={{ borderTop: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', transition: 'background 150ms' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                      onClick={() => setDrawer(t.tenant_id)}>
                      <td style={{ padding: '11px 12px', fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: 'var(--cream)' }}>{t.name}</td>
                      <td style={{ padding: '11px 12px' }}><TypePill type={t.type} /></td>
                      <td style={{ padding: '11px 12px' }}><StatusBadge status={t.status} /></td>
                      <td style={{ padding: '11px 12px', fontFamily: 'DM Mono, monospace', fontSize: 12, color: 'var(--cream)' }}>{t.members_count}</td>
                      <td style={{ padding: '11px 12px', fontFamily: 'DM Mono, monospace', fontSize: 12, color: 'var(--cream)' }}>{t.projects_count}</td>
                      <td style={{ padding: '11px 12px', fontFamily: 'DM Mono, monospace', fontSize: 12, color: 'var(--theme)' }}>{fmtMxn(t.ai_usage_month_mxn)}</td>
                      <td style={{ padding: '11px 12px', fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.55)' }}>{fmtRel(t.last_activity_at)}</td>
                      <td style={{ padding: '11px 12px', fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240, 235, 224, 0.70)' }}>{fmtRel(t.created_at)}</td>
                      <td style={{ padding: '11px 12px', whiteSpace: 'nowrap' }}>
                        <button data-testid={`tenant-impersonate-${t.tenant_id}`}
                          onClick={e => { e.stopPropagation(); setImpTarget(t); }}
                          title="Impersonar"
                          style={{ padding: '5px 10px', borderRadius: 9999, background: 'rgba(250,204,21,0.10)', border: '1px solid rgba(250,204,21,0.32)', color: '#FACC15', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 11, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, marginRight: 5 }}>
                          <UserCheck size={11} />
                        </button>
                        <select data-testid={`tenant-status-select-${t.tenant_id}`} value={t.status} onClick={e => e.stopPropagation()}
                          onChange={e => setStatusEdit({ tenant: t, newStatus: e.target.value })}
                          style={{ padding: '4px 9px', borderRadius: 9999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(240,235,224,0.65)', fontFamily: 'DM Sans', fontSize: 11, cursor: 'pointer', appearance: 'none' }}>
                          <option value="active">Activo</option>
                          <option value="trial">Trial</option>
                          <option value="inactive">Inactivo</option>
                          <option value="suspended">Suspender</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )}

            {/* Mobile cards */}
            {isMobile && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.items.map(t => (
                <div key={`${t.type}-${t.tenant_id}-m`} data-testid={`tenant-card-${t.tenant_id}`}
                  onClick={() => setDrawer(t.tenant_id)}
                  style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                    <span style={{ flex: 1, minWidth: 130, fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)' }}>{t.name}</span>
                    <TypePill type={t.type} />
                    <StatusBadge status={t.status} />
                  </div>
                  <div style={{ display: 'flex', gap: 14, fontFamily: 'DM Sans', fontSize: 11.5, color: 'rgba(240,235,224,0.55)', flexWrap: 'wrap', marginBottom: 8 }}>
                    <span><Users size={9} style={{ verticalAlign: 'middle', marginRight: 3 }} />{t.members_count}</span>
                    <span>{t.projects_count} proyectos</span>
                    <span style={{ color: 'var(--theme)' }}>{fmtMxn(t.ai_usage_month_mxn)}</span>
                    <span>{fmtRel(t.last_activity_at)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={e => { e.stopPropagation(); setImpTarget(t); }}
                      data-testid={`tenant-impersonate-m-${t.tenant_id}`}
                      style={{ padding: '5px 11px', borderRadius: 9999, background: 'rgba(250,204,21,0.10)', border: '1px solid rgba(250,204,21,0.32)', color: '#FACC15', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 11, cursor: 'pointer' }}>
                      Impersonar
                    </button>
                    <select onClick={e => e.stopPropagation()} value={t.status}
                      onChange={e => setStatusEdit({ tenant: t, newStatus: e.target.value })}
                      data-testid={`tenant-status-select-m-${t.tenant_id}`}
                      style={{ padding: '4px 9px', borderRadius: 9999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(240,235,224,0.65)', fontFamily: 'DM Sans', fontSize: 11, cursor: 'pointer' }}>
                      <option value="active">Activo</option>
                      <option value="trial">Trial</option>
                      <option value="inactive">Inactivo</option>
                      <option value="suspended">Suspender</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
            )}

            {/* Load more */}
            {data.items.length < data.total && (
              <div style={{ marginTop: 16, textAlign: 'center' }}>
                <button data-testid="tenants-load-more" onClick={() => setSkip(s => s + 50)} disabled={loading}
                  style={{ padding: '9px 22px', borderRadius: 9999, background: 'rgba(var(--theme-rgb),0.10)', border: '1px solid rgba(var(--theme-rgb),0.30)', color: 'var(--theme)', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12.5, cursor: loading ? 'wait' : 'pointer' }}>
                  {loading ? 'Cargando…' : 'Cargar más'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <TenantDrawer tenantId={drawer} onClose={() => setDrawer(null)} />
      <ImpersonateConfirmModal tenant={impTarget} onClose={() => setImpTarget(null)} onConfirm={doImpersonate} busy={impBusy} />
      <StatusChangeModal tenant={statusEdit?.tenant} status={statusEdit?.newStatus} onClose={() => setStatusEdit(null)} onConfirm={doStatusChange} busy={statusBusy} />
    </SuperadminLayout>
  );
}

// ─── SubAgentsTabs — sub-tabs Pricing | Marketing dentro del tab Sub-Agents ──
function SubAgentsTabs({ orgId, projectsSummary }) {
  const [activeAgent, setActiveAgent] = useState('pricing');

  const agentTabs = [
    ['pricing',   'Pricing'],
    ['marketing', 'Marketing'],
    ['lead',      'Lead'],
    ['routing',   'Smart Routing'],
    ['nurture',   'Nurture Intelligent'],
  ];

  return (
    <div data-testid="subagents-tabs" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Sub-tab pills */}
      <div style={{ display: 'flex', gap: 5 }}>
        {agentTabs.map(([k, l]) => (
          <button
            key={k}
            data-testid={`subagent-subtab-${k}`}
            onClick={() => setActiveAgent(k)}
            style={{
              padding: '5px 13px', borderRadius: 9999, fontSize: 11.5, fontFamily: 'DM Sans', fontWeight: 700,
              cursor: 'pointer',
              background: activeAgent === k
                ? 'linear-gradient(90deg, rgba(var(--theme-rgb),0.22), rgba(var(--theme-rgb),0.18))'
                : 'transparent',
              border: activeAgent === k
                ? '1px solid rgba(var(--theme-rgb),0.45)'
                : '1px solid rgba(255,255,255,0.08)',
              color: activeAgent === k ? 'var(--cream)' : 'rgba(240, 235, 224, 0.70)',
            }}
          >
            {l}
          </button>
        ))}
      </div>

      {/* Panel content */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 12 }}>
        {activeAgent === 'pricing' && (
          <PricingAgentPanel orgId={orgId} projectsSummary={projectsSummary} />
        )}
        {activeAgent === 'marketing' && (
          <MarketingAgentPanel orgId={orgId} projectsSummary={projectsSummary} />
        )}
        {activeAgent === 'lead' && (
          <LeadAgentPanel orgId={orgId} />
        )}
        {activeAgent === 'routing' && (
          <SmartRoutingPanel orgId={orgId} />
        )}
        {activeAgent === 'nurture' && (
          <NurtureIntelligentPanel orgId={orgId} />
        )}
      </div>
    </div>
  );
}
