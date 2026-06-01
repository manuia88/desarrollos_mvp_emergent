/**
 * Hub Mis Leads · /asesor/mis-leads
 * B7 Fase 3 · UN solo lugar para los 3 pipelines del asesor, en pestañas:
 *   · Pipeline    — leads de desarrollos (LeadKanban scope=mine) · vínculo dev_org_id/project_id intacto
 *   · Búsquedas   — solicitudes de búsqueda de clientes (colección busquedas)
 *   · Captaciones — inmuebles en reventa que el asesor capta (colección captaciones)
 *
 * Los DATOS siguen en sus 3 colecciones separadas (NO se fusionan); aquí solo se
 * unifica la VISTA reusando cada página en modo `embedded` (sin su propio layout).
 * Rutas viejas (/asesor/leads-dev · /busquedas · /captaciones) siguen vivas (no orphans).
 */
import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AdvisorLayout from '../../components/advisor/AdvisorLayout';
import { Megaphone, Search, Briefcase } from 'lucide-react';
import AsesorLeadsDev from './AsesorLeadsDev';
import AsesorBusquedas from './AsesorBusquedas';
import AsesorCaptaciones from './AsesorCaptaciones';

const TABS = [
  { key: 'pipeline',    label: 'Pipeline',    Icon: Megaphone },
  { key: 'busquedas',   label: 'Búsquedas',   Icon: Search },
  { key: 'captaciones', label: 'Captaciones', Icon: Briefcase },
];

export default function MisLeadsPage({ user, onLogout }) {
  const { tab: tabParam } = useParams();
  const nav = useNavigate();
  const [tab, setTab] = useState(TABS.some(t => t.key === tabParam) ? tabParam : 'pipeline');
  const go = (k) => { setTab(k); nav(`/asesor/mis-leads/${k}`, { replace: true }); };

  return (
    <AdvisorLayout user={user} onLogout={onLogout}>
      <div style={{ marginBottom: 18 }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>CRM · MIS LEADS</div>
        <div role="tablist" aria-label="Mis Leads"
          style={{ display: 'inline-flex', gap: 6, padding: 5, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 1px 2px rgba(20,25,45,0.05), 0 6px 16px rgba(20,25,45,0.06)' }}>
          {TABS.map(t => {
            const on = t.key === tab;
            return (
              <button key={t.key} role="tab" aria-selected={on} data-testid={`misleads-tab-${t.key}`} onClick={() => go(t.key)}
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

      <div data-testid={`misleads-body-${tab}`}>
        {tab === 'pipeline'    && <AsesorLeadsDev    embedded user={user} onLogout={onLogout} />}
        {tab === 'busquedas'   && <AsesorBusquedas   embedded user={user} onLogout={onLogout} />}
        {tab === 'captaciones' && <AsesorCaptaciones embedded user={user} onLogout={onLogout} />}
      </div>
    </AdvisorLayout>
  );
}
