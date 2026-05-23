/**
 * W6.11 · FactCheckBadge
 * Visual indicator for LLM-driven source fact-check.
 * Verde (verified ≥80) · amarillo (disputed 50-79) · rojo (unverified <50)
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

const API = process.env.REACT_APP_BACKEND_URL;

const TIERS = [
  { min: 80, label: 'verified', bg: 'rgba(34,197,94,0.14)', fg: '#86efac', border: 'rgba(34,197,94,0.40)' },
  { min: 50, label: 'disputed', bg: 'rgba(245,158,11,0.14)', fg: '#fbbf24', border: 'rgba(245,158,11,0.40)' },
  { min: 0,  label: 'unverified', bg: 'rgba(239,68,68,0.14)', fg: '#fca5a5', border: 'rgba(239,68,68,0.40)' },
];

const pickTier = (confidence) => TIERS.find((t) => confidence >= t.min) || TIERS[TIERS.length - 1];

export default function FactCheckBadge({ claim, sourceUrl, autoCheck = false }) {
  const { t } = useTranslation();
  const [state, setState] = useState({ loading: false, result: null, error: null });
  const [open, setOpen] = useState(false);
  const fetchedRef = useRef(false);

  const fetchVerdict = useCallback(async () => {
    if (!claim || !sourceUrl) return;
    setState({ loading: true, result: null, error: null });
    try {
      const r = await fetch(`${API}/api/insights/fact-check`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claim_text: claim, source_url: sourceUrl }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setState({ loading: false, result: data, error: null });
    } catch (e) {
      setState({ loading: false, result: null, error: e.message || 'error' });
    }
  }, [claim, sourceUrl]);

  useEffect(() => {
    if (autoCheck && !fetchedRef.current && claim && sourceUrl) {
      fetchedRef.current = true;
      fetchVerdict();
    }
  }, [autoCheck, claim, sourceUrl, fetchVerdict]);

  const result = state.result;
  const confidence = result?.confidence ?? null;
  const verdict = result?.verdict || 'unverified';
  const tier = pickTier(confidence ?? 0);

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6 }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => (result ? setOpen((v) => !v) : fetchVerdict())}
        data-testid="factcheck-badge"
        style={{
          background: result ? tier.bg : 'rgba(240,235,224,0.06)',
          color: result ? tier.fg : 'var(--cream-3)',
          border: `1px solid ${result ? tier.border : 'var(--border)'}`,
          borderRadius: 999, padding: '3px 10px',
          fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700,
          cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
        }}
      >
        <span style={{
          width: 6, height: 6, borderRadius: 999,
          background: result ? tier.fg : 'var(--cream-4)',
        }} />
        {state.loading
          ? t('insightsExt.factcheck.checking', 'Verificando…')
          : result
          ? `${t(`insightsExt.factcheck.verdict.${verdict}`, verdict)} · ${confidence}%`
          : t('insightsExt.factcheck.check', 'Verificar fuente')}
      </button>
      {open && result && (
        <div
          role="tooltip"
          style={{
            position: 'absolute', top: '120%', left: 0, zIndex: 50,
            background: '#0D1118', border: '1px solid var(--border)', borderRadius: 10,
            padding: '10px 12px', minWidth: 240, maxWidth: 320,
            boxShadow: '0 12px 30px rgba(0,0,0,0.45)',
          }}
        >
          <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {t('insightsExt.factcheck.rationaleTitle', 'Fundamento')}
          </div>
          <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-2)', lineHeight: 1.45 }}>
            {result.rationale || t('insightsExt.factcheck.noRationale', 'Sin fundamento detallado.')}
          </div>
          {Array.isArray(result.sources_consulted) && result.sources_consulted.length > 0 && (
            <div style={{ marginTop: 8, fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>
              <div style={{ marginBottom: 2 }}>{t('insightsExt.factcheck.sources', 'Fuentes consultadas')}:</div>
              {result.sources_consulted.slice(0, 3).map((s, i) => (
                <div key={i} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--cream-2)' }}>· {s}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </span>
  );
}
