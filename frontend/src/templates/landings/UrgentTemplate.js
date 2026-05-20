// W5.22 Z.8.7 Sub-B2 · Urgent Template · Brunson PURO 95% · countdown XL · banner rojo · stack con suma
// Consume schema LLM completo de memory/Z8_PROMPT_06_URGENT.md
import React, { useEffect, useState } from 'react';

const PAL = { red: '#DC2626', redDark: '#991B1B', orange: '#F97316', ink: '#0F172A', bg: '#FFFFFF', dim: '#64748B', highlight: '#FEF08A', surface: '#FEF2F2', border: '#FECACA', green: '#16A34A' };
const HEAD = "'Outfit', sans-serif";
const BODY = "'DM Sans', sans-serif";
const fmtMoney = (v) => (typeof v === 'number' ? `$${v.toLocaleString('es-MX')}` : v || '—');

function useCountdown(targetIso) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  if (!targetIso) return null;
  const target = new Date(targetIso).getTime();
  const diff = Math.max(0, target - now);
  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff / 3600000) % 24),
    minutes: Math.floor((diff / 60000) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  };
}

export default function UrgentTemplate({ intake = {}, copy = null, isPreview = false }) {
  const advisor = intake.assigned_advisor || {};
  const photos = intake.photos || [];

  const stickyBanner = copy?.sticky_banner_top;
  const preHeader = copy?.pre_header || `Solo ${intake.units_available || 3} unidades · cierra fase`;
  const headline = copy?.headline || `Quedan ${intake.units_available || 3} unidades. Sube +${intake.promo_discount_pct || 8}%. ¿Esperas o decides?`;
  const subheadline = copy?.subheadline || '';
  const countdown = useCountdown(copy?.countdown_visible?.target_date || intake.urgent_expires_at);
  const reframe = copy?.reframe;
  const mathBlock = copy?.math_block;
  const threeSecrets = copy?.three_secrets || [];
  const fascination = copy?.fascination_bullets || [];
  const antiObjections = copy?.anti_objections || [];
  const stack = copy?.stack_brunson_puro || copy?.stack || { items: [] };
  const liveCounter = copy?.live_counter_block;
  const riskReversal = copy?.risk_reversal;
  const yesLadder = copy?.yes_ladder;
  const scarcity = copy?.scarcity_block;
  const leadForm = copy?.lead_form_copy || {};
  const faq = copy?.faq || [];
  const ps = copy?.ps || {};
  const footer = copy?.footer_text;
  const ctaPrimary = copy?.cta_primary?.label || `Bloquear precio fase ${intake.phases?.[0]?.phase_name || 'actual'}`;

  return (
    <div data-testid="tpl-z87-urgent" style={{ background: PAL.bg, color: PAL.ink, fontFamily: BODY, minHeight: '100vh', paddingBottom: 90 }}>
      <div style={{ background: PAL.red, color: '#fff', padding: '12px 24px', textAlign: 'center', fontFamily: HEAD, fontWeight: 800, fontSize: 14, position: 'sticky', top: 0, zIndex: 40 }}>
        ⚡ {stickyBanner?.text || preHeader}
      </div>

      <section style={{ padding: '3rem 2rem 4rem', maxWidth: 1100, margin: '0 auto', textAlign: 'center' }}>
        <h1 style={{ fontFamily: HEAD, fontSize: 'clamp(2rem, 4.8vw, 3.5rem)', fontWeight: 900, margin: 0, lineHeight: 1.1, color: PAL.ink }}>{headline}</h1>
        {subheadline && <p style={{ marginTop: 18, fontSize: 'clamp(1rem, 1.6vw, 1.3rem)', color: PAL.dim, maxWidth: 760, marginInline: 'auto' }}>{subheadline}</p>}

        {countdown && (
          <div style={{ marginTop: 32, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, maxWidth: 640, marginInline: 'auto' }}>
            {[{ k: 'days', l: 'días' }, { k: 'hours', l: 'horas' }, { k: 'minutes', l: 'min' }, { k: 'seconds', l: 'seg' }].map((u) => (
              <div key={u.k} style={{ background: PAL.red, color: '#fff', padding: '20px 8px', borderRadius: 12 }}>
                <div style={{ fontFamily: HEAD, fontWeight: 900, fontSize: 'clamp(1.6rem, 4vw, 2.8rem)', lineHeight: 1 }}>{String(countdown[u.k]).padStart(2, '0')}</div>
                <div style={{ fontSize: 11, marginTop: 6, textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.85 }}>{u.l}</div>
              </div>
            ))}
          </div>
        )}
        {copy?.countdown_visible?.label && <p style={{ marginTop: 14, color: PAL.redDark, fontWeight: 700 }}>{copy.countdown_visible.label}</p>}
        {copy?.countdown_visible?.explainer && <p style={{ color: PAL.dim, fontSize: 13, marginTop: 4 }}>{copy.countdown_visible.explainer}</p>}

        <a href="#reservar" style={{ display: 'inline-block', marginTop: 36, padding: '20px 48px', background: PAL.red, color: '#fff', borderRadius: 12, textDecoration: 'none', fontFamily: HEAD, fontWeight: 900, fontSize: 18, boxShadow: '0 10px 30px rgba(220, 38, 38, 0.4)', letterSpacing: '0.02em' }}>{ctaPrimary} →</a>
      </section>

      {mathBlock && (
        <section style={{ padding: '3rem 2rem', maxWidth: 760, margin: '0 auto' }}>
          {mathBlock.headline && <h2 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 22, color: PAL.ink, margin: '0 0 24px', textAlign: 'center' }}>{mathBlock.headline}</h2>}
          <div style={{ background: PAL.surface, borderRadius: 14, padding: 28, border: `2px solid ${PAL.border}` }}>
            {mathBlock.comparison && Object.entries(mathBlock.comparison).filter(([k]) => k !== 'explainer').map(([k, v]) => {
              if (!v || typeof v !== 'object') return null;
              const isHighlight = v.highlight;
              const isStrike = v.strikethrough;
              return (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: `1px dashed ${PAL.border}`, background: isHighlight ? PAL.highlight : 'transparent', paddingInline: isHighlight ? 14 : 0, borderRadius: isHighlight ? 8 : 0 }}>
                  <span style={{ color: PAL.dim, fontSize: 14 }}>{v.label}</span>
                  <span style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 20, color: isStrike ? PAL.dim : PAL.ink, textDecoration: isStrike ? 'line-through' : 'none' }}>{v.amount}</span>
                </div>
              );
            })}
            {mathBlock.comparison?.explainer && <p style={{ marginTop: 16, fontSize: 13, color: PAL.dim, fontStyle: 'italic' }}>{mathBlock.comparison.explainer}</p>}
          </div>
        </section>
      )}

      {reframe && (
        <section style={{ padding: '4rem 2rem', maxWidth: 820, margin: '0 auto' }}>
          <p style={{ fontFamily: HEAD, fontSize: 'clamp(1.2rem, 2vw, 1.6rem)', fontWeight: 700, lineHeight: 1.6, whiteSpace: 'pre-line', textAlign: 'center' }}>{reframe}</p>
        </section>
      )}

      {threeSecrets.length > 0 && (
        <section style={{ padding: '4rem 2rem', maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
            {threeSecrets.slice(0, 3).map((s, i) => (
              <div key={i} style={{ background: '#fff', border: `2px solid ${PAL.red}`, borderRadius: 14, padding: 22 }}>
                <div style={{ fontFamily: HEAD, fontWeight: 900, fontSize: 14, color: PAL.red, letterSpacing: '0.1em' }}>SECRETO #{i + 1}</div>
                <h3 style={{ fontFamily: HEAD, fontSize: 17, fontWeight: 800, margin: '10px 0 12px', color: PAL.ink }}>{s.title}</h3>
                <p style={{ color: PAL.dim, lineHeight: 1.6, fontSize: 14, margin: 0, whiteSpace: 'pre-line' }}>{s.body}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {fascination.length > 0 && (
        <section style={{ padding: '4rem 2rem', maxWidth: 880, margin: '0 auto' }}>
          <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
            {fascination.slice(0, 15).map((b, i) => (
              <li key={i} style={{ background: '#fff', border: `1px solid ${PAL.border}`, borderRadius: 8, padding: '12px 18px 12px 44px', position: 'relative', fontSize: 14, lineHeight: 1.5 }}>
                <span style={{ position: 'absolute', left: 16, top: 12, color: PAL.red, fontWeight: 800 }}>⚡</span>{b}
              </li>
            ))}
          </ul>
        </section>
      )}

      {antiObjections.length > 0 && (
        <section style={{ padding: '4rem 2rem', maxWidth: 880, margin: '0 auto' }}>
          {antiObjections.slice(0, 3).map((o, i) => (
            <div key={i} style={{ background: PAL.surface, borderRadius: 14, padding: 24, marginBottom: 14, border: `1px solid ${PAL.border}` }}>
              <p style={{ fontFamily: HEAD, color: PAL.red, fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>Si estás pensando</p>
              <p style={{ fontSize: 17, fontWeight: 700, color: PAL.ink, margin: '6px 0 14px' }}>"{o.if_thinking}"</p>
              <p style={{ color: PAL.dim, lineHeight: 1.7, margin: 0, whiteSpace: 'pre-line' }}>{o.answer}</p>
            </div>
          ))}
        </section>
      )}

      {stack.items?.length > 0 && (
        <section style={{ padding: '4rem 2rem', maxWidth: 880, margin: '0 auto', background: PAL.surface, borderRadius: 20 }}>
          {stack.intro && <p style={{ fontFamily: HEAD, fontSize: 22, fontWeight: 800, color: PAL.ink, margin: '0 0 24px', textAlign: 'center' }}>{stack.intro}</p>}
          <div style={{ display: 'grid', gap: 10 }}>
            {stack.items.map((it, i) => (
              <div key={i} style={{ background: '#fff', borderRadius: 10, padding: 18, display: 'grid', gridTemplateColumns: '30px 1fr auto', gap: 14, alignItems: 'start' }}>
                <span style={{ color: PAL.green, fontSize: 20, fontWeight: 800 }}>{it.icon || '✓'}</span>
                <div>
                  <h4 style={{ fontFamily: HEAD, fontWeight: 700, margin: 0, color: PAL.ink, fontSize: 15 }}>{it.title}</h4>
                  <p style={{ color: PAL.dim, lineHeight: 1.6, margin: '4px 0 0', fontSize: 13 }}>{it.body}</p>
                </div>
                {it.value && <span style={{ fontFamily: HEAD, color: PAL.red, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>{it.strikethrough_value && <del style={{ color: PAL.dim, marginRight: 6 }}>{it.strikethrough_value}</del>}{it.value}</span>}
              </div>
            ))}
          </div>
          {stack.total_block && (
            <div style={{ marginTop: 18, padding: 20, background: PAL.highlight, borderRadius: 12, textAlign: 'center' }}>
              <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 13 }}>{stack.total_block.label_visible}</div>
              <div style={{ fontFamily: HEAD, fontWeight: 900, color: PAL.red, fontSize: 32 }}>{stack.total_block.value_visible}</div>
              {stack.total_block.anchor && <p style={{ marginTop: 8, fontSize: 13, color: PAL.dim }}>{stack.total_block.anchor}</p>}
            </div>
          )}
        </section>
      )}

      {liveCounter && (
        <section style={{ padding: '3rem 2rem', maxWidth: 820, margin: '0 auto' }}>
          <h3 style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 18, textAlign: 'center', margin: '0 0 18px' }}>{liveCounter.headline || 'Reservas recientes'}</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {(liveCounter.entries || []).slice(0, 5).map((e, i) => (
              <div key={i} style={{ background: '#fff', border: `1px solid ${PAL.border}`, padding: '10px 14px', borderRadius: 8, fontSize: 13, color: PAL.dim }}>{typeof e === 'string' ? e : e.text || ''}</div>
            ))}
          </div>
        </section>
      )}

      {riskReversal && (
        <section style={{ padding: '3rem 2rem', maxWidth: 820, margin: '0 auto' }}>
          <p style={{ fontFamily: HEAD, color: PAL.red, fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 14px' }}>Garantía contractual</p>
          <p style={{ color: PAL.ink, lineHeight: 1.8, whiteSpace: 'pre-line' }}>{riskReversal}</p>
        </section>
      )}

      {scarcity && <section style={{ padding: '3rem 2rem', maxWidth: 820, margin: '0 auto', background: PAL.surface, borderRadius: 14 }}><p style={{ color: PAL.redDark, fontWeight: 600, lineHeight: 1.7, whiteSpace: 'pre-line', textAlign: 'center' }}>{scarcity}</p></section>}

      <section id="reservar" data-testid="lead-form-section" style={{ padding: '5rem 2rem', background: PAL.ink, color: '#fff' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <h2 style={{ fontFamily: HEAD, fontSize: 'clamp(1.6rem, 2.6vw, 2rem)', textAlign: 'center', margin: '0 0 28px', fontWeight: 900 }}>{leadForm.intro || `${advisor.full_name || 'Sales lead'} te llama en <30 min`}</h2>
          <UrgentForm slug={intake.slug} advisor={advisor} leadForm={leadForm} isPreview={isPreview} />
          {leadForm.trust_text && <p style={{ marginTop: 18, color: 'rgba(255,255,255,0.6)', fontSize: 12, textAlign: 'center' }}>{leadForm.trust_text}</p>}
        </div>
      </section>

      {yesLadder && <section style={{ padding: '3rem 2rem', maxWidth: 700, margin: '0 auto' }}><p style={{ fontFamily: HEAD, fontSize: 'clamp(1.1rem, 1.6vw, 1.4rem)', fontWeight: 700, color: PAL.ink, lineHeight: 1.7, whiteSpace: 'pre-line', textAlign: 'center' }}>{yesLadder}</p></section>}

      {faq.length > 0 && (
        <section style={{ padding: '3rem 2rem', maxWidth: 820, margin: '0 auto' }}>
          {faq.map((f, i) => (
            <details key={i} style={{ background: PAL.surface, borderRadius: 10, padding: '14px 18px', marginBottom: 8 }}>
              <summary style={{ cursor: 'pointer', fontFamily: HEAD, fontWeight: 800, color: PAL.ink, listStyle: 'none' }}>{f.q}</summary>
              <p style={{ marginTop: 8, color: PAL.dim, lineHeight: 1.7 }}>{f.a}</p>
            </details>
          ))}
        </section>
      )}

      {(ps.body || ps.signature) && (
        <section style={{ padding: '3rem 2rem', maxWidth: 720, margin: '0 auto', background: PAL.highlight, borderRadius: 14 }}>
          {ps.body && <p style={{ color: PAL.ink, lineHeight: 1.8, whiteSpace: 'pre-line', fontSize: 15, fontWeight: 500 }}>{ps.body}</p>}
          {ps.signature && <p style={{ marginTop: 14, color: PAL.redDark, fontFamily: HEAD, fontWeight: 800 }}>— {ps.signature}</p>}
        </section>
      )}

      <footer style={{ padding: '2rem', textAlign: 'center', color: PAL.dim, fontSize: 12 }}>{footer || `${intake.developer_name || ''} · LFPDPPP`}</footer>

      <a href="#reservar" style={{ position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)', padding: '16px 36px', background: PAL.red, color: '#fff', borderRadius: 9999, textDecoration: 'none', fontFamily: HEAD, fontWeight: 900, fontSize: 15, boxShadow: '0 12px 32px rgba(220,38,38,0.5)', zIndex: 50 }}>⚡ {ctaPrimary}</a>
    </div>
  );
}

function UrgentForm({ slug, advisor, leadForm, isPreview }) {
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
      await fetch(`${API}/api/landing/${slug}/lead`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ payload: state }) });
      setSent(true);
    } catch (_) { setSent(true); }
  };
  if (sent) return <p style={{ background: '#fff', color: PAL.red, padding: 20, borderRadius: 12, textAlign: 'center', fontWeight: 800 }}>⚡ Reserva en proceso. {advisor.full_name || 'Sales lead'} te llama en menos de 30 minutos.</p>;
  return (
    <form onSubmit={onSubmit} style={{ display: 'grid', gap: 14, background: '#fff', padding: 24, borderRadius: 14, color: PAL.ink }}>
      {fields.map((f) => (
        <label key={f.id}>
          <span style={{ display: 'block', fontSize: 12, color: PAL.dim, marginBottom: 6, fontWeight: 700 }}>{f.label}{f.required ? ' *' : ''}</span>
          {f.type === 'select' && f.options ? (
            <select required={f.required} value={state[f.id] || ''} onChange={(e) => setState((s) => ({ ...s, [f.id]: e.target.value }))} style={{ width: '100%', padding: 12, border: `2px solid ${PAL.border}`, borderRadius: 10, fontSize: 14 }}>
              <option value="">—</option>
              {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <input type={f.type || 'text'} required={f.required} value={state[f.id] || ''} onChange={(e) => setState((s) => ({ ...s, [f.id]: e.target.value }))} style={{ width: '100%', padding: 12, border: `2px solid ${PAL.border}`, borderRadius: 10, fontSize: 14 }} />
          )}
        </label>
      ))}
      <button type="submit" style={{ marginTop: 6, padding: '16px 32px', background: PAL.red, color: '#fff', border: 'none', borderRadius: 12, fontFamily: HEAD, fontWeight: 900, fontSize: 16, cursor: 'pointer', letterSpacing: '0.02em' }}>{leadForm.submit_label || 'Bloquear mi unidad ahora ⚡'}</button>
    </form>
  );
}
