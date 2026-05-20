// W5.22 Z.8.7 Sub-B2 · Investor Template · Bloomberg memorándum · JetBrains Mono cifras · azul Bloomberg
// Consume schema LLM completo de memory/Z8_PROMPT_02_INVESTOR.md
import React, { useState, useMemo } from 'react';

const PAL = {
  bg: '#FFFFFF',
  surface: '#F8FAFC',
  muted: '#F1F5F9',
  ink: '#0F172A',
  inkSoft: '#1E293B',
  dim: '#64748B',
  faint: '#94A3B8',
  blue: '#1A56DB',
  blueDark: '#1E40AF',
  blueSoft: '#DBEAFE',
  positive: '#16A34A',
  border: '#E2E8F0',
};
const SANS = "'Outfit', 'Inter', sans-serif";
const MONO = "'JetBrains Mono', 'IBM Plex Mono', ui-monospace, monospace";
const fmtMoney = (v) => (typeof v === 'number' ? `$${v.toLocaleString('es-MX')}` : v || '—');
const fmtPct = (v) => (typeof v === 'number' ? `${v.toFixed(1)}%` : v || '—');

export default function InvestorTemplate({ intake = {}, copy = null, isPreview = false }) {
  const m = intake.investment_metrics || {};
  const advisor = intake.assigned_advisor || {};
  const photos = intake.photos || [];
  const heroPhoto = photos.find((p) => p.category === 'facade' || p.category === 'exterior' || p.category === 'drone') || photos[0];

  const preHeader = copy?.pre_header || `${intake.colonia || 'CDMX'} · memorándum para inversionistas patrimoniales`;
  const headline = copy?.headline || intake.project_name || 'Cap rate proyectado. Plusvalía documentada. Renta indexada USD.';
  const subheadline = copy?.subheadline || `Yield ${fmtPct(m.expected_yield_pct)} · ROI ${fmtPct(m.expected_roi_pct)} · payback ${m.payback_years || '—'} años`;
  const heroStats = copy?.hero_stats || [
    { value: fmtPct(m.cap_rate_pct), label: 'Cap rate', source: 'comparables zona' },
    { value: fmtPct(m.expected_yield_pct), label: 'Yield bruto anual' },
    { value: fmtPct(m.expected_capital_appreciation_pct), label: 'Plusvalía proyectada', source: 'Softec / BBVA' },
    { value: fmtMoney(m.cap_rate_pct && intake.price_from_mxn ? Math.round((intake.price_from_mxn * m.cap_rate_pct) / 100 / 12) : null), label: 'Renta mensual est.' },
  ];
  const reframe = copy?.reframe;
  const storyArc = copy?.story_arc;
  const secrets = copy?.secrets || [];
  const fascination = copy?.fascination_bullets || [];
  const scenariosTable = copy?.scenarios_table;
  const calcCfg = copy?.calculator_config || { title: 'Calculadora ROI privada', input_label: 'Enganche (% del valor)', input_min_pct: 20, input_max_pct: 100 };
  const zoneTable = copy?.zone_comparative_table;
  const investorProfiles = copy?.investor_profiles;
  const antiObjections = copy?.anti_objections || [];
  const stack = copy?.stack || { items: [] };
  const priceBlock = copy?.price_block || {};
  const riskReversal = copy?.risk_reversal;
  const yesLadder = copy?.yes_ladder;
  const scarcity = copy?.scarcity_block;
  const leadForm = copy?.lead_form_copy || {};
  const faq = copy?.faq || [];
  const ps = copy?.ps || {};
  const footer = copy?.footer_text;

  return (
    <div data-testid="tpl-z87-investor" style={{ background: PAL.bg, color: PAL.ink, fontFamily: SANS, minHeight: '100vh', lineHeight: 1.55 }}>
      {/* Pre-header strip */}
      <div style={{ borderBottom: `1px solid ${PAL.border}`, padding: '14px 32px', background: PAL.surface, fontFamily: MONO, fontSize: 11, letterSpacing: '0.15em', color: PAL.blue, textTransform: 'uppercase' }}>{preHeader}</div>

      {/* Hero split */}
      <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', minHeight: '72vh', borderBottom: `1px solid ${PAL.border}` }}>
        <div style={{ background: heroPhoto ? `linear-gradient(135deg, rgba(15,23,42,0.12), rgba(26,86,219,0.18)), url(${heroPhoto.url}) center/cover` : `linear-gradient(135deg, ${PAL.blueDark}, ${PAL.ink})`, minHeight: 400 }} />
        <div style={{ padding: '4rem 3rem', background: PAL.bg, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <h1 style={{ fontSize: 'clamp(2rem, 3.6vw, 3rem)', fontWeight: 800, margin: 0, lineHeight: 1.1, color: PAL.ink }}>{headline}</h1>
          <p style={{ marginTop: 18, fontSize: 16, color: PAL.dim, lineHeight: 1.6 }}>{subheadline}</p>
          <div style={{ marginTop: 40, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 24 }}>
            {heroStats.slice(0, 4).map((s, i) => (
              <div key={i} style={{ paddingTop: 16, borderTop: `2px solid ${PAL.blue}` }}>
                <div style={{ fontFamily: MONO, fontSize: 30, fontWeight: 700, color: PAL.blue, lineHeight: 1 }}>{s.value}</div>
                <div style={{ marginTop: 6, fontSize: 11, color: PAL.dim, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{s.label}</div>
                {s.source && <div style={{ marginTop: 4, fontFamily: MONO, fontSize: 10, color: PAL.faint }}>{s.source}</div>}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 40, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <a href="#proforma" style={{ padding: '14px 26px', background: PAL.blue, color: '#fff', textDecoration: 'none', fontWeight: 600, fontSize: 14, borderRadius: 4 }}>Solicitar pro-forma</a>
            <a href={`mailto:${advisor.email || ''}`} style={{ padding: '14px 26px', border: `1px solid ${PAL.blue}`, color: PAL.blue, textDecoration: 'none', fontWeight: 600, fontSize: 14, borderRadius: 4 }}>Llamada 15 min</a>
          </div>
        </div>
      </section>

      {/* Reframe */}
      {reframe && (
        <section style={{ padding: '5rem 3rem', maxWidth: 880, margin: '0 auto', background: PAL.surface }}>
          <div style={{ fontSize: 'clamp(1.1rem, 1.6vw, 1.4rem)', lineHeight: 1.7, color: PAL.inkSoft, whiteSpace: 'pre-line', fontWeight: 500 }}>{reframe}</div>
        </section>
      )}

      {/* Story arc */}
      {storyArc && (
        <section style={{ padding: '4rem 3rem', maxWidth: 980, margin: '0 auto' }}>
          {storyArc.intro && <p style={{ fontFamily: MONO, fontSize: 11, color: PAL.blue, textTransform: 'uppercase', letterSpacing: '0.15em', margin: 0 }}>{storyArc.intro}</p>}
          {storyArc.body && <p style={{ fontSize: 16, lineHeight: 1.75, color: PAL.inkSoft, marginTop: 24, whiteSpace: 'pre-line' }}>{storyArc.body}</p>}
          {storyArc.closing && <p style={{ marginTop: 16, color: PAL.dim, fontStyle: 'italic' }}>{storyArc.closing}</p>}
        </section>
      )}

      {/* Scenarios table */}
      {scenariosTable?.rows?.length > 0 && (
        <section style={{ padding: '4rem 3rem', maxWidth: 1100, margin: '0 auto' }}>
          <h2 style={{ fontSize: 28, fontWeight: 700, margin: '0 0 12px' }}>Escenarios proyectados</h2>
          {scenariosTable.intro && <p style={{ color: PAL.dim, marginBottom: 24, maxWidth: 720 }}>{scenariosTable.intro}</p>}
          <div style={{ overflowX: 'auto', border: `1px solid ${PAL.border}`, borderRadius: 4 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: MONO, fontSize: 13 }}>
              <thead style={{ background: PAL.muted }}>
                <tr>
                  <th style={{ padding: 14, textAlign: 'left', fontFamily: SANS, fontWeight: 700, color: PAL.ink, borderBottom: `1px solid ${PAL.border}` }}>Métrica</th>
                  {(scenariosTable.columns || ['Conservador', 'Base', 'Optimista']).map((c, i) => (
                    <th key={c} style={{ padding: 14, textAlign: 'right', fontFamily: SANS, fontWeight: 700, color: i === 1 ? PAL.blue : PAL.ink, borderBottom: `1px solid ${PAL.border}` }}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {scenariosTable.rows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: i < scenariosTable.rows.length - 1 ? `1px solid ${PAL.border}` : 'none' }}>
                    <td style={{ padding: 14, fontFamily: SANS, fontWeight: 600 }}>{r.metric}</td>
                    {(r.values || []).map((v, j) => (
                      <td key={j} style={{ padding: 14, textAlign: 'right', color: j === 1 ? PAL.blue : PAL.inkSoft, fontWeight: j === 1 ? 700 : 400 }}>{v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {scenariosTable.disclaimer && <p style={{ marginTop: 16, fontSize: 12, color: PAL.faint, fontStyle: 'italic' }}>{scenariosTable.disclaimer}</p>}
        </section>
      )}

      {/* Calculator */}
      <CalculatorBlock cfg={calcCfg} priceFrom={intake.price_from_mxn} metrics={m} />

      {/* Zone comparative */}
      {zoneTable?.rows?.length > 0 && (
        <section style={{ padding: '4rem 3rem', maxWidth: 1100, margin: '0 auto' }}>
          <h2 style={{ fontSize: 28, fontWeight: 700, margin: '0 0 12px' }}>Comparativo zonal</h2>
          {zoneTable.intro && <p style={{ color: PAL.dim, marginBottom: 24 }}>{zoneTable.intro}</p>}
          <div style={{ overflowX: 'auto', border: `1px solid ${PAL.border}`, borderRadius: 4 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: MONO, fontSize: 13 }}>
              <thead style={{ background: PAL.muted }}>
                <tr>
                  <th style={{ padding: 14, textAlign: 'left', fontFamily: SANS, fontWeight: 700, color: PAL.ink, borderBottom: `1px solid ${PAL.border}` }}>Métrica</th>
                  {(zoneTable.columns || []).map((c, i) => (
                    <th key={c} style={{ padding: 14, textAlign: 'right', fontFamily: SANS, fontWeight: 700, color: i === 0 ? PAL.blue : PAL.ink, borderBottom: `1px solid ${PAL.border}` }}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {zoneTable.rows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${PAL.border}` }}>
                    <td style={{ padding: 14, fontFamily: SANS }}>{r.metric}</td>
                    {(r.values || []).map((v, j) => (
                      <td key={j} style={{ padding: 14, textAlign: 'right', color: j === 0 ? PAL.blue : PAL.inkSoft, fontWeight: j === 0 ? 700 : 400 }}>{v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {zoneTable.source && <p style={{ marginTop: 12, fontSize: 11, color: PAL.faint, fontFamily: MONO }}>Fuente: {zoneTable.source}</p>}
        </section>
      )}

      {/* Investor profiles */}
      {investorProfiles?.profiles?.length > 0 && (
        <section style={{ padding: '4rem 3rem', maxWidth: 1100, margin: '0 auto', background: PAL.surface }}>
          {investorProfiles.intro && <p style={{ color: PAL.dim, marginBottom: 28, maxWidth: 720 }}>{investorProfiles.intro}</p>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
            {investorProfiles.profiles.slice(0, 4).map((p, i) => (
              <div key={i} style={{ background: PAL.bg, border: `1px solid ${PAL.border}`, borderRadius: 4, padding: 24 }}>
                <p style={{ fontFamily: MONO, fontSize: 11, color: PAL.blue, textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>Perfil #{i + 1}</p>
                <p style={{ marginTop: 12, fontWeight: 600, color: PAL.ink, lineHeight: 1.5 }}>{p.archetype}</p>
                <p style={{ marginTop: 12, color: PAL.dim, fontSize: 14, lineHeight: 1.6 }}>{p.thesis}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Fascination bullets */}
      {fascination.length > 0 && (
        <section style={{ padding: '4rem 3rem', maxWidth: 880, margin: '0 auto' }}>
          <h2 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 24px' }}>Lo que va a descubrir en el memorándum</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {fascination.slice(0, 15).map((b, i) => (
              <li key={i} style={{ paddingLeft: 28, marginBottom: 12, position: 'relative', color: PAL.inkSoft, lineHeight: 1.6 }}>
                <span style={{ position: 'absolute', left: 0, color: PAL.blue, fontFamily: MONO, fontSize: 11, top: 4 }}>0{i < 9 ? i + 1 : ''}{i >= 9 ? i + 1 : ''}</span>
                {b}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Secrets */}
      {secrets.length > 0 && (
        <section style={{ padding: '4rem 3rem', maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 32 }}>
            {secrets.slice(0, 3).map((s, i) => (
              <div key={i} style={{ borderTop: `3px solid ${PAL.blue}`, paddingTop: 20 }}>
                <p style={{ fontFamily: MONO, fontSize: 11, color: PAL.blue, textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>Secreto {i + 1}</p>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: PAL.ink, margin: '12px 0' }}>{s.title}</h3>
                <p style={{ color: PAL.dim, lineHeight: 1.7, fontSize: 14, whiteSpace: 'pre-line' }}>{s.body}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Anti-objeciones */}
      {antiObjections.length > 0 && (
        <section style={{ padding: '4rem 3rem', maxWidth: 880, margin: '0 auto', background: PAL.surface }}>
          {antiObjections.slice(0, 3).map((o, i) => (
            <div key={i} style={{ background: PAL.bg, border: `1px solid ${PAL.border}`, borderRadius: 4, padding: 24, marginBottom: 16 }}>
              <p style={{ fontFamily: MONO, fontSize: 11, color: PAL.blue, textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>Si está pensando</p>
              <p style={{ fontSize: 17, fontWeight: 600, color: PAL.ink, margin: '8px 0 16px' }}>"{o.if_thinking}"</p>
              <p style={{ color: PAL.dim, lineHeight: 1.7, whiteSpace: 'pre-line' }}>{o.answer}</p>
            </div>
          ))}
        </section>
      )}

      {/* Stack */}
      {stack.items?.length > 0 && (
        <section style={{ padding: '4rem 3rem', maxWidth: 980, margin: '0 auto' }}>
          {stack.intro && <p style={{ color: PAL.dim, marginBottom: 24 }}>{stack.intro}</p>}
          <div style={{ display: 'grid', gap: 12 }}>
            {stack.items.map((it, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '60px 1fr auto', gap: 20, padding: 20, background: PAL.surface, border: `1px solid ${PAL.border}`, borderRadius: 4, alignItems: 'start' }}>
                <div style={{ fontFamily: MONO, color: PAL.blue, fontSize: 16, fontWeight: 700 }}>{it.number || String(i + 1).padStart(2, '0')}</div>
                <div>
                  <h4 style={{ fontSize: 16, fontWeight: 700, color: PAL.ink, margin: '0 0 6px' }}>{it.title}</h4>
                  <p style={{ color: PAL.dim, lineHeight: 1.6, margin: 0, fontSize: 14 }}>{it.body}</p>
                </div>
                {it.value_real && <div style={{ fontFamily: MONO, fontSize: 12, color: PAL.positive, fontWeight: 600 }}>{it.value_real}</div>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Price block */}
      {(priceBlock.headline || intake.price_from_mxn) && (
        <section style={{ padding: '4rem 3rem', maxWidth: 880, margin: '0 auto', borderTop: `2px solid ${PAL.blue}` }}>
          <h2 style={{ fontFamily: MONO, fontSize: 28, color: PAL.blue, fontWeight: 700, margin: '0 0 24px' }}>{priceBlock.headline || `Desde ${fmtMoney(intake.price_from_mxn)} MXN`}</h2>
          {priceBlock.details && (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {priceBlock.details.map((d, i) => <li key={i} style={{ padding: '8px 0', color: PAL.inkSoft, fontFamily: MONO, fontSize: 13 }}>· {d}</li>)}
            </ul>
          )}
        </section>
      )}

      {/* Risk reversal */}
      {riskReversal && (
        <section style={{ padding: '4rem 3rem', maxWidth: 880, margin: '0 auto', background: PAL.blueSoft, borderRadius: 4 }}>
          <p style={{ fontFamily: MONO, fontSize: 11, color: PAL.blueDark, textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0 }}>Antes de cualquier compromiso</p>
          <p style={{ marginTop: 16, color: PAL.inkSoft, lineHeight: 1.8, whiteSpace: 'pre-line' }}>{riskReversal}</p>
        </section>
      )}

      {/* Scarcity */}
      {scarcity && (
        <section style={{ padding: '3rem 3rem', maxWidth: 880, margin: '0 auto' }}>
          <p style={{ color: PAL.inkSoft, lineHeight: 1.8, fontSize: 15, whiteSpace: 'pre-line' }}>{scarcity}</p>
        </section>
      )}

      {/* Lead form */}
      <section id="proforma" data-testid="lead-form-section" style={{ padding: '5rem 3rem', background: PAL.ink, color: '#fff' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          {leadForm.intro && <p style={{ fontFamily: MONO, fontSize: 11, color: '#7AB8FF', textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0 }}>{leadForm.intro}</p>}
          <h2 style={{ fontSize: 'clamp(1.6rem, 2.6vw, 2rem)', margin: '12px 0 32px', color: '#fff', fontWeight: 700 }}>Solicitar pro-forma de inversión</h2>
          <InvestorForm slug={intake.slug} advisor={advisor} leadForm={leadForm} isPreview={isPreview} />
          {leadForm.trust_text && <p style={{ marginTop: 24, color: 'rgba(255,255,255,0.6)', fontSize: 12, fontFamily: MONO, whiteSpace: 'pre-line' }}>{leadForm.trust_text}</p>}
        </div>
      </section>

      {/* Yes ladder */}
      {yesLadder && (
        <section style={{ padding: '4rem 3rem', maxWidth: 720, margin: '0 auto', textAlign: 'left' }}>
          <p style={{ fontSize: 'clamp(1rem, 1.5vw, 1.2rem)', color: PAL.inkSoft, lineHeight: 1.9, whiteSpace: 'pre-line', fontWeight: 500 }}>{yesLadder}</p>
        </section>
      )}

      {/* FAQ */}
      {faq.length > 0 && (
        <section style={{ padding: '4rem 3rem', maxWidth: 880, margin: '0 auto' }}>
          <h2 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 24px' }}>Preguntas técnicas</h2>
          {faq.map((f, i) => (
            <details key={i} style={{ borderTop: `1px solid ${PAL.border}`, padding: '16px 0' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 600, color: PAL.ink, listStyle: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{f.q}</span>
                <span style={{ color: PAL.blue, fontFamily: MONO, fontSize: 18 }}>+</span>
              </summary>
              <p style={{ marginTop: 12, color: PAL.dim, lineHeight: 1.7, whiteSpace: 'pre-line', fontSize: 14 }}>{f.a}</p>
            </details>
          ))}
        </section>
      )}

      {/* PS */}
      {(ps.body || ps.signature) && (
        <section style={{ padding: '3rem 3rem', maxWidth: 720, margin: '0 auto', borderTop: `2px solid ${PAL.blue}` }}>
          {ps.body && <p style={{ color: PAL.inkSoft, lineHeight: 1.8, whiteSpace: 'pre-line', fontSize: 15 }}>{ps.body}</p>}
          {ps.signature && <p style={{ marginTop: 20, fontFamily: MONO, color: PAL.blue, fontSize: 13 }}>— {ps.signature}</p>}
        </section>
      )}

      {/* Footer */}
      <footer style={{ padding: '2rem 3rem', textAlign: 'center', color: PAL.faint, fontSize: 11, fontFamily: MONO, borderTop: `1px solid ${PAL.border}` }}>
        {footer || `${intake.developer_name || ''} · privacidad LFPDPPP · proyecciones no constituyen asesoría de inversión`}
      </footer>
    </div>
  );
}

function CalculatorBlock({ cfg, priceFrom, metrics }) {
  const [pct, setPct] = useState(20);
  const enganche = useMemo(() => priceFrom ? Math.round((priceFrom * pct) / 100) : 0, [pct, priceFrom]);
  const cashflowAnual = useMemo(() => {
    const roi = metrics?.expected_roi_pct || 18;
    return enganche ? Math.round((enganche * roi) / 100) : 0;
  }, [enganche, metrics]);
  const breakEvenMeses = useMemo(() => metrics?.payback_years ? Math.round(metrics.payback_years * 12) : 60, [metrics]);
  return (
    <section style={{ padding: '4rem 3rem', maxWidth: 820, margin: '0 auto', background: PAL.surface, borderRadius: 8 }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{cfg.title}</h2>
      <label style={{ display: 'block', marginTop: 24 }}>
        <span style={{ fontFamily: MONO, fontSize: 12, color: PAL.dim }}>{cfg.input_label} ({pct}%)</span>
        <input type="range" min={cfg.input_min_pct || 20} max={cfg.input_max_pct || 100} value={pct} onChange={(e) => setPct(Number(e.target.value))} style={{ display: 'block', width: '100%', marginTop: 8 }} />
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginTop: 24 }}>
        <div style={{ background: PAL.bg, padding: 18, border: `1px solid ${PAL.border}` }}>
          <div style={{ fontFamily: MONO, fontSize: 11, color: PAL.dim }}>Enganche</div>
          <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 700, color: PAL.ink }}>{fmtMoney(enganche)}</div>
        </div>
        <div style={{ background: PAL.blue, color: '#fff', padding: 18 }}>
          <div style={{ fontFamily: MONO, fontSize: 11, opacity: 0.85 }}>Cashflow anual base</div>
          <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 700 }}>{fmtMoney(cashflowAnual)}</div>
        </div>
        <div style={{ background: PAL.bg, padding: 18, border: `1px solid ${PAL.border}` }}>
          <div style={{ fontFamily: MONO, fontSize: 11, color: PAL.dim }}>Break-even (meses)</div>
          <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 700, color: PAL.ink }}>{breakEvenMeses}</div>
        </div>
      </div>
    </section>
  );
}

function InvestorForm({ slug, advisor, leadForm, isPreview }) {
  const fields = leadForm.fields?.length > 0 ? leadForm.fields : [
    { id: 'name', label: 'Nombre', required: true },
    { id: 'whatsapp', label: 'WhatsApp', required: true, type: 'tel' },
    { id: 'capital_range', label: 'Capital líquido', type: 'select', options: ['< $2M MXN', '$2-5M MXN', '$5-10M MXN', '$10M+ MXN'], required: true },
    { id: 'horizon', label: 'Horizonte', type: 'select', options: ['Cashflow', 'Plusvalía', 'Mixto'], required: true },
  ];
  const [state, setState] = useState({});
  const [sent, setSent] = useState(false);
  const onSubmit = async (e) => {
    e.preventDefault();
    if (isPreview) { setSent(true); return; }
    try {
      const API = process.env.REACT_APP_BACKEND_URL;
      await fetch(`${API}/api/studio/property-intake/public/${slug}/lead`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ payload: state }) });
      setSent(true);
    } catch (_) { setSent(true); }
  };
  if (sent) return <p style={{ fontFamily: MONO, color: '#7AB8FF' }}>Pro-forma en preparación. {advisor.full_name || 'Director'} responde en 48h hábiles.</p>;
  return (
    <form onSubmit={onSubmit} style={{ display: 'grid', gap: 14 }}>
      {fields.map((f) => (
        <label key={f.id} style={{ display: 'block' }}>
          <span style={{ display: 'block', fontFamily: MONO, fontSize: 11, color: '#7AB8FF', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{f.label}{f.required ? ' *' : ''}</span>
          {f.type === 'select' && f.options ? (
            <select required={f.required} value={state[f.id] || ''} onChange={(e) => setState((s) => ({ ...s, [f.id]: e.target.value }))} style={{ width: '100%', padding: '12px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontFamily: SANS, fontSize: 14, borderRadius: 4 }}>
              <option value="">—</option>
              {f.options.map((o) => <option key={o} value={o} style={{ color: PAL.ink }}>{o}</option>)}
            </select>
          ) : (
            <input type={f.type || 'text'} required={f.required} value={state[f.id] || ''} onChange={(e) => setState((s) => ({ ...s, [f.id]: e.target.value }))} style={{ width: '100%', padding: '12px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontFamily: SANS, fontSize: 14, borderRadius: 4 }} />
          )}
        </label>
      ))}
      <button type="submit" style={{ marginTop: 8, padding: '14px 28px', background: PAL.blue, color: '#fff', border: 'none', fontFamily: SANS, fontSize: 14, fontWeight: 700, cursor: 'pointer', borderRadius: 4 }}>{leadForm.submit_label || 'Solicitar pro-forma · 48h'}</button>
    </form>
  );
}
