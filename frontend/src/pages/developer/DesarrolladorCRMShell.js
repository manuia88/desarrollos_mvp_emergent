/**
 * Phase 4 Batch 10 — DesarrolladorCRMShell
 * /desarrollador/crm — CRM global con 6 tabs (shell)
 * URL sync: ?tab= (pipeline|leads|citas|slots|brokers|metricas)
 */
import React from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import DeveloperLayout from '../../components/developer/DeveloperLayout';
import LeadKanban from '../../components/shared/LeadKanban';
import { MessageSquare } from 'lucide-react';
// Suite IA agéntica (Tanda 2) — paneles org-level montados en el portal dev
import SmartRoutingPanel from '../../components/director/SmartRoutingPanel';
import NurtureIntelligentPanel from '../../components/agentic_crm/NurtureIntelligentPanel';
import MatchWeightsPanel from '../../components/agentic_crm/MatchWeightsPanel';
import RepliesInbox from '../../components/agentic_crm/RepliesInbox';

const TABS = [
  { key: 'pipeline',  label: 'Pipeline',          phase: null },
  { key: 'suite-ia',  label: 'Suite IA',          phase: null },
];
// Nota: Leads, Citas, Métricas equipo y Brokers viven como páginas reales en el
// menú (CRM & Leads / Red comercial) — antes eran placeholders "próximo release".

function MensajesPlaceholder() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '64px 24px', gap: 12, textAlign: 'center',
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 12,
        background: 'rgba(var(--cream-rgb),0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 4,
      }}>
        <MessageSquare size={22} color="rgba(var(--cream-rgb),0.2)" />
      </div>
      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--cream)', fontFamily: 'Outfit,sans-serif' }}>
        Mensajes / WhatsApp
      </h3>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--cream-3)', maxWidth: 320 }}>
        Integración WhatsApp Business + Caya conversacional.<br />
        Disponible en Phase 8.
      </p>
    </div>
  );
}

function IASection({ title, children }) {
  return (
    <div style={{ background: 'var(--surface, rgba(var(--cream-rgb),0.03))', border: '1px solid var(--border, rgba(var(--cream-rgb),0.10))', borderRadius: 14, padding: 16, boxShadow: 'var(--asr-shadow, none)' }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--theme, #6D4AFF)', marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}

export default function DesarrolladorCRMShell({ user, onLogout }) {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  // Detect if navigated to /mensajes
  const isMensajes = location.pathname === '/desarrollador/mensajes';

  if (isMensajes) {
    return (
      <DeveloperLayout user={user} onLogout={onLogout}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 4px 48px' }}>
          <MensajesPlaceholder />
        </div>
      </DeveloperLayout>
    );
  }

  const activeTab = searchParams.get('tab') || 'pipeline';
  const orgId = user?.tenant_id || user?.org_id || '';

  const setTab = (key) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', key);
    setSearchParams(next, { replace: true });
  };

  return (
    <DeveloperLayout user={user} onLogout={onLogout}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 4px 48px' }}>
        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--cream)', fontFamily: 'Outfit,sans-serif' }}>
            CRM
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--cream-3)' }}>
            Gestión de pipeline, leads, citas y equipo comercial
          </p>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: 'flex', overflowX: 'auto',
            border: '1px solid rgba(var(--cream-rgb),0.12)', borderRadius: 10,
            marginBottom: 24,
          }}
          data-testid="crm-tabs"
        >
          {TABS.map((t, i) => (
            <button
              key={t.key}
              data-testid={`crm-tab-${t.key}`}
              onClick={() => setTab(t.key)}
              style={{
                whiteSpace: 'nowrap', flex: 1, padding: '10px 14px',
                background: activeTab === t.key ? 'rgba(var(--cream-rgb),0.10)' : 'transparent',
                color: activeTab === t.key ? 'var(--cream)' : 'var(--cream-3)',
                border: 'none',
                borderRight: i < TABS.length - 1 ? '1px solid rgba(var(--cream-rgb),0.08)' : 'none',
                fontSize: 12, fontWeight: activeTab === t.key ? 700 : 400,
                cursor: 'pointer', transition: 'all 0.12s', fontFamily: 'DM Sans,sans-serif',
                position: 'relative',
              }}
            >
              {t.label}
              {t.phase && (
                <span style={{
                  position: 'absolute', top: 4, right: 4,
                  fontSize: 7, color: 'rgba(var(--cream-rgb),0.25)',
                }}>
                  {t.phase}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div data-testid="crm-content">
          {activeTab === 'pipeline' && (
            <LeadKanban scope="mine" />
          )}
          {activeTab === 'suite-ia' && (
            <div data-testid="crm-suite-ia" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ fontSize: 13, color: 'var(--cream-2)', lineHeight: 1.5 }}>
                Tu equipo de IA trabajando el pipeline: rutea leads, los nutre, afina el match y clasifica respuestas entrantes. Tú apruebas lo delicado.
              </div>
              <IASection title="Bandeja IA · respuestas entrantes"><RepliesInbox asesorId={user?.user_id || user?.id || null} /></IASection>
              <IASection title="Ruteo inteligente de leads"><SmartRoutingPanel orgId={orgId} /></IASection>
              <IASection title="Nurture inteligente"><NurtureIntelligentPanel orgId={orgId} /></IASection>
              <IASection title="Pesos de match · auto-ajuste"><MatchWeightsPanel orgId={orgId} /></IASection>
            </div>
          )}
        </div>
      </div>
    </DeveloperLayout>
  );
}
