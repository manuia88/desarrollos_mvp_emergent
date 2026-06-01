/**
 * P5.A · AutopilotPanel — sección "Modo Piloto" para AsesorAgentsPage.
 * Auto-pilot EJECUTA acciones por el asesor → UI con guardrails visibles:
 * warning claro · kill switch global (instantáneo) · opt-in por tipo (default off) ·
 * log "el piloto hizo hoy" · run-now. Consume /api/asesor/autopilot/*. FAIL-OPEN.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Bot, Power, AlertTriangle, Zap, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import {
  getAutopilotConfig, setAutopilotConfig, getAutopilotLog,
  pauseAutopilot, runAutopilotNow,
} from '../../api/advisor';

const TYPES = ['followup_whatsapp', 'recordatorio', 'reasignar_etapa'];

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

      <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4 space-y-4" style={{ boxShadow: 'var(--asr-shadow)' }}>
        {/* Kill switch global */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Power size={15} className={paused ? 'text-[var(--cream-3)]' : 'text-emerald-300'} />
            <div>
              <p className="text-[var(--cream)] text-sm font-medium">{t('kill_switch')}</p>
              <p className="text-[var(--cream-3)] text-xs">{t('kill_switch_hint')}</p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={!paused}
            onClick={toggleKill}
            data-testid="autopilot-kill-switch"
            className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
              paused ? 'bg-[var(--surface-2)]' : 'bg-emerald-500'
            }`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
              paused ? '' : 'translate-x-5'
            }`} />
          </button>
        </div>

        {/* Opt-in por tipo */}
        <div className={paused ? 'opacity-50 pointer-events-none' : ''}>
          <p className="text-[var(--cream-3)] text-xs font-semibold uppercase tracking-wide mb-2">{t('types_title')}</p>
          <div className="space-y-2">
            {TYPES.map((type) => {
              const on = !!config.types?.[type];
              return (
                <div key={type} className="flex items-center justify-between gap-3 cursor-pointer" onClick={() => toggleType(type)}>
                  <span className="text-[var(--cream-2)] text-sm">{t(`type_${type}`)}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    data-testid={`autopilot-type-${type}`}
                    onClick={(e) => { e.stopPropagation(); toggleType(type); }}
                    className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors"
                    style={{ background: on ? 'linear-gradient(90deg, var(--theme), var(--theme-3))' : 'var(--border-2)' }}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${on ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              );
            })}
          </div>
          <p className="text-[var(--cream-3)] text-[11px] mt-2">{t('types_hint')}</p>
          <p className="text-[var(--cream-3)] text-[11px]">{t('guardrails_note')}</p>
        </div>

        {/* Log + run-now */}
        <div className="pt-3 border-t border-[var(--border)]">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-[var(--cream)] text-xs font-semibold">
              {t('log_title')}: {t('log_done_today', { count: log.done_today || 0 })}
            </p>
            <button
              type="button"
              onClick={runNow}
              disabled={busy || paused}
              data-testid="autopilot-run-now"
              className="flex items-center gap-1.5 px-3 h-8 rounded-full text-xs font-medium text-[var(--cream)] bg-[var(--surface-2)] border border-[var(--border)] hover:bg-[var(--surface-2)] disabled:opacity-50 transition-colors"
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
              {busy ? t('running') : t('run_now')}
            </button>
          </div>
          {msg && (
            <p className={`text-xs mb-2 ${
              msg.kind === 'ok' ? 'text-emerald-300' : msg.kind === 'warn' ? 'text-amber-300' : 'text-rose-300'
            }`}>{msg.text}</p>
          )}
          {(log.items || []).length === 0 ? (
            <p className="text-[var(--cream-3)] text-xs">{t('log_empty')}</p>
          ) : (
            <div className="space-y-1.5">
              {log.items.slice(0, 8).map((it) => (
                <div key={it.id} className="flex items-center gap-2 text-xs" data-testid={`autopilot-log-${it.id}`}>
                  {it.status === 'auto_done'
                    ? <CheckCircle2 size={13} className="text-emerald-300 shrink-0" />
                    : <XCircle size={13} className="text-rose-300 shrink-0" />}
                  <span className="text-[var(--cream-2)] truncate flex-1">{it.title || it.type}</span>
                  {it.status !== 'auto_done' && <span className="text-rose-300">{t('log_failed')}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
