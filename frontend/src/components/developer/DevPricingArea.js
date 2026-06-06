// Pricing consolidado (Bloque 1.4) — un solo Pricing con tabs: Estrategia (Precio Inteligente,
// por proyecto) · Sugerencias (por unidad, AVM). El Lab de experimentos se abre desde cada proyecto.
import React, { useState } from 'react';
import DevPricingStrategy from './DevPricingStrategy';
import DesarrolladorPricing from '../../pages/developer/DesarrolladorPricing';

const TABS = [['estrategia', 'Estrategia'], ['sugerencias', 'Sugerencias por Unidad']];

export default function DevPricingArea({ user }) {
  const [tab, setTab] = useState('estrategia');
  return (
    <div data-testid="dev-pricing-area">
      <div style={{ display: 'inline-flex', gap: 3, background: 'rgba(var(--cream-rgb),0.05)', border: '1px solid var(--border, rgba(var(--cream-rgb),0.10))', borderRadius: 9999, padding: 3, marginBottom: 18 }}>
        {TABS.map(([k, lbl]) => {
          const on = tab === k;
          return (
            <button key={k} data-testid={`pricing-tab-${k}`} onClick={() => setTab(k)}
              style={{ padding: '7px 16px', borderRadius: 9999, border: 'none', cursor: 'pointer', background: on ? 'linear-gradient(90deg,#6366F1,#EC4899)' : 'transparent', color: on ? '#fff' : 'var(--cream-2)', fontFamily: 'DM Sans,sans-serif', fontSize: 12.5, fontWeight: on ? 700 : 500 }}>
              {lbl}
            </button>
          );
        })}
      </div>
      {tab === 'estrategia' && <DevPricingStrategy onVerSugerencias={() => setTab('sugerencias')} />}
      {tab === 'sugerencias' && <DesarrolladorPricing user={user} embedded />}
    </div>
  );
}
