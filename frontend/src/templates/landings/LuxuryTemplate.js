// W5.22 Z.8.7 Sub-B2 · Luxury Template · editorial Vogue · Playfair · oro discreto · sin tachado
// Consume schema LLM completo de memory/Z8_PROMPT_01_LUXURY.md
import React, { useState } from 'react';

const PALETTE = {
  bg: '#FAF7F2',
  ink: '#1A1A1A',
  gold: '#B8941F',
  goldSoft: 'rgba(184, 148, 31, 0.18)',
  dim: '#4A4A4A',
  faint: 'rgba(26, 26, 26, 0.45)',
};
const SERIF = "'Playfair Display', 'Cormorant Garamond', Georgia, serif";
const SANS = "'Inter', 'Helvetica Neue', sans-serif";

const fmtCount = (n) => (typeof n === 'number' ? n.toLocaleString('es-MX') : n || '—');

export default function LuxuryTemplate({ intake = {}, copy = null, isPreview = false }) {
  const [faqOpen, setFaqOpen] = useState(-1);

  const advisor = intake.assigned_advisor || {};
  const photos = intake.photos || [];
  const heroPhoto = photos.find((p) => p.category === 'facade' || p.category === 'exterior') || photos[0];
  const interiorPhotos = photos.filter((p) => ['interior', 'unit_interior', 'lobby', 'view'].includes(p.category)).slice(0, 6);

  const preHeader = copy?.pre_header || `${intake.colonia || 'Polanco'}, ${intake.city || 'CDMX'} — para quien ya leyó suficientes brochures.`;
  const headline = copy?.headline || intake.project_name || 'Una residencia que no vuelve a salir a la venta en su generación.';
  const subheadline = copy?.subheadline || 'No las que están off-market. Las que se compran una vez y se heredan.';
  const ctaPrimary = copy?.cta_primary || 'Solicitar dossier privado';
  const reframe = copy?.reframe;
  const storyArc = copy?.story_arc;
  const secrets = copy?.secrets || [];
  const galleryIntro = copy?.gallery_intro;
  const antiObjections = copy?.anti_objections || [];
  const stack = copy?.stack || [];
  const priceBlock = copy?.price_block || (intake.price_visible ? `Desde $${fmtCount(intake.price_from_mxn)} MXN · plan de pagos a convenir con el director del proyecto.` : 'Precio bajo solicitud privada.');
  const riskReversal = copy?.risk_reversal;
  const yesLadder = copy?.yes_ladder;
  const scarcity = copy?.scarcity_block;
  const leadForm = copy?.lead_form_copy || {};
  const faq = copy?.faq || [];
  const ps = copy?.ps || {};
  const footer = copy?.footer_text;

  return (
    <div data-testid="tpl-z87-luxury" style={{ background: PALETTE.bg, color: PALETTE.ink, fontFamily: SANS, minHeight: '100vh', lineHeight: 1.6 }}>
      {/* Pre-header */}
      <div style={{ padding: '24px 48px 0', fontFamily: SERIF, fontStyle: 'italic', color: PALETTE.gold, fontSize: 14, letterSpacing: '0.04em' }}>
        {preHeader}
      </div>

      {/* Hero */}
      <header style={{ position: 'relative', minHeight: '88vh', display: 'flex', alignItems: 'flex-end', padding: '4rem 3rem 6rem' }}>
        {heroPhoto && (
          <div style={{ position: 'absolute', inset: 0, backgroundImage: `linear-gradient(180deg, rgba(250,247,242,0.4), rgba(26,26,26,0.55)), url(${heroPhoto.url})`, backgroundSize: 'cover', backgroundPosition: 'center', zIndex: 0 }} />
        )}
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 880 }}>
          <h1 style={{ fontFamily: SERIF, fontSize: 'clamp(2.5rem, 5.5vw, 5rem)', fontWeight: 700, margin: 0, lineHeight: 1.05, color: heroPhoto ? '#FAF7F2' : PALETTE.ink }}>{headline}</h1>
          <p style={{ marginTop: 28, fontFamily: SERIF, fontStyle: 'italic', fontSize: 'clamp(1rem, 1.6vw, 1.4rem)', color: heroPhoto ? 'rgba(250,247,242,0.85)' : PALETTE.dim, maxWidth: 720, whiteSpace: 'pre-line' }}>{subheadline}</p>
          <a href="#dossier-form" style={{ display: 'inline-block', marginTop: 48, fontFamily: SERIF, fontStyle: 'italic', fontSize: 16, color: heroPhoto ? '#FAF7F2' : PALETTE.ink, textDecoration: 'underline', textDecorationColor: PALETTE.gold, textUnderlineOffset: 8, letterSpacing: '0.04em' }}>{ctaPrimary} →</a>
        </div>
      </header>

      {/* Reframe */}
      {reframe && (
        <section style={{ padding: '6rem 3rem', maxWidth: 820, margin: '0 auto' }}>
          <div style={{ fontFamily: SERIF, fontSize: 'clamp(1.2rem, 2vw, 1.7rem)', lineHeight: 1.7, color: PALETTE.ink, whiteSpace: 'pre-line', fontStyle: 'normal' }}>{reframe}</div>
        </section>
      )}

      {/* Story arc */}
      {storyArc && (
        <section style={{ padding: '5rem 3rem', maxWidth: 880, margin: '0 auto', borderTop: `1px solid ${PALETTE.goldSoft}` }}>
          {storyArc.intro && <p style={{ fontFamily: SERIF, fontStyle: 'italic', color: PALETTE.gold, fontSize: 14, letterSpacing: '0.12em', textTransform: 'uppercase', margin: 0 }}>{storyArc.intro}</p>}
          {storyArc.body && <p style={{ fontFamily: SERIF, fontSize: 'clamp(1.1rem, 1.8vw, 1.5rem)', lineHeight: 1.7, marginTop: 24, color: PALETTE.ink, whiteSpace: 'pre-line' }}>{storyArc.body}</p>}
          {storyArc.closing && <p style={{ marginTop: 24, fontFamily: SERIF, fontStyle: 'italic', color: PALETTE.dim, fontSize: 'clamp(1rem, 1.4vw, 1.2rem)' }}>{storyArc.closing}</p>}
        </section>
      )}

      {/* Tres secretos */}
      {secrets.length > 0 && (
        <section style={{ padding: '5rem 3rem', maxWidth: 1100, margin: '0 auto' }}>
          <h2 style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 'clamp(1.6rem, 2.8vw, 2.2rem)', textAlign: 'center', margin: '0 0 56px', color: PALETTE.ink }}>Tres revelaciones sobre este proyecto</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 56 }}>
            {secrets.slice(0, 3).map((s, i) => (
              <div key={i}>
                <div style={{ fontFamily: SERIF, fontSize: 64, color: PALETTE.gold, lineHeight: 1, marginBottom: 16 }}>{String(i + 1).padStart(2, '0')}</div>
                <h3 style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 20, fontWeight: 600, color: PALETTE.ink, margin: '0 0 16px' }}>{s.title}</h3>
                <p style={{ color: PALETTE.dim, lineHeight: 1.75, fontSize: 15, whiteSpace: 'pre-line' }}>{s.body}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Galería */}
      {interiorPhotos.length > 0 && (
        <section style={{ padding: '5rem 0' }}>
          {galleryIntro && <p style={{ textAlign: 'center', fontFamily: SERIF, fontStyle: 'italic', color: PALETTE.dim, maxWidth: 720, margin: '0 auto 56px', padding: '0 2rem' }}>{galleryIntro}</p>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 4 }}>
            {interiorPhotos.map((p, i) => (
              <figure key={i} style={{ margin: 0, position: 'relative' }}>
                <img src={p.url} alt={p.caption || `interior-${i}`} style={{ width: '100%', height: 480, objectFit: 'cover', display: 'block' }} />
                {p.caption && <figcaption style={{ padding: '14px 24px', fontFamily: SERIF, fontStyle: 'italic', fontSize: 13, color: PALETTE.dim, background: PALETTE.bg }}>{p.caption}</figcaption>}
              </figure>
            ))}
          </div>
        </section>
      )}

      {/* Anti-objeciones */}
      {antiObjections.length > 0 && (
        <section style={{ padding: '5rem 3rem', maxWidth: 880, margin: '0 auto', borderTop: `1px solid ${PALETTE.goldSoft}`, borderBottom: `1px solid ${PALETTE.goldSoft}` }}>
          {antiObjections.slice(0, 3).map((o, i) => (
            <div key={i} style={{ paddingBlock: 32, borderBottom: i < 2 ? `1px dashed ${PALETTE.goldSoft}` : 'none' }}>
              <p style={{ fontFamily: SERIF, fontStyle: 'italic', color: PALETTE.gold, fontSize: 15, margin: 0 }}>Si está pensando:</p>
              <p style={{ fontFamily: SERIF, fontSize: 'clamp(1.1rem, 1.6vw, 1.4rem)', fontWeight: 600, color: PALETTE.ink, margin: '8px 0 18px' }}>"{o.if_thinking}"</p>
              <p style={{ color: PALETTE.dim, lineHeight: 1.7, whiteSpace: 'pre-line' }}>{o.answer}</p>
            </div>
          ))}
        </section>
      )}

      {/* Stack */}
      {stack.length > 0 && (
        <section style={{ padding: '5rem 3rem', maxWidth: 980, margin: '0 auto' }}>
          <h2 style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 'clamp(1.6rem, 2.8vw, 2.2rem)', margin: '0 0 56px', color: PALETTE.ink }}>Lo que recibe</h2>
          {stack.slice(0, 6).map((it, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 32, padding: '28px 0', borderTop: i === 0 ? `1px solid ${PALETTE.gold}` : `1px solid ${PALETTE.goldSoft}` }}>
              <div style={{ fontFamily: SERIF, fontStyle: 'italic', color: PALETTE.gold, fontSize: 24 }}>{it.number || String(i + 1).padStart(2, '0')}</div>
              <div>
                <h4 style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 600, color: PALETTE.ink, margin: '0 0 10px' }}>{it.title}</h4>
                <p style={{ color: PALETTE.dim, lineHeight: 1.7, margin: 0, whiteSpace: 'pre-line' }}>{it.body}</p>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Price block */}
      <section style={{ padding: '4rem 3rem', maxWidth: 820, margin: '0 auto', textAlign: 'center' }}>
        <p style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 'clamp(1.1rem, 1.6vw, 1.4rem)', color: PALETTE.ink, lineHeight: 1.7 }}>{priceBlock}</p>
      </section>

      {/* Risk reversal */}
      {riskReversal && (
        <section style={{ padding: '4rem 3rem', maxWidth: 820, margin: '0 auto', borderTop: `1px solid ${PALETTE.goldSoft}` }}>
          <p style={{ fontFamily: SERIF, fontStyle: 'italic', color: PALETTE.gold, fontSize: 13, letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 24px' }}>Lo que recibe antes de cualquier compromiso</p>
          <p style={{ color: PALETTE.dim, lineHeight: 1.8, whiteSpace: 'pre-line' }}>{riskReversal}</p>
        </section>
      )}

      {/* Scarcity */}
      {scarcity && (
        <section style={{ padding: '4rem 3rem', maxWidth: 820, margin: '0 auto' }}>
          <p style={{ fontFamily: SERIF, fontStyle: 'italic', color: PALETTE.ink, fontSize: 'clamp(1rem, 1.4vw, 1.2rem)', lineHeight: 1.8, whiteSpace: 'pre-line' }}>{scarcity}</p>
        </section>
      )}

      {/* Lead form */}
      <section id="dossier-form" data-testid="lead-form-section" style={{ padding: '6rem 3rem', background: PALETTE.ink, color: PALETTE.bg }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          {leadForm.intro && <p style={{ fontFamily: SERIF, fontStyle: 'italic', color: PALETTE.gold, fontSize: 14, letterSpacing: '0.12em', textTransform: 'uppercase', margin: 0 }}>{leadForm.intro}</p>}
          <h2 style={{ fontFamily: SERIF, fontSize: 'clamp(1.8rem, 3vw, 2.5rem)', margin: '20px 0 32px', color: PALETTE.bg, fontWeight: 600 }}>Solicitar dossier privado</h2>
          <LuxuryForm slug={intake.slug} advisor={advisor} leadForm={leadForm} isPreview={isPreview} />
          {leadForm.trust_text && <p style={{ marginTop: 28, color: 'rgba(250,247,242,0.55)', fontSize: 13, fontFamily: SERIF, fontStyle: 'italic', whiteSpace: 'pre-line' }}>{leadForm.trust_text}</p>}
        </div>
      </section>

      {/* Yes ladder */}
      {yesLadder && (
        <section style={{ padding: '5rem 3rem', maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
          <p style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 'clamp(1.1rem, 1.6vw, 1.4rem)', color: PALETTE.ink, lineHeight: 1.9, whiteSpace: 'pre-line' }}>{yesLadder}</p>
        </section>
      )}

      {/* FAQ */}
      {faq.length > 0 && (
        <section style={{ padding: '4rem 3rem', maxWidth: 820, margin: '0 auto' }}>
          <h2 style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 'clamp(1.4rem, 2.2vw, 1.8rem)', margin: '0 0 32px', color: PALETTE.ink }}>Preguntas frecuentes</h2>
          {faq.map((f, i) => (
            <div key={i} style={{ borderTop: `1px solid ${PALETTE.goldSoft}`, paddingBlock: 18 }}>
              <button type="button" onClick={() => setFaqOpen(faqOpen === i ? -1 : i)} style={{ background: 'none', border: 'none', padding: 0, width: '100%', textAlign: 'left', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
                <span style={{ fontFamily: SERIF, fontSize: 17, color: PALETTE.ink, fontStyle: 'italic' }}>{f.q}</span>
                <span style={{ color: PALETTE.gold, fontFamily: SERIF, fontSize: 22 }}>{faqOpen === i ? '−' : '+'}</span>
              </button>
              {faqOpen === i && <p style={{ marginTop: 14, color: PALETTE.dim, lineHeight: 1.7, fontSize: 15, whiteSpace: 'pre-line' }}>{f.a}</p>}
            </div>
          ))}
        </section>
      )}

      {/* PS */}
      {(ps.body || ps.signature) && (
        <section style={{ padding: '4rem 3rem', maxWidth: 720, margin: '0 auto', borderTop: `1px solid ${PALETTE.goldSoft}` }}>
          {ps.body && <p style={{ fontFamily: SERIF, fontStyle: 'italic', color: PALETTE.ink, lineHeight: 1.8, whiteSpace: 'pre-line', fontSize: 16 }}>{ps.body}</p>}
          {ps.signature && <p style={{ marginTop: 32, fontFamily: SERIF, color: PALETTE.gold, fontSize: 14, letterSpacing: '0.06em' }}>— {ps.signature}</p>}
        </section>
      )}

      {/* Footer */}
      <footer style={{ padding: '3rem', textAlign: 'center', color: PALETTE.faint, fontSize: 12, fontFamily: SERIF, fontStyle: 'italic', letterSpacing: '0.04em' }}>
        {footer || `${intake.developer_name || ''} · ${intake.project_name || ''} · ${intake.colonia || ''} · privacidad LFPDPPP`}
      </footer>
    </div>
  );
}

function LuxuryForm({ slug, advisor, leadForm, isPreview }) {
  const fields = leadForm.fields && leadForm.fields.length > 0 ? leadForm.fields : [
    { id: 'name', label: 'Nombre', required: true },
    { id: 'whatsapp', label: 'WhatsApp', required: true },
    { id: 'referral_source', label: '¿Cómo nos conoció?', type: 'select', options: ['Referido', 'Artículo / publicación', 'Búsqueda directa'] },
  ];
  const submitLabel = leadForm.submit_label || 'Solicitar dossier';
  const [state, setState] = useState({});
  const [sent, setSent] = useState(false);
  const onSubmit = async (e) => {
    e.preventDefault();
    if (isPreview) { setSent(true); return; }
    try {
      const API = process.env.REACT_APP_BACKEND_URL;
      await fetch(`${API}/api/landing/${slug}/lead`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ payload: state }),
      });
      setSent(true);
    } catch (_) { setSent(true); }
  };
  if (sent) return <p style={{ fontFamily: SERIF, fontStyle: 'italic', color: PALETTE.gold }}>Recibido. {advisor.full_name || 'El director del proyecto'} responde en menos de 24 horas.</p>;
  return (
    <form onSubmit={onSubmit} style={{ display: 'grid', gap: 18 }}>
      {fields.map((f) => (
        <label key={f.id} style={{ display: 'block' }}>
          <span style={{ display: 'block', fontFamily: SERIF, fontStyle: 'italic', fontSize: 13, color: PALETTE.gold, marginBottom: 6 }}>{f.label}{f.required ? ' *' : ''}</span>
          {f.type === 'select' && f.options ? (
            <select required={f.required} value={state[f.id] || ''} onChange={(e) => setState((s) => ({ ...s, [f.id]: e.target.value }))} style={{ width: '100%', padding: '12px 14px', background: 'transparent', border: `1px solid ${PALETTE.gold}`, color: PALETTE.bg, fontFamily: SERIF, fontSize: 15 }}>
              <option value="">—</option>
              {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <input type={f.type === 'tel' ? 'tel' : 'text'} required={f.required} value={state[f.id] || ''} onChange={(e) => setState((s) => ({ ...s, [f.id]: e.target.value }))} style={{ width: '100%', padding: '12px 14px', background: 'transparent', border: `1px solid ${PALETTE.gold}`, color: PALETTE.bg, fontFamily: SERIF, fontSize: 15 }} />
          )}
        </label>
      ))}
      <button type="submit" style={{ marginTop: 12, padding: '14px 32px', background: PALETTE.gold, color: PALETTE.ink, border: 'none', fontFamily: SERIF, fontStyle: 'italic', fontSize: 14, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer' }}>{submitLabel}</button>
    </form>
  );
}
