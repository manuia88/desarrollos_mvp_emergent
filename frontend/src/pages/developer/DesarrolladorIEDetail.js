// /desarrollador/desarrollos/:slug/ie — Phase 4.16
// 12 IE scores breakdown + drill-down + benchmark comparison + AI recommendations
import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import DeveloperLayout from '../../components/developer/DeveloperLayout';
import { PageHeader, Card, Badge } from '../../components/advisor/primitives';
import * as api from '../../api/developer';
import { Sparkle, ArrowRight, X, Target, Activity, TrendUp, TrendDown } from '../../components/icons';

const TIER_COLORS = {
  excellent: { fg: '#86efac', bg: 'rgba(34,197,94,0.14)', bd: 'rgba(34,197,94,0.35)' },
  good:      { fg: '#fef08a', bg: 'rgba(234,179,8,0.14)', bd: 'rgba(234,179,8,0.35)' },
  fair:      { fg: '#fdba74', bg: 'rgba(249,115,22,0.14)', bd: 'rgba(249,115,22,0.35)' },
  poor:      { fg: '#fca5a5', bg: 'rgba(239,68,68,0.14)', bd: 'rgba(239,68,68,0.35)' },
};

const CAT_LABELS = {
  fundamentals: 'Fundamentales',
  market:       'Mercado',
  risk:         'Riesgo',
  sentiment:    'Sentimiento',
};

export default function DesarrolladorIEDetail({ user, onLogout }) {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [drillScore, setDrillScore] = useState(null);
  const [drillData, setDrillData] = useState(null);

  useEffect(() => {
    if (!slug) return;
    api.getIEBreakdown(slug).then(setData).catch(() => setData({ error: true }));
  }, [slug]);

  const openDrill = async (score) => {
    setDrillScore(score);
    setDrillData(null);
    try {
      const r = await api.getIEImprove(slug, score.code);
      setDrillData(r);
    } catch (e) { setDrillData({ error: true }); }
  };

  if (!data) return <DeveloperLayout user={user} onLogout={onLogout}><div style={{ padding: 60, textAlign: 'center', color: 'var(--cream-3)' }}>Cargando…</div></DeveloperLayout>;
  if (data.error) return <DeveloperLayout user={user} onLogout={onLogout}><Card style={{ padding: 40, textAlign: 'center', color: '#fca5a5' }}>Error cargando IE</Card></DeveloperLayout>;

  const tier = TIER_COLORS[data.overall_tier] || TIER_COLORS.fair;

  return (
    <DeveloperLayout user={user} onLogout={onLogout}>
      <div style={{ marginBottom: 22 }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>
          <Link to="/desarrollador/inventario" style={{ color: 'var(--cream-3)', textDecoration: 'none' }}>
            Inventario
          </Link>
          {' / '}
          <Link to={`/desarrollador/desarrollos/${slug}/legajo`} style={{ color: 'var(--cream-3)', textDecoration: 'none' }}>
            {data.project_name}
          </Link>
          {' / IE Score detallado'}
        </div>
        <h1 data-testid="ie-h1" style={{
          fontFamily: 'Outfit', fontWeight: 800, fontSize: 30,
          color: 'var(--cream)', letterSpacing: '-0.025em', margin: '4px 0 6px',
        }}>
          IE Score · {data.project_name}
        </h1>
        <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)', maxWidth: 720, lineHeight: 1.55 }}>
          Inteligencia Espacial: 12 scores agrupados en 4 categorías. Click en cualquier score para recomendaciones IA para mejorarlo.
        </p>
      </div>

      {/* Overall score card */}
      <Card data-testid="ie-overall" style={{ marginBottom: 18, background: `linear-gradient(140deg, ${tier.bg}, transparent)`, border: `1px solid ${tier.bd}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
          <div>
            <div className="eyebrow">SCORE GENERAL IE · {data.colonia}</div>
            <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 58, color: tier.fg, letterSpacing: '-0.04em', lineHeight: 1, marginTop: 4 }}>
              {data.overall_score}
            </div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)', marginTop: 6 }}>
              Tier: <strong style={{ color: tier.fg, textTransform: 'capitalize' }}>{data.overall_tier}</strong> · {data.categories.reduce((a, c) => a + c.scores.length, 0)} scores analizados
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {data.categories.map(c => (
              <div key={c.key} style={{ padding: '10px 14px', background: 'rgba(13,17,24,0.6)', border: '1px solid var(--border)', borderRadius: 12, minWidth: 110 }}>
                <div className="eyebrow" style={{ marginBottom: 3, fontSize: 9 }}>{CAT_LABELS[c.key] || c.label}</div>
                <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 20, color: 'var(--cream)' }}>{c.avg}</div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Categories */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 14 }}>
        {data.categories.map(cat => (
          <Card key={cat.key} data-testid={`ie-cat-${cat.key}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
              <div>
                <div className="eyebrow">{CAT_LABELS[cat.key] || cat.label}</div>
                <h3 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 17, color: 'var(--cream)', margin: '4px 0 0' }}>
                  Promedio {cat.avg}
                </h3>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {cat.scores.map(s => {
                const t = TIER_COLORS[s.tier] || TIER_COLORS.fair;
                return (
                  <button
                    key={s.code}
                    data-testid={`ie-score-${s.code}`}
                    onClick={() => openDrill(s)}
                    style={{
                      width: '100%', textAlign: 'left', cursor: 'pointer',
                      padding: 12, borderRadius: 10,
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid var(--border)',
                      display: 'grid', gridTemplateColumns: '1fr auto auto', alignItems: 'center', gap: 10,
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                  >
                    <div>
                      <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream)', fontWeight: 600 }}>
                        {s.name} <span style={{ color: 'var(--cream-3)', fontWeight: 400, fontFamily: 'DM Mono, monospace', fontSize: 10 }}>· {s.code}</span>
                      </div>
                      <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', marginTop: 2 }}>
                        vs colonia {s.benchmark_colonia} · delta{' '}
                        <span style={{ color: s.delta_vs_colonia > 0 ? '#86efac' : s.delta_vs_colonia < 0 ? '#fca5a5' : 'var(--cream-3)' }}>
                          {s.delta_vs_colonia > 0 ? '+' : ''}{s.delta_vs_colonia}
                        </span>
                        {s.is_stub && <span style={{ marginLeft: 6, padding: '1px 5px', background: 'rgba(251,191,36,0.14)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 4, color: '#fcd34d', fontSize: 9 }}>PILOTO</span>}
                      </div>
                    </div>
                    <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: t.fg }}>
                      {s.value}
                    </div>
                    <ArrowRight size={13} color="var(--cream-3)" />
                  </button>
                );
              })}
            </div>
          </Card>
        ))}
      </div>

      {drillScore && (
        <DrillDownModal
          score={drillScore}
          data={drillData}
          onClose={() => { setDrillScore(null); setDrillData(null); }}
        />
      )}
    </DeveloperLayout>
  );
}

function DrillDownModal({ score, data, onClose }) {
  const tier = TIER_COLORS[score.tier] || TIER_COLORS.fair;
  return (
    <div
      data-testid="ie-drill-modal"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 700, background: 'rgba(8,10,18,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#0D1118', border: '1px solid var(--border)',
        borderRadius: 16, padding: 22, maxWidth: 640, width: '100%', maxHeight: '88vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div className="eyebrow">DRILL-DOWN · {score.code}</div>
            <h3 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 20, color: 'var(--cream)', margin: '4px 0 0' }}>
              {score.name}
            </h3>
          </div>
          <button onClick={onClose} data-testid="ie-drill-close" style={{ background: 'transparent', border: 'none', color: 'var(--cream-3)', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 18 }}>
          <MiniMetric label="Mi proyecto" v={score.value} color={tier.fg} />
          <MiniMetric label="Colonia benchmark" v={score.benchmark_colonia} color="var(--cream-2)" />
          <MiniMetric
            label="Delta"
            v={`${score.delta_vs_colonia > 0 ? '+' : ''}${score.delta_vs_colonia}`}
            color={score.delta_vs_colonia > 0 ? '#86efac' : score.delta_vs_colonia < 0 ? '#fca5a5' : 'var(--cream-2)'}
          />
        </div>

        {!data ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--cream-3)' }}>Cargando recomendaciones IA…</div>
         : data.error ? <div style={{ padding: 20, color: '#fca5a5' }}>Error al cargar recomendaciones.</div>
         : (
          <>
            <div style={{ padding: 14, background: 'linear-gradient(140deg, rgba(236,72,153,0.08), transparent)', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Sparkle size={13} color="#f9a8d4" />
                <div className="eyebrow" style={{ marginBottom: 0 }}>NARRATIVA IA</div>
              </div>
              <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-2)', lineHeight: 1.6 }}>
                {data.narrative_stub}
              </div>
            </div>

            <div className="eyebrow" style={{ marginBottom: 10 }}>CÓMO MEJORAR ESTE SCORE</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {data.recommendations.map((r, i) => (
                <div key={i} data-testid={`ie-rec-${i}`} style={{
                  padding: 14, borderRadius: 12,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--border)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
                    <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)', flex: 1 }}>
                      {r.title}
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <Badge tone={r.impact === 'alto' ? 'ok' : 'neutral'}>Impacto {r.impact}</Badge>
                      <Badge tone={r.effort === 'baja' ? 'ok' : r.effort === 'alta' ? 'bad' : 'warn'}>Esfuerzo {r.effort}</Badge>
                    </div>
                  </div>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)', lineHeight: 1.55 }}>
                    {r.detail}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MiniMetric({ label, v, color }) {
  return (
    <div style={{ padding: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 10, textAlign: 'center' }}>
      <div className="eyebrow" style={{ fontSize: 9, marginBottom: 3 }}>{label}</div>
      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color }}>{v}</div>
    </div>
  );
}
