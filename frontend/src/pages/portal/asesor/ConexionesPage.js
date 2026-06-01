/**
 * Hub de Conexiones · /portal/asesor/conexiones
 * B7 Fase 2 · UN solo lugar para todo lo que el asesor conecta:
 *   · Canales      — WhatsApp / Instagram / Facebook para conversaciones (backend /api/asesor/channels)
 *   · Anuncios Meta — vincula cuenta de Meta Ads (OAuth socialAds)
 *   · Campañas      — rendimiento por campaña + sugerencia de presupuesto IA
 *
 * Reúsa los cuerpos existentes (CanalesBody / SocialAdsConnectPageBody /
 * SocialAdsCampaignsPageBody) → cero backend nuevo, cero features perdidas.
 * Antes estaban dispersos en 3 grupos del menú (Conversaciones IA / Mis Leads /
 * Herramientas); ahora viven aquí. Las rutas viejas siguen existiendo (no orphans).
 */
import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import PortalLayout from '../../../components/shared/PortalLayout';
import { Share2, Megaphone, BarChart3 } from 'lucide-react';
import { CanalesBody } from './CanalesPage';
import { SocialAdsConnectPageBody } from './SocialAdsConnectPage';
import { SocialAdsCampaignsPageBody } from './SocialAdsCampaignsPage';

const TABS = [
  { key: 'canales',  label: 'Canales',       Icon: Share2 },
  { key: 'anuncios', label: 'Anuncios Meta', Icon: Megaphone },
  { key: 'campanas', label: 'Campañas',      Icon: BarChart3 },
];

export default function ConexionesPage({ user, onLogout }) {
  const loc = useLocation();
  const nav = useNavigate();
  const initial = new URLSearchParams(loc.search).get('tab');
  const [tab, setTab] = useState(TABS.some(t => t.key === initial) ? initial : 'canales');
  const go = (k) => { setTab(k); nav(`/portal/asesor/conexiones?tab=${k}`, { replace: true }); };

  return (
    <PortalLayout role={user?.role} user={user} onLogout={onLogout}>
      <div style={{ padding: '20px 24px 0', maxWidth: 1140, margin: '0 auto' }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--theme-2)', marginBottom: 10 }}>
          DesarrollosMX · Conexiones
        </div>
        <div role="tablist" aria-label="Conexiones"
          style={{ display: 'inline-flex', gap: 6, padding: 5, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 1px 2px rgba(20,25,45,0.05), 0 6px 16px rgba(20,25,45,0.06)' }}>
          {TABS.map(t => {
            const on = t.key === tab;
            return (
              <button key={t.key} role="tab" aria-selected={on} data-testid={`conexiones-tab-${t.key}`} onClick={() => go(t.key)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 18px', borderRadius: 10, border: 'none', cursor: 'pointer',
                  fontFamily: 'DM Sans, sans-serif', fontSize: 13.5, fontWeight: 700,
                  background: on ? 'linear-gradient(90deg, var(--theme), var(--theme-3))' : 'transparent',
                  color: on ? '#fff' : 'var(--cream-2)', transition: 'all 150ms ease',
                }}>
                <t.Icon size={16} /> {t.label}
              </button>
            );
          })}
        </div>
      </div>
      <div data-testid={`conexiones-body-${tab}`}>
        {tab === 'canales'  && <CanalesBody />}
        {tab === 'anuncios' && <SocialAdsConnectPageBody />}
        {tab === 'campanas' && <SocialAdsCampaignsPageBody />}
      </div>
    </PortalLayout>
  );
}
