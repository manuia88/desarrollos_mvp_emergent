/**
 * W5.23 — DeveloperBattleCard
 *
 * Page: /desarrollador/battle-card/:project_id
 * T3+ only. Muestra score compuesto, 5 dimensiones, top 3 competidores,
 * timeline 12 semanas y accion recomendada.
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Download, RefreshCw, Lock } from 'lucide-react';

import { getBattleCard, getHistory, getPdfUrl } from '../../api/battle_card';
import BattleCardScoreGauge from '../../components/developer/BattleCardScoreGauge';
import BattleCardCompetitorsTable from '../../components/developer/BattleCardCompetitorsTable';
import BattleCardRankingTimeline from '../../components/developer/BattleCardRankingTimeline';

const GREEN  = '#10B981';
const YELLOW = '#F59E0B';
const RED    = '#EF4444';
const INDIGO = '#6366F1';
const ROSE   = '#EC4899';

function _color(score) {
  if (score >= 75) return GREEN;
  if (score >= 50) return YELLOW;
  return RED;
}

const DIM_KEYS = ['precio', 'ventas', 'zona', 'marketing', 'lead_gen'];

function DimCard({ dimKey, score, delta, t }) {
  const color = _color(score || 0);
  const label = t(`battle_card.dimensions.${dimKey}`, { defaultValue: dimKey });
  return (
    <div
      data-testid={`battle-card-dim-${dimKey}`}
      style={{
        padding: '14px 16px', borderRadius: 14,
        background: 'rgba(255,255,255,0.035)',
        border: `1px solid ${color}28`,
        display: 'flex', flexDirection: 'column', gap: 6,
        minWidth: 0,
      }}
    >
      <span style={{
        fontFamily: 'DM Sans, sans-serif', fontWeight: 700,
        fontSize: 10, color: 'rgba(240,235,224,0.45)',
        textTransform: 'uppercase', letterSpacing: '0.08em',
      }}>
        {label}
      </span>
      <span style={{
        fontFamily: 'Outfit, sans-serif', fontWeight: 800,
        fontSize: 28, color: color, lineHeight: 1,
      }}>
        {Math.round(score || 0)}
      </span>
      {delta != null && delta !== 0 && (
        <span style={{
          fontFamily: 'DM Sans, sans-serif', fontSize: 11,
          fontWeight: 700, color: delta > 0 ? GREEN : RED,
        }}>
          {delta > 0 ? '+' : ''}{delta.toFixed(1)} pp
        </span>
      )}
    </div>
  );
}

export default function DeveloperBattleCard() {
  const { project_id } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tierError, setTierError] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [toastMsg, setToastMsg] = useState(null);
  const refreshRef = useRef(null);

  const loadData = useCallback(async (pid) => {
    try {
      setLoading(true);
      const [card, hist] = await Promise.all([
        getBattleCard(pid),
        getHistory(pid, 12).catch(() => ({ history: [] })),
      ]);
      setData(card);
      setHistory(hist.history || []);
    } catch (err) {
      if (err.status === 403 || err.code === 'tier_locked') {
        setTierError(true);
      } else {
        setToastMsg({ type: 'error', text: err.message || t('battle_card.errors.no_data_yet', { defaultValue: 'Error cargando Battle Card' }) });
        setTimeout(() => setToastMsg(null), 4000);
      }
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (project_id) {
      loadData(project_id);
      // Auto-refresh cada 5 min
      refreshRef.current = setInterval(() => loadData(project_id), 5 * 60 * 1000);
    }
    return () => { if (refreshRef.current) clearInterval(refreshRef.current); };
  }, [project_id, loadData]);

  const handlePdfDownload = () => {
    if (!project_id) return;
    setPdfLoading(true);
    setToastMsg({ type: 'info', text: t('battle_card.pdf.generating_toast', { defaultValue: 'Generando PDF...' }) });
    const url = getPdfUrl(project_id);
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => {
      setPdfLoading(false);
      setToastMsg({ type: 'success', text: t('battle_card.pdf.success_toast', { defaultValue: 'PDF abierto en nueva pestana' }) });
      setTimeout(() => setToastMsg(null), 3000);
    }, 1500);
  };

  // ── Tier Error State ──
  if (tierError) {
    return (
      <div data-testid="battle-card-tier-error" style={{
        minHeight: '100vh', background: '#06080F',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', padding: '40px 24px', gap: 20, textAlign: 'center',
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: 18,
          background: 'rgba(239,68,68,0.14)',
          border: '1px solid rgba(239,68,68,0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Lock size={28} color={RED} />
        </div>
        <h2 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 22, color: '#F0EBE0', margin: 0 }}>
          {t('battle_card.errors.tier_required', { defaultValue: 'Battle Card requiere tier T3+' })}
        </h2>
        <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: 'rgba(240,235,224,0.5)', margin: 0, maxWidth: 380 }}>
          Upgrade a Enterprise para acceder a inteligencia competitiva en tiempo real.
        </p>
        <button
          data-testid="battle-card-upgrade-cta"
          onClick={() => navigate('/desarrollador/configuracion')}
          style={{
            padding: '11px 28px', borderRadius: 9999,
            background: `linear-gradient(90deg, ${INDIGO}, ${ROSE})`,
            border: 'none', cursor: 'pointer', color: '#fff',
            fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: 14,
          }}
        >
          Upgrade a T3
        </button>
      </div>
    );
  }

  // ── Loading ──
  if (loading) {
    return (
      <div data-testid="battle-card-loading" style={{
        minHeight: '100vh', background: '#06080F',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: '50%',
          border: `3px solid ${INDIGO}`,
          borderTopColor: 'transparent',
          animation: 'spin 0.9s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ── Insufficient competitors ──
  if (!data || data.state === 'insufficient') {
    const zone = data?.zone_slug || '';
    const count = data?.zone_competitors_count ?? 0;
    const nextUpdate = new Date();
    nextUpdate.setDate(nextUpdate.getDate() + (7 - nextUpdate.getDay()));
    return (
      <div data-testid="battle-card-insufficient" style={{
        minHeight: '100vh', background: '#06080F',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', padding: '40px 24px', gap: 16, textAlign: 'center',
      }}>
        <div style={{
          maxWidth: 440, padding: '32px 36px', borderRadius: 20,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}>
          <h2 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 20, color: '#F0EBE0', marginBottom: 10 }}>
            {t('battle_card.empty.insufficient_competitors_title', {
              defaultValue: 'Battle Card en preparacion',
            })}
          </h2>
          <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: 'rgba(240,235,224,0.5)', lineHeight: 1.55, margin: 0 }}>
            {t('battle_card.empty.body', {
              defaultValue: `Necesitamos al menos 3 desarrolladores en ${zone} para generar Battle Card. Actualmente hay ${count} registrados.`,
              zone, count,
            })}
          </p>
          <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 11, color: 'rgba(240,235,224,0.3)', marginTop: 14 }}>
            {t('battle_card.empty.eta_message', {
              defaultValue: `Proximo update: ${nextUpdate.toLocaleDateString('es-MX')}`,
              date: nextUpdate.toLocaleDateString('es-MX'),
            })}
          </p>
        </div>
      </div>
    );
  }

  const composite = data.my_score || 0;
  const dims = data.dim_scores || {};
  const ranking = data.ranking || {};
  const competitors = data.competitors || [];
  const action = data.recommended_action || '';
  const weekIso = data.week_iso || '';
  const rankN = ranking.rank;
  const totalZone = ranking.total_in_zone;

  return (
    <div
      data-testid="developer-battle-card"
      style={{
        minHeight: '100vh', background: '#06080F',
        padding: '28px 24px 60px',
        fontFamily: 'DM Sans, sans-serif',
        maxWidth: 1100, margin: '0 auto',
      }}
    >
      {/* Hero */}
      <div style={{
        display: 'flex', alignItems: 'flex-start',
        justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
        marginBottom: 28,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {data.dev_org_id || ''}
            </span>
            <ChevronRight size={12} color="rgba(240,235,224,0.3)" />
            <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {data.zone_slug || ''}
            </span>
          </div>
          <h1 style={{
            fontFamily: 'Outfit, sans-serif', fontWeight: 800,
            fontSize: 26, color: '#F0EBE0', margin: 0, lineHeight: 1.2,
          }}>
            {t('battle_card.title.main', { defaultValue: 'Battle Card' })}
            <span style={{ color: INDIGO }}> · {data.project_name || project_id}</span>
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'rgba(240,235,224,0.4)' }}>
            {t('battle_card.title.week_N', { n: weekIso, defaultValue: `Semana ${weekIso}` })}
          </p>
        </div>

        {/* Acciones */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            data-testid="battle-card-refresh-btn"
            onClick={() => loadData(project_id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 9999,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
              color: 'rgba(240,235,224,0.7)', cursor: 'pointer',
              fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12,
            }}
          >
            <RefreshCw size={13} /> Actualizar
          </button>
          <button
            data-testid="battle-card-pdf-btn"
            onClick={handlePdfDownload}
            disabled={pdfLoading}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 18px', borderRadius: 9999,
              background: 'rgba(99,102,241,0.15)',
              border: '1px solid rgba(99,102,241,0.35)',
              color: '#a5b4fc', cursor: 'pointer',
              fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12,
            }}
          >
            <Download size={13} />
            {pdfLoading
              ? t('battle_card.pdf.generating_toast', { defaultValue: 'Generando...' })
              : t('battle_card.pdf.export_cta', { defaultValue: 'Descargar PDF para comite' })}
          </button>
        </div>
      </div>

      {/* Main grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 20 }}>
        {/* Columna izquierda: Gauge + Ranking */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Score gauge */}
          <div style={{
            borderRadius: 18, background: 'rgba(255,255,255,0.035)',
            border: '1px solid rgba(255,255,255,0.08)', padding: '6px 0',
          }}>
            <BattleCardScoreGauge
              score={composite}
              delta_pp={data.delta_pp}
              week_iso={weekIso}
            />
          </div>

          {/* Ranking card */}
          <div style={{
            padding: '16px 18px', borderRadius: 14,
            background: 'rgba(255,255,255,0.035)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <p style={{ margin: 0, fontSize: 10, color: 'rgba(240,235,224,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
              {t('battle_card.ranking.position_label', { defaultValue: 'Posicion en zona' })}
            </p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 6 }}>
              <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 32, color: '#F0EBE0', lineHeight: 1 }}>
                {rankN ? `#${rankN}` : '—'}
              </span>
              {totalZone && (
                <span style={{ fontSize: 11, color: 'rgba(240,235,224,0.4)' }}>
                  {t('battle_card.ranking.delta_label', { defaultValue: `de ${totalZone}`, n: totalZone })}
                </span>
              )}
            </div>
            {ranking.delta_position != null && ranking.delta_position !== 0 && (
              <p style={{
                margin: '4px 0 0', fontSize: 11, fontWeight: 700,
                color: ranking.delta_position > 0 ? GREEN : RED,
              }}>
                {ranking.delta_position > 0 ? `+${ranking.delta_position}` : ranking.delta_position} pos esta semana
              </p>
            )}
          </div>
        </div>

        {/* Columna derecha: dims + competitors + timeline + accion */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* 5 dimensiones */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10,
          }}>
            {DIM_KEYS.map(dim => (
              <DimCard
                key={dim}
                dimKey={dim}
                score={dims[dim]}
                delta={null}
                t={t}
              />
            ))}
          </div>

          {/* Competidores */}
          {competitors.length > 0 && (
            <div style={{
              padding: '18px 20px', borderRadius: 16,
              background: 'rgba(255,255,255,0.035)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}>
              <p style={{
                margin: '0 0 14px', fontWeight: 800, fontSize: 12,
                color: 'rgba(240,235,224,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em',
              }}>
                {t('battle_card.competitors.table_header', { defaultValue: 'Comparativa competidores' })}
              </p>
              <BattleCardCompetitorsTable
                myScore={composite}
                myDimScores={dims}
                competitors={competitors}
              />
            </div>
          )}

          {/* Timeline ranking */}
          <div style={{
            padding: '18px 20px', borderRadius: 16,
            background: 'rgba(255,255,255,0.035)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <BattleCardRankingTimeline history={history} />
          </div>

          {/* Accion recomendada CTA */}
          {action && (
            <div
              data-testid="battle-card-recommended-action"
              style={{
                padding: '20px 22px', borderRadius: 16,
                background: `linear-gradient(135deg, rgba(99,102,241,0.12), rgba(236,72,153,0.12))`,
                border: `1px solid rgba(236,72,153,0.25)`,
              }}
            >
              <p style={{
                margin: '0 0 8px', fontWeight: 800, fontSize: 11,
                color: ROSE, textTransform: 'uppercase', letterSpacing: '0.08em',
              }}>
                {t('battle_card.action.recommended_title', { defaultValue: 'Accion recomendada' })}
                {data.weakest_dim && (
                  <span style={{ color: 'rgba(240,235,224,0.4)', fontWeight: 600, marginLeft: 6 }}>
                    · {t(`battle_card.dimensions.${data.weakest_dim}`, { defaultValue: data.weakest_dim })}
                  </span>
                )}
              </p>
              <p style={{ margin: '0 0 14px', fontSize: 13, color: '#F0EBE0', lineHeight: 1.55 }}>
                {action}
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  data-testid="battle-card-action-implement"
                  style={{
                    padding: '9px 20px', borderRadius: 9999,
                    background: `linear-gradient(90deg, ${INDIGO}, ${ROSE})`,
                    border: 'none', cursor: 'pointer', color: '#fff',
                    fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12,
                  }}
                >
                  {t('battle_card.action.cta_implement', { defaultValue: 'Implementar' })}
                </button>
              </div>
            </div>
          )}

          {/* Footer */}
          <p style={{
            margin: 0, fontSize: 10,
            color: 'rgba(240,235,224,0.25)', fontFamily: 'DM Sans',
          }}>
            {t('battle_card.footer.updated_label', { defaultValue: 'Datos actualizados: domingo de cada semana' })}
            &nbsp;·&nbsp;
            <button
              data-testid="battle-card-audit-link"
              onClick={() => navigate('/superadmin/audit')}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'rgba(99,102,241,0.6)', fontSize: 10,
                fontFamily: 'DM Sans', padding: 0, textDecoration: 'underline',
              }}
            >
              {t('battle_card.footer.audit_chain_link', { defaultValue: 'Ver cadena de auditoria' })}
            </button>
          </p>
        </div>
      </div>

      {/* Toast notification local */}
      {toastMsg && (
        <div
          data-testid="battle-card-toast"
          style={{
            position: 'fixed', bottom: 28, right: 24, zIndex: 9999,
            padding: '12px 20px', borderRadius: 12,
            background: toastMsg.type === 'error' ? 'rgba(239,68,68,0.95)'
              : toastMsg.type === 'success' ? 'rgba(16,185,129,0.95)'
              : 'rgba(99,102,241,0.95)',
            color: '#fff', fontFamily: 'DM Sans, sans-serif', fontSize: 13,
            fontWeight: 600, backdropFilter: 'blur(16px)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}
        >
          {toastMsg.text}
        </div>
      )}
    </div>
  );
}
