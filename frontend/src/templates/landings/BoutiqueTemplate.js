// W5.22 Z.8.7 Sub-B2 · Boutique Template · editorial cultural · Lora serif · tierra+cream · timeline histórico
// Consume schema LLM completo de memory/Z8_PROMPT_05_BOUTIQUE.md
import React, { useState } from 'react';

const PAL = { bg: '#FDF6E3', paper: '#F7F2DE', ink: '#3B2C1A', dim: '#92704E', brown: '#92400E', olive: '#65803F', border: 'rgba(146, 64, 14, 0.2)' };
const SERIF = "'Lora', 'EB Garamond', Georgia, serif";
const BODY = "'DM Sans', sans-serif";

export default function BoutiqueTemplate({ intake = {}, copy = null, isPreview = false }) {
  const advisor = intake.assigned_advisor || {};
  const photos = intake.photos || [];
  const heroPhoto = photos[0];

  const preHeader = copy?.pre_header || `${intake.colonia || 'Roma Norte'} · un capítulo nuevo de una casa con historia`;
  const headline = copy?.headline || intake.project_name || 'Hay departamentos que se construyen. Otros que se heredan.';
  const subheadline = copy?.subheadline || '';
  const reframe = copy?.reframe;
  const storyArc = copy?.story_arc;
  const timeline = copy?.timeline_block;
  const materiality = copy?.materiality_section;
  const secrets = copy?.secrets || [];
  const neighborhood = copy?.neighborhood_context;
  const antiObjections = copy?.anti_objections || [];
  const stack = copy?.stack || [];
  const priceBlock = copy?.price_block || 'Precio bajo solicitud privada · proceso de selección incluye conversación con curaduría.';
  const riskReversal = copy?.risk_reversal;
  const yesLadder = copy?.yes_ladder;
  const scarcity = copy?.scarcity_block;
  const leadForm = copy?.lead_form_copy || {};
  const faq = copy?.faq || [];
  const ps = copy?.ps || {};
  const footer = copy?.footer_text;

  return (
    <div data-testid="tpl-z87-boutique" style={{ background: PAL.bg, color: PAL.ink, fontFamily: BODY, minHeight: '100vh', lineHeight: 1.7 }}>
      <div style={{ padding: '20px 40px 0', fontFamily: SERIF, fontStyle: 'italic', color: PAL.brown, fontSize: 14, letterSpacing: '0.05em' }}>{preHeader}</div>
      <header style={{ padding: '4rem 3rem 5rem', maxWidth: 980, margin: '0 auto', textAlign: 'center' }}>
        <h1 style={{ fontFamily: SERIF, fontSize: 'clamp(2rem, 4.5vw, 4rem)', fontWeight: 500, margin: 0, lineHeight: 1.15, color: PAL.ink }}>{headline}</h1>
        {subheadline && <p style={{ marginTop: 24, fontFamily: SERIF, fontStyle: 'italic', fontSize: 'clamp(1.1rem, 1.6vw, 1.4rem)', color: PAL.dim, maxWidth: 720, marginInline: 'auto', whiteSpace: 'pre-line' }}>{subheadline}</p>}
      </header>

      {heroPhoto && (
        <figure style={{ margin: 0 }}>
          <img src={heroPhoto.url} alt="lugar" style={{ width: '100%', height: 540, objectFit: 'cover' }} />
          {heroPhoto.caption && <figcaption style={{ padding: 16, textAlign: 'center', fontFamily: SERIF, fontStyle: 'italic', color: PAL.dim, fontSize: 13 }}>{heroPhoto.caption}</figcaption>}
        </figure>
      )}

      {reframe && <section style={{ padding: '5rem 3rem', maxWidth: 760, margin: '0 auto' }}><p style={{ fontFamily: SERIF, fontSize: 'clamp(1.2rem, 1.8vw, 1.5rem)', lineHeight: 1.85, whiteSpace: 'pre-line', color: PAL.ink }}>{reframe}</p></section>}

      {storyArc && (
        <section style={{ padding: '4rem 3rem', maxWidth: 860, margin: '0 auto', borderTop: `1px solid ${PAL.border}`, borderBottom: `1px solid ${PAL.border}` }}>
          {storyArc.intro && <p style={{ fontFamily: SERIF, fontStyle: 'italic', color: PAL.brown, fontSize: 13, letterSpacing: '0.12em', textTransform: 'uppercase', margin: 0 }}>{storyArc.intro}</p>}
          {storyArc.body && <p style={{ marginTop: 20, fontFamily: SERIF, fontSize: 'clamp(1.1rem, 1.5vw, 1.3rem)', lineHeight: 1.85, color: PAL.ink, whiteSpace: 'pre-line' }}>{storyArc.body}</p>}
          {storyArc.closing && <p style={{ marginTop: 16, fontFamily: SERIF, fontStyle: 'italic', color: PAL.dim }}>{storyArc.closing}</p>}
        </section>
      )}

      {timeline?.events?.length > 0 && (
        <section style={{ padding: '5rem 3rem', maxWidth: 880, margin: '0 auto' }}>
          <h2 style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 'clamp(1.6rem, 2.5vw, 2rem)', margin: '0 0 36px', color: PAL.ink, textAlign: 'center' }}>{timeline.title || 'Línea del tiempo'}</h2>
          {timeline.events.map((e, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 24, paddingBlock: 22, borderTop: `1px solid ${PAL.border}` }}>
              <div style={{ fontFamily: SERIF, fontSize: 24, color: PAL.brown, fontWeight: 500 }}>{e.year}</div>
              <div>
                {e.title && <h4 style={{ fontFamily: SERIF, fontStyle: 'italic', margin: '0 0 6px', fontSize: 17, color: PAL.ink, fontWeight: 600 }}>{e.title}</h4>}
                {e.body && <p style={{ color: PAL.dim, lineHeight: 1.7, margin: 0, fontSize: 14 }}>{e.body}</p>}
              </div>
            </div>
          ))}
        </section>
      )}

      {materiality?.items?.length > 0 && (
        <section style={{ padding: '4rem 3rem', maxWidth: 980, margin: '0 auto', background: PAL.paper }}>
          {materiality.intro && <p style={{ fontFamily: SERIF, fontStyle: 'italic', color: PAL.dim, textAlign: 'center', marginBottom: 32 }}>{materiality.intro}</p>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 28 }}>
            {materiality.items.map((cat, i) => (
              <div key={i}>
                <h3 style={{ fontFamily: SERIF, fontStyle: 'italic', color: PAL.brown, fontSize: 18, margin: '0 0 14px', fontWeight: 600 }}>{cat.category}</h3>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {(cat.examples || []).map((ex, j) => <li key={j} style={{ padding: '8px 0', borderBottom: `1px dashed ${PAL.border}`, color: PAL.ink, fontSize: 14, lineHeight: 1.5 }}>{ex}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {secrets.length > 0 && (
        <section style={{ padding: '5rem 3rem', maxWidth: 960, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 36 }}>
            {secrets.slice(0, 3).map((s, i) => (
              <div key={i}>
                <div style={{ fontFamily: SERIF, fontSize: 28, color: PAL.brown, marginBottom: 8 }}>{String(i + 1).padStart(2, '0')}</div>
                <h3 style={{ fontFamily: SERIF, fontSize: 18, fontStyle: 'italic', color: PAL.ink, margin: '0 0 12px', fontWeight: 600 }}>{s.title}</h3>
                <p style={{ color: PAL.dim, lineHeight: 1.7, fontSize: 14, whiteSpace: 'pre-line' }}>{s.body}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {neighborhood?.items?.length > 0 && (
        <section style={{ padding: '4rem 3rem', maxWidth: 880, margin: '0 auto', borderTop: `1px solid ${PAL.border}` }}>
          {neighborhood.intro && <p style={{ fontFamily: SERIF, fontStyle: 'italic', color: PAL.dim, marginBottom: 28 }}>{neighborhood.intro}</p>}
          {neighborhood.items.map((cat, i) => (
            <div key={i} style={{ marginBottom: 24 }}>
              <h4 style={{ fontFamily: SERIF, color: PAL.brown, fontSize: 14, letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 10px' }}>{cat.category}</h4>
              <p style={{ color: PAL.ink, lineHeight: 1.6, margin: 0, fontSize: 14 }}>{(cat.list || []).join(' · ')}</p>
            </div>
          ))}
        </section>
      )}

      {antiObjections.length > 0 && (
        <section style={{ padding: '4rem 3rem', maxWidth: 820, margin: '0 auto' }}>
          {antiObjections.slice(0, 2).map((o, i) => (
            <div key={i} style={{ paddingBlock: 28, borderBottom: i < antiObjections.length - 1 ? `1px solid ${PAL.border}` : 'none' }}>
              <p style={{ fontFamily: SERIF, fontStyle: 'italic', color: PAL.brown, margin: 0, fontSize: 14 }}>Si está pensando:</p>
              <p style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 'clamp(1.1rem, 1.5vw, 1.3rem)', color: PAL.ink, margin: '8px 0 16px', fontWeight: 500 }}>"{o.if_thinking}"</p>
              <p style={{ color: PAL.dim, lineHeight: 1.8, whiteSpace: 'pre-line' }}>{o.answer}</p>
            </div>
          ))}
        </section>
      )}

      {stack.length > 0 && (
        <section style={{ padding: '4rem 3rem', maxWidth: 880, margin: '0 auto', background: PAL.paper }}>
          {stack.slice(0, 5).map((it, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '60px 1fr', gap: 24, paddingBlock: 22, borderTop: `1px solid ${PAL.border}` }}>
              <div style={{ fontFamily: SERIF, fontStyle: 'italic', color: PAL.brown, fontSize: 18 }}>{it.number || String(i + 1).padStart(2, '0')}</div>
              <div>
                <h4 style={{ fontFamily: SERIF, fontStyle: 'italic', margin: '0 0 8px', color: PAL.ink, fontSize: 17, fontWeight: 600 }}>{it.title}</h4>
                <p style={{ color: PAL.dim, lineHeight: 1.7, margin: 0, fontSize: 14, whiteSpace: 'pre-line' }}>{it.body}</p>
              </div>
            </div>
          ))}
        </section>
      )}

      <section style={{ padding: '3rem 3rem', maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
        <p style={{ fontFamily: SERIF, fontStyle: 'italic', color: PAL.ink, fontSize: 'clamp(1rem, 1.4vw, 1.2rem)', lineHeight: 1.8 }}>{priceBlock}</p>
      </section>

      {riskReversal && <section style={{ padding: '3rem 3rem', maxWidth: 760, margin: '0 auto', borderTop: `1px solid ${PAL.border}` }}><p style={{ fontFamily: SERIF, fontStyle: 'italic', color: PAL.dim, lineHeight: 1.8, whiteSpace: 'pre-line' }}>{riskReversal}</p></section>}

      <section data-testid="lead-form-section" style={{ padding: '5rem 3rem', maxWidth: 720, margin: '0 auto', background: PAL.ink, color: PAL.bg, borderRadius: 8 }}>
        <h2 style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 'clamp(1.6rem, 2.6vw, 2rem)', margin: 0, color: PAL.bg, fontWeight: 500, textAlign: 'center' }}>{leadForm.intro || 'Recibir dossier de archivo'}</h2>
        <div style={{ marginTop: 28 }}>
          <BoutiqueForm slug={intake.slug} advisor={advisor} leadForm={leadForm} isPreview={isPreview} />
        </div>
      </section>

      {scarcity && <section style={{ padding: '3rem 3rem', maxWidth: 760, margin: '0 auto' }}><p style={{ fontFamily: SERIF, fontStyle: 'italic', color: PAL.dim, textAlign: 'center', lineHeight: 1.8, whiteSpace: 'pre-line' }}>{scarcity}</p></section>}
      {yesLadder && <section style={{ padding: '3rem 3rem', maxWidth: 720, margin: '0 auto', textAlign: 'center' }}><p style={{ fontFamily: SERIF, fontStyle: 'italic', color: PAL.ink, fontSize: 'clamp(1.1rem, 1.5vw, 1.3rem)', lineHeight: 1.9, whiteSpace: 'pre-line' }}>{yesLadder}</p></section>}

      {faq.length > 0 && (
        <section style={{ padding: '4rem 3rem', maxWidth: 820, margin: '0 auto' }}>
          {faq.map((f, i) => (
            <details key={i} style={{ paddingBlock: 18, borderTop: `1px solid ${PAL.border}` }}>
              <summary style={{ cursor: 'pointer', fontFamily: SERIF, fontStyle: 'italic', color: PAL.ink, fontSize: 16, listStyle: 'none', display: 'flex', justifyContent: 'space-between' }}>
                <span>{f.q}</span><span style={{ color: PAL.brown }}>+</span>
              </summary>
              <p style={{ marginTop: 12, color: PAL.dim, lineHeight: 1.7 }}>{f.a}</p>
            </details>
          ))}
        </section>
      )}

      {(ps.body || ps.signature) && (
        <section style={{ padding: '3rem 3rem', maxWidth: 720, margin: '0 auto', borderTop: `1px solid ${PAL.border}` }}>
          {ps.body && <p style={{ fontFamily: SERIF, fontStyle: 'italic', color: PAL.ink, lineHeight: 1.85, whiteSpace: 'pre-line', fontSize: 16 }}>{ps.body}</p>}
          {ps.signature && <p style={{ marginTop: 20, fontFamily: SERIF, color: PAL.brown, fontSize: 13, fontStyle: 'italic' }}>— {ps.signature}</p>}
        </section>
      )}

      <footer style={{ padding: '2.5rem', textAlign: 'center', color: PAL.dim, fontSize: 12, fontFamily: SERIF, fontStyle: 'italic' }}>{footer || `${intake.developer_name || ''} · ${intake.project_name || ''} · LFPDPPP`}</footer>
    </div>
  );
}

function BoutiqueForm({ slug, advisor, leadForm, isPreview }) {
  const fields = leadForm.fields?.length > 0 ? leadForm.fields : [
    { id: 'name', label: 'Nombre', required: true },
    { id: 'email', label: 'Correo electrónico', required: true },
    { id: 'interest_motivation', label: '¿Qué le interesó?', type: 'select', options: ['La historia de la casa', 'La materialidad descrita', 'La curaduría', 'Un referido'] },
  ];
  const [state, setState] = useState({});
  const [sent, setSent] = useState(false);
  const onSubmit = async (e) => {
    e.preventDefault();
    if (isPreview) { setSent(true); return; }
    try {
      const API = process.env.REACT_APP_BACKEND_URL;
      await fetch(`${API}/api/landing/${slug}/lead`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ payload: state }) });
      setSent(true);
    } catch (_) { setSent(true); }
  };
  if (sent) return <p style={{ fontFamily: SERIF, fontStyle: 'italic', color: '#E6D5A7', textAlign: 'center' }}>Recibido. {advisor.full_name || 'La curadora'} responde en 48h.</p>;
  return (
    <form onSubmit={onSubmit} style={{ display: 'grid', gap: 16 }}>
      {fields.map((f) => (
        <label key={f.id}>
          <span style={{ display: 'block', fontFamily: SERIF, fontStyle: 'italic', fontSize: 13, color: '#C9A96A', marginBottom: 6 }}>{f.label}{f.required ? ' *' : ''}</span>
          {f.type === 'select' && f.options ? (
            <select required={f.required} value={state[f.id] || ''} onChange={(e) => setState((s) => ({ ...s, [f.id]: e.target.value }))} style={{ width: '100%', padding: '12px 14px', background: 'transparent', border: '1px solid #C9A96A', color: PAL.bg, fontFamily: SERIF, fontSize: 14 }}>
              <option value="">—</option>
              {f.options.map((o) => <option key={o} value={o} style={{ color: PAL.ink }}>{o}</option>)}
            </select>
          ) : (
            <input type={f.type === 'email' ? 'email' : 'text'} required={f.required} value={state[f.id] || ''} onChange={(e) => setState((s) => ({ ...s, [f.id]: e.target.value }))} style={{ width: '100%', padding: '12px 14px', background: 'transparent', border: '1px solid #C9A96A', color: PAL.bg, fontFamily: SERIF, fontSize: 14 }} />
          )}
        </label>
      ))}
      <button type="submit" style={{ marginTop: 8, padding: '14px 28px', background: '#C9A96A', color: PAL.ink, border: 'none', fontFamily: SERIF, fontStyle: 'italic', fontSize: 14, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>{leadForm.submit_label || 'Recibir dossier'}</button>
    </form>
  );
}
