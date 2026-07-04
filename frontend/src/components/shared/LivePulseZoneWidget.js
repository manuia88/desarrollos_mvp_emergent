/**
 * W5.5 Parte 2 — Sub-D · Widget compacto LivePulse para una zona.
 *
 * Consume GET /api/live-pulse/zones (filtra por slug) + GET /timeline
 * para el sparkline 30d. Si snapshot null o insufficient_data → hidden.
 */
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { getZones, getZoneTimeline } from '../../api/live_pulse';

const BUCKET_STYLE = {
  cold:    { bg: 'rgba(120,120,128,0.15)', border: 'rgba(120,120,128,0.45)', fg: '#d4d4d8' },
  warm:    { bg: 'rgba(234,179,8,0.15)',   border: 'rgba(234,179,8,0.50)',   fg: '#fde68a' },
  hot:     { bg: 'rgba(249,115,22,0.16)',  border: 'rgba(249,115,22,0.50)',  fg: '#fed7aa' },
  surging: { bg: 'rgba(239,68,68,0.16)',   border: 'rgba(239,68,68,0.55)',   fg: '#fecaca' },
};

function bucketOf(score) {
  if (score == null) return null;
  if (score <= 40) return 'cold';
  if (score <= 65) return 'warm';
  if (score <= 85) return 'hot';
  return 'surging';
}

export default function LivePulseZoneWidget({ zone_slug, user, compact = false }) {
  const { t } = useTranslation('common');
  const [pulse, setPulse] = useState(null);
  const [spark, setSpark] = useState([]);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!zone_slug) { setHidden(true); return; }
    let cancel = false;
    (async () => {
      const r = await getZones({ limit: 100 });
      if (cancel) return;
      const match = (r.body?.zones || []).find((z) => z.zone_slug === zone_slug);
      if (!match) { setHidden(true); return; }
      // Ocultar si NO hay ninguna señal REAL. 'stub' = placeholder determinista del trend (apify no-real) →
      // cuenta como no-real, para no pintar un pulso falso (~50 plano) sin datos verdaderos de la zona.
      const allStub = match.signals && Object.values(match.signals).every(
        (s) => ['insufficient_data', 'unavailable', 'stub'].includes(s?.source)
      );
      if (allStub) { setHidden(true); return; }
      setPulse(match);
      const tl = await getZoneTimeline(zone_slug, 30);
      if (cancel) return;
      setSpark((tl.body?.timeline || []).map((row) => ({ score: row.score })));
    })();
    return () => { cancel = true; };
  }, [zone_slug]);

  if (hidden || !pulse) return null;

  const bucket = pulse.bucket || bucketOf(pulse.score) || 'warm';
  const style = BUCKET_STYLE[bucket];
  const linkTo = user?.role === 'superadmin' ? '/superadmin/live-pulse' : `/zona/${zone_slug}`;

  return (
    <div
      data-testid={`lp-widget-${zone_slug}`}
      style={{
        background: 'rgba(var(--bg-rgb),0.85)', backdropFilter: 'blur(20px)',
        border: '1px solid rgba(var(--theme-rgb),0.22)', borderRadius: 14,
        padding: compact ? 12 : 16,
        display: 'flex', flexDirection: 'column', gap: 8, minWidth: 200,
      }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div>
          <div style={{ fontFamily: 'DM Mono', fontSize: 9.5, color: 'rgba(var(--cream-rgb),0.55)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {t('live_pulse.widget.pulse_de_tu_zona')}
          </div>
          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: compact ? 14 : 16, color: 'var(--cream, #F0EBE0)', marginTop: 2, textTransform: 'capitalize' }}>
            {zone_slug}
          </div>
        </div>
        <span style={{
          display: 'inline-flex', padding: '3px 9px', borderRadius: 9999,
          fontFamily: 'DM Sans', fontSize: 9.5, fontWeight: 700,
          background: style.bg, color: style.fg, border: `1px solid ${style.border}`,
          textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>{t(`live_pulse.buckets.${bucket}`)}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: compact ? 24 : 30, color: 'rgba(var(--theme-rgb),0.95)', letterSpacing: '-0.02em' }}>
          {pulse.score}
        </span>
        <span style={{ fontFamily: 'DM Sans', fontSize: 10, color: 'rgba(var(--cream-rgb),0.55)' }}>/ 100</span>
      </div>
      {spark.length > 1 && (
        <div style={{ height: compact ? 28 : 36 }}>
          <ResponsiveContainer>
            <LineChart data={spark}>
              <Line type="monotone" dataKey="score" stroke="rgba(var(--theme-rgb),0.85)" strokeWidth={1.6} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <a href={linkTo} data-testid={`lp-widget-link-${zone_slug}`} style={{
        fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(var(--theme-rgb),0.95)', textDecoration: 'none', marginTop: 2,
      }}>{t('live_pulse.widget.ver_detalle')} →</a>
    </div>
  );
}
