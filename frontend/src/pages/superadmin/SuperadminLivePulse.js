/**
 * W5.5 Parte 2 — SuperadminLivePulse (page).
 *
 * Ruta: /superadmin/live-pulse
 * Layout: SuperadminLayout (seccion INTELIGENCIA · morado #7c2fff)
 * Tabs: Heatmap · Timeline · Alertas · Readiness
 */
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, AlertTriangle, Map, LineChart } from 'lucide-react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import LivePulseMapTab from '../../components/superadmin/LivePulseMapTab';
import LivePulseTimelineTab from '../../components/superadmin/LivePulseTimelineTab';
import LivePulseAlertsTab from '../../components/superadmin/LivePulseAlertsTab';
import LivePulseReadinessTab from '../../components/superadmin/LivePulseReadinessTab';
import { getScoreDistribution } from '../../api/live_pulse';

const TABS = [
  { key: 'heatmap',   i18nKey: 'tabs.heatmap',   Icon: Map },
  { key: 'timeline',  i18nKey: 'tabs.timeline',  Icon: LineChart },
  { key: 'alertas',   i18nKey: 'tabs.alertas',   Icon: AlertTriangle },
  { key: 'readiness', i18nKey: 'tabs.readiness', Icon: Activity },
];

function TabBtn({ tab, active, onClick }) {
  const Icon = tab.Icon;
  return (
    <button
      data-testid={`lp-tab-${tab.key}`}
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '10px 18px', borderRadius: 9999,
        fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
        background: active
          ? 'linear-gradient(90deg, rgba(var(--theme-rgb),0.22), rgba(192,38,211,0.18))'
          : 'rgba(255,255,255,0.04)',
        border: active
          ? '1px solid rgba(var(--theme-rgb),0.50)'
          : '1px solid rgba(255,255,255,0.10)',
        color: active ? '#e0e7ff' : 'rgba(240,235,224,0.65)',
        transition: 'all 0.18s',
      }}>
      <Icon size={13} />
      {tab.label}
    </button>
  );
}

function KpiPill({ label, count, color }) {
  return (
    <div data-testid={`lp-kpi-${label.toLowerCase()}`} style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '8px 14px', borderRadius: 9999,
      background: 'rgba(13,16,23,0.92)', border: `1px solid ${color}40`,
      fontFamily: 'DM Sans', fontSize: 11.5,
    }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%', background: color,
        display: 'inline-block',
      }} />
      <span style={{ color: 'rgba(240,235,224,0.65)' }}>{label}</span>
      <span style={{ fontFamily: 'DM Mono', fontWeight: 700, color: 'var(--cream, #F0EBE0)' }}>{count}</span>
    </div>
  );
}

export default function SuperadminLivePulse({ user, onLogout }) {
  const { t } = useTranslation('common');
  const [active, setActive] = useState('heatmap');
  const [dist, setDist] = useState({ cold: 0, warm: 0, hot: 0, surging: 0, total: 0 });
  const [readinessState, setReadinessState] = useState(null);
  const [zoneFromMap, setZoneFromMap] = useState(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const r = await getScoreDistribution();
      if (!cancel && r.ok) setDist(r.body || {});
    })();
    return () => { cancel = true; };
  }, [active]);

  return (
    <SuperadminLayout user={user} onLogout={onLogout}>
      <div data-testid="lp-page" style={{ display: 'flex', flexDirection: 'column', gap: 18, paddingBottom: 60 }}>
        {/* Header */}
        <div>
          <div style={{ fontFamily: 'DM Mono', fontSize: 10, letterSpacing: '0.08em', color: 'rgba(240,235,224,0.55)', textTransform: 'uppercase', marginBottom: 8 }}>
            {t('live_pulse.eyebrow')}
          </div>
          <h1 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 32, color: 'var(--cream, #F0EBE0)', letterSpacing: '-0.02em', margin: 0, lineHeight: 1.1 }}>
            {t('live_pulse.title')}
          </h1>
          <p style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'rgba(240,235,224,0.65)', marginTop: 8, maxWidth: 720, lineHeight: 1.55 }}>
            {t('live_pulse.subtitle')}
          </p>
        </div>

        {/* KPI strip score_distribution */}
        <div data-testid="lp-kpi-strip" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <KpiPill label={t('live_pulse.buckets.cold')}    count={dist.cold ?? 0}    color="rgba(120,120,128,0.85)" />
          <KpiPill label={t('live_pulse.buckets.warm')}    count={dist.warm ?? 0}    color="rgba(234,179,8,0.85)" />
          <KpiPill label={t('live_pulse.buckets.hot')}     count={dist.hot ?? 0}     color="rgba(249,115,22,0.85)" />
          <KpiPill label={t('live_pulse.buckets.surging')} count={dist.surging ?? 0} color="rgba(239,68,68,0.85)" />
          <KpiPill label={t('live_pulse.kpi_strip.total_zones')} count={dist.total ?? 0} color="rgba(var(--theme-rgb),0.85)" />
        </div>

        {/* Sticky tabs */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 10,
          background: 'rgba(13,16,23,0.85)', backdropFilter: 'blur(24px)',
          padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.06)',
        }} data-testid="lp-tabs-bar">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {TABS.map((tab) => (
              <TabBtn
                key={tab.key}
                tab={{ ...tab, label: t(`live_pulse.${tab.i18nKey}`) }}
                active={active === tab.key}
                onClick={() => setActive(tab.key)}
              />
            ))}
          </div>
        </div>

        {active === 'heatmap'   && <LivePulseMapTab onPickZone={(s) => { setZoneFromMap(s); }} />}
        {active === 'timeline'  && <LivePulseTimelineTab initialZone={zoneFromMap} />}
        {active === 'alertas'   && <LivePulseAlertsTab user={user} readinessState={readinessState} />}
        {active === 'readiness' && <LivePulseReadinessTab onStateChange={setReadinessState} />}
      </div>
    </SuperadminLayout>
  );
}
