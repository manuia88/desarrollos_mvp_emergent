/**
 * W5.5 Parte 2 — Sub-A · Tab Timeline.
 *
 * Dropdown zone_slug + selector dias (7/30/90/365) · LineChart score + 5 signals
 * como areas semi-transparentes · stats (avg/peak/low). Botón suscribirse abre
 * el modal compartido (subscribe inline en este componente).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart, ReferenceLine } from 'recharts';
import { getZones, getZoneTimeline, subscribeZone } from '../../api/live_pulse';

const PERIODS = [7, 30, 90, 365];

export default function LivePulseTimelineTab({ initialZone }) {
  const { t } = useTranslation('common');
  const [zones, setZones] = useState([]);
  const [zone, setZone] = useState(initialZone || '');
  const [days, setDays] = useState(90);
  const [timeline, setTimeline] = useState(null);
  const [loading, setLoading] = useState(false);
  const [subOpen, setSubOpen] = useState(false);
  const [threshold, setThreshold] = useState(80);
  const [subFlash, setSubFlash] = useState('');

  // Cargar zonas disponibles
  useEffect(() => {
    let cancel = false;
    (async () => {
      const r = await getZones({ limit: 100 });
      if (cancel) return;
      const list = (r.body?.zones || []).map((z) => z.zone_slug);
      setZones(list);
      if (!zone && list.length > 0) setZone(list[0]);
    })();
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cargar timeline al cambiar zone/days
  const load = async () => {
    if (!zone) return;
    setLoading(true);
    const r = await getZoneTimeline(zone, days);
    setTimeline(r.body || null);
    setLoading(false);
  };

  useEffect(() => {
    if (zone) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zone, days]);

  const chartData = useMemo(() => {
    if (!timeline?.timeline) return [];
    return timeline.timeline.map((row) => ({
      ts: (row.computed_at || '').slice(0, 10),
      score: row.score,
      search_velocity: row.signals?.search_velocity?.delta_pct ?? 0,
      view_volume: row.signals?.view_volume?.delta_pct ?? 0,
      trend_velocity: row.signals?.trend_velocity?.delta_pct ?? 0,
      lead_intent_velocity: row.signals?.lead_intent_velocity?.delta_pct ?? 0,
      price_movement: row.signals?.price_movement?.delta_pct ?? 0,
    }));
  }, [timeline]);

  const handleSubscribe = async () => {
    const r = await subscribeZone(zone, threshold);
    if (r.ok) {
      setSubFlash(t('live_pulse.actions.subscribe') + ' OK');
      setSubOpen(false);
    } else {
      setSubFlash(r.body?.detail || t('live_pulse.errors.subscribe_failed'));
    }
    setTimeout(() => setSubFlash(''), 3500);
  };

  const stats = timeline?.stats || { avg: 0, peak: 0, low: 0 };

  return (
    <div data-testid="lp-timeline-tab" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Controls */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10,
        background: 'rgba(13,16,23,0.92)', backdropFilter: 'blur(24px)',
        border: '1px solid rgba(var(--theme-rgb),0.20)', borderRadius: 14, padding: 14,
      }}>
        <label style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.60)' }}>
          {t('live_pulse.timeline_tab.select_zone')}
        </label>
        <select
          data-testid="lp-zone-select"
          value={zone}
          onChange={(e) => setZone(e.target.value)}
          style={{
            padding: '8px 14px', borderRadius: 9999, fontFamily: 'DM Sans', fontSize: 12,
            background: 'rgba(255,255,255,0.05)', color: 'var(--cream, #F0EBE0)',
            border: '1px solid rgba(var(--theme-rgb),0.30)', minWidth: 180,
          }}>
          {zones.length === 0 && <option value="">{t('live_pulse.timeline_tab.no_zones')}</option>}
          {zones.map((z) => <option key={z} value={z}>{z}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 6 }}>
          {PERIODS.map((d) => (
            <button
              key={d}
              data-testid={`lp-period-${d}`}
              onClick={() => setDays(d)}
              style={{
                padding: '7px 14px', borderRadius: 9999, fontFamily: 'DM Sans', fontSize: 11.5,
                fontWeight: 600, cursor: 'pointer',
                background: days === d ? 'linear-gradient(90deg, rgba(var(--theme-rgb),0.30), rgba(192,38,211,0.25))' : 'rgba(255,255,255,0.04)',
                color: days === d ? '#e0e7ff' : 'rgba(240,235,224,0.65)',
                border: days === d ? '1px solid rgba(var(--theme-rgb),0.55)' : '1px solid rgba(255,255,255,0.10)',
              }}>{d}{t('live_pulse.fields.days', 'd')[0]}</button>
          ))}
        </div>
        <button
          data-testid="lp-load-btn"
          onClick={load}
          disabled={loading || !zone}
          style={{
            padding: '7px 16px', borderRadius: 9999, fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600,
            cursor: loading ? 'wait' : 'pointer', color: '#fff',
            background: 'linear-gradient(90deg, rgba(var(--theme-rgb),0.85), rgba(192,38,211,0.85))',
            border: '1px solid rgba(var(--theme-rgb),0.65)',
          }}>{loading ? '...' : t('live_pulse.actions.load')}</button>
        <button
          data-testid="lp-subscribe-open"
          onClick={() => setSubOpen(true)}
          disabled={!zone}
          style={{
            padding: '7px 16px', borderRadius: 9999, fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', marginLeft: 'auto',
            background: 'rgba(255,255,255,0.04)', color: 'var(--cream, #F0EBE0)',
            border: '1px solid rgba(var(--theme-rgb),0.45)',
          }}>{t('live_pulse.actions.subscribe')}</button>
      </div>

      {/* Stats strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <StatCard label={t('live_pulse.timeline_tab.stats.avg')} value={stats.avg} />
        <StatCard label={t('live_pulse.timeline_tab.stats.peak')} value={stats.peak} />
        <StatCard label={t('live_pulse.timeline_tab.stats.low')} value={stats.low} />
      </div>

      {/* Chart */}
      <div style={{
        background: 'rgba(13,16,23,0.92)', backdropFilter: 'blur(24px)',
        border: '1px solid rgba(var(--theme-rgb),0.20)', borderRadius: 14, padding: 18, minHeight: 360,
      }}>
        {chartData.length === 0 ? (
          <div data-testid="lp-timeline-empty" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 320,
            fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.55)', textAlign: 'center',
          }}>{t('live_pulse.empty_states.no_timeline')}</div>
        ) : (
          <ResponsiveContainer width="100%" height={360}>
            <AreaChart data={chartData} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id="lpScore" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"  stopColor="rgba(var(--theme-rgb),0.45)" />
                  <stop offset="100%" stopColor="rgba(var(--theme-rgb),0.02)" />
                </linearGradient>
              </defs>
              <XAxis dataKey="ts" tick={{ fontSize: 10, fill: 'rgba(240,235,224,0.55)' }} stroke="rgba(255,255,255,0.10)" />
              <YAxis tick={{ fontSize: 10, fill: 'rgba(240,235,224,0.55)' }} stroke="rgba(255,255,255,0.10)" domain={[0, 100]} />
              <Tooltip contentStyle={{ background: 'rgba(13,16,23,0.95)', border: '1px solid rgba(var(--theme-rgb),0.45)', borderRadius: 10, fontFamily: 'DM Sans', fontSize: 11 }} />
              <ReferenceLine y={40} stroke="rgba(120,120,128,0.45)" strokeDasharray="3 3" />
              <ReferenceLine y={65} stroke="rgba(234,179,8,0.45)" strokeDasharray="3 3" />
              <ReferenceLine y={85} stroke="rgba(249,115,22,0.55)" strokeDasharray="3 3" />
              <Area type="monotone" dataKey="score" stroke="rgba(var(--theme-rgb),0.95)" strokeWidth={2.2} fill="url(#lpScore)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Inline subscribe modal */}
      {subOpen && (
        <div data-testid="lp-subscribe-modal" style={{
          position: 'fixed', inset: 0, background: 'rgba(6,8,15,0.78)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 80,
        }} onClick={() => setSubOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{
            background: 'rgba(13,16,23,0.98)', border: '1px solid rgba(var(--theme-rgb),0.40)', borderRadius: 16,
            padding: 26, width: 'min(420px, 92vw)', display: 'flex', flexDirection: 'column', gap: 14,
          }}>
            <div>
              <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: 'rgba(240,235,224,0.55)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {t('live_pulse.subscribe_modal.title')}
              </div>
              <h3 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, color: 'var(--cream, #F0EBE0)', margin: '4px 0 0' }}>
                {zone}
              </h3>
              <p style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'rgba(240,235,224,0.65)', marginTop: 6 }}>
                {t('live_pulse.subscribe_modal.subtitle')}
              </p>
            </div>
            <label style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.60)' }}>
              {t('live_pulse.subscribe_modal.threshold_label')}: <strong style={{ color: 'rgba(var(--theme-rgb),0.95)' }}>{threshold}</strong>
            </label>
            <input
              data-testid="lp-threshold-slider"
              type="range" min={60} max={100} step={5}
              value={threshold} onChange={(e) => setThreshold(Number(e.target.value))}
              style={{ accentColor: 'rgba(var(--theme-rgb),0.95)' }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <button data-testid="lp-subscribe-cancel" onClick={() => setSubOpen(false)} style={{
                padding: '8px 18px', borderRadius: 9999, fontFamily: 'DM Sans', fontSize: 12, cursor: 'pointer',
                background: 'rgba(255,255,255,0.04)', color: 'var(--cream, #F0EBE0)',
                border: '1px solid rgba(255,255,255,0.12)',
              }}>{t('live_pulse.actions.cancel')}</button>
              <button data-testid="lp-subscribe-confirm" onClick={handleSubscribe} style={{
                padding: '8px 18px', borderRadius: 9999, fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: 'linear-gradient(90deg, rgba(var(--theme-rgb),0.95), rgba(192,38,211,0.95))',
                color: '#fff', border: '1px solid rgba(var(--theme-rgb),0.65)',
              }}>{t('live_pulse.actions.confirm')}</button>
            </div>
          </div>
        </div>
      )}

      {subFlash && (
        <div data-testid="lp-sub-flash" style={{
          position: 'fixed', bottom: 24, right: 24, padding: '10px 18px', borderRadius: 9999,
          background: 'rgba(13,16,23,0.95)', border: '1px solid rgba(var(--theme-rgb),0.45)',
          fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream, #F0EBE0)', zIndex: 90,
        }}>{subFlash}</div>
      )}
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div style={{
      background: 'rgba(13,16,23,0.92)', backdropFilter: 'blur(24px)',
      border: '1px solid rgba(var(--theme-rgb),0.20)', borderRadius: 14, padding: 16,
    }}>
      <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: 'rgba(240,235,224,0.55)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {label}
      </div>
      <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 28, color: 'rgba(var(--theme-rgb),0.95)', marginTop: 4 }}>
        {Number(value || 0).toFixed(1)}
      </div>
    </div>
  );
}
