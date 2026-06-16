/**
 * DesarrolladorAgentes — "Tus Asistentes IA"
 * Expone los 3 sub-agentes IA (Precios / Difusión / Leads) en el portal del Developer,
 * para que el developer los opere sobre SUS proyectos.
 *
 * El backend (routes/subagents.py) acepta rol developer_admin y aísla por la org de la
 * sesión, así que el prop `orgId` es solo informativo (el servidor no confía en él).
 *
 * TEMA: los 3 paneles usan tokens OSCUROS (superadmin). El portal Dev es CLARO, así que
 * los envolvemos en una "consola" oscura intencional para que se lean como un widget a
 * propósito, sin restilizar los paneles internos.
 */
import React, { useEffect, useState } from 'react';
import { TrendingDown, Megaphone, Users, Bot } from 'lucide-react';
import DeveloperLayout from '../../components/developer/DeveloperLayout';
import { useAuth } from '../../App';
import { listProjectsWithStats } from '../../api/developer';
import PricingAgentPanel from '../../components/director/PricingAgentPanel';
import MarketingAgentPanel from '../../components/director/MarketingAgentPanel';
import LeadAgentPanel from '../../components/director/LeadAgentPanel';

// Sub-tabs en lenguaje humano (cero jerga).
const AGENT_TABS = [
  { key: 'precios',   label: 'Precios',              Icon: TrendingDown },
  { key: 'difusion',  label: 'Difusión / Marketing', Icon: Megaphone },
  { key: 'leads',     label: 'Leads',                Icon: Users },
];

export default function DesarrolladorAgentes({ user, onLogout }) {
  const { user: authUser } = useAuth();
  const me = user || authUser;
  const orgId = me?.tenant_id || me?.org_id || null;

  const [activeAgent, setActiveAgent] = useState('precios');
  const [projectsSummary, setProjectsSummary] = useState([]);

  useEffect(() => {
    let alive = true;
    listProjectsWithStats()
      .then((data) => {
        if (!alive) return;
        // listProjectsWithStats() → mapear a [{id, name}] (lo que esperan los paneles).
        const items = Array.isArray(data) ? data : (data?.items || data?.projects || []);
        const mapped = (items || [])
          .map((p) => ({ id: p.id || p.project_id || p._id, name: p.name || p.title || p.nombre || '—' }))
          .filter((p) => p.id);
        setProjectsSummary(mapped);
      })
      .catch(() => { if (alive) setProjectsSummary([]); });
    return () => { alive = false; };
  }, []);

  return (
    <DeveloperLayout user={me} onLogout={onLogout}>
      <div data-testid="desarrollador-agentes" style={{ maxWidth: 920, margin: '0 auto' }}>
        {/* Encabezado claro (portal Dev) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Bot size={22} color="#6D28D9" />
          <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 24, color: '#1A1A1A', margin: 0, letterSpacing: '-0.02em' }}>
            Tus Asistentes IA
          </h1>
        </div>
        <p style={{ fontFamily: 'DM Sans', fontSize: 14, color: '#6B6B6B', margin: '0 0 20px' }}>
          Tres asistentes que trabajan sobre tus proyectos: te sugieren mejores precios, mejor
          difusión y cómo recuperar leads. Tú apruebas o rechazas cada sugerencia.
        </p>

        {/* "Consola" oscura intencional — los paneles internos usan tema oscuro. */}
        <div
          style={{
            background: '#0d111c',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 18,
            padding: '20px 22px 24px',
            boxShadow: '0 10px 40px rgba(13,17,28,0.18)',
          }}
        >
          {/* Título de la consola */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Bot size={16} color="#A78BFA" />
            <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 15, color: '#F0EBE0' }}>
              Tus asistentes IA · operan sobre tus proyectos
            </span>
          </div>

          {/* Sub-tabs */}
          <div style={{ display: 'flex', gap: 7, marginBottom: 18, flexWrap: 'wrap' }}>
            {AGENT_TABS.map(({ key, label, Icon }) => {
              const active = activeAgent === key;
              return (
                <button
                  key={key}
                  data-testid={`dev-agente-tab-${key}`}
                  onClick={() => setActiveAgent(key)}
                  style={{
                    padding: '7px 15px', borderRadius: 9999, fontSize: 12.5,
                    fontFamily: 'DM Sans', fontWeight: 700, cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: active ? 'rgba(167,139,250,0.18)' : 'transparent',
                    border: active ? '1px solid rgba(167,139,250,0.50)' : '1px solid rgba(255,255,255,0.10)',
                    color: active ? '#C4B5FD' : 'rgba(240,235,224,0.55)',
                  }}
                >
                  <Icon size={13} />
                  {label}
                </button>
              );
            })}
          </div>

          {/* Panel activo */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 16 }}>
            {activeAgent === 'precios' && (
              <PricingAgentPanel orgId={orgId} projectsSummary={projectsSummary} />
            )}
            {activeAgent === 'difusion' && (
              <MarketingAgentPanel orgId={orgId} projectsSummary={projectsSummary} />
            )}
            {activeAgent === 'leads' && (
              <LeadAgentPanel orgId={orgId} />
            )}
          </div>
        </div>
      </div>
    </DeveloperLayout>
  );
}
