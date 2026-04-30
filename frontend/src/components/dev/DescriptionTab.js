// Tab 1 — Descripción: stats row + description + project stage timeline + price history + developer card
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchDeveloper } from '../../api/marketplace';
import { Bed, Bath, Car, Ruler, Calendar, Shield, Leaf, Database } from '../icons';

export default function DescriptionTab({ dev }) {
  const { t } = useTranslation();
  const [developer, setDeveloper] = useState(null);

  useEffect(() => {
    if (!dev.developer_id) return;
    fetchDeveloper(dev.developer_id).then(setDeveloper).catch(() => setDeveloper(null));
  }, [dev.developer_id]);

  const statsCards = [
    { Icon: Ruler, val: `${dev.m2_range[0]}-${dev.m2_range[1]}`, unit: 'm²' },
    { Icon: Bed, val: `${dev.bedrooms_range[0]}-${dev.bedrooms_range[1]}`, unit: 'rec' },
    { Icon: Car, val: `${dev.parking_range[0]}-${dev.parking_range[1]}`, unit: 'cajones' },
    { Icon: Calendar, val: dev.delivery_estimate, unit: t('dev.delivery') },
  ];

  // Project stage milestones
  const stages = [
    { key: 'design', label: 'Diseño' },
    { key: 'permits', label: 'Permisos' },
    { key: 'construction', label: 'Construcción' },
    { key: 'finishing', label: 'Acabados' },
    { key: 'delivery', label: 'Entrega' },
  ];
  const progress = dev.construction_progress?.percentage ?? 0;
  const currentStageIdx = progress < 5 ? 0 : progress < 15 ? 1 : progress < 75 ? 2 : progress < 95 ? 3 : 4;

  const history = dev.price_history || [];
  const firstPrice = history[0]?.price || dev.price_from;
  const lastPrice = history[history.length - 1]?.price || dev.price_from;
  const pct = firstPrice ? Math.round(((lastPrice - firstPrice) / firstPrice) * 100) : 0;

  // Mini chart
  const chartW = 420, chartH = 110;
  const hMin = Math.min(...history.map(h => h.price));
  const hMax = Math.max(...history.map(h => h.price));
  const range = hMax - hMin || 1;
  const pts = history.map((h, i) => {
    const x = history.length > 1 ? (i / (history.length - 1)) * (chartW - 30) + 15 : chartW / 2;
    const y = chartH - 20 - ((h.price - hMin) / range) * (chartH - 40);
    return { x, y, ...h };
  });
  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${pts[pts.length - 1].x.toFixed(1)},${chartH - 10} L${pts[0].x.toFixed(1)},${chartH - 10} Z`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }} className="stats-row">
        {statsCards.map(({ Icon, val, unit }, i) => (
          <div key={i} style={{
            padding: 18,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            display: 'flex', flexDirection: 'column', gap: 6,
          }}>
            <Icon size={16} color="var(--indigo-3)" />
            <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 20, color: 'var(--cream)', letterSpacing: '-0.02em' }}>
              {val}
            </div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {unit}
            </div>
          </div>
        ))}
      </div>

      {/* Description */}
      <div>
        <div className="eyebrow" style={{ marginBottom: 10 }}>{t('dev.description_h')}</div>
        <p style={{ fontFamily: 'DM Sans', fontSize: 15, color: 'var(--cream-2)', lineHeight: 1.7, textWrap: 'pretty' }}>
          {dev.description}
        </p>
      </div>

      {/* Project stage timeline */}
      <div>
        <div className="eyebrow" style={{ marginBottom: 14 }}>{t('dev.stage_timeline_h')}</div>
        <div style={{ position: 'relative', padding: '24px 0 16px' }}>
          <div style={{
            position: 'absolute', top: 34, left: '8%', right: '8%', height: 2,
            background: 'var(--border-2)',
          }} />
          <div style={{
            position: 'absolute', top: 34, left: '8%',
            width: `${(currentStageIdx / (stages.length - 1)) * 84}%`, height: 2,
            background: 'var(--grad)',
            transition: 'width 0.8s cubic-bezier(0.22,1,0.36,1)',
          }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative' }}>
            {stages.map((s, i) => {
              const done = i < currentStageIdx;
              const active = i === currentStageIdx;
              return (
                <div key={s.key} style={{ flex: 1, textAlign: 'center', position: 'relative' }}>
                  <div style={{
                    width: done || active ? 22 : 16,
                    height: done || active ? 22 : 16,
                    margin: '0 auto 8px',
                    borderRadius: 9999,
                    background: active ? 'var(--grad)' : done ? 'var(--indigo-3)' : 'var(--bg-3)',
                    border: done || active ? 'none' : '2px solid var(--border-2)',
                    transition: 'all 0.4s',
                    boxShadow: active ? '0 0 16px rgba(99,102,241,0.6)' : 'none',
                  }} />
                  <div style={{
                    fontFamily: 'DM Sans', fontSize: 11, fontWeight: active ? 600 : 500,
                    color: active ? 'var(--indigo-3)' : done ? 'var(--cream-2)' : 'var(--cream-3)',
                  }}>
                    {s.label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Price history chart */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14 }}>
          <div className="eyebrow">{t('dev.price_history_h')}</div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '3px 10px',
            background: pct >= 0 ? 'rgba(34,197,94,0.14)' : 'rgba(239,68,68,0.14)',
            border: `1px solid ${pct >= 0 ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}`,
            borderRadius: 9999,
            fontFamily: 'Outfit', fontWeight: 700, fontSize: 11,
            color: pct >= 0 ? '#86efac' : '#fca5a5',
          }}>
            {pct >= 0 ? '↑' : '↓'} {pct >= 0 ? '+' : ''}{pct}% desde lanzamiento
          </div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
          <svg viewBox={`0 0 ${chartW} ${chartH}`} style={{ width: '100%', height: 140 }}>
            <defs>
              <linearGradient id="ph-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366F1" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#6366F1" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="ph-line" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#6366F1" /><stop offset="100%" stopColor="#EC4899" />
              </linearGradient>
            </defs>
            <path d={areaPath} fill="url(#ph-area)" />
            <path d={linePath} fill="none" stroke="url(#ph-line)" strokeWidth={2} />
            {pts.map((p, i) => (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r={4} fill="#EC4899" />
                <text x={p.x} y={p.y - 10} textAnchor="middle" style={{ fontFamily: 'DM Sans', fontSize: 10, fill: 'var(--cream-2)' }}>
                  ${Math.round(p.price / 1e6)}M
                </text>
                <text x={p.x} y={chartH - 2} textAnchor="middle" style={{ fontFamily: 'DM Sans', fontSize: 9, fill: 'var(--cream-3)' }}>
                  {p.date}
                </text>
              </g>
            ))}
          </svg>
        </div>
      </div>

      {/* Developer card */}
      {developer && (
        <div style={{
          background: 'linear-gradient(140deg, rgba(99,102,241,0.08), rgba(236,72,153,0.04))',
          border: '1px solid var(--border)',
          borderRadius: 18,
          padding: 22,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
            <div style={{
              width: 52, height: 52, borderRadius: 14,
              background: `linear-gradient(135deg, hsl(${developer.logo_hue || 231},70%,55%), hsl(${(developer.logo_hue + 40) % 360},70%,42%))`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: '#fff',
            }}>
              {developer.name[0]}
            </div>
            <div>
              <div className="eyebrow" style={{ marginBottom: 2 }}>{t('dev.dev_by')}</div>
              <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 20, color: 'var(--cream)', letterSpacing: '-0.02em' }}>
                {developer.name}
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>
                Desarrolladora · CDMX · desde {developer.founded_year}
              </div>
            </div>
          </div>

          <p style={{ fontFamily: 'DM Sans', fontSize: 13.5, color: 'var(--cream-2)', lineHeight: 1.65, marginBottom: 16 }}>
            {developer.description}
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {[
              { k: developer.verified_constitution, label: 'Constitución legal verificada', Icon: Shield },
              { k: developer.no_judicial_records, label: 'Sin antecedentes judiciales', Icon: Leaf },
              { k: developer.no_profeco_complaints, label: 'Sin quejas PROFECO', Icon: Database },
            ].filter(x => x.k).map(({ label, Icon }, i) => (
              <div key={i} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '5px 10px',
                background: 'rgba(34,197,94,0.10)',
                border: '1px solid rgba(34,197,94,0.30)',
                borderRadius: 9999,
              }}>
                <Icon size={11} color="#86efac" />
                <span style={{ fontFamily: 'DM Sans', fontWeight: 500, fontSize: 11.5, color: '#86efac' }}>{label}</span>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {[
              { k: t('dev.dev_stats.delivered'), v: developer.projects_delivered },
              { k: t('dev.dev_stats.units'), v: (developer.units_sold || 0).toLocaleString('es-MX') },
              { k: t('dev.dev_stats.years'), v: developer.years_experience },
            ].map(({ k, v }) => (
              <div key={k} style={{ padding: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 10, textAlign: 'center' }}>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: 'var(--cream)', letterSpacing: '-0.02em' }}>{v}</div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{k}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`@media (max-width: 640px) { .stats-row { grid-template-columns: repeat(2, 1fr) !important; } }`}</style>
    </div>
  );
}
