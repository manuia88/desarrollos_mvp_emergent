// #2 · Terminal de Inteligencia de Mercado del dev — la CASA del dato profundo.
// Aquí vive el análisis que sale del Inicio (que queda limpio): tú vs mercado, qué mueve
// el valor, dónde construir, tus zonas, comparativo CDMX. Con selector de alcance como el
// cockpit (Todo / Una zona) para drillear consistente.
import React, { useEffect, useMemo, useState } from 'react';
import DeveloperLayout from '../../components/developer/DeveloperLayout';
import { PageHeader } from '../../components/advisor/primitives';
import { listProjectsWithStats } from '../../api/developer';
import CubeIntelligence from '../../components/developer/CubeIntelligence';
import ZoneIntelligence from '../../components/developer/ZoneIntelligence';
import MarketIntelligence from '../../components/developer/MarketIntelligence';
import WhatIfPanel from '../../components/whatif/WhatIfPanel';
import DesarrolladorDemanda from './DesarrolladorDemanda';
import DesarrolladorPricing from './DesarrolladorPricing';
import DesarrolladorCompetidores from './DesarrolladorCompetidores';

const DEV_V2 = process.env.REACT_APP_DEV_V2 === 'true';

// Áreas del Centro de Inteligencia (re-arquitectura · consolida las hojas sueltas).
const AREAS = [
  ['mercado', 'Mercado'],
  ['demanda', 'Demanda'],
  ['precios', 'Precios'],
  ['competencia', 'Competencia'],
];

const slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const selStyle = {
  appearance: 'none', padding: '7px 30px 7px 13px', borderRadius: 9999,
  background: 'var(--surface, #fff) url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\'><path d=\'M1 1l4 4 4-4\' stroke=\'%23999\' fill=\'none\' stroke-width=\'1.5\'/></svg>") no-repeat right 12px center',
  border: '1px solid var(--border, rgba(var(--cream-rgb),0.14))', color: 'var(--cream)',
  fontFamily: 'DM Sans,sans-serif', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
};

export default function DesarrolladorMercado({ user, onLogout }) {
  const [projects, setProjects] = useState(null);
  const [mode, setMode] = useState('all');       // all | zona
  const [zoneSel, setZoneSel] = useState('');
  const [area, setArea] = useState('mercado');   // V2: mercado | demanda | precios | competencia

  useEffect(() => {
    listProjectsWithStats()
      .then(r => setProjects(Array.isArray(r) ? r : (r.projects || r.items || [])))
      .catch(() => setProjects([]));
  }, []);

  const colonias = useMemo(() => {
    const seen = new Map();
    (projects || []).forEach(p => { if (p.colonia && !seen.has(p.colonia)) seen.set(p.colonia, slug(p.colonia)); });
    return [...seen.entries()].map(([name, s]) => ({ name, slug: s }));
  }, [projects]);

  const colonia = mode === 'zona' && zoneSel ? zoneSel : undefined;

  const setModeSafe = (m) => { setMode(m); if (m === 'zona' && !zoneSel && colonias[0]) setZoneSel(colonias[0].slug); };

  const Eyebrow = ({ children }) => (
    <div className="eyebrow" style={{ marginBottom: 8, marginTop: 4 }}>{children}</div>
  );

  return (
    <DeveloperLayout user={user} onLogout={onLogout}>
      <PageHeader
        eyebrow={DEV_V2 ? 'CENTRO DE INTELIGENCIA' : 'TERMINAL · INTELIGENCIA'}
        title={DEV_V2 ? 'Centro de Inteligencia' : 'Inteligencia de Mercado'}
        sub="Tu mercado a fondo: tú vs el mercado, qué mueve el valor, dónde construir y tus zonas."
      />

      {/* Switch de áreas (V2) — consolida las hojas sueltas en un solo centro, por trabajo. */}
      {DEV_V2 && (
        <div data-testid="intel-area-switcher" style={{ display: 'inline-flex', gap: 3, background: 'rgba(var(--cream-rgb),0.05)', border: '1px solid var(--border, rgba(var(--cream-rgb),0.10))', borderRadius: 9999, padding: 3, marginBottom: 22, flexWrap: 'wrap' }}>
          {AREAS.map(([k, lbl]) => {
            const on = area === k;
            return (
              <button key={k} data-testid={`intel-area-${k}`} onClick={() => setArea(k)}
                style={{ padding: '7px 16px', borderRadius: 9999, border: 'none', cursor: 'pointer', background: on ? 'linear-gradient(90deg,#6366F1,#EC4899)' : 'transparent', color: on ? '#fff' : 'var(--cream-2)', fontFamily: 'DM Sans,sans-serif', fontSize: 12.5, fontWeight: on ? 700 : 500 }}>
                {lbl}
              </button>
            );
          })}
          <span style={{ alignSelf: 'center', padding: '0 10px', fontSize: 11, color: 'var(--cream-3)' }}>Reportes · Site Selection — próximo</span>
        </div>
      )}

      {/* Áreas embebidas (V2) — reusan las hojas existentes sin doble layout (bare). */}
      {DEV_V2 && area === 'demanda' && <DesarrolladorDemanda user={user} embedded />}
      {DEV_V2 && area === 'precios' && <DesarrolladorPricing user={user} embedded />}
      {DEV_V2 && area === 'competencia' && <DesarrolladorCompetidores user={user} embedded />}

      {/* ÁREA MERCADO — el terminal (default · y único en V1) */}
      {(!DEV_V2 || area === 'mercado') && (
      <>
      {/* Selector de alcance (consistente con el cockpit) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 22 }}>
        <span style={{ fontSize: 11.5, color: 'var(--cream-3)', fontWeight: 700, letterSpacing: '.03em' }}>ESTÁS VIENDO</span>
        <div style={{ display: 'inline-flex', gap: 3, background: 'rgba(var(--cream-rgb),0.05)', border: '1px solid var(--border, rgba(var(--cream-rgb),0.10))', borderRadius: 9999, padding: 3 }}>
          {[['all', 'Todo el portafolio'], ['zona', 'Una zona']].map(([k, lbl]) => {
            const on = mode === k;
            return (
              <button key={k} data-testid={`mkt-scope-${k}`} onClick={() => setModeSafe(k)}
                style={{ padding: '6px 14px', borderRadius: 9999, border: 'none', cursor: 'pointer', background: on ? 'linear-gradient(90deg, var(--theme), var(--theme-3, var(--theme)))' : 'transparent', color: on ? '#fff' : 'var(--cream-2)', fontFamily: 'DM Sans,sans-serif', fontSize: 12, fontWeight: on ? 700 : 500 }}>
                {lbl}
              </button>
            );
          })}
        </div>
        {mode === 'zona' && (
          <select data-testid="mkt-zone-select" value={zoneSel} onChange={e => setZoneSel(e.target.value)} style={selStyle}>
            {colonias.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        )}
      </div>

      {/* 1 · Tú vs el mercado + qué mueve el valor + dónde construir */}
      <div data-testid="terminal-cube" style={{ marginBottom: 26 }}>
        <Eyebrow>TÚ VS EL MERCADO · DECISIONES</Eyebrow>
        <CubeIntelligence colonia={colonia} />
      </div>

      {/* 2 · Tus zonas a fondo (radar de calidad + tendencia + veredicto) */}
      <div data-testid="terminal-zones" style={{ marginBottom: 26 }}>
        <Eyebrow>TUS ZONAS · A FONDO</Eyebrow>
        <ZoneIntelligence user={user} colonia={colonia} />
      </div>

      {/* 3 · Comparativo CDMX (embudo, plusvalía, precio/m², calidad) */}
      <div data-testid="terminal-cdmx" style={{ marginBottom: 26 }}>
        <Eyebrow>COMPARATIVO · CDMX</Eyebrow>
        <MarketIntelligence user={user} />
      </div>

      {/* 4 · Simulador What-if — re-ubicado del Inicio (V2). Herramienta de escenarios de precio/mezcla. */}
      {DEV_V2 && (
        <div data-testid="terminal-whatif" style={{ marginBottom: 26 }}>
          <Eyebrow>SIMULADOR · ¿QUÉ PASA SI…?</Eyebrow>
          <WhatIfPanel
            user={user}
            projects={(projects || []).map(p => ({
              id: p.id || p.slug || p._id,
              name: p.name,
              price_from: p.price_from,
              price_to: p.price_to,
              m2_range: p.m2_range,
            }))}
          />
        </div>
      )}
      </>
      )}
    </DeveloperLayout>
  );
}
