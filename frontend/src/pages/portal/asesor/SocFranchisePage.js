/**
 * W6.MOV.1 · SocFranchisePage · /portal/asesor/soc
 * Hero my score + level · breakdown 5 dimensiones · tips · leaderboard with self highlighted.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SocBadge from '../../../components/franchise/SocBadge';
import SocLeaderboard from '../../../components/franchise/SocLeaderboard';
import { getMyScore } from '../../../api/socFranchise';

const BG = '#06080F';
const CREAM = '#F0EBE0';
const MUTED = 'rgba(240,235,224,0.62)';
const MUTED_2 = 'rgba(240,235,224,0.45)';
const CARD_BG = 'rgba(13,16,23,0.92)';
const BORDER = '1px solid rgba(240,235,224,0.10)';
const GRAD = 'linear-gradient(90deg, #6366F1, #EC4899)';

const DIMS = ['lead_conversion', 'nps_proxy', 'response_time', 'revenue_30d', 'compliance'];

function DimCard({ dimKey, dim }) {
  const { t } = useTranslation('common');
  const score = dim?.score != null ? Number(dim.score) : null;
  const pct = score != null ? Math.max(0, Math.min(100, score)) : 0;
  return (
    <div
      data-testid={`soc-dim-${dimKey}`}
      style={{
        padding: 16, borderRadius: 14,
        background: 'rgba(240,235,224,0.04)',
        border: '1px solid rgba(240,235,224,0.08)',
      }}
    >
      <div style={{ fontSize: 11, opacity: 0.62, textTransform: 'uppercase', letterSpacing: 0.8 }}>
        {t(`socFranchise.dim.${dimKey}`, dimKey)}
      </div>
      <div style={{
        marginTop: 6, fontFamily: 'Outfit, sans-serif', fontSize: 26, fontWeight: 800,
        color: dim?.missing_data ? MUTED_2 : CREAM,
      }}>
        {score != null ? score.toFixed(1) : '—'}
      </div>
      <div style={{ marginTop: 8, height: 6, borderRadius: 9999, background: 'rgba(240,235,224,0.08)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: GRAD }} />
      </div>
      <div style={{ marginTop: 8, fontSize: 11, opacity: 0.55, lineHeight: 1.45 }}>
        {t(`socFranchise.dimDesc.${dimKey}`, '')}
      </div>
      {dim?.missing_data && (
        <div style={{ marginTop: 6, fontSize: 11, color: '#FBCFE8' }}>
          {t('socFranchise.dim.missingData', 'Datos parciales')}
        </div>
      )}
    </div>
  );
}

const TIPS = [
  { key: 'lead_conversion', text: 'tipsLeadConversion' },
  { key: 'response_time',    text: 'tipsResponseTime' },
  { key: 'nps_proxy',        text: 'tipsNps' },
  { key: 'revenue_30d',      text: 'tipsRevenue' },
  { key: 'compliance',       text: 'tipsCompliance' },
];

export default function SocFranchisePage() {
  const { t } = useTranslation('common');
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await getMyScore();
      setMe(r);
    } catch (e) {
      setError(e?.body?.detail || e?.message || t('common.error', 'Error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const breakdown = me?.breakdown || {};
  const score = me?.score;
  const level = me?.level;

  return (
    <div
      data-testid="soc-franchise-page"
      style={{ minHeight: '100vh', background: BG, color: CREAM, fontFamily: 'DM Sans, sans-serif', padding: 24 }}
    >
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* Header */}
        <header style={{ marginBottom: 24 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase',
            color: 'transparent', background: GRAD, WebkitBackgroundClip: 'text', backgroundClip: 'text',
          }}>
            DesarrollosMX · SOC
          </div>
          <h1 style={{ margin: '6px 0 4px', fontFamily: 'Outfit, sans-serif', fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>
            {t('socFranchise.title', 'Sistema Operación Certificado')}
          </h1>
          <div style={{ fontSize: 13, opacity: 0.7, maxWidth: 720 }}>
            {t('socFranchise.subtitle', 'Score 0-100 · 4 niveles · 5 dimensiones evaluadas mensualmente desde tu actividad real.')}
          </div>
        </header>

        {error && (
          <div style={{
            padding: 14, borderRadius: 12, marginBottom: 18,
            background: 'rgba(236,72,153,0.08)', border: '1px solid rgba(236,72,153,0.30)',
            color: '#FBCFE8', fontSize: 13,
          }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: MUTED }}>
            {t('common.loading', 'Cargando…')}
          </div>
        ) : (
          <>
            {/* Hero score + level */}
            <section style={{
              background: CARD_BG, border: BORDER, borderRadius: 20, padding: 28, marginBottom: 22,
              display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 24,
            }}>
              <div>
                <div style={{ fontSize: 11, opacity: 0.62, textTransform: 'uppercase', letterSpacing: 1 }}>
                  {t('socFranchise.myScoreLabel', 'Tu score actual')}
                </div>
                <div style={{
                  marginTop: 6, fontFamily: 'Outfit, sans-serif', fontSize: 64, fontWeight: 800,
                  letterSpacing: '-0.04em',
                  background: GRAD, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
                }}>
                  {score != null ? score.toFixed(1) : '—'}
                </div>
                <div style={{ marginTop: 4, fontSize: 12, opacity: 0.6 }}>
                  {me?.computed_at
                    ? `${t('socFranchise.updated', 'Actualizado')}: ${new Date(me.computed_at).toLocaleString('es-MX')}`
                    : ''}
                </div>
                {me?.manual_override && (
                  <div style={{ marginTop: 8, fontSize: 12, color: '#FCD34D' }}>
                    {t('socFranchise.manualOverride', 'Nivel asignado manualmente')}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
                {level && <SocBadge level={level} size="lg" />}
                <div style={{ fontSize: 11, opacity: 0.55 }}>
                  {t('socFranchise.nextTier', 'Próximo nivel a')} {
                    level === 'platinum' ? '—' :
                    level === 'gold' ? '90' :
                    level === 'silver' ? '70' :
                    '50'
                  }
                </div>
              </div>
            </section>

            {/* Breakdown 5 dims */}
            <section style={{ marginBottom: 22 }}>
              <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 18, fontWeight: 700, marginBottom: 14 }}>
                {t('socFranchise.breakdownTitle', 'Cómo se calcula tu score')}
              </h2>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 12,
              }}>
                {DIMS.map((k) => (
                  <DimCard key={k} dimKey={k} dim={breakdown[k]} />
                ))}
              </div>
            </section>

            {/* Tips */}
            <section style={{
              background: CARD_BG, border: BORDER, borderRadius: 16, padding: 22, marginBottom: 22,
            }}>
              <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 18, fontWeight: 700, marginBottom: 10 }}>
                {t('socFranchise.tipsTitle', 'Tips para subir tu score')}
              </h2>
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.65, fontSize: 13, color: MUTED }}>
                {TIPS.map((tp) => (
                  <li key={tp.key} style={{ marginBottom: 4 }}>
                    {t(`socFranchise.${tp.text}`, '')}
                  </li>
                ))}
              </ul>
            </section>

            {/* Leaderboard */}
            <section>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
                <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 18, fontWeight: 700, margin: 0 }}>
                  {t('socFranchise.leaderboardTitle', 'Top 20 franquiciatarios')}
                </h2>
                <div style={{ fontSize: 12, opacity: 0.6 }}>
                  {t('socFranchise.leaderboardSubtitle', 'Ranking nacional · actualizado semanalmente')}
                </div>
              </div>
              <SocLeaderboard limit={20} highlightUserId={me?.user_id} />
            </section>
          </>
        )}
      </div>
    </div>
  );
}
