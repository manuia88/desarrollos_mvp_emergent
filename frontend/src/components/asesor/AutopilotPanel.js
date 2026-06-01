/**
 * P5.A · AutopilotPanel — sección "Modo Piloto" para AsesorAgentsPage.
 * Auto-pilot EJECUTA acciones por el asesor → UI con guardrails visibles:
 * warning claro · kill switch global (instantáneo) · opt-in por tipo (default off) ·
 * log "el piloto hizo hoy" · run-now. Consume /api/asesor/autopilot/*. FAIL-OPEN.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Bot, Power, AlertTriangle, Zap, Loader2, CheckCircle2, XCircle, MessageCircle, Bell, Shuffle } from 'lucide-react';
import {
  getAutopilotConfig, setAutopilotConfig, getAutopilotLog,
  pauseAutopilot, runAutopilotNow,
} from '../../api/advisor';

const TYPES = ['followup_whatsapp', 'recordatorio', 'reasignar_etapa'];
const TYPE_ICONS = { followup_whatsapp: MessageCircle, recordatorio: Bell, reasignar_etapa: Shuffle };

export default function AutopilotPanel() {
  const { t } = useTranslation('autopilot');
  const [config, setConfig] = useState(null);
  const [log, setLog] = useState({ items: [], done_today: 0 });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const reload = useCallback(async () => {
    const [c, l] = await Promise.all([
      getAutopilotConfig().catch(() => null),
      getAutopilotLog(7).catch(() => ({ items: [], done_today: 0 })),
    ]);
    if (c) setConfig(c);
    setLog(l || { items: [], done_today: 0 });
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const toggleKill = useCallback(async () => {
    if (!config) return;
    const next = !config.paused;
    setConfig((c) => ({ ...c, paused: next }));         // optimista
    try { const r = await pauseAutopilot(next); setConfig(r); } catch { reload(); }
  }, [config, reload]);

  const toggleType = useCallback(async (type) => {
    if (!config) return;
    const nextTypes = { ...config.types, [type]: !config.types?.[type] };
    setConfig((c) => ({ ...c, types: nextTypes }));     // optimista
    try { const r = await setAutopilotConfig({ types: nextTypes }); setConfig(r); } catch { reload(); }
  }, [config, reload]);

  const runNow = useCallback(async () => {
    if (busy) return;
    setBusy(true); setMsg(null);
    try {
      const r = await runAutopilotNow();
      const n = r?.executed ?? 0;
      setMsg({ kind: 'ok', text: n > 0 ? t('run_done', { count: n }) : t('run_none') });
      await reload();
    } catch (e) {
      setMsg({ kind: e?.status === 429 ? 'warn' : 'err',
               text: e?.status === 429 ? t('rate_limited') : t('run_none') });
    } finally { setBusy(false); }
  }, [busy, t, reload]);

  if (!config) return null;
  const paused = !!config.paused;

  return (
    <section className="mb-8" data-testid="autopilot-panel">
      <div className="flex items-center gap-2 mb-3">
        <Bot size={16} className="text-[var(--cream-2)]" />
        <h2 className="text-[var(--cream)] text-sm font-semibold uppercase tracking-wide">
          {t('section_title')}
        </h2>
        <span className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
          paused ? 'text-[var(--cream-3)] bg-[var(--surface-2)]'
                 : 'text-amber-300 bg-[rgba(245,158,11,0.14)]'
        }`}>
          {paused ? t('status_paused') : t('status_active')}
        </span>
      </div>

      {/* Warning explícito · el piloto actúa por ti */}
      <div className="flex items-start gap-2 p-3 mb-3 rounded-xl bg-[rgba(245,158,11,0.08)] border border-[rgba(245,158,11,0.22)]">
        <AlertTriangle size={15} className="text-amber-300 shrink-0 mt-0.5" />
        <p className="text-[var(--cream-2)] text-xs leading-relaxed">
          {t('warning')} <span className="text-[var(--cream-3)]">{t('warning_how_off')}</span>
        </p>
      </div>

      <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] overflow-hidden" style={{ boxShadow: 'var(--asr-shadow)' }}>
        {/* Control maestro · hero */}
        <div className="flex items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            <span style={{
              width: 42, height: 42, borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              background: paused ? 'var(--surface-2)' : 'linear-gradient(135deg, #10B981, #34D399)',
              color: paused ? 'var(--cream-3)' : '#fff',
              boxShadow: paused ? 'none' : '0 6px 16px rgba(16,185,129,0.32)',
            }}>
              <Power size={19} />
            </span>
            <div>
              <p className="text-[var(--cream)] text-sm font-bold">{t('kill_switch')}</p>
              <p className="text-[var(--cream-3)] text-xs">{t('kill_switch_hint')}</p>
            </div>
          </div>
          <button
            type="button" role="switch" aria-checked={!paused} onClick={toggleKill} data-testid="autopilot-kill-switch"
            className="relative w-12 h-7 rounded-full transition-all shrink-0"
            style={{ background: paused ? 'var(--border-2)' : 'linear-gradient(90deg, #10B981, #34D399)', boxShadow: paused ? 'none' : '0 2px 10px rgba(16,185,129,0.4)' }}
          >
            <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${paused ? '' : 'translate-x-5'}`} />
          </button>
        </div>

        {/* Permisos · 3 tarjetas que se tintan al prenderse */}
        <div className={`px-4 pb-4 ${paused ? 'opacity-50 pointer-events-none' : ''}`}>
          <p className="text-[var(--cream-3)] text-[11px] font-bold uppercase tracking-wider mb-2.5">{t('types_title')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {TYPES.map((type) => {
              const on = !!config.types?.[type];
              const Ico = TYPE_ICONS[type] || Zap;
              return (
                <button
                  key={type} type="button" role="switch" aria-checked={on}
                  data-testid={`autopilot-type-${type}`} onClick={() => toggleType(type)}
                  className="flex flex-col gap-2.5 p-3 rounded-xl border text-left transition-all"
                  style={{ borderColor: on ? 'rgba(var(--theme-rgb),0.45)' : 'var(--border)', background: on ? 'rgba(var(--theme-rgb),0.06)' : 'var(--surface)' }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span style={{
                      width: 30, height: 30, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      background: on ? 'linear-gradient(135deg, var(--theme), var(--theme-3))' : 'var(--surface-2)',
                      color: on ? '#fff' : 'var(--cream-3)',
                    }}>
                      <Ico size={15} />
                    </span>
                    <span className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors"
                      style={{ background: on ? 'linear-gradient(90deg, var(--theme), var(--theme-3))' : 'var(--border-2)' }}>
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${on ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
                    </span>
                  </div>
                  <span className="text-[var(--cream)] text-xs font-semibold leading-snug">{t(`type_${type}`)}</span>
                </button>
              );
            })}
          </div>
          <p className="text-[var(--cream-3)] text-[11px] mt-2.5 leading-relaxed">{t('types_hint')} {t('guardrails_note')}</p>
        </div>

        {/* Footer · acciones de hoy + ejecutar */}
        <div className="flex items-center justify-between gap-3 px-4 py-3.5 border-t border-[var(--border)]">
          <p className="text-[var(--cream-2)] text-xs font-semibold">
            {t('log_done_today', { count: log.done_today || 0 })}
          </p>
          <button
            type="button" onClick={runNow} disabled={busy || paused} data-testid="autopilot-run-now"
            className="flex items-center gap-1.5 px-4 h-9 rounded-full text-xs font-bold text-white disabled:opacity-50 transition-opacity"
            style={{ background: 'linear-gradient(90deg, var(--theme), var(--theme-3))', boxShadow: '0 4px 14px rgba(var(--theme-rgb),0.3)' }}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
            {busy ? t('running') : t('run_now')}
          </button>
        </div>

        {/* Log de acciones recientes (si hay) */}
        {(msg || (log.items || []).length > 0) && (
          <div className="px-4 pb-4 pt-1 space-y-1.5">
            {msg && (
              <p className={`text-xs ${msg.kind === 'ok' ? 'text-emerald-500' : msg.kind === 'warn' ? 'text-amber-500' : 'text-rose-500'}`}>{msg.text}</p>
            )}
            {(log.items || []).slice(0, 8).map((it) => (
              <div key={it.id} className="flex items-center gap-2 text-xs" data-testid={`autopilot-log-${it.id}`}>
                {it.status === 'auto_done'
                  ? <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                  : <XCircle size={13} className="text-rose-500 shrink-0" />}
                <span className="text-[var(--cream-2)] truncate flex-1">{it.title || it.type}</span>
                {it.status !== 'auto_done' && <span className="text-rose-500">{t('log_failed')}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
