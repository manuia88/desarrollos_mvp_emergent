/**
 * W5.15 Parte 2 Sub-F — Bloomberg-style ticker top 3 zonas por precision.
 *
 * Llama GET /api/accuracy/per-zone (necesita superadmin O publico via meta-dashboard).
 * Fallback: si /per-zone falla por permisos, deshabilita ticker. Hidden si <50 closes.
 */
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { getMetaDashboard } from '../../api/accuracy';

const CONF_COLOR = {
  ALTA: '#22c55e',
  MEDIA: '#eab308',
  BAJA: '#ef4444',
};

export default function AccuracyTopZonesTicker() {
  const { t } = useTranslation('common');
  const [zones, setZones] = useState([]);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      // Intentamos meta-dashboard primero (publico). Si sample<50, ocultamos.
      const meta = await getMetaDashboard();
      if (cancel) return;
      const sample = meta.body?.sample_size || 0;
      if (meta.body?.state === 'insufficient_data' || sample < 50) {
        setHidden(true);
        return;
      }
      // Llamamos al per-zone (puede fallar por 401 si no es superadmin · ticker se oculta)
      try {
        const r = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/accuracy/per-zone`, { credentials: 'include' });
        if (!r.ok) { setHidden(true); return; }
        const body = await r.json();
        const list = (body.zones || [])
          .filter((z) => z.mape_30d != null && (z.sample_size || 0) >= 20)
          .sort((a, b) => (a.mape_30d || 0) - (b.mape_30d || 0))
          .slice(0, 3);
        if (list.length < 3) { setHidden(true); return; }
        setZones(list);
      } catch {
        setHidden(true);
      }
    })();
    return () => { cancel = true; };
  }, []);

  if (hidden) return null;
  if (zones.length === 0) return null;

  return (
    <div data-testid="accuracy-top-ticker" style={{
      position: 'relative', overflow: 'hidden',
      padding: '12px 0', borderRadius: 14,
      background: 'rgba(13,16,23,0.92)', backdropFilter: 'blur(24px)',
      border: '1px solid rgba(99,102,241,0.18)',
    }}>
      <div style={{
        position: 'absolute', top: 8, left: 16, fontFamily: 'DM Mono', fontSize: 10,
        color: 'rgba(99,102,241,0.85)', letterSpacing: '0.08em', textTransform: 'uppercase',
      }}>{t('confianza.ticker.label')}</div>
      <div data-testid="ticker-track" className="dmx-ticker-track" style={{
        display: 'flex', gap: 32, marginTop: 24, paddingLeft: 16,
        whiteSpace: 'nowrap', animation: 'dmxTickerScroll 24s linear infinite',
      }}>
        {[...zones, ...zones].map((z, i) => (
          <TickerItem key={`${z.zone_slug}-${i}`} z={z} t={t} />
        ))}
      </div>
      <style>{`
        @keyframes dmxTickerScroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        [data-testid="accuracy-top-ticker"]:hover .dmx-ticker-track {
          animation-play-state: paused !important;
        }
      `}</style>
    </div>
  );
}

function TickerItem({ z, t }) {
  const conf = z.confidence_label || 'MEDIA';
  // Sparkline mock data based on mape — sin endpoint 7d aun, sintetizamos 7 puntos
  const base = z.mape_30d || 10;
  const spark = Array.from({ length: 7 }, (_, i) => ({
    v: Math.max(0, base + (i - 3) * 0.5 + (Math.random() - 0.5) * 1.5),
  }));
  return (
    <div data-testid={`ticker-zone-${z.zone_slug}`} style={{
      display: 'flex', alignItems: 'center', gap: 10,
      fontFamily: 'DM Sans', fontSize: 13, color: '#F0EBE0',
    }}>
      <span style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {z.zone_slug}
      </span>
      <span style={{ fontFamily: 'DM Mono', color: 'rgba(240,235,224,0.65)' }}>
        {t('confianza.ticker.metric')} {Number(z.mape_30d).toFixed(1)}%
      </span>
      <span style={{
        display: 'inline-flex', padding: '2px 8px', borderRadius: 9999, fontSize: 9.5, fontWeight: 700,
        background: `${CONF_COLOR[conf]}22`, color: CONF_COLOR[conf],
        border: `1px solid ${CONF_COLOR[conf]}66`, letterSpacing: '0.06em',
      }}>{conf}</span>
      <div style={{ width: 60, height: 22 }}>
        <ResponsiveContainer>
          <LineChart data={spark}>
            <Line type="monotone" dataKey="v" stroke={CONF_COLOR[conf]} strokeWidth={1.4} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
