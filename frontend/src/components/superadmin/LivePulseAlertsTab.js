/**
 * W5.5 Parte 2 — Sub-B · Tab Alertas.
 *
 * 2 secciones:
 *   1. Mis suscripciones (T3+) - tabla + add + delete
 *   2. Frecuencia del cron (superadmin only) - KPIs + modal
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { getMySubs, unsubscribe, subscribeZone, getZones, getStats } from '../../api/live_pulse';
import LivePulseFrequencyModal from './LivePulseFrequencyModal';

export default function LivePulseAlertsTab({ user, readinessState }) {
  const { t } = useTranslation('common');
  const isSuperadmin = user?.role === 'superadmin';
  const tier = isSuperadmin ? 'T5' : (user?.tenant_id ? 'T3' : 'T2');
  const canSubscribe = ['T3', 'T4', 'T5'].includes(tier);

  const [subs, setSubs] = useState([]);
  const [stats, setStats] = useState(null);
  const [zones, setZones] = useState([]);
  const [addOpen, setAddOpen] = useState(false);
  const [freqOpen, setFreqOpen] = useState(false);
  const [zone, setZone] = useState('');
  const [threshold, setThreshold] = useState(80);
  const [err, setErr] = useState('');
  const [flash, setFlash] = useState('');

  const loadSubs = useCallback(async () => {
    if (!canSubscribe) return;
    const r = await getMySubs();
    setSubs(r.body?.subs || []);
  }, [canSubscribe]);

  const loadStats = useCallback(async () => {
    if (!isSuperadmin) return;
    const r = await getStats();
    setStats(r.ok ? r.body : null);
  }, [isSuperadmin]);

  const loadZones = useCallback(async () => {
    if (!canSubscribe) return;
    const r = await getZones({ limit: 100 });
    setZones((r.body?.zones || []).map((z) => z.zone_slug));
  }, [canSubscribe]);

  useEffect(() => { loadSubs(); loadStats(); loadZones(); }, [loadSubs, loadStats, loadZones]);

  const handleAdd = async () => {
    if (!zone) { setErr(t('live_pulse.errors.subscribe_failed')); return; }
    setErr('');
    const r = await subscribeZone(zone, threshold);
    if (r.ok) {
      setAddOpen(false);
      setFlash(t('live_pulse.actions.subscribe') + ' OK');
      loadSubs();
    } else {
      setErr(r.body?.detail || t('live_pulse.errors.subscribe_failed'));
    }
    setTimeout(() => setFlash(''), 3500);
  };

  const handleDelete = async (sub_id) => {
    const r = await unsubscribe(sub_id);
    if (r.ok) {
      setFlash(t('live_pulse.actions.unsubscribe') + ' OK');
      loadSubs();
    }
    setTimeout(() => setFlash(''), 3500);
  };

  return (
    <div data-testid="lp-alerts-tab" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {/* Seccion 1: Mis suscripciones */}
      <section data-testid="lp-my-subs-section">
        <SectionHeader title={t('live_pulse.alerts_tab.my_subs_title')} />
        {!canSubscribe ? (
          <EmptyState text={t('live_pulse.empty_states.requires_t3')} />
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
              <button
                data-testid="lp-add-sub-btn"
                onClick={() => setAddOpen(true)}
                style={{
                  padding: '8px 18px', borderRadius: 9999, fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', color: '#fff',
                  background: 'linear-gradient(90deg, rgba(124,47,255,0.90), rgba(192,38,211,0.90))',
                  border: '1px solid rgba(124,47,255,0.55)',
                }}>+ {t('live_pulse.actions.new_subscription')}</button>
            </div>
            {subs.length === 0 ? (
              <EmptyState text={t('live_pulse.empty_states.no_subs')} />
            ) : (
              <div style={{
                background: 'rgba(13,16,23,0.92)', backdropFilter: 'blur(24px)',
                border: '1px solid rgba(124,47,255,0.20)', borderRadius: 14, overflow: 'hidden',
              }}>
                <table data-testid="lp-subs-table" style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'DM Sans', fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ background: 'rgba(124,47,255,0.10)' }}>
                      <Th>{t('live_pulse.fields.zone')}</Th>
                      <Th>{t('live_pulse.fields.threshold_score')}</Th>
                      <Th>{t('live_pulse.fields.created_at')}</Th>
                      <Th style={{ textAlign: 'right' }}>{' '}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {subs.map((s) => (
                      <tr key={s.id} data-testid={`lp-sub-row-${s.id}`} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        <Td>{s.zone_slug}</Td>
                        <Td>{s.threshold_score}</Td>
                        <Td>{(s.created_at || '').slice(0, 16).replace('T', ' ')}</Td>
                        <Td style={{ textAlign: 'right' }}>
                          <button
                            data-testid={`lp-sub-delete-${s.id}`}
                            onClick={() => handleDelete(s.id)}
                            style={{
                              padding: '5px 12px', borderRadius: 9999, fontFamily: 'DM Sans', fontSize: 11,
                              cursor: 'pointer', background: 'rgba(239,68,68,0.10)',
                              color: '#fecaca', border: '1px solid rgba(239,68,68,0.45)',
                            }}>{t('live_pulse.actions.unsubscribe')}</button>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>

      {/* Seccion 2: Frecuencia cron (superadmin only) */}
      {isSuperadmin && (
        <section data-testid="lp-cron-section">
          <SectionHeader title={t('live_pulse.alerts_tab.cron_section_title')} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <KpiCard
              label={t('live_pulse.fields.current_frequency')}
              value={t(`live_pulse.frequencies.${stats?.current_frequency === '*/15min' ? '15min' : (stats?.current_frequency || 'weekly')}`)}
              prominent
            />
            <KpiCard label={t('live_pulse.fields.snapshots_24h')} value={stats?.snapshots_24h ?? 0} />
            <KpiCard label={t('live_pulse.fields.alerts_30d')} value={stats?.alerts_sent_30d ?? 0} />
            <KpiCard label={t('live_pulse.fields.avg_score')} value={(stats?.avg_score ?? 0).toFixed(1)} />
          </div>
          <div style={{ marginTop: 14 }}>
            <button
              data-testid="lp-change-freq-btn"
              onClick={() => setFreqOpen(true)}
              style={{
                padding: '9px 20px', borderRadius: 9999, fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 600,
                cursor: 'pointer', color: '#fff',
                background: 'linear-gradient(90deg, rgba(124,47,255,0.95), rgba(192,38,211,0.95))',
                border: '1px solid rgba(124,47,255,0.65)',
              }}>{t('live_pulse.actions.change_frequency')}</button>
          </div>
        </section>
      )}

      <LivePulseFrequencyModal
        open={freqOpen}
        onClose={() => setFreqOpen(false)}
        current={stats?.current_frequency || 'weekly'}
        readinessState={readinessState}
        onSaved={() => { setFlash(t('live_pulse.actions.change_frequency') + ' OK'); loadStats(); setTimeout(() => setFlash(''), 3500); }}
      />

      {addOpen && (
        <div data-testid="lp-add-sub-modal" style={{
          position: 'fixed', inset: 0, background: 'rgba(6,8,15,0.78)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 80,
        }} onClick={() => setAddOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{
            background: 'rgba(13,16,23,0.98)', border: '1px solid rgba(124,47,255,0.40)', borderRadius: 16,
            padding: 26, width: 'min(440px, 92vw)', display: 'flex', flexDirection: 'column', gap: 14,
          }}>
            <h3 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, color: 'var(--cream, #F0EBE0)', margin: 0 }}>
              {t('live_pulse.subscribe_modal.title')}
            </h3>
            <label style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.60)' }}>
              {t('live_pulse.subscribe_modal.zone_label')}
            </label>
            <select
              data-testid="lp-add-zone-select"
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              style={{
                padding: '10px 14px', borderRadius: 14, fontFamily: 'DM Sans', fontSize: 13,
                background: 'rgba(255,255,255,0.05)', color: 'var(--cream, #F0EBE0)',
                border: '1px solid rgba(124,47,255,0.30)',
              }}>
              <option value="">—</option>
              {zones.map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
            <label style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.60)' }}>
              {t('live_pulse.subscribe_modal.threshold_label')}: <strong style={{ color: 'rgba(124,47,255,0.95)' }}>{threshold}</strong>
            </label>
            <input
              data-testid="lp-add-threshold"
              type="range" min={60} max={100} step={5}
              value={threshold} onChange={(e) => setThreshold(Number(e.target.value))}
              style={{ accentColor: 'rgba(124,47,255,0.95)' }}
            />
            {err && <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: '#fecaca' }}>{err}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
              <button onClick={() => setAddOpen(false)} style={{
                padding: '8px 18px', borderRadius: 9999, fontFamily: 'DM Sans', fontSize: 12, cursor: 'pointer',
                background: 'rgba(255,255,255,0.04)', color: 'var(--cream, #F0EBE0)',
                border: '1px solid rgba(255,255,255,0.12)',
              }}>{t('live_pulse.actions.cancel')}</button>
              <button
                data-testid="lp-add-confirm"
                onClick={handleAdd}
                style={{
                  padding: '8px 18px', borderRadius: 9999, fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  background: 'linear-gradient(90deg, rgba(124,47,255,0.95), rgba(192,38,211,0.95))',
                  color: '#fff', border: '1px solid rgba(124,47,255,0.65)',
                }}>{t('live_pulse.actions.confirm')}</button>
            </div>
          </div>
        </div>
      )}

      {flash && (
        <div data-testid="lp-alerts-flash" style={{
          position: 'fixed', bottom: 24, right: 24, padding: '10px 18px', borderRadius: 9999,
          background: 'rgba(13,16,23,0.95)', border: '1px solid rgba(124,47,255,0.45)',
          fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream, #F0EBE0)', zIndex: 95,
        }}>{flash}</div>
      )}
    </div>
  );
}

function SectionHeader({ title }) {
  return (
    <h2 style={{
      fontFamily: 'Outfit', fontWeight: 700, fontSize: 17, color: 'var(--cream, #F0EBE0)',
      margin: '0 0 12px 0', letterSpacing: '-0.01em',
    }}>{title}</h2>
  );
}

function EmptyState({ text }) {
  return (
    <div data-testid="lp-empty-state" style={{
      background: 'rgba(13,16,23,0.92)', border: '1px solid rgba(124,47,255,0.15)',
      borderRadius: 14, padding: 28, textAlign: 'center',
      fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.55)',
    }}>{text}</div>
  );
}

function Th({ children, style }) {
  return <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: 'rgba(240,235,224,0.65)', textTransform: 'uppercase', letterSpacing: '0.06em', ...(style || {}) }}>{children}</th>;
}

function Td({ children, style }) {
  return <td style={{ padding: '12px 16px', color: 'var(--cream, #F0EBE0)', ...(style || {}) }}>{children}</td>;
}

function KpiCard({ label, value, prominent }) {
  return (
    <div style={{
      background: 'rgba(13,16,23,0.92)', backdropFilter: 'blur(24px)',
      border: prominent ? '1px solid rgba(124,47,255,0.45)' : '1px solid rgba(124,47,255,0.20)',
      borderRadius: 14, padding: 14,
    }}>
      <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: 'rgba(240,235,224,0.55)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {label}
      </div>
      <div style={{
        fontFamily: 'Outfit', fontWeight: 700, fontSize: prominent ? 18 : 22,
        color: prominent ? 'rgba(124,47,255,0.95)' : 'var(--cream, #F0EBE0)', marginTop: 4,
      }}>
        {value}
      </div>
    </div>
  );
}
