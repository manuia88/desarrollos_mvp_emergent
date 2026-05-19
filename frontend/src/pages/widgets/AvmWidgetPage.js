/**
 * W5.1 Sub-Chunk C — AVM widget embeddable.
 * Standalone, sin Navbar ni footer. Diseño compacto para iframe 320-720px.
 * URL: /widgets/avm/:slug?theme=dark|light
 */
import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { fetchAvmQuick, fetchAvmWidgetConfig } from '../../api/avm';
import NarrativeBlock from '../../components/landing/NarrativeBlock';
import { trackWidgetEmbed } from '../../utils/widgetTracking';

function fmtMXN(n) {
  if (!n) return '—';
  try {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n);
  } catch { return `$${n}`; }
}

export default function AvmWidgetPage() {
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const theme = searchParams.get('theme') === 'light' ? 'light' : 'dark';
  const showNarrative = searchParams.get('narrative') === 'true';
  const [config, setConfig] = useState(null);
  const [m2, setM2] = useState(80);
  const [recamaras, setRecamaras] = useState(2);
  const [banos, setBanos] = useState(2);
  const [antiguedad, setAntiguedad] = useState(8);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    document.body.style.margin = '0';
    document.body.style.background = 'transparent';
    return () => {
      document.body.style.margin = '';
      document.body.style.background = '';
    };
  }, []);

  // W5.25 · embed analytics tracking (fail-soft)
  useEffect(() => {
    if (slug) trackWidgetEmbed('avm', { slug });
  }, [slug]);

  useEffect(() => {
    let cancelled = false;
    fetchAvmWidgetConfig(slug, theme)
      .then(d => { if (!cancelled) setConfig(d); })
      .catch(() => { if (!cancelled) setError('not_found'); });
    return () => { cancelled = true; };
  }, [slug, theme]);

  const submit = async (e) => {
    e?.preventDefault();
    setLoading(true); setError(null); setResult(null);
    try {
      const data = await fetchAvmQuick({
        coloniaSlug: slug, m2, recamaras, banos, antiguedadAnos: antiguedad, explain: false,
      });
      setResult(data);
    } catch (err) { setError(String(err.message || err)); }
    finally { setLoading(false); }
  };

  if (error === 'not_found') {
    return (
      <div style={{ padding: 24, fontFamily: 'DM Sans', color: '#888' }}>Colonia no encontrada.</div>
    );
  }
  if (!config) {
    return <div style={{ padding: 24, fontFamily: 'DM Sans', color: '#888' }}>Cargando…</div>;
  }

  const p = config.palette;

  const input = (props) => (
    <input
      {...props}
      style={{
        width: '100%', padding: '8px 12px', borderRadius: 9999,
        background: theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(6,8,15,0.04)',
        border: `1px solid ${p.border}`, color: p.fg,
        fontFamily: 'DM Sans', fontSize: 13, outline: 'none', boxSizing: 'border-box',
      }}
    />
  );

  return (
    <div
      data-testid="avm-widget-root"
      style={{
        fontFamily: 'DM Sans', color: p.fg, background: p.bg,
        minHeight: '100vh', padding: 16, boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          maxWidth: 480, margin: '0 auto', padding: 18,
          borderRadius: 18, background: p.panel,
          border: `1px solid ${p.border}`,
          backdropFilter: 'blur(24px)',
        }}
      >
        <div style={{ fontSize: 10.5, color: p.accent_a, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, marginBottom: 4 }}>
          AVM · {config.colonia_name}
        </div>
        <div style={{ fontFamily: 'Outfit', fontSize: 22, fontWeight: 800, color: p.fg, lineHeight: 1.15, marginBottom: 12 }}>
          Estima el valor de tu propiedad
        </div>

        <form onSubmit={submit} data-testid="avm-widget-form" style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
          <label style={{ gridColumn: 'span 2' }}>
            <div style={{ fontSize: 10, color: p.fg_muted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>m²</div>
            {input({ type: 'number', min: 20, max: 2000, value: m2, onChange: e => setM2(+e.target.value), required: true, 'data-testid': 'avm-widget-m2' })}
          </label>
          <label>
            <div style={{ fontSize: 10, color: p.fg_muted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Recámaras</div>
            {input({ type: 'number', min: 0, max: 10, value: recamaras, onChange: e => setRecamaras(+e.target.value), required: true, 'data-testid': 'avm-widget-rec' })}
          </label>
          <label>
            <div style={{ fontSize: 10, color: p.fg_muted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Baños</div>
            {input({ type: 'number', min: 0, max: 10, value: banos, onChange: e => setBanos(+e.target.value), required: true, 'data-testid': 'avm-widget-banos' })}
          </label>
          <label style={{ gridColumn: 'span 2' }}>
            <div style={{ fontSize: 10, color: p.fg_muted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Antigüedad (años)</div>
            {input({ type: 'number', min: 0, max: 150, value: antiguedad, onChange: e => setAntiguedad(+e.target.value), required: true, 'data-testid': 'avm-widget-ant' })}
          </label>
          <button
            data-testid="avm-widget-submit"
            type="submit"
            disabled={loading}
            style={{
              gridColumn: 'span 2', padding: '10px 16px', borderRadius: 9999, border: 'none',
              background: `linear-gradient(90deg, ${p.accent_a}, ${p.accent_b})`, color: '#fff',
              fontFamily: 'DM Sans', fontSize: 13, fontWeight: 700,
              cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.6 : 1,
            }}
          >{loading ? 'Calculando…' : 'Estimar valor'}</button>
          {error && (
            <div style={{ gridColumn: 'span 2', fontSize: 11, color: '#fca5a5' }}>{error}</div>
          )}
        </form>

        {result && (
          <div data-testid="avm-widget-result" style={{ marginTop: 14, padding: 12, borderRadius: 14, background: theme === 'dark' ? 'rgba(99,102,241,0.10)' : 'rgba(99,102,241,0.06)', border: `1px solid ${p.accent_a}55` }}>
            <div style={{ fontFamily: 'Outfit', fontSize: 26, fontWeight: 800, color: p.fg, lineHeight: 1 }}>
              {fmtMXN(result.precio_estimado)}
            </div>
            <div style={{ fontSize: 11, color: p.fg_muted, marginTop: 4 }}>
              {fmtMXN(result.range_low)} — {fmtMXN(result.range_high)} · Confianza {result.confidence}
            </div>
            <div style={{ fontSize: 10, color: p.fg_muted, marginTop: 2 }}>
              {fmtMXN(result.precio_per_m2)}/m² · {result.pricing_model === 'hedonic_regression' ? 'Modelo hedónico' : 'Modelo heurístico'}
            </div>
          </div>
        )}

        <div style={{ marginTop: 14, paddingTop: 10, borderTop: `1px solid ${p.border}`, display: 'flex', justifyContent: 'space-between', fontSize: 10, color: p.fg_muted }}>
          <a
            href={`/valor/${slug}`} target="_blank" rel="noreferrer"
            style={{ color: p.accent_a, textDecoration: 'none', fontWeight: 700 }}
            data-testid="avm-widget-landing-link"
          >Ver análisis completo →</a>
          <span>Powered by DesarrollosMX</span>
        </div>

        {/* W5.6 Sub-A — Narrative compact (solo si ?narrative=true) */}
        {showNarrative && (
          <div
            data-testid="avm-widget-narrative"
            style={{
              marginTop: 12, padding: '10px 12px', borderRadius: 10,
              background: theme === 'dark' ? 'rgba(99,102,241,0.06)' : 'rgba(99,102,241,0.04)',
              border: `1px solid ${p.accent_a}33`,
              fontSize: 11, color: p.fg_muted, lineHeight: 1.6,
            }}
          >
            <NarrativeBlock
              entityType="zone"
              entityId={slug}
              mode="compact"
              showFooter={false}
            />
          </div>
        )}
      </div>
    </div>
  );
}
