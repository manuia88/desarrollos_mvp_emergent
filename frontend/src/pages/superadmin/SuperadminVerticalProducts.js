// W3.6 — Superadmin Vertical Products page.
import React, { useEffect, useState } from 'react';
import { Building2, ShieldAlert, FileSearch, TrendingUp, Copy, X } from 'lucide-react';
import SuperadminLayout from '../../components/superadmin/SuperadminLayout';
import { PageHeader, Card } from '../../components/advisor/primitives';
import VerticalProductCard from '../../components/superadmin/VerticalProductCard';

const API = process.env.REACT_APP_BACKEND_URL;

const VERTICALS = [
  {
    key: 'bank-avm',
    name: 'Bank AVM',
    icon: Building2,
    tier_required: 'pro',
    description: 'Pre-mortgage origination valuation. Hedonic + comparables + risk adj.',
    sample_body: { zone_id: 'polanco', m2: 80, recamaras: 2, baños: 2, year_built: 2018 },
  },
  {
    key: 'insurance-risk',
    name: 'Insurance Risk',
    icon: ShieldAlert,
    tier_required: 'free',
    description: 'Underwriting + premium recommendation. 4-peril breakdown.',
    sample_body: { zone_id: 'polanco', m2: 120, year_built: 2010, floor: 7, coverage_type: 'property' },
  },
  {
    key: 'notaria-title-check',
    name: 'Notaría Title Check',
    icon: FileSearch,
    tier_required: 'enterprise',
    description: 'Pre-escritura due diligence. Transaction Network + heuristic.',
    sample_body: { property_id: 'prop_test_123', transaction_history: [] },
  },
  {
    key: 'investor-yield',
    name: 'Investor Yield',
    icon: TrendingUp,
    tier_required: 'pro',
    description: 'Cap-rate, IRR, Monte Carlo. AVM + DRPI + rent estimate.',
    sample_body: { zone_id: 'polanco', m2: 80, purchase_price: 7000000, hold_years: 5 },
  },
];

export default function SuperadminVerticalProducts() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState(null);

  useEffect(() => {
    let alive = true;
    fetch(`${API}/api/superadmin/api-keys`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject({ status: r.status }))
      .then(d => { if (alive) setStats(d); })
      .catch(() => { if (alive) setStats({ kpis: {}, items: [] }); })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  const totalCalls30d = stats?.kpis?.calls_30d || 0;
  const activeKeys = stats?.kpis?.active || 0;

  return (
    <SuperadminLayout>
      <PageHeader
        eyebrow="W3.6 · Phase Z.4"
        title="Productos Verticales"
        sub="4 endpoints white-label B2B sobre los engines W3.1A · W3.2 · W3.3 · W3.4. Tier-gating Free/Pro/Enterprise. Embebibles vía /widget/*."
      />

      <div data-testid="vertical-products-kpis" style={{
        display: 'grid', gap: 12,
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        marginBottom: 22,
      }}>
        <Kpi label="Calls totales 30d" value={totalCalls30d.toLocaleString('es-MX')} tone="brand" />
        <Kpi label="API keys activas" value={activeKeys} tone="ok" />
        <Kpi label="Verticales" value={VERTICALS.length} tone="pink" />
        <Kpi label="Methodology v" value="1.0.0" tone="muted" />
      </div>

      {loading ? (
        <div style={{ color: 'var(--cream-3)', fontFamily: 'DM Sans' }}>Cargando…</div>
      ) : (
        <div data-testid="vertical-products-grid" style={{
          display: 'grid', gap: 12,
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        }}>
          {VERTICALS.map(v => (
            <VerticalProductCard
              key={v.key}
              vertical={v}
              stats={{ calls_30d: 0, avg_latency_ms: 0 }}
              onTest={(vert) => setDrawer(vert)}
            />
          ))}
        </div>
      )}

      {drawer && <TestDrawer vertical={drawer} onClose={() => setDrawer(null)} />}
    </SuperadminLayout>
  );
}

function TestDrawer({ vertical, onClose }) {
  const [apiKey, setApiKey] = useState('');
  const [bodyText, setBodyText] = useState(JSON.stringify(vertical.sample_body, null, 2));
  const [output, setOutput] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('test');
  const [copied, setCopied] = useState('');

  const onRun = async () => {
    setLoading(true); setOutput(null);
    try {
      const body = JSON.parse(bodyText);
      const r = await fetch(`${API}/api/v1/verticals/${vertical.key}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
      const json = await r.json();
      setOutput({ status: r.status, data: json });
    } catch (e) {
      setOutput({ status: 'err', data: { error: e.message } });
    } finally {
      setLoading(false);
    }
  };

  const onCopy = async (key, text) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(''), 1800); } catch {}
  };

  const curlSnippet =
    `curl -X POST "${window.location.origin}/api/v1/verticals/${vertical.key}" \\\n` +
    `  -H "Authorization: Bearer dmx_test_<your_key>" \\\n` +
    `  -H "Content-Type: application/json" \\\n` +
    `  -d '${JSON.stringify(vertical.sample_body)}'`;

  const iframeSnippet =
    `<iframe src="${window.location.origin}/widget/${vertical.key}?api_key=dmx_test_<your_key>"\n` +
    `  width="100%" height="640" frameborder="0"\n` +
    `  style="border:0;border-radius:14px;background:#06080F"></iframe>`;

  return (
    <div onClick={onClose}
      data-testid={`vertical-test-drawer-${vertical.key}`}
      style={{ position: 'fixed', inset: 0, zIndex: 8000, background: 'rgba(6,8,15,0.85)' }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute', right: 0, top: 0, bottom: 0,
          width: 'min(720px, 96vw)', overflowY: 'auto',
          background: 'rgba(13,16,23,0.98)',
          borderLeft: '1px solid rgba(255,255,255,0.10)',
          padding: 24,
        }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div className="eyebrow">{vertical.tier_required}+ TIER</div>
            <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, color: 'var(--cream)', margin: '4px 0', fontSize: 22 }}>
              {vertical.name}
            </h2>
            <p style={{ fontFamily: 'DM Sans', color: 'var(--cream-3)', fontSize: 13, margin: 0 }}>
              {vertical.description}
            </p>
          </div>
          <button data-testid="vertical-drawer-close-btn" onClick={onClose} style={{
            padding: 6, borderRadius: 9999,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.12)',
            color: 'var(--cream)', cursor: 'pointer',
          }}><X size={16} /></button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 16, borderBottom: '1px solid rgba(255,255,255,0.10)' }}>
          {[['test', 'Probar'], ['curl', 'cURL'], ['embed', 'Iframe embed']].map(([k, label]) => (
            <button key={k} data-testid={`vertical-drawer-tab-${k}`}
              onClick={() => setTab(k)}
              style={{
                padding: '8px 16px', background: 'none', border: 'none',
                borderBottom: tab === k ? '2px solid #a5b4fc' : '2px solid transparent',
                color: tab === k ? 'var(--cream)' : 'var(--cream-3)',
                cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: 600, fontSize: 13,
              }}>{label}</button>
          ))}
        </div>

        <div style={{ marginTop: 16 }}>
          {tab === 'test' && (
            <div>
              <Field label="API key (Bearer)">
                <input data-testid="vertical-drawer-apikey-input"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="dmx_test_..." style={inputStyle} />
              </Field>
              <Field label="Request body (JSON)">
                <textarea data-testid="vertical-drawer-body-input"
                  rows={6} value={bodyText}
                  onChange={(e) => setBodyText(e.target.value)}
                  style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 12 }} />
              </Field>
              <button data-testid="vertical-drawer-run-btn"
                onClick={onRun} disabled={loading || !apiKey}
                style={{
                  marginTop: 12, padding: '9px 18px', borderRadius: 9999,
                  backgroundImage: 'linear-gradient(90deg,#6366F1,#EC4899)',
                  border: '1px solid rgba(255,255,255,0.16)',
                  color: '#fff', cursor: loading || !apiKey ? 'not-allowed' : 'pointer',
                  fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13,
                  opacity: loading || !apiKey ? 0.6 : 1,
                }}>{loading ? 'Ejecutando…' : 'Ejecutar'}</button>
              {output && (
                <Card style={{ marginTop: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)' }}>
                      Status <strong style={{ color: output.status >= 400 ? '#fca5a5' : '#86efac' }}>{output.status}</strong>
                    </span>
                  </div>
                  <pre data-testid="vertical-drawer-output" style={{
                    background: 'rgba(0,0,0,0.45)', padding: 12, borderRadius: 10,
                    fontFamily: 'monospace', fontSize: 11.5,
                    color: '#a5b4fc', overflowX: 'auto', maxHeight: 360,
                    margin: '8px 0 0',
                  }}>{JSON.stringify(output.data, null, 2)}</pre>
                </Card>
              )}
            </div>
          )}
          {tab === 'curl' && (
            <CodeBlock code={curlSnippet} onCopy={() => onCopy('curl', curlSnippet)} copied={copied === 'curl'} />
          )}
          {tab === 'embed' && (
            <CodeBlock code={iframeSnippet} onCopy={() => onCopy('iframe', iframeSnippet)} copied={copied === 'iframe'} />
          )}
        </div>
      </div>
    </div>
  );
}

function CodeBlock({ code, onCopy, copied }) {
  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <button data-testid="vertical-drawer-copy-btn"
          onClick={onCopy}
          style={{
            padding: '5px 12px', borderRadius: 9999,
            background: 'rgba(99,102,241,0.10)',
            border: '1px solid rgba(99,102,241,0.36)',
            color: '#a5b4fc', cursor: 'pointer',
            fontFamily: 'DM Sans', fontWeight: 600, fontSize: 11,
            display: 'inline-flex', alignItems: 'center', gap: 5,
          }}>
          <Copy size={12} /> {copied ? 'Copiado!' : 'Copiar'}
        </button>
      </div>
      <pre style={{
        background: 'rgba(0,0,0,0.45)', padding: 12, borderRadius: 10,
        fontFamily: 'monospace', fontSize: 11.5,
        color: '#a5b4fc', overflowX: 'auto',
        margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>{code}</pre>
    </Card>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'block', marginTop: 12 }}>
      <span style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {label}
      </span>
      {children}
    </label>
  );
}
const inputStyle = {
  width: '100%', padding: '8px 12px', marginTop: 6, borderRadius: 10,
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.12)',
  color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13,
};

function Kpi({ label, value, tone }) {
  const colors = {
    ok:    { bg: 'rgba(16,185,129,0.10)', bd: 'rgba(16,185,129,0.34)', fg: '#86efac' },
    brand: { bg: 'rgba(99,102,241,0.10)', bd: 'rgba(99,102,241,0.34)', fg: '#a5b4fc' },
    pink:  { bg: 'rgba(236,72,153,0.10)', bd: 'rgba(236,72,153,0.34)', fg: '#fbcfe8' },
    muted: { bg: 'rgba(255,255,255,0.04)',bd: 'rgba(255,255,255,0.10)', fg: 'var(--cream-3)' },
  }[tone] || {};
  return (
    <div data-testid={`vertical-products-kpi-${tone}`}
      style={{ background: colors.bg, border: `1px solid ${colors.bd}`, borderRadius: 14, padding: 14 }}>
      <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      <div style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 24, color: colors.fg, marginTop: 6 }}>{value}</div>
    </div>
  );
}
