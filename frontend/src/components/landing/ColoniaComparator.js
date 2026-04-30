// ColoniaComparator — Radar Battle
// Layout: 220px left / 1fr radar / 220px right
// SVG radar with 6 axes, 5 rings, 2 data polygons
import React, { useState, useRef, useEffect } from 'react';
import FadeUp from '../animations/FadeUp';
import BlurText from '../animations/BlurText';

const COLONIAS_DATA = {
  'del-valle': {
    name: 'Del Valle Centro', alcaldia: 'Benito Juárez', initials: 'DV',
    color: '#6366F1',
    priceM2: '$58k', momentum: '+6%',
    scores: { Movilidad: 91, Seguridad: 74, Comercio: 82, Momentum: 80, Educación: 77, Riesgo: 71 },
  },
  'condesa': {
    name: 'Condesa', alcaldia: 'Cuauhtémoc', initials: 'CO',
    color: '#EC4899',
    priceM2: '$72k', momentum: '+4%',
    scores: { Movilidad: 88, Seguridad: 76, Comercio: 94, Momentum: 74, Educación: 82, Riesgo: 78 },
  },
  'roma-norte': {
    name: 'Roma Norte', alcaldia: 'Cuauhtémoc', initials: 'RN',
    color: '#22C55E',
    priceM2: '$68k', momentum: '+8%',
    scores: { Movilidad: 85, Seguridad: 72, Comercio: 91, Momentum: 88, Educación: 79, Riesgo: 74 },
  },
  'narvarte': {
    name: 'Narvarte Poniente', alcaldia: 'Benito Juárez', initials: 'NA',
    color: '#F59E0B',
    priceM2: '$55k', momentum: '+7%',
    scores: { Movilidad: 87, Seguridad: 78, Comercio: 76, Momentum: 84, Educación: 81, Riesgo: 75 },
  },
};

const AXES = ['Movilidad', 'Seguridad', 'Comercio', 'Momentum', 'Educación', 'Riesgo'];
const AXIS_HELP = {
  Movilidad: 'Acceso a Metro, Metrobús, Ecobici y tiempos de traslado promedio.',
  Seguridad: 'Incidencia delictiva FGJ, cobertura C5, alumbrado público.',
  Comercio:  'Densidad DENUE: restaurantes, abasto, servicios, vida nocturna.',
  Momentum:  'Tendencia de precio m² últimos 24 meses y volumen transaccional.',
  Educación: 'Escuelas públicas y privadas, rating SEP, ratio estudiantes/plantel.',
  Riesgo:    'Atlas de Riesgos CDMX: sísmico, hundimiento, encharcamiento. (Alto = mejor)',
};

const CX = 170, CY = 170, R_MAX = 118;
const N_RINGS = 5;

function getPoint(axisIdx, val) {
  const angle = (axisIdx / AXES.length) * 2 * Math.PI - Math.PI / 2;
  const r = (val / 100) * R_MAX;
  return { x: CX + r * Math.cos(angle), y: CY + r * Math.sin(angle) };
}

function radarPath(scores) {
  const pts = AXES.map((ax, i) => getPoint(i, scores[ax] || 0));
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + ' Z';
}

function SidePanel({ coloniaKey, setColoniaKey, side }) {
  const c = COLONIAS_DATA[coloniaKey];
  const keys = Object.keys(COLONIAS_DATA);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      {/* Avatar */}
      <div style={{
        width: 88, height: 88, borderRadius: 9999,
        background: `radial-gradient(circle, ${c.color}40 0%, ${c.color}10 100%)`,
        border: `2px solid ${c.color}60`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 28, color: c.color }}>
          {c.initials}
        </span>
      </div>

      {/* Name */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--cream)', marginBottom: 2 }}>
          {c.name}
        </div>
        <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>
          {c.alcaldia}
        </div>
      </div>

      {/* Mini stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, width: '100%' }}>
        {[{ k: 'Precio m²', v: c.priceM2 }, { k: 'Momentum', v: c.momentum }].map(({ k, v }) => (
          <div key={k} style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '8px 10px',
            textAlign: 'center',
          }}>
            <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)', marginBottom: 3 }}>{k}</div>
            <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: 'var(--cream)' }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Picker */}
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {keys.map(k => (
          <button
            key={k}
            data-testid={`comparator-pick-${side}-${k}`}
            onClick={() => setColoniaKey(k)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '7px 10px',
              borderRadius: 9999,
              border: `1px solid ${k === coloniaKey ? COLONIAS_DATA[k].color + '60' : 'var(--border)'}`,
              background: k === coloniaKey ? COLONIAS_DATA[k].color + '15' : 'transparent',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            <div style={{ width: 8, height: 8, borderRadius: 9999, background: COLONIAS_DATA[k].color, flexShrink: 0 }} />
            <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)' }}>
              {COLONIAS_DATA[k].name.split(' ')[0]}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ColoniaComparator() {
  const [leftKey, setLeftKey] = useState('del-valle');
  const [rightKey, setRightKey] = useState('condesa');
  const [activeAxis, setActiveAxis] = useState(null);

  const left = COLONIAS_DATA[leftKey];
  const right = COLONIAS_DATA[rightKey];

  const leftPath = radarPath(left.scores);
  const rightPath = radarPath(right.scores);

  return (
    <section data-testid="colonia-comparator" id="comparador" style={{
      padding: '80px 32px',
      background: 'linear-gradient(180deg, #0D1017, #06080F)',
      borderTop: '1px solid var(--border)',
      borderBottom: '1px solid var(--border)',
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* Header */}
        <FadeUp>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div className="tag-pill" style={{ marginBottom: 16 }}>Comparador de colonias</div>
            <BlurText
              as="h2"
              style={{
                fontFamily: 'Outfit', fontWeight: 800,
                fontSize: 'clamp(32px, 4.5vw, 54px)',
                lineHeight: 1.0, letterSpacing: '-0.028em',
                marginBottom: 16,
                justifyContent: 'center',
              }}
            >
              Compara dos colonias cara a cara.
            </BlurText>
            <p style={{
              maxWidth: 560, margin: '0 auto',
              fontFamily: 'DM Sans', fontSize: 16, color: 'var(--cream-2)',
              lineHeight: 1.65,
            }}>
              Elige dos colonias y DMX las proyecta sobre seis dimensiones de decisión. Los polígonos superpuestos te muestran al instante dónde gana cada una.
            </p>
          </div>
        </FadeUp>

        {/* Battle layout */}
        <div
          data-testid="comparator-battle"
          style={{
            display: 'grid',
            gridTemplateColumns: '220px 1fr 220px',
            gap: 32,
            padding: 32,
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid var(--border)',
            borderRadius: 28,
            alignItems: 'start',
          }}
          className="comparator-grid"
        >
          {/* Left panel */}
          <SidePanel coloniaKey={leftKey} setColoniaKey={setLeftKey} side="left" />

          {/* Radar center */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <svg
              viewBox="0 0 340 340"
              style={{ width: '100%', maxWidth: 340, height: 340 }}
              data-testid="radar-svg"
            >
              {/* Rings */}
              {Array.from({ length: N_RINGS }).map((_, ri) => {
                const r = ((ri + 1) / N_RINGS) * R_MAX;
                const ringPts = AXES.map((_, ai) => {
                  const angle = (ai / AXES.length) * 2 * Math.PI - Math.PI / 2;
                  return `${(CX + r * Math.cos(angle)).toFixed(1)},${(CY + r * Math.sin(angle)).toFixed(1)}`;
                });
                return (
                  <polygon
                    key={ri}
                    points={ringPts.join(' ')}
                    fill="none"
                    stroke="rgba(255,255,255,0.06)"
                    strokeWidth="1"
                  />
                );
              })}

              {/* Spokes */}
              {AXES.map((ax, ai) => {
                const angle = (ai / AXES.length) * 2 * Math.PI - Math.PI / 2;
                const ex = CX + R_MAX * Math.cos(angle);
                const ey = CY + R_MAX * Math.sin(angle);
                return (
                  <line key={ax} x1={CX} y1={CY} x2={ex} y2={ey}
                    stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                );
              })}

              {/* Left polygon */}
              <path
                d={leftPath}
                fill={`${left.color}28`}
                stroke={left.color}
                strokeWidth="1.6"
                style={{
                  transition: 'd 0.8s cubic-bezier(0.22,1,0.36,1)',
                  mixBlendMode: 'plus-lighter',
                  filter: `drop-shadow(0 0 6px ${left.color}60)`,
                }}
              />
              {/* Right polygon */}
              <path
                d={rightPath}
                fill={`${right.color}28`}
                stroke={right.color}
                strokeWidth="1.6"
                style={{
                  transition: 'd 0.8s cubic-bezier(0.22,1,0.36,1)',
                  mixBlendMode: 'plus-lighter',
                  filter: `drop-shadow(0 0 6px ${right.color}60)`,
                }}
              />

              {/* Vertex dots */}
              {AXES.map((ax, ai) => {
                const lp = getPoint(ai, left.scores[ax] || 0);
                const rp = getPoint(ai, right.scores[ax] || 0);
                return (
                  <g key={ax}>
                    <circle cx={lp.x} cy={lp.y} r={3} fill={left.color} />
                    <circle cx={rp.x} cy={rp.y} r={3} fill={right.color} />
                  </g>
                );
              })}

              {/* Center dot */}
              <circle cx={CX} cy={CY} r={2} fill="rgba(255,255,255,0.3)" />

              {/* Axis labels */}
              {AXES.map((ax, ai) => {
                const angle = (ai / AXES.length) * 2 * Math.PI - Math.PI / 2;
                const r = R_MAX + 22;
                const lx = CX + r * Math.cos(angle);
                const ly = CY + r * Math.sin(angle);
                const anchor = lx < CX - 5 ? 'end' : lx > CX + 5 ? 'start' : 'middle';
                return (
                  <text
                    key={ax}
                    x={lx} y={ly + 4}
                    textAnchor={anchor}
                    style={{
                      fontFamily: 'DM Sans', fontSize: 11,
                      fill: activeAxis === ax ? 'var(--indigo-3)' : 'rgba(240,235,224,0.5)',
                      cursor: 'pointer',
                    }}
                    onClick={() => setActiveAxis(activeAxis === ax ? null : ax)}
                  >
                    {ax}
                  </text>
                );
              })}
            </svg>

            {/* Axis pills */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
              {AXES.map(ax => (
                <button
                  key={ax}
                  data-testid={`axis-pill-${ax}`}
                  onClick={() => setActiveAxis(activeAxis === ax ? null : ax)}
                  style={{
                    padding: '3px 10px',
                    borderRadius: 9999,
                    border: '1px solid var(--border)',
                    background: activeAxis === ax ? 'var(--grad)' : 'transparent',
                    color: activeAxis === ax ? '#fff' : 'var(--cream-3)',
                    fontFamily: 'DM Sans', fontWeight: 500, fontSize: 11,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  {ax}
                </button>
              ))}
            </div>

            {/* Axis help text */}
            {activeAxis && (
              <div style={{
                maxWidth: 320,
                padding: '10px 14px',
                background: 'rgba(99,102,241,0.10)',
                border: '1px solid rgba(99,102,241,0.20)',
                borderRadius: 12,
                textAlign: 'center',
              }}>
                <div style={{ fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12, color: 'var(--indigo-3)', marginBottom: 4 }}>
                  {activeAxis}
                </div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)', lineHeight: 1.5 }}>
                  {AXIS_HELP[activeAxis]}
                </div>
              </div>
            )}
          </div>

          {/* Right panel */}
          <SidePanel coloniaKey={rightKey} setColoniaKey={setRightKey} side="right" />
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .comparator-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </section>
  );
}
