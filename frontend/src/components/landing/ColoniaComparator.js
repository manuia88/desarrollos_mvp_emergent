// ColoniaComparator — Radar battle, 8 colonias in picker, 6 axes
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import FadeUp from '../animations/FadeUp';
import BlurText from '../animations/BlurText';
import { COLONIAS_BY_KEY } from '../../data/colonias';

// Picker pool: 8 diverse colonias
const PICKER_KEYS = ['polanco', 'lomas-chapultepec', 'roma-norte', 'condesa', 'juarez', 'del-valle-centro', 'narvarte', 'coyoacan-centro'];

// Axes mapped to composite scores from data
const AXES = ['Movilidad', 'Seguridad', 'Comercio', 'Plusvalía', 'Educación', 'Riesgo'];
const AXIS_TO_KEY = {
  'Movilidad': 'movilidad', 'Seguridad': 'seguridad', 'Comercio': 'comercio',
  'Plusvalía': 'plusvalia', 'Educación': 'educacion', 'Riesgo': 'riesgo',
};

const CX = 170, CY = 170, R_MAX = 118;
const N_RINGS = 5;

function getPoint(axisIdx, val) {
  const angle = (axisIdx / AXES.length) * 2 * Math.PI - Math.PI / 2;
  const r = (val / 100) * R_MAX;
  return { x: CX + r * Math.cos(angle), y: CY + r * Math.sin(angle) };
}

function radarPath(colonia) {
  const pts = AXES.map((ax, i) => getPoint(i, colonia.scores[AXIS_TO_KEY[ax]] || 0));
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + ' Z';
}

function SidePanel({ coloniaKey, setColoniaKey, side, t }) {
  const c = COLONIAS_BY_KEY[coloniaKey];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
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

      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 16, color: 'var(--cream)', marginBottom: 2, letterSpacing: '-0.02em' }}>
          {c.name}
        </div>
        <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>
          {c.alcaldia}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, width: '100%' }}>
        {[
          { k: t('comparator.mini_price'), v: c.priceM2 },
          { k: t('comparator.mini_mom'), v: c.momentum },
        ].map(({ k, v }) => (
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

      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
        {PICKER_KEYS.map(k => {
          const col = COLONIAS_BY_KEY[k];
          const active = k === coloniaKey;
          return (
            <button
              key={k}
              data-testid={`comparator-pick-${side}-${k}`}
              onClick={() => setColoniaKey(k)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 10px',
                borderRadius: 9999,
                border: `1px solid ${active ? col.color + '60' : 'var(--border)'}`,
                background: active ? col.color + '15' : 'transparent',
                cursor: 'pointer',
                transition: 'background 0.2s, border-color 0.2s',
              }}
            >
              <div style={{ width: 8, height: 8, borderRadius: 9999, background: col.color, flexShrink: 0 }} />
              <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)', textAlign: 'left' }}>
                {col.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function ColoniaComparator() {
  const { t } = useTranslation();
  const [leftKey, setLeftKey] = useState('polanco');
  const [rightKey, setRightKey] = useState('roma-norte');
  const [activeAxis, setActiveAxis] = useState(null);

  const left = COLONIAS_BY_KEY[leftKey];
  const right = COLONIAS_BY_KEY[rightKey];

  const leftPath = radarPath(left);
  const rightPath = radarPath(right);

  return (
    <section data-testid="colonia-comparator" id="comparador" style={{
      padding: '80px 32px',
      background: 'linear-gradient(180deg, #0D1017, #06080F)',
      borderTop: '1px solid var(--border)',
      borderBottom: '1px solid var(--border)',
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <FadeUp>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div className="tag-pill" style={{ marginBottom: 16 }}>{t('comparator.eyebrow')}</div>
            <BlurText
              as="h2"
              gradientWords={['verdad.']}
              style={{
                fontFamily: 'Outfit', fontWeight: 800,
                fontSize: 'clamp(32px, 4.5vw, 54px)',
                lineHeight: 1.0, letterSpacing: '-0.028em',
                marginBottom: 16,
                justifyContent: 'center',
              }}
            >
              {`${t('comparator.h2_1')} ${t('comparator.h2_2')}`}
            </BlurText>
            <p style={{
              maxWidth: 620, margin: '0 auto',
              fontFamily: 'DM Sans', fontSize: 16, color: 'var(--cream-2)',
              lineHeight: 1.65,
            }}>
              {t('comparator.sub')}
            </p>
          </div>
        </FadeUp>

        <div
          data-testid="comparator-battle"
          style={{
            display: 'grid',
            gridTemplateColumns: '240px 1fr 240px',
            gap: 32,
            padding: 32,
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid var(--border)',
            borderRadius: 28,
            alignItems: 'start',
          }}
          className="comparator-grid"
        >
          <SidePanel coloniaKey={leftKey} setColoniaKey={setLeftKey} side="left" t={t} />

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <svg viewBox="0 0 340 340" style={{ width: '100%', maxWidth: 340, height: 340 }} data-testid="radar-svg">
              {Array.from({ length: N_RINGS }).map((_, ri) => {
                const r = ((ri + 1) / N_RINGS) * R_MAX;
                const ringPts = AXES.map((_, ai) => {
                  const angle = (ai / AXES.length) * 2 * Math.PI - Math.PI / 2;
                  return `${(CX + r * Math.cos(angle)).toFixed(1)},${(CY + r * Math.sin(angle)).toFixed(1)}`;
                });
                return (
                  <polygon key={ri} points={ringPts.join(' ')} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                );
              })}

              {AXES.map((ax, ai) => {
                const angle = (ai / AXES.length) * 2 * Math.PI - Math.PI / 2;
                const ex = CX + R_MAX * Math.cos(angle);
                const ey = CY + R_MAX * Math.sin(angle);
                return <line key={ax} x1={CX} y1={CY} x2={ex} y2={ey} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />;
              })}

              <path d={leftPath} fill={`${left.color}28`} stroke={left.color} strokeWidth="1.6"
                style={{ transition: 'd 0.8s cubic-bezier(0.22,1,0.36,1)', mixBlendMode: 'plus-lighter', filter: `drop-shadow(0 0 6px ${left.color}60)` }} />
              <path d={rightPath} fill={`${right.color}28`} stroke={right.color} strokeWidth="1.6"
                style={{ transition: 'd 0.8s cubic-bezier(0.22,1,0.36,1)', mixBlendMode: 'plus-lighter', filter: `drop-shadow(0 0 6px ${right.color}60)` }} />

              {AXES.map((ax, ai) => {
                const lp = getPoint(ai, left.scores[AXIS_TO_KEY[ax]] || 0);
                const rp = getPoint(ai, right.scores[AXIS_TO_KEY[ax]] || 0);
                return (
                  <g key={ax}>
                    <circle cx={lp.x} cy={lp.y} r={3} fill={left.color} />
                    <circle cx={rp.x} cy={rp.y} r={3} fill={right.color} />
                  </g>
                );
              })}

              <circle cx={CX} cy={CY} r={2} fill="rgba(255,255,255,0.3)" />

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
                    transition: 'background 0.2s, color 0.2s',
                  }}
                >
                  {ax}
                </button>
              ))}
            </div>

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
                  {t(`comparator.axis_help.${activeAxis}`)}
                </div>
              </div>
            )}
          </div>

          <SidePanel coloniaKey={rightKey} setColoniaKey={setRightKey} side="right" t={t} />
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .comparator-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  );
}
