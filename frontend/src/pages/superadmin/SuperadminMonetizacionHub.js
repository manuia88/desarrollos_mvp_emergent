/**
 * SuperadminMonetizacionHub — el HUB DE MONETIZACIÓN & API (metodología Hub de Mercado).
 *
 * Una sola casa para vender el cubo: F6 unificó el backend (public_api_v1 keys+tier+scope+
 * metering→Stripe · data_licensing bundles · vertical_products playground), así que estas 5
 * pantallas son LENTES de la misma máquina. Cada pestaña embebe la página existente (bare) —
 * cero duplicación, cada página sigue viva por su ruta directa (redirige aquí con ?tab=).
 * La URL es la fuente de verdad del tab (deep-link + back/forward siempre sincronizados).
 * Cada pestaña carga su JS SOLO al abrirla (lazy) — el hub arranca ligero.
 */
import React, { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { KeyRound, Package, FlaskConical, Cpu, Briefcase } from 'lucide-react';

const SuperadminApiKeys = lazy(() => import('./SuperadminApiKeys'));
const SuperadminDataLicensing = lazy(() => import('./SuperadminDataLicensing'));
const SuperadminVerticalProducts = lazy(() => import('./SuperadminVerticalProducts'));
const SuperadminAiCost = lazy(() => import('./SuperadminAiCost'));
const SuperadminCommercial = lazy(() => import('./SuperadminCommercial'));

const TABS = [
  { k: 'keys', label: 'API Keys & Uso', Icon: KeyRound, grupo: 'API Pública', Page: SuperadminApiKeys },
  { k: 'bundles', label: 'Bundles B2B', Icon: Package, grupo: 'API Pública', Page: SuperadminDataLicensing },
  { k: 'probar', label: 'Probar API', Icon: FlaskConical, grupo: 'API Pública', Page: SuperadminVerticalProducts },
  { k: 'costos', label: 'Costo de IA', Icon: Cpu, grupo: 'Interno', Page: SuperadminAiCost },
  { k: 'comercial', label: 'Comercial & Planes', Icon: Briefcase, grupo: 'Interno', Page: SuperadminCommercial },
];

export default function SuperadminMonetizacionHub() {
  const [sp, setSp] = useSearchParams();
  // La URL es la ÚNICA fuente de verdad del tab → back/forward del navegador y deep-links quedan
  // siempre sincronizados (antes: useState solo leía el searchParam en el mount → desync).
  const raw = sp.get('tab');
  const tab = TABS.some((t) => t.k === raw) ? raw : 'keys';
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
      {/* encabezado COMPACTO (eyebrow) — el título grande lo pone cada pestaña, sin doble headline */}
      <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--theme)', marginBottom: 2 }}>
        Monetización & API
      </div>
      <div role="tablist" aria-label="Monetización & API" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', margin: '8px 0 18px' }}>
        {TABS.map((t) => {
          const sep = t.grupo !== grupoActual; grupoActual = t.grupo;
          return (
            <React.Fragment key={t.k}>
              {sep && <span aria-hidden="true" style={{ fontFamily: 'DM Mono, monospace', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(240,235,224,0.4)', marginLeft: t.grupo === 'Interno' ? 8 : 0 }}>{t.grupo}</span>}
              <button role="tab" aria-selected={tab === t.k} data-testid={`monet-tab-${t.k}`} onClick={() => setTab(t.k)} style={tabBtn(tab === t.k)}>
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
