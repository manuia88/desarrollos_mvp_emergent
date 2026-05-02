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
import { Building } from '../../components/icons';

const TABS = [
  { key: 'pipeline',  label: 'Pipeline',          phase: null },
  { key: 'leads',     label: 'Leads',             phase: null },
  { key: 'citas',     label: 'Citas',             phase: null },
  { key: 'slots',     label: 'Slots',             phase: 'B11' },
  { key: 'brokers',   label: 'Brokers',           phase: 'B11' },
  { key: 'metricas',  label: 'Métricas equipo',   phase: 'B11' },
];

function PlaceholderContent({ label }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '64px 24px', gap: 12, textAlign: 'center',
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 12,
        background: 'rgba(240,235,224,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 4,
      }}>
        <Building size={22} color="rgba(240,235,224,0.2)" />
      </div>
      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--cream)', fontFamily: 'Outfit,sans-serif' }}>
        {label}
      </h3>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--cream-3)', maxWidth: 300 }}>
        Esta sección estará disponible en el próximo release.
      </p>
    </div>
  );
}

function MensajesPlaceholder() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '64px 24px', gap: 12, textAlign: 'center',
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 12,
        background: 'rgba(240,235,224,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 4,
      }}>
        <MessageSquare size={22} color="rgba(240,235,224,0.2)" />
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
            border: '1px solid rgba(240,235,224,0.12)', borderRadius: 10,
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
                background: activeTab === t.key ? 'rgba(240,235,224,0.10)' : 'transparent',
                color: activeTab === t.key ? 'var(--cream)' : 'var(--cream-3)',
                border: 'none',
                borderRight: i < TABS.length - 1 ? '1px solid rgba(240,235,224,0.08)' : 'none',
                fontSize: 12, fontWeight: activeTab === t.key ? 700 : 400,
                cursor: 'pointer', transition: 'all 0.12s', fontFamily: 'DM Sans,sans-serif',
                position: 'relative',
              }}
            >
              {t.label}
              {t.phase && (
                <span style={{
                  position: 'absolute', top: 4, right: 4,
                  fontSize: 7, color: 'rgba(240,235,224,0.25)',
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
          {activeTab === 'leads' && (
            <PlaceholderContent label="Leads" />
          )}
          {activeTab === 'citas' && (
            <PlaceholderContent label="Citas" />
          )}
          {activeTab === 'slots' && (
            <PlaceholderContent label="Slots de disponibilidad" />
          )}
          {activeTab === 'brokers' && (
            <PlaceholderContent label="Brokers externos" />
          )}
          {activeTab === 'metricas' && (
            <PlaceholderContent label="Métricas de equipo" />
          )}
        </div>
      </div>
    </DeveloperLayout>
  );
}
