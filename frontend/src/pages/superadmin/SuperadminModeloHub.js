/**
 * SuperadminModeloHub — el HUB DE MODELO & APRENDIZAJE (metodología Hub de Mercado).
 *
 * Una sola casa para la salud del cerebro: cuánto acierta (precisión AVM/pronóstico/FSD +
 * calibración), cómo aprende (Cerebro), y qué produce (Scores, Índices, DRPI, Risk Score).
 * Aprendizaje ya declaraba las 4 de precisión como sub-vistas; aquí son pestañas embebidas
 * (bare) — cero duplicación, cada página sigue viva por su ruta directa (redirige con ?tab=).
 * La URL es la fuente de verdad del tab · lazy-load por pestaña · roles ARIA.
 */
import React, { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { Activity, TrendingUp, Gauge, Sparkles, Target, LineChart, AlertTriangle } from 'lucide-react';

const SuperadminAprendizaje = lazy(() => import('./SuperadminAprendizaje'));
const SuperadminAvmAccuracy = lazy(() => import('./SuperadminAvmAccuracy'));
const SuperadminForecastAccuracy = lazy(() => import('./SuperadminForecastAccuracy'));
const SuperadminFsdAccuracy = lazy(() => import('./SuperadminFSDAccuracy'));
const SuperadminCalibracion = lazy(() => import('./SuperadminCalibracion'));
const SuperadminCerebroMercado = lazy(() => import('./SuperadminCerebroMercado'));
const ScoresPage = lazy(() => import('./ScoresPage'));
const SuperadminIndices = lazy(() => import('./SuperadminIndices'));
const SuperadminDRPI = lazy(() => import('./SuperadminDRPI'));
const SuperadminRiskScore = lazy(() => import('./SuperadminRiskScore'));

const TABS = [
  { k: 'resumen', label: 'Resumen', Icon: Activity, grupo: 'Aprendizaje', Page: SuperadminAprendizaje },
  { k: 'avm', label: 'Precisión AVM', Icon: TrendingUp, grupo: 'Aprendizaje', Page: SuperadminAvmAccuracy },
  { k: 'forecast', label: 'Precisión pronóstico', Icon: TrendingUp, grupo: 'Aprendizaje', Page: SuperadminForecastAccuracy },
  { k: 'fsd', label: 'Confiabilidad (FSD)', Icon: Gauge, grupo: 'Aprendizaje', Page: SuperadminFsdAccuracy },
  { k: 'calibracion', label: 'Calibración', Icon: Gauge, grupo: 'Aprendizaje', Page: SuperadminCalibracion },
  { k: 'cerebro', label: 'Cómo aprende', Icon: Sparkles, grupo: 'Aprendizaje', Page: SuperadminCerebroMercado },
  { k: 'scores', label: 'Scores', Icon: Target, grupo: 'Scores & Índices', Page: ScoresPage },
  { k: 'indices', label: 'Índices DMX', Icon: LineChart, grupo: 'Scores & Índices', Page: SuperadminIndices },
  { k: 'drpi', label: 'DRPI', Icon: LineChart, grupo: 'Scores & Índices', Page: SuperadminDRPI },
  { k: 'risk', label: 'Risk Score', Icon: AlertTriangle, grupo: 'Scores & Índices', Page: SuperadminRiskScore },
];

export default function SuperadminModeloHub() {
  const [sp, setSp] = useSearchParams();
  const raw = sp.get('tab');
  const tab = TABS.some((t) => t.k === raw) ? raw : 'resumen';   // URL = única fuente de verdad
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
        Modelo & Aprendizaje
      </div>
      <div role="tablist" aria-label="Modelo & Aprendizaje" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', margin: '8px 0 18px' }}>
        {TABS.map((t) => {
          const sep = t.grupo !== grupoActual; grupoActual = t.grupo;
          return (
            <React.Fragment key={t.k}>
              {sep && <span aria-hidden="true" style={{ fontFamily: 'DM Mono, monospace', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(240,235,224,0.4)', marginLeft: t.grupo !== 'Aprendizaje' ? 8 : 0 }}>{t.grupo}</span>}
              <button role="tab" aria-selected={tab === t.k} data-testid={`modelo-tab-${t.k}`} onClick={() => setTab(t.k)} style={tabBtn(tab === t.k)}>
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
