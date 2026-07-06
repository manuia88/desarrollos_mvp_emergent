/**
 * SuperadminMonetizacionHub — el HUB DE MONETIZACIÓN & API (metodología Hub de Mercado).
 *
 * Una sola casa para vender el cubo: F6 unificó el backend (public_api_v1 keys+tier+scope+
 * metering→Stripe · data_licensing bundles · vertical_products playground), así que estas 5
 * pantallas son LENTES de la misma máquina. Cada pestaña embebe la página existente (bare) —
 * cero duplicación, cada página sigue viva por su ruta directa (redirige aquí con ?tab=).
 */
import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { KeyRound, Package, FlaskConical, Cpu, Briefcase } from 'lucide-react';
import SuperadminApiKeys from './SuperadminApiKeys';
import SuperadminDataLicensing from './SuperadminDataLicensing';
import SuperadminVerticalProducts from './SuperadminVerticalProducts';
import SuperadminAiCost from './SuperadminAiCost';
import SuperadminCommercial from './SuperadminCommercial';

const TABS = [
  { k: 'keys', label: 'API Keys & Uso', Icon: KeyRound, grupo: 'API Pública', Page: SuperadminApiKeys },
  { k: 'bundles', label: 'Bundles B2B', Icon: Package, grupo: 'API Pública', Page: SuperadminDataLicensing },
  { k: 'probar', label: 'Probar API', Icon: FlaskConical, grupo: 'API Pública', Page: SuperadminVerticalProducts },
  { k: 'costos', label: 'Costo de IA', Icon: Cpu, grupo: 'Interno', Page: SuperadminAiCost },
  { k: 'comercial', label: 'Comercial & Planes', Icon: Briefcase, grupo: 'Interno', Page: SuperadminCommercial },
];

export default function SuperadminMonetizacionHub() {
  const [sp, setSp] = useSearchParams();
  const [tab, setTab] = useState(sp.get('tab') && TABS.some((t) => t.k === sp.get('tab')) ? sp.get('tab') : 'keys');
  useEffect(() => { if (sp.get('tab') !== tab) { const n = new URLSearchParams(sp); n.set('tab', tab); setSp(n, { replace: true }); } /* eslint-disable-next-line */ }, [tab]);

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
      <div style={{ marginBottom: 4 }}>
        <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: 'var(--cream)', margin: 0 }}>Monetización & API</h1>
        <p style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'rgba(240,235,224,0.55)', marginTop: 3 }}>
          Vender el cubo: emite y cobra el acceso a la API, empaqueta bundles B2B, prueba los productos, y vigila el P&amp;L interno de IA y planes.
        </p>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', margin: '14px 0 18px' }}>
        {TABS.map((t) => {
          const sep = t.grupo !== grupoActual; grupoActual = t.grupo;
          return (
            <React.Fragment key={t.k}>
              {sep && <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(240,235,224,0.4)', marginLeft: t.grupo === 'Interno' ? 8 : 0 }}>{t.grupo}</span>}
              <button data-testid={`monet-tab-${t.k}`} onClick={() => setTab(t.k)} style={tabBtn(tab === t.k)}>
                <t.Icon size={13} /> {t.label}
              </button>
            </React.Fragment>
          );
        })}
      </div>
      <Active embedded />
    </SuperadminLayout>
  );
}
