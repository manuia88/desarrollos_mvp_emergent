// W5.22 Z.8.7 Sub-B2 · VideoFirst Template · VSL hero fullscreen · captions · sticky WhatsApp · 90% Brunson
// Consume schema LLM completo de memory/Z8_PROMPT_08_VIDEO_FIRST.md
import React, { useState } from 'react';

const PAL = { bg: '#0A0A0A', ink: '#FFFFFF', dim: 'rgba(255,255,255,0.7)', faint: 'rgba(255,255,255,0.4)', accent: '#F97316', whatsapp: '#25D366', surface: 'rgba(255,255,255,0.05)' };
const HEAD = "'Outfit', sans-serif";
const BODY = "'DM Sans', sans-serif";

export default function VideoFirstTemplate({ intake = {}, copy = null, isPreview = false }) {
  const advisor = intake.assigned_advisor || {};
  const videos = intake.videos || [];
  const heroVideo = videos.find((v) => v.type === 'walkthrough' || v.type === 'teaser') || videos[0];
  const otherVideos = videos.filter((v) => v !== heroVideo).slice(0, 5);

  const headlineOverlay = copy?.headline_overlay_on_video?.text || copy?.headline || 'Vívelo antes de visitarlo.';
  const subhead = copy?.subheadline_overlay_on_video?.text || copy?.subheadline || `${intake.units_available || 12} unidades · entrega ${intake.phases?.[0]?.delivery_estimate || ''}`;
  const chapters = copy?.chapters_below_video?.items || copy?.fascination_bullets?.slice(0, 6).map((b, i) => ({ timestamp: `${i + 1}:00`, title: b.split('·')[0] || b, body: b })) || [];
  const tour3d = copy?.tour_3d_block;
  const stackVisual = copy?.stack_visual || { items: copy?.stack_brunson_lite?.items || copy?.stack?.items || [] };
  const videoTestimonials = copy?.video_testimonials;
  const antiClips = copy?.anti_objections_as_micro_clips || copy?.anti_objections?.map((o, i) => ({ if_thinking: o.if_thinking, answer_caption: o.answer })) || [];
  const specificityStrip = copy?.specificity_strip;
  const riskReversal = copy?.risk_reversal_short || copy?.risk_reversal;
  const yesLadder = copy?.yes_ladder;
  const scarcity = copy?.scarcity_block_sutil || copy?.scarcity_block;
  const leadForm = copy?.lead_form_compact || copy?.lead_form_copy || {};
  const faq = copy?.faq_compact || copy?.faq || [];
  const ps = copy?.ps_short || copy?.ps || {};
  const footer = copy?.footer_text_compact || copy?.footer_text;
  const whatsapp = (advisor.phone || '').replace(/\D/g, '');

  return (
    <div data-testid="tpl-z87-video-first" style={{ background: PAL.bg, color: PAL.ink, fontFamily: BODY, minHeight: '100vh', paddingBottom: 90 }}>
      <section style={{ position: 'relative', height: '88vh', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
        {heroVideo?.url ? (
          <video src={heroVideo.url} autoPlay muted loop playsInline poster={heroVideo.thumbnail_url} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          intake.photos?.[0] && <div style={{ position: 'absolute', inset: 0, background: `url(${intake.photos[0].url}) center/cover` }} />
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.3), rgba(0,0,0,0.7))' }} />
        <div style={{ position: 'relative', textAlign: 'center', padding: '0 2rem', maxWidth: 980 }}>
          <h1 style={{ fontFamily: HEAD, fontSize: 'clamp(2.5rem, 7vw, 5rem)', margin: 0, fontWeight: 900, lineHeight: 1, textShadow: '0 4px 24px rgba(0,0,0,0.6)' }}>{headlineOverlay}</h1>
          <p style={{ marginTop: 24, color: 'rgba(255,255,255,0.85)', fontSize: 'clamp(1rem, 1.6vw, 1.3rem)', textShadow: '0 2px 12px rgba(0,0,0,0.8)' }}>{subhead}</p>
          <a href="#agenda" style={{ display: 'inline-block', marginTop: 36, padding: '16px 40px', background: PAL.accent, color: '#fff', textDecoration: 'none', fontFamily: HEAD, fontWeight: 800, fontSize: 16, borderRadius: 9999 }}>Agendar tour 15 min</a>
        </div>
      </section>

      {specificityStrip?.metrics?.length > 0 && (
        <section style={{ padding: '3rem 2rem', maxWidth: 1100, margin: '0 auto', borderBottom: `1px solid ${PAL.surface}` }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 24, textAlign: 'center' }}>
            {specificityStrip.metrics.map((m, i) => (
              <div key={i}>
                <div style={{ fontFamily: HEAD, fontSize: 'clamp(1.6rem, 2.4vw, 2.4rem)', fontWeight: 900, color: PAL.accent }}>{m.value}</div>
                <div style={{ fontSize: 12, color: PAL.dim, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{m.label}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {chapters.length > 0 && (
        <section style={{ padding: '4rem 2rem', maxWidth: 880, margin: '0 auto' }}>
          <h2 style={{ fontFamily: HEAD, fontSize: 24, fontWeight: 800, margin: '0 0 24px' }}>Capítulos del video</h2>
          <div style={{ display: 'grid', gap: 10 }}>
            {chapters.slice(0, 7).map((c, i) => (
              <div key={i} style={{ background: PAL.surface, padding: '14px 18px', borderRadius: 10, display: 'flex', gap: 16 }}>
                <span style={{ fontFamily: HEAD, fontWeight: 800, color: PAL.accent, fontSize: 14, minWidth: 60 }}>{c.timestamp || `${i + 1}:00`}</span>
                <div>
                  <h4 style={{ margin: 0, fontFamily: HEAD, fontSize: 15, color: '#fff' }}>{c.title}</h4>
                  {c.body && <p style={{ margin: '4px 0 0', color: PAL.dim, fontSize: 13 }}>{c.body}</p>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {tour3d && (
        <section style={{ padding: '4rem 2rem', maxWidth: 980, margin: '0 auto', textAlign: 'center' }}>
          <h3 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 22, color: '#fff', margin: '0 0 20px' }}>{tour3d.title || 'Tour 3D'}</h3>
          {tour3d.url_field || intake.virtual_tour_url ? (
            <a href={tour3d.url_field || intake.virtual_tour_url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', padding: '14px 36px', background: PAL.surface, color: '#fff', textDecoration: 'none', border: `1px solid ${PAL.accent}`, borderRadius: 9999, fontFamily: HEAD, fontWeight: 700 }}>Recorrer ahora →</a>
          ) : (
            <p style={{ color: PAL.dim }}>Tour 3D disponible próximamente.</p>
          )}
        </section>
      )}

      {otherVideos.length > 0 && (
        <section style={{ padding: '3rem 2rem', maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
            {otherVideos.map((v, i) => (
              <a key={i} href={v.url} target="_blank" rel="noreferrer" style={{ background: '#000', borderRadius: 10, overflow: 'hidden', aspectRatio: '16/9', position: 'relative', textDecoration: 'none' }}>
                {v.thumbnail_url && <img src={v.thumbnail_url} alt={v.title} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.7 }} />}
                <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#fff', fontFamily: HEAD, fontWeight: 700 }}>▶ {v.title || v.type}</div>
              </a>
            ))}
          </div>
        </section>
      )}

      {stackVisual.items?.length > 0 && (
        <section style={{ padding: '4rem 2rem', maxWidth: 880, margin: '0 auto' }}>
          {stackVisual.intro && <p style={{ color: PAL.dim, textAlign: 'center', marginBottom: 24 }}>{stackVisual.intro}</p>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
            {stackVisual.items.slice(0, 6).map((it, i) => (
              <div key={i} style={{ background: PAL.surface, padding: 18, borderRadius: 12 }}>
                <h4 style={{ margin: 0, fontFamily: HEAD, fontSize: 14, color: PAL.accent }}>{it.title}</h4>
                <p style={{ marginTop: 8, color: PAL.dim, fontSize: 13, margin: '8px 0 0' }}>{it.body}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {antiClips.length > 0 && (
        <section style={{ padding: '3rem 2rem', maxWidth: 880, margin: '0 auto' }}>
          {antiClips.slice(0, 3).map((o, i) => (
            <div key={i} style={{ background: PAL.surface, padding: 20, borderRadius: 12, marginBottom: 12 }}>
              <p style={{ color: PAL.accent, fontSize: 13, fontWeight: 700, margin: 0 }}>"{o.if_thinking}"</p>
              <p style={{ color: PAL.dim, lineHeight: 1.6, margin: '8px 0 0' }}>{o.answer_caption || o.answer}</p>
            </div>
          ))}
        </section>
      )}

      {riskReversal && <section style={{ padding: '3rem 2rem', maxWidth: 820, margin: '0 auto' }}><p style={{ color: PAL.dim, lineHeight: 1.8, whiteSpace: 'pre-line', textAlign: 'center' }}>{riskReversal}</p></section>}
      {scarcity && <section style={{ padding: '2rem', maxWidth: 720, margin: '0 auto', textAlign: 'center' }}><p style={{ color: PAL.faint, fontSize: 14 }}>{scarcity}</p></section>}

      <section id="agenda" data-testid="lead-form-section" style={{ padding: '5rem 2rem', maxWidth: 560, margin: '0 auto' }}>
        <h2 style={{ fontFamily: HEAD, fontSize: 'clamp(1.6rem, 2.6vw, 2rem)', textAlign: 'center', margin: '0 0 24px', fontWeight: 800 }}>{leadForm.intro || 'Agendar tour 15 min'}</h2>
        <VideoForm slug={intake.slug} advisor={advisor} leadForm={leadForm} isPreview={isPreview} />
        {leadForm.trust_text && <p style={{ marginTop: 18, color: PAL.faint, fontSize: 12, textAlign: 'center' }}>{leadForm.trust_text}</p>}
      </section>

      {yesLadder && <section style={{ padding: '3rem 2rem', maxWidth: 720, margin: '0 auto', textAlign: 'center' }}><p style={{ fontFamily: HEAD, fontSize: 'clamp(1.1rem, 1.5vw, 1.3rem)', fontWeight: 600, lineHeight: 1.7, whiteSpace: 'pre-line', color: '#fff' }}>{yesLadder}</p></section>}

      {faq.length > 0 && (
        <section style={{ padding: '3rem 2rem', maxWidth: 760, margin: '0 auto' }}>
          {faq.map((f, i) => (
            <details key={i} style={{ background: PAL.surface, borderRadius: 10, padding: '14px 18px', marginBottom: 8 }}>
              <summary style={{ cursor: 'pointer', fontFamily: HEAD, fontWeight: 700, color: '#fff', listStyle: 'none' }}>{f.q}</summary>
              <p style={{ marginTop: 8, color: PAL.dim, lineHeight: 1.7 }}>{f.a}</p>
            </details>
          ))}
        </section>
      )}

      {(ps.body || ps.signature) && (
        <section style={{ padding: '3rem 2rem', maxWidth: 720, margin: '0 auto' }}>
          {ps.body && <p style={{ color: PAL.dim, lineHeight: 1.7, whiteSpace: 'pre-line', fontSize: 14 }}>{ps.body}</p>}
          {ps.signature && <p style={{ marginTop: 12, color: PAL.accent, fontFamily: HEAD, fontWeight: 700 }}>— {ps.signature}</p>}
        </section>
      )}

      <footer style={{ padding: '2rem', textAlign: 'center', color: PAL.faint, fontSize: 11, borderTop: `1px solid ${PAL.surface}` }}>{footer || `${intake.developer_name || ''} · LFPDPPP`}</footer>

      {whatsapp && (
        <a href={`https://wa.me/${whatsapp}`} style={{ position: 'fixed', bottom: 24, right: 24, width: 60, height: 60, background: PAL.whatsapp, borderRadius: '50%', display: 'grid', placeItems: 'center', textDecoration: 'none', boxShadow: '0 10px 30px rgba(37,211,102,0.45)', color: '#fff', fontSize: 28, fontWeight: 700, zIndex: 50 }}>W</a>
      )}
    </div>
  );
}

function VideoForm({ slug, advisor, leadForm, isPreview }) {
  const fields = leadForm.fields?.length > 0 ? leadForm.fields : [
    { id: 'name', label: 'Nombre', required: true },
    { id: 'whatsapp', label: 'WhatsApp', required: true, type: 'tel' },
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
  if (sent) return <p style={{ background: PAL.surface, padding: 20, borderRadius: 12, textAlign: 'center', color: '#fff' }}>▶ Tour reservado. {advisor.full_name || 'Asesor'} te llama en menos de 30 min.</p>;
  return (
    <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12 }}>
      {fields.map((f) => (
        <label key={f.id}>
          <span style={{ display: 'block', fontSize: 12, color: PAL.dim, marginBottom: 6 }}>{f.label}{f.required ? ' *' : ''}</span>
          <input type={f.type || 'text'} required={f.required} value={state[f.id] || ''} onChange={(e) => setState((s) => ({ ...s, [f.id]: e.target.value }))} style={{ width: '100%', padding: 14, background: PAL.surface, border: `1px solid rgba(255,255,255,0.2)`, borderRadius: 10, color: '#fff', fontSize: 14 }} />
        </label>
      ))}
      <button type="submit" style={{ marginTop: 8, padding: '16px 32px', background: PAL.accent, color: '#fff', border: 'none', borderRadius: 12, fontFamily: HEAD, fontWeight: 800, fontSize: 16, cursor: 'pointer' }}>{leadForm.submit_label || 'Agendar tour 15 min'}</button>
    </form>
  );
}
