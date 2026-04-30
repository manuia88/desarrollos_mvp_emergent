// ColoniasBento — Vinyl Tiles grid, 3 cols desktop
// Each tile: alcaldía label, name, momentum pill, score big, layer switcher, facts, sparkline, footer
import React, { useState } from 'react';
import useInView from '../../hooks/useInView';
import FadeUp from '../animations/FadeUp';
import BlurText from '../animations/BlurText';
import { ArrowRight } from '../icons';

const COLONIAS = [
  {
    id: 'del-valle-centro',
    name: 'Del Valle Centro',
    alcaldia: 'Benito Juárez',
    scores: { LIV: 87, MOV: 91, SEC: 74, ECO: 82 },
    price: '$58k', inventory: '142 unidades',
    mom: { pct: '+6%', positive: true },
    trend: [52,53,54,54,55,56,56,55,56,57,58,58,58,58,58,58,57,58,58,59,58,58,58,58],
    facts: {
      LIV: [
        { k: 'Parques a 10 min', v: '8' },
        { k: 'Amenidades', v: '412' },
        { k: 'Ruido promedio', v: '58 dB' },
      ],
      MOV: [
        { k: 'Estaciones Metro', v: '3' },
        { k: 'Ecobici', v: '14 cicloestaciones' },
        { k: 'Tiempo a Reforma', v: '22 min' },
      ],
      SEC: [
        { k: 'Incidentes / 100k hab', v: '42' },
        { k: 'Cobertura C5', v: '28 cámaras' },
        { k: 'Alumbrado público', v: '94%' },
      ],
      ECO: [
        { k: 'Restaurantes y cafés', v: '312' },
        { k: 'Supermercados', v: '7' },
        { k: 'Vida nocturna', v: 'Alta' },
      ],
    },
  },
  {
    id: 'condesa',
    name: 'Condesa',
    alcaldia: 'Cuauhtémoc',
    scores: { LIV: 92, MOV: 88, SEC: 76, ECO: 94 },
    price: '$72k', inventory: '89 unidades',
    mom: { pct: '+4%', positive: true },
    trend: [62,63,64,65,65,66,67,68,68,68,69,70,70,71,72,72,71,72,72,73,72,72,72,72],
    facts: {
      LIV: [
        { k: 'Parques a 10 min', v: '12' },
        { k: 'Amenidades', v: '681' },
        { k: 'Ruido promedio', v: '54 dB' },
      ],
      MOV: [
        { k: 'Estaciones Metro', v: '2' },
        { k: 'Ecobici', v: '22 cicloestaciones' },
        { k: 'Tiempo a Reforma', v: '18 min' },
      ],
      SEC: [
        { k: 'Incidentes / 100k hab', v: '38' },
        { k: 'Cobertura C5', v: '35 cámaras' },
        { k: 'Alumbrado público', v: '97%' },
      ],
      ECO: [
        { k: 'Restaurantes y cafés', v: '524' },
        { k: 'Supermercados', v: '9' },
        { k: 'Vida nocturna', v: 'Muy alta' },
      ],
    },
  },
  {
    id: 'roma-norte',
    name: 'Roma Norte',
    alcaldia: 'Cuauhtémoc',
    scores: { LIV: 90, MOV: 85, SEC: 72, ECO: 91 },
    price: '$68k', inventory: '115 unidades',
    mom: { pct: '+8%', positive: true },
    trend: [56,57,58,59,60,61,62,62,63,64,64,65,66,66,67,67,67,68,68,68,68,68,68,68],
    facts: {
      LIV: [
        { k: 'Parques a 10 min', v: '9' },
        { k: 'Amenidades', v: '537' },
        { k: 'Ruido promedio', v: '56 dB' },
      ],
      MOV: [
        { k: 'Estaciones Metro', v: '3' },
        { k: 'Ecobici', v: '18 cicloestaciones' },
        { k: 'Tiempo a Reforma', v: '15 min' },
      ],
      SEC: [
        { k: 'Incidentes / 100k hab', v: '47' },
        { k: 'Cobertura C5', v: '31 cámaras' },
        { k: 'Alumbrado público', v: '91%' },
      ],
      ECO: [
        { k: 'Restaurantes y cafés', v: '489' },
        { k: 'Supermercados', v: '8' },
        { k: 'Vida nocturna', v: 'Muy alta' },
      ],
    },
  },
];

const LAYERS = ['LIV', 'MOV', 'SEC', 'ECO'];
const LAYER_LABELS = { LIV: 'Calidad de vida', MOV: 'Movilidad', SEC: 'Seguridad', ECO: 'Comercio' };

function Sparkline({ trend }) {
  if (!trend || trend.length === 0) return null;
  const w = 200, h = 48;
  const min = Math.min(...trend);
  const max = Math.max(...trend);
  const range = max - min || 1;
  const pts = trend.map((v, i) => {
    const x = (i / (trend.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 8) - 4;
    return `${x},${y}`;
  });
  const areaPath = `M${pts[0]} ${pts.slice(1).map(p => `L${p}`).join(' ')} L${w},${h} L0,${h} Z`;
  const linePath = `M${pts.join(' L')}`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: h, display: 'block' }}>
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6366F1" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#6366F1" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="spark-line" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#6366F1" />
          <stop offset="100%" stopColor="#EC4899" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#spark-fill)" />
      <path d={linePath} fill="none" stroke="url(#spark-line)" strokeWidth="1.5" />
    </svg>
  );
}

function ColoniaCard({ colonia, index }) {
  const [layer, setLayer] = useState('LIV');
  const [ref, inView] = useInView({ once: true, amount: 0.2 });

  const score = colonia.scores[layer];

  return (
    <div
      ref={ref}
      className="card breath"
      data-testid={`colonia-card-${colonia.id}`}
      style={{
        minHeight: 580,
        display: 'flex', flexDirection: 'column',
        opacity: inView ? 1 : 0,
        transform: inView ? 'translateY(0)' : 'translateY(30px)',
        filter: inView ? 'blur(0)' : 'blur(6px)',
        transition: 'opacity 0.7s cubic-bezier(0.22,1,0.36,1), transform 0.7s cubic-bezier(0.22,1,0.36,1), filter 0.7s',
        transitionDelay: `${index * 0.1}s`,
      }}
    >
      {/* Top hero */}
      <div style={{ padding: '22px 22px 16px', position: 'relative' }}>
        {/* Momentum pill top-right */}
        <div style={{ position: 'absolute', top: 18, right: 18 }}>
          <span className={colonia.mom.positive ? 'mom-pill mom-up' : 'mom-pill mom-dn'}>
            {colonia.mom.pct}
          </span>
        </div>

        {/* Alcaldía */}
        <div className="eyebrow" style={{ marginBottom: 6 }}>{colonia.alcaldia}</div>

        {/* Name */}
        <div style={{
          fontFamily: 'Outfit', fontWeight: 800, fontSize: 22,
          color: 'var(--cream)', marginBottom: 16,
          letterSpacing: '-0.025em',
        }}>
          {colonia.name}
        </div>

        {/* Score big */}
        <div style={{
          fontFamily: 'Outfit', fontWeight: 800, fontSize: 68,
          lineHeight: 0.9, letterSpacing: '-0.045em',
          background: 'var(--grad)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          marginBottom: 6,
        }}>
          {score}
        </div>
        <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>
          {LAYER_LABELS[layer]} · Score DMX
        </div>

        {/* Help box */}
        <div style={{
          marginTop: 12,
          padding: '8px 12px',
          background: 'rgba(99,102,241,0.06)',
          border: '1px solid rgba(99,102,241,0.16)',
          borderRadius: 10,
        }}>
          <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>
            Score calculado con 97+ variables de DENUE, C5, GTFS, SEDUVI
          </span>
        </div>
      </div>

      {/* Layer switcher */}
      <div style={{
        display: 'flex', gap: 4,
        padding: '0 16px',
        marginBottom: 16,
      }}>
        {LAYERS.map(l => (
          <button
            key={l}
            data-testid={`layer-${colonia.id}-${l}`}
            onClick={() => setLayer(l)}
            style={{
              flex: 1,
              padding: '5px 0',
              borderRadius: 9999,
              border: `1px solid ${layer === l ? 'var(--indigo)' : 'var(--border)'}`,
              background: layer === l ? 'var(--grad)' : 'transparent',
              color: layer === l ? '#fff' : 'var(--cream-3)',
              fontFamily: 'Outfit', fontWeight: 700, fontSize: 10.5,
              letterSpacing: '0.12em', textTransform: 'uppercase',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {l}
          </button>
        ))}
      </div>

      {/* Facts */}
      <div style={{ padding: '0 20px', marginBottom: 16, flex: 1 }}>
        {(colonia.facts[layer] || []).map(({ k, v }) => (
          <div key={k} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '8px 0',
            borderBottom: '1px solid var(--border)',
          }}>
            <span style={{ fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)' }}>{k}</span>
            <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: 'var(--cream)' }}>{v}</span>
          </div>
        ))}
      </div>

      {/* Sparkline / Lifeline */}
      <div style={{ padding: '0 20px', marginBottom: 16 }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Precio m² — 24 meses</div>
        <Sparkline trend={colonia.trend} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10, color: 'var(--cream-3)' }}>
            ${colonia.trend[0]}k
          </span>
          <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10, color: 'var(--indigo-3)' }}>
            ${colonia.trend[colonia.trend.length - 1]}k
          </span>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        padding: '14px 20px',
        borderTop: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', gap: 20 }}>
          <div>
            <div className="eyebrow" style={{ fontSize: 9 }}>Precio m²</div>
            <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 15, color: 'var(--cream)' }}>{colonia.price}</div>
          </div>
          <div>
            <div className="eyebrow" style={{ fontSize: 9 }}>Inventario</div>
            <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 15, color: 'var(--cream)' }}>{colonia.inventory}</div>
          </div>
        </div>
        <button
          data-testid={`colonia-card-btn-${colonia.id}`}
          style={{
            width: 36, height: 36,
            borderRadius: 9999,
            background: 'var(--grad)',
            border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
            transition: 'transform 0.2s, filter 0.2s',
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
        >
          <ArrowRight size={16} color="#fff" />
        </button>
      </div>
    </div>
  );
}

export default function ColoniasBento() {
  return (
    <section data-testid="colonias-bento" id="colonias" style={{ padding: '80px 32px', background: 'var(--bg)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        {/* Section header */}
        <FadeUp>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div className="tag-pill" style={{ marginBottom: 16 }}>Inteligencia por colonia</div>
            <BlurText
              as="h2"
              gradientWords={['mes.']}
              style={{
                fontFamily: 'Outfit', fontWeight: 800,
                fontSize: 'clamp(32px, 4.5vw, 54px)',
                lineHeight: 1.0, letterSpacing: '-0.028em',
                marginBottom: 16,
                justifyContent: 'center',
              }}
            >
              Las colonias más activas este mes.
            </BlurText>
            <p style={{
              maxWidth: 640, margin: '0 auto',
              fontFamily: 'DM Sans', fontSize: 16, color: 'var(--cream-2)',
              lineHeight: 1.65, textWrap: 'pretty',
            }}>
              Cada colonia tiene 4 scores compuestos — LIV, MOV, SEC, ECO — calculados desde más de 97 variables de fuentes oficiales (DENUE, C5, GTFS, SEDUVI). Cambia la capa en cada tarjeta y verás los datos duros que alimentan el score.
            </p>
          </div>
        </FadeUp>

        {/* Bento grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 24,
        }} className="colonias-grid">
          {COLONIAS.map((c, i) => (
            <ColoniaCard key={c.id} colonia={c} index={i} />
          ))}
        </div>

        {/* See all link */}
        <FadeUp delay={0.4} style={{ textAlign: 'center', marginTop: 32 }}>
          <a
            href="#"
            data-testid="colonias-see-all"
            style={{
              fontFamily: 'DM Sans', fontWeight: 500, fontSize: 14,
              color: 'var(--indigo-3)',
              textDecoration: 'none',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            Ver las 18 colonias <ArrowRight size={14} color="var(--indigo-3)" />
          </a>
        </FadeUp>
      </div>

      <style>{`
        @media (max-width: 960px) { .colonias-grid { grid-template-columns: repeat(2, 1fr) !important; } }
        @media (max-width: 640px) { .colonias-grid { grid-template-columns: 1fr !important; } }
      `}</style>
    </section>
  );
}
