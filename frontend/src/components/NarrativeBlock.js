// W5.x F4 Sub-E · NarrativeBlock · LLM storyteller cross-feature UI
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { generateNarrative } from '../api/narrative';

const INDIGO = '#6366F1';
const ROSE = '#EC4899';
const CREAM = '#F0EBE0';
const BG = '#06080F';
const CARD_BG = 'rgba(13,16,23,0.92)';
const BORDER = '1px solid rgba(240,235,224,0.10)';
const MUTED = 'rgba(240,235,224,0.62)';
const GRADIENT = 'linear-gradient(90deg, #6366F1, #EC4899)';
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

const tabStyle = (active) => ({
  padding: '8px 18px',
  borderRadius: 9999,
  border: active ? `1px solid ${INDIGO}` : '1px solid rgba(240,235,224,0.14)',
  background: active ? 'rgba(99,102,241,0.18)' : 'transparent',
  color: CREAM,
  cursor: 'pointer',
  fontFamily: 'DM Sans, sans-serif',
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  transition: `transform 320ms ${EASE}`,
});

const Skeleton = () => (
  <div data-testid="narrative-skeleton" style={{ display: 'grid', gap: 10 }}>
    {[100, 92, 86, 70].map((w, i) => (
      <div key={i} style={{ height: 14, width: `${w}%`, borderRadius: 9999, background: 'rgba(240,235,224,0.06)' }} />
    ))}
  </div>
);

function Chip({ children, accent = INDIGO }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '4px 12px', borderRadius: 9999,
      background: 'rgba(99,102,241,0.10)', border: `1px solid ${accent}55`, color: CREAM,
      fontFamily: 'DM Sans, sans-serif', fontSize: 11, marginRight: 6, marginBottom: 6,
    }}>{children}</span>
  );
}

export default function NarrativeBlock({ scope, entityId, audience = 'neutral', disc = null, defaultMode = 'long', language = 'es-MX' }) {
  const { t } = useTranslation('common');
  const [mode, setMode] = useState(defaultMode);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);

  const fetchNarrative = async (force = false) => {
    if (!scope || !entityId) return;
    setLoading(true);
    setErr('');
    try {
      const r = await generateNarrative({ scope, entity_id: entityId, audience, language, disc, force_refresh: !!force });
      setData(r);
    } catch (e) {
      setErr(e?.body?.detail || e?.message || t('narrativeLayer.error_generic'));
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNarrative(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, entityId, audience, disc, language]);

  const currentText = useMemo(() => {
    if (!data) return '';
    if (mode === 'medium') return data.narrative_medium || '';
    if (mode === 'short') return data.narrative_short || '';
    return data.narrative_long || '';
  }, [data, mode]);

  const onCopy = async () => {
    if (!currentText) return;
    try {
      await navigator.clipboard.writeText(currentText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setErr(t('narrativeLayer.error_generic'));
    }
  };

  const audienceLabel = t(`narrative.audience_${audience}`, audience);
  const sources = useMemo(() => {
    const cites = (data?.citations || []).map((c) => c.source).filter(Boolean);
    return Array.from(new Set(cites));
  }, [data]);

  return (
    <section data-testid="narrative-block" style={{
      background: CARD_BG, border: BORDER, borderRadius: 24, padding: 28,
      backdropFilter: 'blur(24px)', color: CREAM, fontFamily: 'DM Sans, sans-serif',
    }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 18, flexWrap: 'wrap' }}>
        <div>
          <div style={{ letterSpacing: '0.22em', fontSize: 11, textTransform: 'uppercase', color: INDIGO }}>{t('narrativeLayer.title')}</div>
          <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 18, marginTop: 4 }}>{audienceLabel}{disc ? ` · ${disc}` : ''}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" data-testid="narrative-refresh" onClick={() => fetchNarrative(true)} disabled={loading} style={{
            padding: '10px 18px', borderRadius: 9999, border: 'none', background: GRADIENT,
            color: '#FFF', fontWeight: 700, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase',
            cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.55 : 1,
            transition: `transform 320ms ${EASE}, opacity 320ms ${EASE}`,
          }}>{loading ? t('narrativeLayer.loading') : t('narrativeLayer.refresh')}</button>
        </div>
      </header>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        <button type="button" data-testid="narrative-tab-long" onClick={() => setMode('long')} style={tabStyle(mode === 'long')}>{t('narrativeLayer.mode_long')}</button>
        <button type="button" data-testid="narrative-tab-medium" onClick={() => setMode('medium')} style={tabStyle(mode === 'medium')}>{t('narrativeLayer.mode_medium')}</button>
        <button type="button" data-testid="narrative-tab-short" onClick={() => setMode('short')} style={tabStyle(mode === 'short')}>{t('narrativeLayer.mode_short')}</button>
      </div>

      <div data-testid="narrative-body" style={{
        minHeight: 80, padding: 18, borderRadius: 16, background: 'rgba(240,235,224,0.04)', border: '1px solid rgba(240,235,224,0.06)',
        color: CREAM, fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap',
      }}>
        {loading ? <Skeleton /> : (err ? <span style={{ color: ROSE }}>{err}</span> : (currentText || t('narrativeLayer.loading')))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ color: MUTED, fontSize: 12 }}>
          {data && (
            <>
              <span data-testid="narrative-conf">conf {Math.round((data.confidence || 0) * 100)}%</span>
              {data.fallback ? <span style={{ marginLeft: 8, color: ROSE }}>· templated fallback</span> : null}
              {data.cached ? <span style={{ marginLeft: 8 }}>· cached</span> : null}
            </>
          )}
        </div>
        <button type="button" data-testid="narrative-copy" onClick={onCopy} disabled={!currentText} style={{
          padding: '8px 16px', borderRadius: 9999, border: '1px solid rgba(240,235,224,0.18)',
          background: 'transparent', color: CREAM, fontFamily: 'DM Sans, sans-serif',
          fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
          cursor: currentText ? 'pointer' : 'not-allowed', opacity: currentText ? 1 : 0.45,
          transition: `transform 320ms ${EASE}`,
        }}>
          {copied ? t('narrativeLayer.copied') : (mode === 'long' ? t('narrativeLayer.copy_long') : mode === 'medium' ? t('narrativeLayer.copy_medium') : t('narrativeLayer.copy_short'))}
        </button>
      </div>

      {sources.length > 0 && (
        <div data-testid="narrative-sources" style={{ marginTop: 18 }}>
          <div style={{ fontSize: 11, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.18em', marginBottom: 8 }}>{t('narrativeLayer.sources')}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap' }}>
            {sources.map((s, i) => <Chip key={i}>{s}</Chip>)}
          </div>
        </div>
      )}
    </section>
  );
}
