/**
 * W5.5 Parte 2 — Sub-B · Cron Switcher Modal.
 *
 * Permite a superadmin cambiar la frecuencia del cron en caliente.
 * Si la nueva frecuencia (hourly/15min) excede la readiness recomendada,
 * exige aceptar el checkbox "Entiendo el riesgo".
 */
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { setFrequency } from '../../api/live_pulse';

const ALL_FREQS = ['weekly', 'biweekly', 'monthly', 'daily', 'hourly', '*/15min'];

// Mapeo bucket readiness → frecuencia maxima recomendada
const STATE_MAX_FREQ_INDEX = {
  bootstrap: 0, // weekly
  growing:   1, // biweekly
  ready:     4, // hourly
  optimal:   5, // */15min
};

export default function LivePulseFrequencyModal({ open, onClose, current, readinessState, onSaved }) {
  const { t } = useTranslation('common');
  const [selected, setSelected] = useState(current || 'weekly');
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (open) {
      setSelected(current || 'weekly');
      setAck(false);
      setErr('');
    }
  }, [open, current]);

  if (!open) return null;

  const maxIdx = readinessState != null ? (STATE_MAX_FREQ_INDEX[readinessState] ?? 0) : 0;
  const selectedIdx = ALL_FREQS.indexOf(selected);
  const isRisky = selectedIdx > maxIdx;
  const canConfirm = !busy && (!isRisky || ack);

  const handleConfirm = async () => {
    setBusy(true);
    setErr('');
    const r = await setFrequency(selected);
    setBusy(false);
    if (r.ok) {
      if (onSaved) onSaved(selected);
      onClose();
    } else {
      setErr(r.body?.detail || t('live_pulse.errors.frequency_change_failed'));
    }
  };

  const labelFor = (f) => t(`live_pulse.frequencies.${f === '*/15min' ? '15min' : f}`);

  return (
    <div
      data-testid="lp-freq-modal"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(6,8,15,0.78)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 90,
      }}
      onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'rgba(13,16,23,0.98)', border: '1px solid rgba(124,47,255,0.40)', borderRadius: 16,
        padding: 28, width: 'min(460px, 92vw)', display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <div>
          <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: 'rgba(240,235,224,0.55)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {t('live_pulse.frequency_modal.title')}
          </div>
          <h3 style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 20, color: 'var(--cream, #F0EBE0)', margin: '6px 0 0' }}>
            {t('live_pulse.actions.change_frequency')}
          </h3>
          <p style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'rgba(240,235,224,0.65)', marginTop: 6 }}>
            {t('live_pulse.frequency_modal.subtitle')}
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.60)' }}>
            {t('live_pulse.frequency_modal.current')}: <strong style={{ color: 'var(--cream, #F0EBE0)' }}>{labelFor(current)}</strong>
          </label>
          <label style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'rgba(240,235,224,0.60)' }}>
            {t('live_pulse.frequency_modal.new')}
          </label>
          <select
            data-testid="lp-freq-select"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            style={{
              padding: '10px 14px', borderRadius: 14, fontFamily: 'DM Sans', fontSize: 13,
              background: 'rgba(255,255,255,0.05)', color: 'var(--cream, #F0EBE0)',
              border: '1px solid rgba(124,47,255,0.30)',
            }}>
            {ALL_FREQS.map((f) => <option key={f} value={f}>{labelFor(f)}</option>)}
          </select>
        </div>

        {isRisky && (
          <div data-testid="lp-freq-warning" style={{
            background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.45)',
            borderRadius: 12, padding: 14, fontFamily: 'DM Sans', fontSize: 12, color: '#fed7aa',
          }}>
            {t('live_pulse.warnings.premature_hourly')}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, cursor: 'pointer' }}>
              <input
                data-testid="lp-freq-ack"
                type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)}
                style={{ accentColor: 'rgba(124,47,255,0.95)' }} />
              <span>{t('live_pulse.warnings.understand_risk')}</span>
            </label>
          </div>
        )}

        {err && (
          <div data-testid="lp-freq-error" style={{
            background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.45)',
            borderRadius: 10, padding: 10, fontFamily: 'DM Sans', fontSize: 12, color: '#fecaca',
          }}>{err}</div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
          <button data-testid="lp-freq-cancel" onClick={onClose} style={{
            padding: '9px 18px', borderRadius: 9999, fontFamily: 'DM Sans', fontSize: 12, cursor: 'pointer',
            background: 'rgba(255,255,255,0.04)', color: 'var(--cream, #F0EBE0)',
            border: '1px solid rgba(255,255,255,0.12)',
          }}>{t('live_pulse.actions.cancel')}</button>
          <button
            data-testid="lp-freq-confirm"
            onClick={handleConfirm}
            disabled={!canConfirm}
            style={{
              padding: '9px 20px', borderRadius: 9999, fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600,
              cursor: canConfirm ? 'pointer' : 'not-allowed', opacity: canConfirm ? 1 : 0.5,
              background: 'linear-gradient(90deg, rgba(124,47,255,0.95), rgba(192,38,211,0.95))',
              color: '#fff', border: '1px solid rgba(124,47,255,0.65)',
            }}>{busy ? '...' : t('live_pulse.actions.confirm')}</button>
        </div>
      </div>
    </div>
  );
}
