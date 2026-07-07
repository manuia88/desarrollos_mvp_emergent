/**
 * SuperadminOperacionHub — el HUB DE OPERACIÓN & SEGURIDAD (metodología Hub de Mercado).
 *
 * Una sola casa para vigilar la plataforma: salud & observabilidad, auditoría (log/cadena/
 * actividad/compliance), fraude & riesgo, e integridad de datos (duplicados/entidades).
 * Cada pestaña embebe la página existente — cero duplicación, cada una sigue viva por su ruta
 * directa (redirige con ?tab=). URL = fuente de verdad · lazy-load por pestaña · roles ARIA.
 * Bonus: Resolución de entidades no tenía layout (se veía sin sidebar) — el hub la enmarca.
 */
import React, { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { HeartPulse, Eye, BarChart3, ScrollText, ShieldCheck, ListChecks, AlertTriangle, ShieldAlert, Siren, Copy, GitMerge, ToggleRight, Link as LinkIcon } from 'lucide-react';

const SuperadminHealth = lazy(() => import('./SuperadminHealth'));
const SuperadminObservabilityPage = lazy(() => import('./SuperadminObservabilityPage'));
const SuperadminPhaseYObservability = lazy(() => import('./SuperadminObservability'));
const SuperadminAuditUnified = lazy(() => import('./SuperadminAuditUnified'));
const SuperadminAuditLog = lazy(() => import('./SuperadminAuditLog'));
const SuperadminAuditChain = lazy(() => import('./SuperadminAuditChain'));
const SuperadminCompliance = lazy(() => import('./SuperadminCompliance'));
const SuperadminFraudPatterns = lazy(() => import('./SuperadminFraudPatterns'));
const SuperadminFraudAlerts = lazy(() => import('./SuperadminFraudAlerts'));
const SuperadminRiskAlerts = lazy(() => import('./SuperadminRiskAlerts'));
const SuperadminDuplicates = lazy(() => import('./SuperadminDuplicates'));
const SuperadminEntityResolution = lazy(() => import('./SuperadminEntityResolution'));
// Plataforma & marca (antes 3 rutas sueltas del sidebar de operación)
const SuperadminFeatureVisibility = lazy(() => import('./SuperadminFeatureVisibility'));
const SuperadminWidgetEmbeds = lazy(() => import('./SuperadminWidgetEmbeds'));
const SuperadminReputationMonitor = lazy(() => import('./SuperadminReputationMonitor'));

const TABS = [
  { k: 'health', label: 'Salud sistema', Icon: HeartPulse, grupo: 'Salud & Observabilidad', Page: SuperadminHealth },
  { k: 'observabilidad', label: 'Observabilidad', Icon: Eye, grupo: 'Salud & Observabilidad', Page: SuperadminObservabilityPage },
  { k: 'phase-y', label: 'ROI & Phase Y', Icon: BarChart3, grupo: 'Salud & Observabilidad', Page: SuperadminPhaseYObservability },
  { k: 'actividad', label: 'Actividad unificada', Icon: ListChecks, grupo: 'Auditoría', Page: SuperadminAuditUnified },
  { k: 'audit-log', label: 'Audit log', Icon: ScrollText, grupo: 'Auditoría', Page: SuperadminAuditLog },
  { k: 'audit-chain', label: 'Cadena (SHA-256)', Icon: ShieldCheck, grupo: 'Auditoría', Page: SuperadminAuditChain },
  { k: 'compliance', label: 'Compliance', Icon: ShieldCheck, grupo: 'Auditoría', Page: SuperadminCompliance },
  { k: 'fraud-patterns', label: 'Patrones de fraude', Icon: ShieldAlert, grupo: 'Fraude & Riesgo', Page: SuperadminFraudPatterns },
  { k: 'fraud-alerts', label: 'Alertas de fraude', Icon: Siren, grupo: 'Fraude & Riesgo', Page: SuperadminFraudAlerts },
  { k: 'risk-alerts', label: 'Alertas de riesgo', Icon: AlertTriangle, grupo: 'Fraude & Riesgo', Page: SuperadminRiskAlerts },
  { k: 'duplicates', label: 'Duplicados', Icon: Copy, grupo: 'Integridad de datos', Page: SuperadminDuplicates },
  { k: 'entity-resolution', label: 'Resolución de entidades', Icon: GitMerge, grupo: 'Integridad de datos', Page: SuperadminEntityResolution },
  { k: 'feature-visibility', label: 'Visibilidad de funciones', Icon: ToggleRight, grupo: 'Plataforma & marca', Page: SuperadminFeatureVisibility },
  { k: 'widget-embeds', label: 'Widgets embebidos', Icon: LinkIcon, grupo: 'Plataforma & marca', Page: SuperadminWidgetEmbeds },
  { k: 'reputation-monitor', label: 'Reputación de marca', Icon: Eye, grupo: 'Plataforma & marca', Page: SuperadminReputationMonitor },
];

export default function SuperadminOperacionHub() {
  const [sp, setSp] = useSearchParams();
  const raw = sp.get('tab');
  const tab = TABS.some((t) => t.k === raw) ? raw : 'health';   // URL = única fuente de verdad
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
        Operación & Seguridad
      </div>
      <div role="tablist" aria-label="Operación & Seguridad" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', margin: '8px 0 18px' }}>
        {TABS.map((t) => {
          const sep = t.grupo !== grupoActual; grupoActual = t.grupo;
          return (
            <React.Fragment key={t.k}>
              {sep && <span aria-hidden="true" style={{ fontFamily: 'DM Mono, monospace', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(240,235,224,0.4)', marginLeft: t.grupo !== 'Salud & Observabilidad' ? 8 : 0 }}>{t.grupo}</span>}
              <button role="tab" aria-selected={tab === t.k} data-testid={`op-tab-${t.k}`} onClick={() => setTab(t.k)} style={tabBtn(tab === t.k)}>
                <t.Icon size={13} /> {t.label}
              </button>
            </React.Fragment>
          );
        })}
      </div>
      <div role="tabpanel">
        <Suspense fallback={<div style={{ padding: 40, fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.6)' }}>Cargando…</div>}>
          <Active embedded />
        </Suspense>
      </div>
    </SuperadminLayout>
  );
}
