// W5.x F8 · AlertasPage · /portal/asesor/alertas
// Dashboard de alertas predictivas con grid responsivo, filtros y auto-refresh
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useAlertsPolling from '../../../hooks/useAlertsPolling';
import AlertCard from '../../../components/alerts/AlertCard';
// W5 cleanup · Fit + BuyerScore integrations (additive)
import BuyerScoreBadge from '../../../components/asesor/BuyerScoreBadge';
import FitTopPropertiesList from '../../../components/fit/FitTopPropertiesList';
import { getBuyerScore } from '../../../api/buyer_score';
import PortalLayout from '../../../components/shared/PortalLayout';

const BG = 'var(--bg)';
const CREAM = 'var(--cream)';
const INDIGO = '#6366F1';
const MUTED = 'var(--cream-2)';
const MUTED_2 = 'var(--cream-3)';
const CARD_BG = 'var(--surface)';
const BORDER = '1px solid var(--border)';
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

const STATUS_OPTIONS = [
  { value: 'active', key: 'alerts.filter_active' },
  { value: 'snoozed', key: 'alerts.filter_snoozed' },
  { value: 'contacted', key: 'alerts.filter_contacted' },
  { value: 'dismissed', key: 'alerts.filter_dismissed' },
];

const TIER_OPTIONS = [
  { value: 'all', key: 'alerts.tier_all' },
  { value: 'critical', key: 'alerts.urgency_critical' },
  { value: 'high', key: 'alerts.urgency_high' },
  { value: 'medium', key: 'alerts.urgency_medium' },
  { value: 'low', key: 'alerts.urgency_low' },
];

function chipStyle(active) {
  return {
    padding: '8px 14px',
    borderRadius: 9999,
    fontFamily: 'DM Sans, sans-serif',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.04em',
    cursor: 'pointer',
    border: active ? '1px solid rgba(99,102,241,0.55)' : '1px solid var(--border)',
    background: active ? 'rgba(99,102,241,0.14)' : 'var(--surface-2)',
    color: active ? '#C7D2FE' : 'var(--cream-2)',
    transition: `transform 280ms ${EASE}, background 280ms ${EASE}, border-color 280ms ${EASE}`,
    textTransform: 'uppercase',
  };
}

// W5 cleanup · Wrapper additive: fetch buyer_score + selección de lead para Fit panel
function AlertCardWithBuyerScore({ alert, onRefresh, onSelect, selected }) {
  const [scoreData, setScoreData] = useState(null);
  const leadId = alert?.lead_id || alert?.lead?.id || alert?.lead?.lead_id;

  useEffect(() => {
    let mounted = true;
    if (!leadId) return undefined;
    (async () => {
      const r = await getBuyerScore(leadId);
      if (mounted) setScoreData(r);
    })();
    return () => { mounted = false; };
  }, [leadId]);

  return (
    <div
      data-testid={`alert-card-wrap-${alert?.alert_id || alert?.id}`}
      data-selected={selected ? 'true' : 'false'}
      style={{
        position: 'relative',
        borderRadius: 20,
        outline: selected ? '2px solid rgba(99,102,241,0.55)' : 'none',
        outlineOffset: selected ? 2 : 0,
        transition: `outline-color 280ms ${EASE}`,
      }}
      onClick={() => onSelect && onSelect(leadId)}
    >
      <AlertCard alert={alert} onActionDone={onRefresh} />

      {scoreData && (
        <div
          data-testid={`alert-card-buyer-score-${leadId}`}
          style={{ position: 'absolute', top: 18, right: 22, pointerEvents: 'none' }}
        >
          <BuyerScoreBadge score={scoreData.score} tier={scoreData.tier} size="sm" />
        </div>
      )}
    </div>
  );
}

function AlertasPageBody() {
  const { t } = useTranslation('common');
  const [status, setStatus] = useState('active');
  const [tier, setTier] = useState('all');

  const { alertas, total, loading, lastUpdated, silentFailure, refresh } = useAlertsPolling({
    status, limit: 20, enabled: true,
  });

  // W5 cleanup · selected lead para Fit recommendations panel (additive)
  const [selectedLeadId, setSelectedLeadId] = useState(null);

  const filtered = useMemo(() => {
    if (tier === 'all') return alertas;
    return alertas.filter((a) => String(a.urgency_tier || 'medium').toLowerCase() === tier);
  }, [alertas, tier]);

  const lastUpdatedLabel = lastUpdated
    ? lastUpdated.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
    : '--:--';

  return (
    <div data-testid="alertas-page" style={{ minHeight: '100vh', background: BG, color: CREAM, fontFamily: 'DM Sans, sans-serif' }}>
      <header style={{ padding: '64px 24px 16px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ letterSpacing: '0.3em', fontSize: 11, color: INDIGO, textTransform: 'uppercase' }}>
          DesarrollosMX · Asesor
        </div>
        <h1 style={{
          margin: '12px 0 6px', fontFamily: 'Outfit, sans-serif', fontWeight: 800,
          fontSize: 'clamp(2.2rem, 4vw, 3rem)', lineHeight: 1.05, color: CREAM,
        }}>{t('alerts.title', 'Alertas predictivas')}</h1>
        <p style={{ margin: '8px 0 0', color: MUTED, fontSize: 15, maxWidth: 680 }}>
          {t('alerts.subtitle', 'Leads listos para accion ahora. Prioriza por urgencia y actua en un clic.')}
        </p>
      </header>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '8px 24px 96px', display: 'grid', gap: 24 }}>
        {/* Filtros + meta */}
        <section
          data-testid="alerts-toolbar"
          style={{
            padding: '18px 20px',
            background: CARD_BG,
            border: BORDER,
            borderRadius: 20,
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            display: 'grid',
            gap: 14,
          }}
        >
          <div>
            <div style={{ color: MUTED_2, fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 8 }}>
              {t('alerts.filter_status_label', 'Estado')}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  data-testid={`alerts-filter-status-${opt.value}`}
                  onClick={() => setStatus(opt.value)}
                  style={chipStyle(status === opt.value)}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
                >{t(opt.key)}</button>
              ))}
            </div>
          </div>

          <div>
            <div style={{ color: MUTED_2, fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 8 }}>
              {t('alerts.filter_tier_label', 'Urgencia')}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {TIER_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  data-testid={`alerts-filter-tier-${opt.value}`}
                  onClick={() => setTier(opt.value)}
                  style={chipStyle(tier === opt.value)}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
                >{t(opt.key)}</button>
              ))}
            </div>
          </div>

          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            flexWrap: 'wrap', gap: 12, paddingTop: 4,
            borderTop: BORDER,
          }}>
            <div style={{ color: MUTED_2, fontSize: 12 }}>
              {t('alerts.meta_total', 'Total')}: <span style={{ color: CREAM, fontWeight: 700 }}>{filtered.length}</span>
              <span style={{ opacity: 0.4, margin: '0 8px' }}>·</span>
              {t('alerts.meta_last_updated', 'Ultimo refresh')}: <span style={{ color: CREAM }}>{lastUpdatedLabel}</span>
              <span style={{ opacity: 0.4, margin: '0 8px' }}>·</span>
              {t('alerts.meta_auto_refresh', 'Auto-refresh 30s')}
            </div>
            <button
              type="button"
              data-testid="alerts-refresh-btn"
              onClick={() => refresh()}
              style={{
                padding: '8px 16px', borderRadius: 9999,
                background: 'rgba(99,102,241,0.10)', color: '#C7D2FE',
                border: '1px solid rgba(99,102,241,0.32)',
                fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 700,
                cursor: 'pointer', letterSpacing: '0.04em',
                transition: `transform 280ms ${EASE}, background 280ms ${EASE}`,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              {t('alerts.btn_refresh', 'Actualizar')}
            </button>
          </div>
        </section>

        {/* Grid responsivo */}
        {loading && (
          <section data-testid="alerts-loading" style={{
            padding: '36px 28px', borderRadius: 24, background: CARD_BG, border: BORDER,
            color: MUTED, textAlign: 'center', backdropFilter: 'blur(24px)',
          }}>
            {t('alerts.loading', 'Cargando alertas...')}
          </section>
        )}

        {!loading && filtered.length === 0 && (
          <section
            data-testid="alerts-empty-state"
            style={{
              padding: '48px 28px', borderRadius: 24, background: CARD_BG, border: BORDER,
              backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
              textAlign: 'center',
            }}
          >
            <div style={{ letterSpacing: '0.24em', fontSize: 11, color: INDIGO, textTransform: 'uppercase', marginBottom: 12 }}>
              {silentFailure ? t('alerts.empty_eyebrow_offline', 'Sin senales') : t('alerts.empty_eyebrow', 'Bandeja al dia')}
            </div>
            <h2 style={{
              margin: 0, fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 22,
              color: CREAM, letterSpacing: '-0.01em',
            }}>
              {silentFailure
                ? t('alerts.empty_title_offline', 'Aun no hay alertas disponibles')
                : t('alerts.empty_title', 'No hay alertas para mostrar')}
            </h2>
            <p style={{ margin: '8px auto 0', color: MUTED, fontSize: 14, maxWidth: 480, lineHeight: 1.55 }}>
              {silentFailure
                ? t('alerts.empty_body_offline', 'El motor predictivo se esta calibrando. Las nuevas senales apareceran aqui automaticamente.')
                : t('alerts.empty_body', 'Cuando un lead muestre intencion real, la veras aqui en tiempo casi real.')}
            </p>
          </section>
        )}

        {!loading && filtered.length > 0 && (
          <section
            data-testid="alerts-grid"
            style={{
              display: 'grid', gap: 18,
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            }}
          >
            {filtered.map((a) => {
              const lid = a.lead_id || a.lead?.id || a.lead?.lead_id;
              return (
                <AlertCardWithBuyerScore
                  key={a.alert_id || a.id}
                  alert={a}
                  onRefresh={() => refresh()}
                  onSelect={(id) => setSelectedLeadId((prev) => (prev === id ? null : id))}
                  selected={!!lid && selectedLeadId === lid}
                />
              );
            })}
          </section>
        )}

        {/* W5 cleanup · Panel inferior · Top propiedades para el lead seleccionado */}
        {selectedLeadId && (
          <section data-testid="alerts-fit-panel" style={{ marginTop: 4 }}>
            <FitTopPropertiesList leadId={selectedLeadId} limit={5} />
          </section>
        )}

        <aside
          data-testid="alerts-disclaimer"
          style={{
            marginTop: 8, padding: '16px 20px',
            borderLeft: `3px solid ${INDIGO}`, background: 'rgba(99,102,241,0.06)', borderRadius: 14,
            color: MUTED, fontSize: 13, fontFamily: 'DM Sans, sans-serif',
          }}
        >
          {t('alerts.disclaimer', 'Las alertas son predicciones basadas en senales conductuales. Usa tu juicio profesional antes de contactar.')}
        </aside>

        <div style={{ color: MUTED_2, fontSize: 11, textAlign: 'right' }}>
          {t('alerts.footer_total_backend', 'Backend total')}: {total}
        </div>
      </main>
    </div>
  );
}

// F1.5 · wrap en PortalLayout role-aware (sidebar consistente · persiste durante loading)
export default function AlertasPage(props) {
  return (
    <PortalLayout role={props.user?.role} user={props.user} onLogout={props.onLogout}>
      <AlertasPageBody {...props} />
    </PortalLayout>
  );
}
