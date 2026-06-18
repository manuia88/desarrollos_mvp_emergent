/**
 * Phase 4 Batch 22 — InsightsTab container with 5 sub-tabs.
 * Sub-tabs: Resumen · Engagement · Cash Flow · Comparables · IA
 */
import React, { useState } from 'react';
import InsightsProyecto from './InsightsProyecto';
import InsightsResumen from './InsightsResumen';
import InsightsEngagement from './InsightsEngagement';
import UnitFunnelPanel from './UnitFunnelPanel';
import ZoneDemandGapPanel from './ZoneDemandGapPanel';
import InsightsCashFlow from './InsightsCashFlow';
import InsightsComparables from './InsightsComparables';
import InsightsIA from './InsightsIA';
// Motores (Tanda 3) — antes sin UI dev: inversión (score+ROI/TIR) + costos de cierre (impuestos)
import InvestmentSimulator from '../../investment/InvestmentSimulator';
import TaxClosingPanel from '../TaxClosingPanel';
import ConstructionCostPanel from '../ConstructionCostPanel';
import ZoneMarketValuePanel from '../ZoneMarketValuePanel';

const SUBTABS = [
  { key: 'completa',    label: '★ Vista completa' },
  { key: 'resumen',     label: 'Resumen' },
  { key: 'engagement',  label: 'Engagement' },
  { key: 'cashflow',    label: 'Cash Flow' },
  { key: 'comparables', label: 'Comparables' },
  { key: 'inversion',   label: 'Inversión' },
  { key: 'ia',          label: 'IA' },
];

export default function InsightsTab({ projectId, user }) {
  const [active, setActive] = useState('completa');

  return (
    <div data-testid="insights-tab" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Sub-tab pills */}
      <div data-testid="insights-subtabs" style={{
        display: 'flex', gap: 6, flexWrap: 'wrap',
        borderBottom: '1px solid rgba(var(--cream-rgb),0.10)',
        paddingBottom: 12,
      }}>
        {SUBTABS.map(t => {
          const isActive = active === t.key;
          return (
            <button
              key={t.key}
              data-testid={`insights-subtab-${t.key}`}
              onClick={() => setActive(t.key)}
              style={{
                padding: '8px 16px',
                borderRadius: 9999,
                border: '1px solid ' + (isActive ? 'transparent' : 'rgba(var(--cream-rgb),0.14)'),
                background: isActive
                  ? 'linear-gradient(90deg, var(--theme), var(--theme-3))'
                  : 'transparent',
                color: isActive ? '#fff' : 'var(--cream-2)',
                fontFamily: 'DM Sans, sans-serif',
                fontSize: 12.5,
                fontWeight: isActive ? 700 : 500,
                cursor: 'pointer',
                transition: 'opacity 160ms ease',
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Sub-tab content */}
      <div data-testid="insights-subtab-content">
        {active === 'completa'    && <InsightsProyecto projectId={projectId} user={user} />}
        {active === 'resumen'     && <InsightsResumen projectId={projectId} />}
        {active === 'engagement'  && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <UnitFunnelPanel projectId={projectId} />
            <ZoneDemandGapPanel projectId={projectId} />
            <InsightsEngagement projectId={projectId} />
          </div>
        )}
        {active === 'cashflow'    && <InsightsCashFlow projectId={projectId} />}
        {active === 'comparables' && <InsightsComparables projectId={projectId} />}
        {active === 'inversion'   && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <InvestmentSimulator />
            <ZoneMarketValuePanel projectId={projectId} />
            <ConstructionCostPanel zone_id={projectId} />
            <TaxClosingPanel />
          </div>
        )}
        {active === 'ia'          && <InsightsIA projectId={projectId} />}
      </div>
    </div>
  );
}
