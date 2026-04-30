// ColoniasBento — 6 diverse CDMX colonias with Vida/Movilidad/Seguridad/Comercio layers
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import useInView from '../../hooks/useInView';
import FadeUp from '../animations/FadeUp';
import BlurText from '../animations/BlurText';
import { ArrowRight, Leaf, Route, Shield, Store } from '../icons';
import { COLONIAS, LAYER_FACTS } from '../../data/colonias';

// Pick 6 diverse colonias for the bento grid
const FEATURED_KEYS = ['polanco', 'roma-norte', 'condesa', 'del-valle-centro', 'juarez', 'narvarte'];
const LAYERS = ['vida', 'movilidad', 'seguridad', 'comercio'];
const LAYER_ICON = { vida: Leaf, movilidad: Route, seguridad: Shield, comercio: Store };

function Sparkline({ trend }) {
  if (!trend || trend.length === 0) return null;
  const w = 200, h = 48;
  const min = Math.min(...trend), max = Math.max(...trend);
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
  const { t } = useTranslation();
  const [layer, setLayer] = useState('vida');
  const [ref, inView] = useInView({ once: true, amount: 0.2 });

  const score = colonia.scores[layer];
  const facts = LAYER_FACTS[layer](colonia);

  return (
    <div
      ref={ref}
      className="card breath"
      data-testid={`colonia-card-${colonia.key}`}
      style={{
        minHeight: 580,
        display: 'flex', flexDirection: 'column',
        opacity: inView ? 1 : 0,
        transform: inView ? 'translateY(0)' : 'translateY(30px)',
        filter: inView ? 'blur(0)' : 'blur(6px)',
        transition: 'opacity 0.7s cubic-bezier(0.22,1,0.36,1), transform 0.7s cubic-bezier(0.22,1,0.36,1), filter 0.7s',
        transitionDelay: `${index * 0.08}s`,
      }}
    >
      <div style={{ padding: '22px 22px 16px', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 18, right: 18 }}>
          <span className={colonia.momentumPositive ? 'mom-pill mom-up' : 'mom-pill mom-dn'}>
            {colonia.momentum}
          </span>
        </div>

        <div className="eyebrow" style={{ marginBottom: 6 }}>{colonia.alcaldia}</div>

        <div style={{
          fontFamily: 'Outfit', fontWeight: 800, fontSize: 22,
          color: 'var(--cream)', marginBottom: 16,
          letterSpacing: '-0.025em',
        }}>
          {colonia.name}
        </div>

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
          {t(`bento.layers.${layer}`)} · {t('bento.layer_caption')}
        </div>

        <div style={{
          marginTop: 12,
          padding: '8px 12px',
          background: 'rgba(99,102,241,0.06)',
          border: '1px solid rgba(99,102,241,0.16)',
          borderRadius: 10,
        }}>
          <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>
            {t('bento.help')}
          </span>
        </div>
      </div>

      <div style={{
        display: 'flex', gap: 4,
        padding: '0 16px',
        marginBottom: 16,
      }}>
        {LAYERS.map(l => {
          const Icon = LAYER_ICON[l];
          const active = layer === l;
          return (
            <button
              key={l}
              data-testid={`layer-${colonia.key}-${l}`}
              onClick={() => setLayer(l)}
              style={{
                flex: 1,
                padding: '6px 4px',
                borderRadius: 9999,
                border: `1px solid ${active ? 'var(--indigo)' : 'var(--border)'}`,
                background: active ? 'var(--grad)' : 'transparent',
                color: active ? '#fff' : 'var(--cream-3)',
                fontFamily: 'DM Sans', fontWeight: 600, fontSize: 11,
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              }}
            >
              <Icon size={11} color="currentColor" />
              <span>{t(`bento.layers.${l}`)}</span>
            </button>
          );
        })}
      </div>

      <div style={{ padding: '0 20px', marginBottom: 16, flex: 1 }}>
        {facts.map(({ k, v }) => (
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

      <div style={{ padding: '0 20px', marginBottom: 16 }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>{t('bento.trend_label')}</div>
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

      <div style={{
        padding: '14px 20px',
        borderTop: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', gap: 20 }}>
          <div>
            <div className="eyebrow" style={{ fontSize: 9 }}>{t('bento.pm2_label')}</div>
            <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 15, color: 'var(--cream)' }}>{colonia.priceM2}</div>
          </div>
          <div>
            <div className="eyebrow" style={{ fontSize: 9 }}>{t('bento.inv_label')}</div>
            <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 15, color: 'var(--cream)' }}>{colonia.inventory}</div>
          </div>
        </div>
        <button
          data-testid={`colonia-card-btn-${colonia.key}`}
          style={{
            width: 36, height: 36,
            borderRadius: 9999,
            background: 'var(--grad)',
            border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
            transition: 'transform 0.2s',
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
  const { t } = useTranslation();
  const featured = FEATURED_KEYS.map(k => COLONIAS.find(c => c.key === k)).filter(Boolean);

  return (
    <section data-testid="colonias-bento" id="barrios" style={{ padding: '80px 32px', background: 'var(--bg)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <FadeUp>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div className="tag-pill" style={{ marginBottom: 16 }}>{t('bento.eyebrow')}</div>
            <BlurText
              as="h2"
              gradientWords={['analítico.']}
              style={{
                fontFamily: 'Outfit', fontWeight: 800,
                fontSize: 'clamp(32px, 4.5vw, 54px)',
                lineHeight: 1.0, letterSpacing: '-0.028em',
                marginBottom: 16,
                justifyContent: 'center',
              }}
            >
              {`${t('bento.h2_1')} ${t('bento.h2_2')}`}
            </BlurText>
            <p style={{
              maxWidth: 680, margin: '0 auto',
              fontFamily: 'DM Sans', fontSize: 16, color: 'var(--cream-2)',
              lineHeight: 1.65, textWrap: 'pretty',
            }}>
              {t('bento.sub')}
            </p>
          </div>
        </FadeUp>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 24,
        }} className="colonias-grid">
          {featured.map((c, i) => (
            <ColoniaCard key={c.key} colonia={c} index={i} />
          ))}
        </div>

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
            {t('bento.see_all')} <ArrowRight size={14} color="var(--indigo-3)" />
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
