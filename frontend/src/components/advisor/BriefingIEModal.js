// BriefingIEModal — Generate + display advisor pitch modal with scores-clickeable pros,
// caveats, CTA, copy/WhatsApp actions, feedback loop.
import React, { useEffect, useState } from 'react';
import { Sparkle, X, MessageSquare, Database } from '../icons';
import * as api from '../../api/briefings';
import ScoreExplainModal from '../landing/ScoreExplainModal';

function Section({ label, children, eyebrow = false, style = {} }) {
  return (
    <div style={{ marginBottom: 16, ...style }}>
      {eyebrow && <div className="eyebrow" style={{ marginBottom: 8 }}>{label}</div>}
      {!eyebrow && <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 13, color: 'var(--cream)', letterSpacing: '-0.01em', marginBottom: 6 }}>{label}</div>}
      {children}
    </div>
  );
}

function ScoreBullet({ item, onClickScore }) {
  const { score_code, score_value, score_label_es, narrative } = item || {};
  return (
    <li style={{ marginBottom: 8, lineHeight: 1.5 }}>
      <button
        onClick={() => score_code && onClickScore(score_code)}
        data-testid={`briefing-score-${score_code}`}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '2px 9px', marginRight: 8, verticalAlign: 'baseline',
          background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.32)',
          borderRadius: 9999, color: '#c7d2fe',
          fontFamily: 'DM Sans', fontSize: 10.5, fontWeight: 600,
          cursor: score_code ? 'pointer' : 'default',
          letterSpacing: '0.03em',
        }}
      >
        {score_label_es || score_code} · {score_value}
      </button>
      <span style={{ fontFamily: 'DM Sans', fontSize: 13.5, color: 'var(--cream-2)' }}>{narrative}</span>
    </li>
  );
}

function FeedbackInline({ briefingId, onDone }) {
  const [sent, setSent] = useState(false);
  const send = async (result) => {
    try {
      await api.sendFeedback(briefingId, result);
      setSent(result);
      onDone?.();
    } catch (e) { /* ignore */ }
  };
  if (sent) return <div data-testid="briefing-feedback-done" style={{ fontFamily: 'DM Sans', fontSize: 11, color: '#86efac' }}>Gracias — registrado como "{sent}".</div>;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontFamily: 'DM Sans', fontSize: 11.5, color: 'var(--cream-3)' }}>
      <span>¿Cerró el lead?</span>
      {[
        { k: 'closed_lead', l: 'Sí' },
        { k: 'partial', l: 'Parcial' },
        { k: 'didnt_close', l: 'No' },
      ].map(b => (
        <button key={b.k} onClick={() => send(b.k)}
          data-testid={`briefing-feedback-${b.k}`}
          style={{
            padding: '3px 10px', borderRadius: 9999,
            background: 'transparent', border: '1px solid var(--border)',
            color: 'var(--cream-2)', fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600,
            cursor: 'pointer',
          }}>{b.l}</button>
      ))}
    </div>
  );
}

export default function BriefingIEModal({ open, development, leadId = null, contactId = null, phone = null, onClose }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [doc, setDoc] = useState(null);
  const [explainCode, setExplainCode] = useState(null);
  const [toast, setToast] = useState(null);
  const [feedbackVisible, setFeedbackVisible] = useState(false);

  useEffect(() => {
    if (!open || !development?.id) return;
    setDoc(null); setErr(null); setLoading(true);
    api.generateBriefing({ development_id: development.id, lead_id: leadId, contact_id: contactId })
      .then(setDoc)
      .catch(e => setErr(e.message || String(e)))
      .finally(() => setLoading(false));
  }, [open, development?.id, leadId, contactId]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const markUsed = async (type) => {
    if (!doc?.id) return;
    try { await api.sendFeedback(doc.id, 'marked_used'); } catch {}
    setFeedbackVisible(true);
    setToast(`${type === 'copy_full' ? 'Texto completo' : type === 'copy_wa' ? 'Versión WhatsApp' : 'Briefing'} copiado.`);
  };

  const buildFullText = () => {
    if (!doc) return '';
    const pros = (doc.headline_pros || []).map(p => `• ${p.score_label_es || p.score_code} (${p.score_value}) — ${p.narrative}`).join('\n');
    const caveats = (doc.honest_caveats || []).map(c => `• ${c.score_label_es || c.score_code} (${c.score_value}) — ${c.narrative}`).join('\n');
    return `${doc.hook}\n\nRAZONES DATA-BACKED\n${pros}\n\nCAVEATS HONESTOS\n${caveats}\n\nPRÓXIMO PASO\n${doc.call_to_action}\n\n— Briefing IE DesarrollosMX · ${doc.prompt_version}`;
  };

  const copyFull = async () => {
    try { await navigator.clipboard.writeText(buildFullText()); markUsed('copy_full'); }
    catch { setToast('No se pudo copiar.'); }
  };
  const copyWA = async () => {
    if (!doc?.whatsapp_text) return;
    try { await navigator.clipboard.writeText(doc.whatsapp_text); markUsed('copy_wa'); }
    catch { setToast('No se pudo copiar.'); }
  };
  const sendWA = () => {
    if (!doc?.whatsapp_text) return;
    const text = encodeURIComponent(doc.whatsapp_text);
    const url = phone ? `https://wa.me/${phone.replace(/[^0-9]/g,'')}?text=${text}` : `https://wa.me/?text=${text}`;
    window.open(url, '_blank');
    markUsed('send_wa');
  };

  if (!open) return null;

  return (
    <div data-testid="briefing-modal" onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 520,
      background: 'rgba(6,8,15,0.82)', backdropFilter: 'blur(12px)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 'clamp(24px, 5vw, 56px)',
      overflowY: 'auto',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 720, maxWidth: '100%',
        background: 'linear-gradient(180deg, #0E1220, #0A0D16)',
        border: '1px solid var(--border)', borderRadius: 20,
        padding: 26, boxShadow: '0 24px 68px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
          <div>
            <div className="eyebrow" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Sparkle size={10} color="var(--indigo-3)" /> BRIEFING IE · COMPARADOR
            </div>
            <h2 data-testid="briefing-h2" style={{
              fontFamily: 'Outfit', fontWeight: 800, fontSize: 'clamp(20px, 2.4vw, 26px)',
              letterSpacing: '-0.02em', color: 'var(--cream)', margin: '4px 0 2px',
            }}>{development?.name || 'Proyecto'}</h2>
            <div style={{ fontFamily: 'DM Sans', fontSize: 12, color: 'var(--cream-3)' }}>
              Claude Sonnet 4.5 · prompt v1.0{doc?.cache_hit ? ' · cache' : ''}{doc?.cost_usd ? ` · $${doc.cost_usd.toFixed(4)}` : ''}
            </div>
          </div>
          <button data-testid="briefing-close" onClick={onClose} style={{
            background: 'transparent', border: '1px solid var(--border)',
            padding: 8, borderRadius: 9999, color: 'var(--cream-3)', cursor: 'pointer',
          }}><X size={14} /></button>
        </div>

        {/* Loading / error */}
        {loading && (
          <div data-testid="briefing-loading" style={{
            padding: 40, textAlign: 'center', fontFamily: 'DM Sans', fontSize: 13.5, color: 'var(--cream-2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            <Sparkle size={13} color="var(--indigo-3)" /> Generando con Claude Sonnet 4.5…
          </div>
        )}
        {err && (
          <div data-testid="briefing-error" style={{ padding: 14, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.28)', borderRadius: 10, color: '#fca5a5', fontFamily: 'DM Sans', fontSize: 12.5 }}>
            {err}
          </div>
        )}

        {doc && !loading && (
          <>
            {!leadId && !contactId && (
              <div style={{ padding: 10, marginBottom: 14, borderRadius: 10, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.22)', fontFamily: 'DM Sans', fontSize: 11.5, color: '#fcd34d' }}>
                Briefing genérico. Para mayor personalización, abre desde un lead/búsqueda/contacto.
              </div>
            )}

            {doc.context_hint && (
              <Section label="Contexto" style={{ marginBottom: 12 }}>
                <div style={{ fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-3)', fontStyle: 'italic' }}>
                  {doc.context_hint}
                </div>
              </Section>
            )}

            <Section label="Apertura">
              <p data-testid="briefing-hook" style={{ fontFamily: 'DM Sans', fontSize: 15.5, color: 'var(--cream)', lineHeight: 1.55, margin: 0, fontStyle: 'italic' }}>"{doc.hook}"</p>
            </Section>

            <Section label="Razones data-backed">
              <ul data-testid="briefing-pros" style={{ paddingLeft: 0, listStyle: 'none', margin: 0 }}>
                {(doc.headline_pros || []).map((p, i) => (
                  <ScoreBullet key={i} item={p} onClickScore={setExplainCode} />
                ))}
              </ul>
            </Section>

            <Section label="Caveats honestos">
              <ul data-testid="briefing-caveats" style={{ paddingLeft: 0, listStyle: 'none', margin: 0 }}>
                {(doc.honest_caveats || []).map((c, i) => (
                  <ScoreBullet key={i} item={c} onClickScore={setExplainCode} />
                ))}
              </ul>
            </Section>

            <Section label="Próximo paso">
              <p data-testid="briefing-cta" style={{ fontFamily: 'DM Sans', fontSize: 14, color: 'var(--cream)', lineHeight: 1.55, margin: 0 }}>{doc.call_to_action}</p>
            </Section>

            {/* Actions row */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 18, marginBottom: 12 }}>
              <button data-testid="briefing-copy-full" onClick={copyFull} style={{
                padding: '9px 16px', borderRadius: 9999, background: 'rgba(99,102,241,0.12)',
                border: '1px solid rgba(99,102,241,0.34)', color: '#c7d2fe',
                fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12.5, cursor: 'pointer',
              }}>Copiar texto completo</button>
              <button data-testid="briefing-copy-wa" onClick={copyWA} style={{
                padding: '9px 16px', borderRadius: 9999, background: 'rgba(34,197,94,0.12)',
                border: '1px solid rgba(34,197,94,0.34)', color: '#86efac',
                fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12.5, cursor: 'pointer',
              }}>Copiar versión WhatsApp</button>
              <button data-testid="briefing-send-wa" onClick={sendWA} style={{
                padding: '9px 16px', borderRadius: 9999,
                background: 'var(--grad)', border: 'none', color: '#fff',
                fontFamily: 'DM Sans', fontWeight: 600, fontSize: 12.5,
                display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
              }}>
                <MessageSquare size={12} /> Enviar por WhatsApp
              </button>
            </div>

            {/* Feedback inline + footer */}
            <div style={{
              padding: 12, marginTop: 10, borderTop: '1px solid rgba(240,235,224,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap',
            }}>
              {feedbackVisible ? (
                <FeedbackInline briefingId={doc.id} onDone={() => {}} />
              ) : (
                <div style={{ fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream-3)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Database size={10} /> Cache 24h · costo ${doc.cost_usd?.toFixed(4) || '—'}
                </div>
              )}
            </div>
          </>
        )}

        {toast && (
          <div data-testid="briefing-toast" style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 600,
            padding: '10px 16px', borderRadius: 12,
            background: 'rgba(34,197,94,0.14)', border: '1px solid rgba(34,197,94,0.36)',
            color: '#86efac', fontFamily: 'DM Sans', fontSize: 12.5, fontWeight: 500,
          }}>{toast}</div>
        )}
      </div>

      <ScoreExplainModal
        open={!!explainCode}
        zoneId={development?.id}
        code={explainCode}
        onClose={() => setExplainCode(null)}
      />
    </div>
  );
}
