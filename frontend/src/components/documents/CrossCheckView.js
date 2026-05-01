// CrossCheckView — Phase 7.3 · Renders cross-check rules per development.
import React, { useEffect, useState } from 'react';
import * as docsApi from '../../api/documents';
import { Sparkle, AlertTriangle, Check, Clock, RotateCcw, FileText } from '../icons';

const SEVERITY_TONE = {
  critical: { bg: 'rgba(239,68,68,0.14)',  fg: '#fca5a5', label: 'CRÍTICO',  Icon: AlertTriangle },
  warning:  { bg: 'rgba(245,158,11,0.14)', fg: '#fcd34d', label: 'WARNING',  Icon: AlertTriangle },
  info:     { bg: 'rgba(99,102,241,0.10)', fg: '#c7d2fe', label: 'INFO',     Icon: Sparkle },
};
const RESULT_TONE = {
  pass:         { bg: 'rgba(34,197,94,0.14)',  fg: '#86efac', label: 'PASS',         Icon: Check },
  fail:         { bg: 'rgba(239,68,68,0.14)',  fg: '#fca5a5', label: 'FAIL',         Icon: AlertTriangle },
  inconclusive: { bg: 'rgba(148,163,184,0.12)', fg: 'var(--cream-3)', label: 'INCONCLUSO', Icon: Clock },
};

const RULE_LABEL_ES = {
  precio_escritura_vs_lp: 'Precio escritura vs LP',
  vigencia_predial: 'Vigencia predial',
  seduvi_vs_lp_unidades: 'SEDUVI vs LP unidades',
  licencia_m2_total: 'Licencia m² total',
  rfc_constancia_vs_dev: 'RFC constancia vs developer',
};

const fmtVal = (v) => {
  if (v == null) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  if (typeof v === 'number') return Number.isInteger(v) ? v : v.toFixed(2);
  return String(v);
};

function Pill({ tone, children, testid }) {
  return (
    <span data-testid={testid} style={{
      padding: '2px 9px', borderRadius: 9999,
      background: tone.bg, color: tone.fg,
      fontFamily: 'DM Sans', fontSize: 9.5, fontWeight: 700,
      letterSpacing: '0.08em', textTransform: 'uppercase',
      display: 'inline-flex', alignItems: 'center', gap: 4,
    }}><tone.Icon size={9} /> {children}</span>
  );
}

export default function CrossCheckView({ devId, scope = 'superadmin', onOpenDoc }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const load = async () => {
    setLoading(true); setErr(null);
    try { setData(await docsApi.getDevCrossCheck(devId, scope)); }
    catch (e) { setErr(e.message); }
    setLoading(false);
  };

  useEffect(() => { if (devId) load(); /* eslint-disable-next-line */ }, [devId, scope]);

  const trigger = async () => {
    setBusy(true); setErr(null);
    try { await docsApi.triggerCrossCheck(devId, scope); await load(); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  };

  if (loading) return <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>Cargando cross-check…</div>;
  if (err) return <div style={{ color: '#fca5a5', fontFamily: 'DM Sans', fontSize: 12 }}>Error: {err}</div>;

  const results = data?.results || [];
  const summaryTone = data?.criticals > 0 ? 'critical' : data?.warnings > 0 ? 'warning' : (data?.passed > 0 ? 'pass' : 'info');
  const summaryToneStyle = summaryTone === 'critical' ? { bg: 'rgba(239,68,68,0.10)', border: 'rgba(239,68,68,0.32)' }
    : summaryTone === 'warning' ? { bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.32)' }
    : summaryTone === 'pass' ? { bg: 'rgba(34,197,94,0.06)', border: 'rgba(34,197,94,0.28)' }
    : { bg: 'rgba(99,102,241,0.06)', border: 'rgba(99,102,241,0.28)' };

  return (
    <div data-testid="cross-check-view">
      {/* Summary header */}
      <div style={{
        padding: 14, marginBottom: 14, borderRadius: 12,
        background: summaryToneStyle.bg, border: `1px solid ${summaryToneStyle.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Sparkle size={13} color="var(--indigo-3)" />
          <span style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)' }}>
            Cross-check · v{data?.engine_version || '1.0'}
          </span>
          <span style={{ marginLeft: 'auto', fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>
            {data?.total_rules || 0} reglas registradas
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: '#fca5a5' }}><strong>{data?.criticals || 0}</strong> críticos</span>
          <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: '#fcd34d' }}><strong>{data?.warnings || 0}</strong> warnings</span>
          <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: '#86efac' }}><strong>{data?.passed || 0}</strong> pass</span>
          <span style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}><strong>{data?.inconclusive || 0}</strong> inconclusos</span>
          <button data-testid="cross-check-trigger" onClick={trigger} disabled={busy} style={{
            marginLeft: 'auto',
            padding: '5px 12px', borderRadius: 9999,
            background: busy ? 'rgba(148,163,184,0.2)' : 'var(--grad)',
            border: 'none', color: '#fff',
            fontFamily: 'DM Sans', fontWeight: 600, fontSize: 11,
            cursor: busy ? 'wait' : 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 5,
          }}>
            <RotateCcw size={10} /> {busy ? 'Recomputando…' : 'Re-ejecutar reglas'}
          </button>
        </div>
      </div>

      {/* Rules list */}
      {results.length === 0 && (
        <div style={{ padding: 26, textAlign: 'center', background: '#0A0D16', border: '1px solid var(--border)', borderRadius: 12 }}>
          <Sparkle size={22} color="var(--cream-3)" />
          <div style={{ fontFamily: 'Outfit', fontWeight: 600, fontSize: 13.5, color: 'var(--cream-2)', marginTop: 8 }}>
            Aún sin cross-check ejecutado.
          </div>
          <button onClick={trigger} disabled={busy} style={{
            marginTop: 12,
            padding: '8px 18px', borderRadius: 9999,
            background: 'var(--grad)', border: 'none', color: '#fff',
            fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12.5, cursor: 'pointer',
          }}>Ejecutar reglas ahora</button>
        </div>
      )}

      {results.map((r) => {
        const sev = SEVERITY_TONE[r.severity] || SEVERITY_TONE.info;
        const res = RESULT_TONE[r.result] || RESULT_TONE.inconclusive;
        return (
          <div key={r.id} data-testid={`cc-rule-${r.rule_id}`} style={{
            padding: 12, marginBottom: 8, borderRadius: 12,
            background: '#0D1118', border: '1px solid var(--border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: 'var(--cream)' }}>
                  {RULE_LABEL_ES[r.rule_id] || r.rule_id}
                </div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', marginTop: 2 }}>
                  {r.rule_description}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                <Pill tone={sev} testid={`cc-sev-${r.severity}`}>{sev.label}</Pill>
                <Pill tone={res} testid={`cc-result-${r.result}`}>{res.label}</Pill>
              </div>
            </div>

            <div style={{
              padding: 10, marginBottom: 8, borderRadius: 8,
              background: 'rgba(255,255,255,0.02)',
              fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)', lineHeight: 1.5,
            }}>
              {r.message}
            </div>

            {(r.expected != null || r.actual != null || r.delta_pct != null) && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                <div>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 9.5, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Esperado</div>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11.5, color: 'var(--cream)' }}>{fmtVal(r.expected)}</div>
                </div>
                <div>
                  <div style={{ fontFamily: 'DM Sans', fontSize: 9.5, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Actual</div>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11.5, color: r.result === 'fail' ? '#fca5a5' : 'var(--cream)' }}>{fmtVal(r.actual)}</div>
                </div>
                {r.delta_pct != null && (
                  <div>
                    <div style={{ fontFamily: 'DM Sans', fontSize: 9.5, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Δ %</div>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11.5, color: 'var(--cream)' }}>{r.delta_pct >= 0 ? '+' : ''}{r.delta_pct}%</div>
                  </div>
                )}
              </div>
            )}

            {r.referenced_document_ids?.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {r.referenced_document_ids.map(did => (
                  <button key={did} onClick={() => onOpenDoc?.(did)} data-testid="cc-ref-doc" style={{
                    padding: '3px 9px', borderRadius: 9999,
                    background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.28)',
                    color: '#c7d2fe', fontFamily: 'DM Mono, monospace', fontSize: 10, fontWeight: 600,
                    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}><FileText size={9} /> {did}</button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
