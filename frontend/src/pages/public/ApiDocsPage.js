// W3.5 — /docs/api public page (OpenAPI render + pricing table)
import React, { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import ToolNav from '../../components/ui/ToolNav';
import { fetchOpenAPI } from '../../api/superadminApiKeys';

const TIER_BG = {
  free: { bg: '#F6F7FA', bd: '#ECECEC', fg: 'var(--cream-3)' },
  pro:  { bg: 'rgba(109,74,255,0.08)',  bd: 'rgba(109,74,255,0.30)',  fg: '#5B37E0' },
  enterprise: { bg: 'rgba(198,63,174,0.08)', bd: 'rgba(198,63,174,0.30)', fg: '#C63FAE' },
};

function CurlSample({ path, tier }) {
  const sample = `curl -H "Authorization: Bearer dmx_test_<your_key>" \\
  "https://api.desarrollosmx.io/api/v1${path}"`;
  return (
    <pre style={{
      background: '#F6F7FA', padding: 12, borderRadius: 10,
      fontFamily: 'monospace', fontSize: 11.5, color: '#5B37E0',
      overflowX: 'auto', margin: '8px 0',
    }}>{sample}</pre>
  );
}

export default function ApiDocsPage() {
  const [spec, setSpec] = useState(null);

  useEffect(() => {
    fetchOpenAPI().then(setSpec).catch(() => setSpec(null));
    document.title = 'API Docs · DesarrollosMX';
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'TechArticle',
      'headline': 'DesarrollosMX Public API v1',
      'description': 'API REST con datos espaciales: Zone Score, Risk Score, DRPI, comparables, AVM.',
      'author': { '@type': 'Organization', 'name': 'DesarrollosMX' },
    });
    document.head.appendChild(script);
    return () => { try { document.head.removeChild(script); } catch {} };
  }, []);

  return (
    <div className="theme-light-scope" style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <ToolNav />
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px 80px' }}>
        <div data-testid="api-docs-hero">
          <div style={{
            fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700, letterSpacing: '0.18em',
            textTransform: 'uppercase',
            backgroundImage: 'linear-gradient(90deg,#6366F1,#EC4899)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>API REST · v1.0.0</div>
          <h1 style={{
            fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(32px, 5vw, 56px)',
            color: 'var(--cream)', margin: '12px 0 14px', letterSpacing: '-0.025em',
          }}>DesarrollosMX Public API</h1>
          <p style={{ fontFamily: 'DM Sans', fontSize: 16, color: 'var(--cream-2)', maxWidth: 740, lineHeight: 1.6 }}>
            Conecta tu sistema (CRM, AVM bancario, plataforma de tasación) a los datos espaciales
            DMX: Zone Score A-F, Risk Score V2 (4 dimensiones), DRPI hedonic mensual, comparables
            geo-indexados, valuaciones automatizadas (AVM).
          </p>
        </div>

        {/* Pricing */}
        <section style={{ marginTop: 40 }}>
          <h2 style={{ fontFamily: 'Outfit', color: 'var(--cream)', fontSize: 24, fontWeight: 800, marginBottom: 16 }}>
            Pricing
          </h2>
          <div data-testid="api-docs-pricing-grid"
            style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
            {(spec?.tiers || []).map(t => (
              <div key={t.id} data-testid={`api-docs-pricing-${t.id}`} style={{
                background: TIER_BG[t.id]?.bg, border: `1px solid ${TIER_BG[t.id]?.bd}`,
                borderRadius: 16, padding: 22,
              }}>
                <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{t.id}</div>
                <div style={{ fontFamily: 'Outfit', color: 'var(--cream)', fontWeight: 800, fontSize: 28, marginTop: 8 }}>
                  ${t.price_usd} <span style={{ fontSize: 14, color: 'var(--cream-3)', fontWeight: 400 }}>/ mes</span>
                </div>
                <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: TIER_BG[t.id]?.fg, marginTop: 4 }}>
                  {Number(t.monthly_quota).toLocaleString('es-MX')} calls/mes
                </div>
                <ul style={{ paddingLeft: 18, marginTop: 12, color: 'var(--cream-2)', fontSize: 12.5, fontFamily: 'DM Sans' }}>
                  {(t.features || []).map((f, i) => <li key={i} style={{ marginBottom: 4 }}>{f}</li>)}
                </ul>
              </div>
            ))}
          </div>
          <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'var(--cream-3)', marginTop: 14 }}>
            Solicita tu API key escribiendo a <a href="mailto:api@desarrollosmx.io" style={{ color: '#5B37E0' }}>api@desarrollosmx.io</a>.
            Enterprise se negocia con cuotas y SLAs custom.
          </p>
        </section>

        {/* Auth */}
        <section style={{ marginTop: 40 }}>
          <h2 style={{ fontFamily: 'Outfit', color: 'var(--cream)', fontSize: 24, fontWeight: 800, marginBottom: 12 }}>
            Autenticación
          </h2>
          <p style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'var(--cream-2)' }}>
            Header <code style={{ color: '#5B37E0' }}>Authorization: Bearer dmx_test_&lt;tu_token&gt;</code>.
            Sin auth → 401. Tier insuficiente → 402. Cuota mensual agotada → 429.
            Respuestas incluyen <code style={{ color: '#5B37E0' }}>X-DMX-Tier</code> y <code style={{ color: '#5B37E0' }}>X-DMX-Calls-Remaining</code>.
          </p>
        </section>

        {/* Endpoints */}
        <section style={{ marginTop: 40 }}>
          <h2 style={{ fontFamily: 'Outfit', color: 'var(--cream)', fontSize: 24, fontWeight: 800, marginBottom: 16 }}>
            Endpoints
          </h2>
          <div data-testid="api-docs-endpoints">
            {(spec?.endpoints || []).map((ep, i) => (
              <div key={i} data-testid={`api-docs-endpoint-${i}`} style={{
                marginBottom: 16, padding: 16,
                background: '#FFFFFF',
                border: '1px solid #ECECEC',
                borderRadius: 12,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <span style={{
                    padding: '3px 10px', borderRadius: 9999, fontSize: 10, fontFamily: 'DM Sans', fontWeight: 700,
                    background: 'rgba(31,160,106,0.12)', border: '1px solid rgba(31,160,106,0.36)', color: '#1FA06A',
                    textTransform: 'uppercase',
                  }}>{ep.method}</span>
                  <code style={{ color: 'var(--cream)', fontFamily: 'monospace', fontSize: 14 }}>{ep.path}</code>
                  <span style={{
                    marginLeft: 'auto', padding: '3px 10px', borderRadius: 9999, fontSize: 10, fontFamily: 'DM Sans', fontWeight: 700,
                    background: TIER_BG[ep.tier]?.bg, border: `1px solid ${TIER_BG[ep.tier]?.bd}`, color: TIER_BG[ep.tier]?.fg,
                    textTransform: 'uppercase', letterSpacing: '0.08em',
                  }}>
                    <Lock size={10} style={{ marginRight: 4 }} />
                    {ep.tier}+
                  </span>
                </div>
                <CurlSample path={ep.path} tier={ep.tier} />
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
