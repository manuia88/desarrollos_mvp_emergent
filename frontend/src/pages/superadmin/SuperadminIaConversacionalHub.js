/**
 * SuperadminIaConversacionalHub — el HUB DE IA CONVERSACIONAL (metodología Hub de Mercado).
 *
 * Una sola casa para el agente que habla con compradores/asesores: cómo se USA (Conversaciones,
 * Copiloto, Costo) y la CALIDAD del modelo (huecos de conocimiento, A/B de prompts, drift, RAG).
 * Cada pestaña embebe la página existente — cero duplicación, cada una sigue viva por su ruta
 * directa (redirige con ?tab=). URL = fuente de verdad · lazy-load por pestaña · roles ARIA.
 * Bonus: Copiloto y Costo no tenían layout (se veían sin sidebar en su ruta) — el hub los enmarca.
 */
import React, { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { MessageSquare, Bot, DollarSign, HelpCircle, FlaskConical, Activity, Search } from 'lucide-react';

const SuperadminConversations = lazy(() => import('../../components/superadmin/SuperadminConversations'));
const SuperadminCopilot = lazy(() => import('../../components/superadmin/SuperadminCopilot'));
const SuperadminConversationCost = lazy(() => import('../../components/superadmin/SuperadminConversationCost'));
const SuperadminKbGaps = lazy(() => import('../../components/superadmin/SuperadminKbGaps'));
const SuperadminAbTesting = lazy(() => import('../../components/superadmin/SuperadminAbTesting'));
const SuperadminConversationDrift = lazy(() => import('../../components/superadmin/SuperadminConversationDrift'));
const SuperadminRagInspector = lazy(() => import('./SuperadminRagInspector'));

const TABS = [
  { k: 'conversaciones', label: 'Conversaciones', Icon: MessageSquare, grupo: 'Uso', Page: SuperadminConversations },
  { k: 'copiloto', label: 'Copiloto', Icon: Bot, grupo: 'Uso', Page: SuperadminCopilot },
  { k: 'costo', label: 'Costo', Icon: DollarSign, grupo: 'Uso', Page: SuperadminConversationCost },
  { k: 'kb-gaps', label: 'Huecos de conocimiento', Icon: HelpCircle, grupo: 'Calidad del modelo', Page: SuperadminKbGaps },
  { k: 'ab-testing', label: 'A/B de prompts', Icon: FlaskConical, grupo: 'Calidad del modelo', Page: SuperadminAbTesting },
  { k: 'drift', label: 'Drift', Icon: Activity, grupo: 'Calidad del modelo', Page: SuperadminConversationDrift },
  { k: 'rag', label: 'RAG Inspector', Icon: Search, grupo: 'Calidad del modelo', Page: SuperadminRagInspector },
];

export default function SuperadminIaConversacionalHub() {
  const [sp, setSp] = useSearchParams();
  const raw = sp.get('tab');
  const tab = TABS.some((t) => t.k === raw) ? raw : 'conversaciones';   // URL = única fuente de verdad
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
        IA Conversacional
      </div>
      <div role="tablist" aria-label="IA Conversacional" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', margin: '8px 0 18px' }}>
        {TABS.map((t) => {
          const sep = t.grupo !== grupoActual; grupoActual = t.grupo;
          return (
            <React.Fragment key={t.k}>
              {sep && <span aria-hidden="true" style={{ fontFamily: 'DM Mono, monospace', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(240,235,224,0.4)', marginLeft: t.grupo !== 'Uso' ? 8 : 0 }}>{t.grupo}</span>}
              <button role="tab" aria-selected={tab === t.k} data-testid={`ia-tab-${t.k}`} onClick={() => setTab(t.k)} style={tabBtn(tab === t.k)}>
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
