/**
 * Hub Links · /asesor/links-tracking(/:tab)
 * B7 Fase 5 · unifica las DOS páginas de links que estaban sueltas (parecían
 * duplicadas pero son complementarias):
 *   · Tracking → LinksTrackingPage  (atribución por proyecto · vistas/conversiones/stats · /api/asesor/tracking-links)
 *   · Crear    → AsesorLinks         (constructor de URLs con UTM + QR · /api/.../links)
 *
 * Cero features perdidas: ambas viven como pestañas (modo embedded). La ruta vieja
 * /asesor/links ahora redirige aquí (ver App.js).
 */
import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AdvisorLayout from '../../components/advisor/AdvisorLayout';
import { BarChart3, Plus } from 'lucide-react';
import LinksTrackingPage from './LinksTracking';
import AsesorLinks from './AsesorLinks';

const TABS = [
  { key: 'tracking', label: 'Tracking',       Icon: BarChart3 },
  { key: 'crear',    label: 'Crear links UTM', Icon: Plus },
];

export default function LinksHubPage({ user, onLogout }) {
  const { tab: tabParam } = useParams();
  const nav = useNavigate();
  const [tab, setTab] = useState(TABS.some(t => t.key === tabParam) ? tabParam : 'tracking');
  const go = (k) => { setTab(k); nav(`/asesor/links-tracking/${k}`, { replace: true }); };

  return (
    <AdvisorLayout user={user} onLogout={onLogout}>
      <div style={{ marginBottom: 18 }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>MARKETING · LINKS</div>
        <div role="tablist" aria-label="Links"
          style={{ display: 'inline-flex', gap: 6, padding: 5, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 1px 2px rgba(20,25,45,0.05), 0 6px 16px rgba(20,25,45,0.06)' }}>
          {TABS.map(t => {
            const on = t.key === tab;
            return (
              <button key={t.key} role="tab" aria-selected={on} data-testid={`links-tab-${t.key}`} onClick={() => go(t.key)}
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

      <div data-testid={`links-body-${tab}`}>
        {tab === 'tracking' && <LinksTrackingPage embedded user={user} onLogout={onLogout} />}
        {tab === 'crear'    && <AsesorLinks       embedded user={user} onLogout={onLogout} />}
      </div>
    </AdvisorLayout>
  );
}
