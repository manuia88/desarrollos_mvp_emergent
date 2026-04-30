// Tab 3 — Avance de obra: progress bar + horizontal 7-phase timeline + log + (gated) photo timeline
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Lock } from '../icons';

export default function ProgressTab({ dev, user, onGateOpen }) {
  const { t } = useTranslation();
  const cp = dev.construction_progress || {};
  const pct = cp.percentage ?? 0;
  const phases = cp.phases || [];
  const log = cp.log || [];

  const visibleLog = user ? log : log.slice(0, 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }} data-testid="progress-tab">
      {/* Header + bar */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div className="eyebrow">{t('dev.progress_h')}</div>
            <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 32, color: 'var(--cream)', letterSpacing: '-0.03em' }}>
              {pct}<span style={{ fontSize: 20, color: 'var(--cream-3)' }}>%</span>
              <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)', fontWeight: 400, marginLeft: 10 }}>
                · {cp.status}
              </span>
            </div>
          </div>
          <div style={{
            fontFamily: 'DM Sans', fontSize: 11,
            color: 'var(--cream-3)', textAlign: 'right',
          }}>
            {t('dev.last_update')}: {cp.last_update}
          </div>
        </div>
        <div style={{ height: 10, background: 'rgba(255,255,255,0.06)', borderRadius: 9999, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${pct}%`,
            background: 'var(--grad)',
            borderRadius: 9999,
            transition: 'width 1.2s cubic-bezier(0.22,1,0.36,1)',
          }} />
        </div>
      </div>

      {/* 7-phase timeline */}
      <div>
        <div className="eyebrow" style={{ marginBottom: 14 }}>{t('dev.phases_h')}</div>
        <div style={{ position: 'relative', padding: '20px 0 12px' }}>
          <div style={{
            position: 'absolute', top: 30, left: '5%', right: '5%', height: 2,
            background: 'var(--border-2)',
          }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative' }}>
            {phases.map((p, i) => {
              const done = p.status === 'done';
              const active = p.status === 'active';
              return (
                <div key={p.key} style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{
                    width: done || active ? 22 : 14,
                    height: done || active ? 22 : 14,
                    margin: '0 auto 8px',
                    borderRadius: 9999,
                    background: active ? 'var(--grad)' : done ? '#22C55E' : 'var(--bg-3)',
                    border: done || active ? 'none' : '2px solid var(--border-2)',
                    transition: 'all 0.4s',
                    boxShadow: active ? '0 0 14px rgba(99,102,241,0.6)' : 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {done && !active && (
                      <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
                  </div>
                  <div style={{
                    fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: active ? 600 : 500,
                    color: active ? 'var(--indigo-3)' : done ? 'var(--cream-2)' : 'var(--cream-3)',
                  }}>
                    {p.label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Log */}
      <div>
        <div className="eyebrow" style={{ marginBottom: 14 }}>{t('dev.log_h')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {visibleLog.map((entry, i) => (
            <div key={i} style={{
              padding: 16,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              display: 'flex', gap: 14,
            }}>
              <div style={{
                flexShrink: 0, width: 56,
                padding: '6px 8px',
                background: 'var(--grad)',
                borderRadius: 10,
                textAlign: 'center',
                fontFamily: 'Outfit', fontWeight: 800, color: '#fff',
              }}>
                <div style={{ fontSize: 18, lineHeight: 1 }}>{entry.percentage}%</div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 9, fontWeight: 500, letterSpacing: '0.08em' }}>{entry.date}</div>
              </div>
              <p style={{ fontFamily: 'DM Sans', fontSize: 13.5, color: 'var(--cream-2)', lineHeight: 1.6, margin: 0 }}>
                {entry.description}
              </p>
            </div>
          ))}

          {!user && log.length > 1 && (
            <button onClick={() => onGateOpen(t('dev.gate_context_log'))}
              data-testid="gate-open-from-log"
              style={{
                padding: 18,
                background: 'rgba(99,102,241,0.06)',
                border: '1px dashed rgba(99,102,241,0.30)',
                borderRadius: 14,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                fontFamily: 'DM Sans', fontSize: 13, color: 'var(--indigo-3)',
                cursor: 'pointer',
              }}>
              <Lock size={14} color="var(--indigo-3)" />
              {t('dev.log_gated', { n: log.length - 1 })}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
