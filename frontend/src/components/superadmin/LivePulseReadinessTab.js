/**
 * W5.5 Parte 2 — Sub-C · Tab Readiness.
 *
 * Score gauge + state badge + recomendacion + 4 progress bars + ETA + chart 90d.
 * Auto-refresh cada 5 min.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, RadialBarChart, RadialBar, PolarAngleAxis, ReferenceLine } from 'recharts';
import { getReadiness } from '../../api/live_pulse';
import LivePulseFrequencyModal from './LivePulseFrequencyModal';

const STATE_COLORS = {
  bootstrap: { fill: 'rgba(120,120,128,0.85)', label: 'rgba(120,120,128,0.95)' },
  growing:   { fill: 'rgba(234,179,8,0.85)',   label: 'rgba(234,179,8,0.95)' },
  ready:     { fill: 'rgba(34,197,94,0.85)',   label: 'rgba(34,197,94,0.95)' },
  optimal:   { fill: 'rgba(124,47,255,0.95)',  label: 'rgba(124,47,255,0.95)' },
};

export default function LivePulseReadinessTab({ onStateChange }) {
  const { t } = useTranslation('common');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [freqOpen, setFreqOpen] = useState(false);

  const load = useCallback(async () => {
    const r = await getReadiness();
    setData(r.ok ? r.body : null);
    setLoading(false);
    if (r.ok && onStateChange) onStateChange(r.body?.state);
  }, [onStateChange]);

  useEffect(() => {
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [load]);

  if (loading) {
    return (
      <div data-testid="lp-readiness-loading" style={{
        padding: 40, textAlign: 'center', fontFamily: 'DM Sans', fontSize: 13,
        color: 'rgba(240,235,224,0.55)',
      }}>...</div>
    );
  }

  if (!data) {
    return (
      <div data-testid="lp-readiness-empty" style={{
        padding: 40, textAlign: 'center', fontFamily: 'DM Sans', fontSize: 13,
        color: 'rgba(240,235,224,0.55)',
      }}>{t('live_pulse.errors.load_failed')}</div>
    );
  }

  const state = data.state || 'bootstrap';
  const score = data.score || 0;
  const stateColor = STATE_COLORS[state] || STATE_COLORS.bootstrap;
  const gaugeData = [{ name: 'score', value: score, fill: stateColor.fill }];

  const history = (data.history_90d || []).map((h) => ({
    ts: (h.recorded_at || '').slice(0, 10),
    score: h.score,
  }));

  const m = data.metrics || {};

  return (
    <div data-testid="lp-readiness-tab" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Top: gauge + recommendation */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16 }}>
        <div style={{
          background: 'rgba(13,16,23,0.92)', backdropFilter: 'blur(24px)',
          border: '1px solid rgba(124,47,255,0.25)', borderRadius: 14, padding: 18,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        }}>
          <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: 'rgba(240,235,224,0.55)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {t('live_pulse.readiness_tab.score_title')}
          </div>
          <div style={{ width: '100%', height: 200, position: 'relative' }}>
            <ResponsiveContainer>
              <RadialBarChart innerRadius="74%" outerRadius="100%" data={gaugeData} startAngle={210} endAngle={-30}>
                <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
                <RadialBar background={{ fill: 'rgba(255,255,255,0.05)' }} dataKey="value" cornerRadius={12} />
              </RadialBarChart>
            </ResponsiveContainer>
            <div style={{
              position: 'absolute', inset: 0, display: 'flex',
              alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
            }}>
              <span style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 38, color: stateColor.label, letterSpacing: '-0.02em', lineHeight: 1 }}>
                {Math.round(score)}
              </span>
              <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.55)' }}>
                / 100
              </span>
            </div>
          </div>
          <span data-testid={`lp-readiness-state-${state}`} style={{
            display: 'inline-flex', alignItems: 'center', padding: '6px 16px',
            borderRadius: 9999, fontFamily: 'DM Sans', fontSize: 12, fontWeight: 700,
            background: `rgba(${state === 'optimal' ? '124,47,255' : state === 'ready' ? '34,197,94' : state === 'growing' ? '234,179,8' : '120,120,128'},0.18)`,
            color: stateColor.label,
            border: `1px solid ${stateColor.label}`,
            textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>{t(`live_pulse.states.${state}`)}</span>
        </div>

        <div style={{
          background: 'rgba(13,16,23,0.92)', backdropFilter: 'blur(24px)',
          border: '1px solid rgba(124,47,255,0.25)', borderRadius: 14, padding: 18,
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <div>
            <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: 'rgba(240,235,224,0.55)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {t('live_pulse.fields.recommendation')}
            </div>
            <p style={{ fontFamily: 'Outfit', fontWeight: 600, fontSize: 18, color: 'var(--cream, #F0EBE0)', margin: '8px 0 0', lineHeight: 1.4 }}>
              {data.recommendation}
            </p>
          </div>
          <div style={{
            padding: 12, background: 'rgba(124,47,255,0.08)',
            border: '1px solid rgba(124,47,255,0.30)', borderRadius: 12,
          }}>
            <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: 'rgba(240,235,224,0.55)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
              {t('live_pulse.readiness_tab.eta_title')}
            </div>
            <div style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream, #F0EBE0)' }}>
              {data.eta_hourly_days != null
                ? t('live_pulse.readiness_tab.eta_days', { n: data.eta_hourly_days })
                : t('live_pulse.readiness_tab.eta_none')}
            </div>
          </div>
          <button
            data-testid="lp-readiness-change-freq"
            onClick={() => setFreqOpen(true)}
            style={{
              alignSelf: 'flex-start', padding: '9px 20px', borderRadius: 9999,
              fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
              color: '#fff',
              background: 'linear-gradient(90deg, rgba(124,47,255,0.95), rgba(192,38,211,0.95))',
              border: '1px solid rgba(124,47,255,0.65)',
            }}>{t('live_pulse.actions.change_frequency')}</button>
        </div>
      </div>

      {/* Metrics */}
      <div style={{
        background: 'rgba(13,16,23,0.92)', backdropFilter: 'blur(24px)',
        border: '1px solid rgba(124,47,255,0.20)', borderRadius: 14, padding: 18,
      }}>
        <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 15, color: 'var(--cream, #F0EBE0)', marginBottom: 14 }}>
          {t('live_pulse.readiness_tab.metrics_title')}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Metric
            label={t('live_pulse.fields.leads_coverage')}
            metric={m.leads_coverage}
            badge={`${m.leads_coverage?.zones_qualifying ?? 0} / ${m.leads_coverage?.threshold_zones ?? 3}`}
          />
          <Metric
            label={t('live_pulse.fields.behavioral_coverage')}
            metric={m.behavioral_coverage}
            badge={`${m.behavioral_coverage?.zones_qualifying ?? 0} / ${m.behavioral_coverage?.threshold_zones ?? 5}`}
          />
          <Metric
            label={t('live_pulse.fields.atlax_coverage')}
            metric={m.atlax_coverage}
            badge={`${m.atlax_coverage?.zones_qualifying ?? 0} / ${m.atlax_coverage?.threshold_zones ?? 3}`}
          />
          <Metric
            label={t('live_pulse.fields.apify_real')}
            metric={{ value: m.apify_real?.value || 0 }}
            badge={m.apify_real?.enabled ? 'REAL' : 'STUB'}
          />
        </div>
      </div>

      {/* History 90d */}
      <div style={{
        background: 'rgba(13,16,23,0.92)', backdropFilter: 'blur(24px)',
        border: '1px solid rgba(124,47,255,0.20)', borderRadius: 14, padding: 18,
      }}>
        <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 15, color: 'var(--cream, #F0EBE0)', marginBottom: 10 }}>
          {t('live_pulse.readiness_tab.history_title')}
        </div>
        {history.length === 0 ? (
          <div data-testid="lp-history-empty" style={{
            fontFamily: 'DM Sans', fontSize: 12, color: 'rgba(240,235,224,0.55)', textAlign: 'center', padding: 30,
          }}>{t('live_pulse.empty_states.insufficient')}</div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={history} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
              <XAxis dataKey="ts" tick={{ fontSize: 10, fill: 'rgba(240,235,224,0.55)' }} stroke="rgba(255,255,255,0.10)" />
              <YAxis tick={{ fontSize: 10, fill: 'rgba(240,235,224,0.55)' }} stroke="rgba(255,255,255,0.10)" domain={[0, 100]} />
              <Tooltip contentStyle={{ background: 'rgba(13,16,23,0.95)', border: '1px solid rgba(124,47,255,0.45)', borderRadius: 10, fontFamily: 'DM Sans', fontSize: 11 }} />
              <ReferenceLine y={30} stroke="rgba(120,120,128,0.45)" strokeDasharray="3 3" />
              <ReferenceLine y={60} stroke="rgba(234,179,8,0.45)" strokeDasharray="3 3" />
              <ReferenceLine y={85} stroke="rgba(34,197,94,0.55)" strokeDasharray="3 3" />
              <Line type="monotone" dataKey="score" stroke="rgba(124,47,255,0.95)" strokeWidth={2.2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <LivePulseFrequencyModal
        open={freqOpen}
        onClose={() => setFreqOpen(false)}
        current="weekly"
        readinessState={state}
        onSaved={() => { setFreqOpen(false); load(); }}
      />
    </div>
  );
}

function Metric({ label, metric, badge }) {
  const value = Number(metric?.value || 0);
  return (
    <div data-testid={`lp-metric-${(label || '').toLowerCase().replace(/\s+/g, '-')}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
        <span style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'rgba(240,235,224,0.75)' }}>{label}</span>
        <span style={{
          fontFamily: 'DM Mono', fontSize: 10, padding: '3px 10px', borderRadius: 9999,
          background: 'rgba(124,47,255,0.12)', color: 'rgba(124,47,255,0.95)',
          border: '1px solid rgba(124,47,255,0.35)', letterSpacing: '0.04em',
        }}>{badge}</span>
      </div>
      <div style={{
        height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 9999, overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', width: `${Math.min(100, value)}%`,
          background: 'linear-gradient(90deg, rgba(124,47,255,0.85), rgba(192,38,211,0.85))',
          borderRadius: 9999, transition: 'width 0.3s',
        }} />
      </div>
    </div>
  );
}
