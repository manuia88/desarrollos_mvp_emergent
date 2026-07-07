/**
 * SuperadminCrecimientoHub — el HUB DE CRECIMIENTO & DISTRIBUCIÓN (metodología Hub de Mercado).
 *
 * Una sola casa para atraer y convertir: canales de salida (WhatsApp, Newsletter, Boletines,
 * Tarjetas sociales, Distribución social), captación (leads de landing, embudo de auditoría,
 * fuentes de leads, onboarding) y aliados (partners, invitaciones). Cada pestaña embebe la
 * página existente — cero duplicación, cada una sigue viva por su ruta directa (redirige con
 * ?tab=). URL = fuente de verdad · lazy-load por pestaña · roles ARIA.
 *
 * Nota: 4 páginas (Invitaciones, Onboarding, Embudo auditoría, Fuentes de leads) usan `user`
 * para su propia lógica de datos/gate — el hub los toma de useAuth y los pasa a cada pestaña.
 */
import React, { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { useAuth } from '../../App';
import { MessageSquare, Mail, Megaphone, Share2, Radio, Users, ClipboardList, Plug, BarChart3, HeartHandshake, UserPlus } from 'lucide-react';

const SuperadminWhatsApp = lazy(() => import('./SuperadminWhatsApp'));
const SuperadminNewsletter = lazy(() => import('./SuperadminNewsletter'));
const SuperadminBulletins = lazy(() => import('./SuperadminBulletins'));
const SuperadminSocialCards = lazy(() => import('./SuperadminSocialCards'));
const SuperadminMarketingMcp = lazy(() => import('./SuperadminMarketingMcp'));
const SuperadminLandingLeads = lazy(() => import('./SuperadminLandingLeads'));
const SuperadminFreeAuditFunnel = lazy(() => import('./SuperadminFreeAuditFunnel'));
const SuperadminLeadSources = lazy(() => import('./SuperadminLeadSources'));
const SuperadminOnboardingAnalytics = lazy(() => import('./SuperadminOnboardingAnalytics'));
const SuperadminPartners = lazy(() => import('./SuperadminPartners'));
const SuperadminInvites = lazy(() => import('./SuperadminInvites'));

const TABS = [
  { k: 'whatsapp', label: 'WhatsApp', Icon: MessageSquare, grupo: 'Canales', Page: SuperadminWhatsApp },
  { k: 'newsletter', label: 'Newsletter', Icon: Mail, grupo: 'Canales', Page: SuperadminNewsletter },
  { k: 'bulletins', label: 'Boletines', Icon: Megaphone, grupo: 'Canales', Page: SuperadminBulletins },
  { k: 'social-cards', label: 'Tarjetas sociales', Icon: Share2, grupo: 'Canales', Page: SuperadminSocialCards },
  { k: 'marketing-mcp', label: 'Distribución social', Icon: Radio, grupo: 'Canales', Page: SuperadminMarketingMcp },
  { k: 'landing-leads', label: 'Leads de landing', Icon: Users, grupo: 'Captación', Page: SuperadminLandingLeads },
  { k: 'free-audit', label: 'Embudo auditoría', Icon: ClipboardList, grupo: 'Captación', Page: SuperadminFreeAuditFunnel },
  { k: 'lead-sources', label: 'Fuentes de leads', Icon: Plug, grupo: 'Captación', Page: SuperadminLeadSources },
  { k: 'onboarding', label: 'Onboarding', Icon: BarChart3, grupo: 'Captación', Page: SuperadminOnboardingAnalytics },
  { k: 'partners', label: 'Aliados', Icon: HeartHandshake, grupo: 'Aliados', Page: SuperadminPartners },
  { k: 'invites', label: 'Invitaciones', Icon: UserPlus, grupo: 'Aliados', Page: SuperadminInvites },
];

export default function SuperadminCrecimientoHub() {
  const [sp, setSp] = useSearchParams();
  const { user, logout } = useAuth();
  const raw = sp.get('tab');
  const tab = TABS.some((t) => t.k === raw) ? raw : 'whatsapp';   // URL = única fuente de verdad
  const setTab = (k) => { const n = new URLSearchParams(sp); n.set('tab', k); setSp(n); };

  const tabBtn = (on) => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 11,
    fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap',
    background: on ? 'rgba(var(--theme-rgb),0.16)' : 'rgba(255,255,255,0.03)',
    border: `1px solid ${on ? 'rgba(var(--theme-rgb),0.45)' : 'rgba(255,255,255,0.08)'}`,
    color: on ? 'var(--theme)' : 'rgba(240,235,224,0.6)',
  });
  const Active = TABS.find((t) => t.k === tab).Page;
  let grupoActual = null;

  return (
    <SuperadminLayout>
      <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--theme)', marginBottom: 2 }}>
        Crecimiento & Distribución
      </div>
      <div role="tablist" aria-label="Crecimiento & Distribución" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', margin: '8px 0 18px' }}>
        {TABS.map((t) => {
          const sep = t.grupo !== grupoActual; grupoActual = t.grupo;
          return (
            <React.Fragment key={t.k}>
              {sep && <span aria-hidden="true" style={{ fontFamily: 'DM Mono, monospace', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(240,235,224,0.4)', marginLeft: t.grupo !== 'Canales' ? 8 : 0 }}>{t.grupo}</span>}
              <button role="tab" aria-selected={tab === t.k} data-testid={`crec-tab-${t.k}`} onClick={() => setTab(t.k)} style={tabBtn(tab === t.k)}>
                <t.Icon size={13} /> {t.label}
              </button>
            </React.Fragment>
          );
        })}
      </div>
      <div role="tabpanel">
        <Suspense fallback={<div style={{ padding: 40, fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.6)' }}>Cargando…</div>}>
          <Active embedded user={user} onLogout={logout} />
        </Suspense>
      </div>
    </SuperadminLayout>
  );
}
