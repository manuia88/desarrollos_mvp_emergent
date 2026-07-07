/**
 * SuperadminInteligenciaHub — el HUB DE INTELIGENCIA (dashboards) (metodología Hub de Mercado).
 *
 * Una sola casa para los TABLEROS de inteligencia ligeros (vista única, KPIs, monitores): demanda
 * (Demanda de mercado, Gemelo de demanda, Grafo del comprador, Google Trends), activos & calidad
 * (Calidad de obra, Reseñas de residentes, Staging virtual, Investment Explorer) y cobertura &
 * riesgo (Granularidad, Migración climática). Cada pestaña embebe la página existente (bare) —
 * cero duplicación, cada una sigue viva por su ruta directa (redirige con ?tab=). URL = fuente de
 * verdad · lazy-load por pestaña · roles ARIA.
 *
 * FUERA del hub a propósito (terminales full-screen que NO se entierran en pestañas): Terminal de
 * Zona, Intelligence Hub, Foundation Phase 5, Transaction Network, Knowledge Graph, Live Pulse y
 * Terminal de Mercado CDMX — más los hubs Modelo & Aprendizaje e IA Conversacional.
 *
 * Nota: algunas páginas usan user/onLogout; el hub los toma de useAuth y los pasa a cada pestaña.
 */
import React, { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { useAuth } from '../../App';
import { TrendingUp, Scale, Users, BarChart3, ShieldCheck, MessageSquare, Sparkles, DollarSign, Target, CloudRain } from 'lucide-react';

const SuperadminDemandaMercado = lazy(() => import('./SuperadminDemandaMercado'));
const SuperadminGemeloDemanda = lazy(() => import('./SuperadminGemeloDemanda'));
const SuperadminGrafoComprador = lazy(() => import('./SuperadminGrafoComprador'));
const SuperadminTrends = lazy(() => import('./SuperadminTrends'));
const SuperadminConstructionQuality = lazy(() => import('./SuperadminConstructionQuality'));
const SuperadminReviewsResidents = lazy(() => import('./SuperadminReviewsResidents'));
const SuperadminVirtualStaging = lazy(() => import('./SuperadminVirtualStaging'));
const SuperadminInvestmentExplorer = lazy(() => import('./SuperadminInvestmentExplorer'));
const SuperadminGranularidad = lazy(() => import('./SuperadminGranularidad'));
const SuperadminClimateMigration = lazy(() => import('./SuperadminClimateMigration'));

const TABS = [
  { k: 'demanda', label: 'Demanda de mercado', Icon: TrendingUp, grupo: 'Demanda', Page: SuperadminDemandaMercado },
  { k: 'gemelo', label: 'Gemelo de demanda', Icon: Scale, grupo: 'Demanda', Page: SuperadminGemeloDemanda },
  { k: 'grafo-comprador', label: 'Grafo del comprador', Icon: Users, grupo: 'Demanda', Page: SuperadminGrafoComprador },
  { k: 'trends', label: 'Google Trends', Icon: BarChart3, grupo: 'Demanda', Page: SuperadminTrends },
  { k: 'calidad', label: 'Calidad de obra', Icon: ShieldCheck, grupo: 'Activos & Calidad', Page: SuperadminConstructionQuality },
  { k: 'reviews', label: 'Reseñas de residentes', Icon: MessageSquare, grupo: 'Activos & Calidad', Page: SuperadminReviewsResidents },
  { k: 'staging', label: 'Staging virtual', Icon: Sparkles, grupo: 'Activos & Calidad', Page: SuperadminVirtualStaging },
  { k: 'investment', label: 'Investment Explorer', Icon: DollarSign, grupo: 'Activos & Calidad', Page: SuperadminInvestmentExplorer },
  { k: 'granularidad', label: 'Granularidad', Icon: Target, grupo: 'Cobertura & Riesgo', Page: SuperadminGranularidad },
  { k: 'clima', label: 'Migración climática', Icon: CloudRain, grupo: 'Cobertura & Riesgo', Page: SuperadminClimateMigration },
];

export default function SuperadminInteligenciaHub() {
  const [sp, setSp] = useSearchParams();
  const { user, logout } = useAuth();
  const raw = sp.get('tab');
  const tab = TABS.some((t) => t.k === raw) ? raw : 'demanda';   // URL = única fuente de verdad
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
        Inteligencia · Tableros
      </div>
      <div role="tablist" aria-label="Inteligencia · Tableros" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', margin: '8px 0 18px' }}>
        {TABS.map((t) => {
          const sep = t.grupo !== grupoActual; grupoActual = t.grupo;
          return (
            <React.Fragment key={t.k}>
              {sep && <span aria-hidden="true" style={{ fontFamily: 'DM Mono, monospace', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(240,235,224,0.4)', marginLeft: t.grupo !== 'Demanda' ? 8 : 0 }}>{t.grupo}</span>}
              <button role="tab" aria-selected={tab === t.k} data-testid={`intel-tab-${t.k}`} onClick={() => setTab(t.k)} style={tabBtn(tab === t.k)}>
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
