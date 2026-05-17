// W4.14 — BuyerCoachConversation · chat-like UI del asesor de compra
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import StageChecklist from './StageChecklist';

const API = process.env.REACT_APP_BACKEND_URL;

const STAGE_LABELS = {
  1: 'Pre-calificación',
  2: 'Presupuesto',
  3: 'Ubicación',
  4: 'Visita',
  5: 'Negociación',
  6: 'Cierre',
  7: 'Post-compra',
};

const SHOW_CHECKLIST_STAGES = new Set([4, 5, 6, 7]);

export default function BuyerCoachConversation({ colonia = '' }) {
  const navigate = useNavigate();
  const [convId, setConvId] = useState(null);
  const [stage, setStage] = useState(1);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(true);
  const [showChecklist, setShowChecklist] = useState(false);
  const [leadModal, setLeadModal] = useState(false);
  const [leadForm, setLeadForm] = useState({ email: '', whatsapp: '', consent: false });
  const [leadSent, setLeadSent] = useState(false);
  const [zones, setZones] = useState([]);
  // W5.12 P3 Sub-D · Proyectos similares via KG (con fallback legacy)
  const [similarProjects, setSimilarProjects] = useState({ rows: [], source: null });
  const bottomRef = useRef(null);

  // Start conversation
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API}/api/buyer-coach/start`, { method: 'POST' });
        const d = await r.json();
        if (d.ok) {
          setConvId(d.conversation_id);
          setStage(d.stage || 1);
          setMessages([{ role: 'assistant', content: d.opening_message }]);
          try { window.posthog?.capture('buyer_coach_started', { colonia }); } catch {}
        }
      } catch {}
      setStarting(false);
    })();
  }, [colonia]);

  // Scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || loading || !convId) return;
    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/buyer-coach/${convId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg }),
      });
      const d = await r.json();
      if (d.ok) {
        setMessages(prev => [...prev, { role: 'assistant', content: d.assistant_reply }]);
        if (d.current_stage !== stage) {
          setStage(d.current_stage);
          try { window.posthog?.capture('buyer_coach_stage_advanced', { stage: d.current_stage }); } catch {}
        }
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'En este momento no puedo procesar tu consulta. Intenta nuevamente.' }]);
    }
    setLoading(false);
  }, [input, loading, convId, stage]);

  // Load zone recommendations after stage 3
  useEffect(() => {
    if (stage >= 3 && convId && !zones.length) {
      fetch(`${API}/api/buyer-coach/${convId}/zone-recommendations`)
        .then(r => r.ok ? r.json() : null)
        .then(d => d?.zones && setZones(d.zones))
        .catch(() => {});
    }
  }, [stage, convId, zones.length]);

  // W5.12 P3 Sub-D · Cargar proyectos similares al pasar a stage 4 (alternativas)
  useEffect(() => {
    const seed = (zones[0]?.zone_id) || colonia;
    if (stage >= 4 && seed && !similarProjects.rows.length) {
      fetch(`${API}/api/buyer-coach/similar-projects?project_id=${encodeURIComponent(seed)}&limit=5`,
        { credentials: 'include' })
        .then(r => r.ok ? r.json() : null)
        .then(d => d && setSimilarProjects({ rows: d?.rows || [], source: d?.source || 'unknown' }))
        .catch(() => setSimilarProjects({ rows: [], source: 'error' }));
    }
  }, [stage, zones, colonia, similarProjects.rows.length]);

  const handleCaptureLead = async () => {
    if (!leadForm.email || !leadForm.consent) return;
    try {
      const r = await fetch(`${API}/api/buyer-coach/${convId}/capture-lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(leadForm),
      });
      if (r.ok) {
        setLeadSent(true);
        setLeadModal(false);
        try { window.posthog?.capture('buyer_coach_lead_captured', { stage }); } catch {}
      }
    } catch {}
  };

  if (starting) return (
    <div style={{ padding: 24, textAlign: 'center', color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13 }}>
      Iniciando asesor de compra...
    </div>
  );

  return (
    <div style={{ display: 'flex', height: '100%', gap: 0 }}>
      {/* Sidebar: stage progress */}
      <div style={{
        width: 140, flexShrink: 0,
        borderRight: '1px solid rgba(255,255,255,0.06)',
        padding: '16px 12px',
        display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        {Object.entries(STAGE_LABELS).map(([n, label]) => {
          const num = parseInt(n);
          const isActive = num === stage;
          const isDone = num < stage;
          return (
            <div
              key={n}
              data-testid={`buyer-coach-stage-${n}`}
              style={{
                padding: '7px 8px', borderRadius: 7, cursor: 'default',
                background: isActive ? 'rgba(99,102,241,0.15)' : 'transparent',
                borderLeft: `2px solid ${isActive ? '#6366F1' : isDone ? '#10B981' : 'rgba(255,255,255,0.06)'}`,
              }}
            >
              <div style={{
                fontFamily: 'DM Sans', fontSize: 10, fontWeight: 700,
                color: isActive ? '#a5b4fc' : isDone ? '#34D399' : 'var(--cream-3)',
                lineHeight: 1.3,
              }}>
                {num}. {label}
              </div>
            </div>
          );
        })}

        {/* Zone CTA after stage 3 */}
        {stage >= 3 && zones.length > 0 && (
          <button
            onClick={() => navigate(`/mapa?colonias=${zones.map(z => z.zone_id).join(',')}`)}
            style={{
              marginTop: 10, fontFamily: 'DM Sans', fontSize: 10, fontWeight: 600,
              padding: '6px 8px', borderRadius: 7, cursor: 'pointer',
              background: 'rgba(99,102,241,0.1)',
              border: '1px solid rgba(99,102,241,0.3)',
              color: '#a5b4fc', textAlign: 'left', lineHeight: 1.4,
            }}
          >
            Ver mapa con estas zonas
          </button>
        )}

        {/* W5.12 P3 Sub-D · Proyectos similares (KG con fallback legacy) */}
        {stage >= 4 && similarProjects.rows.length > 0 && (
          <div data-testid="bc-similar-projects" style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(240,235,224,0.45)' }}>
                Proyectos similares
              </span>
              <span data-testid="bc-similar-source-badge" style={{
                padding: '2px 8px', borderRadius: 9999, fontSize: 8, fontFamily: 'DM Mono, monospace', fontWeight: 700,
                background: similarProjects.source === 'kg' ? 'rgba(99,102,241,0.18)' : 'rgba(245,158,11,0.10)',
                border: similarProjects.source === 'kg' ? '1px solid rgba(99,102,241,0.40)' : '1px solid rgba(245,158,11,0.30)',
                color: similarProjects.source === 'kg' ? '#a5b4fc' : '#fcd34d',
                textTransform: 'uppercase',
              }}>
                {similarProjects.source === 'kg' ? 'via KG' : 'legacy'}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {similarProjects.rows.slice(0, 5).map(p => (
                <a key={p.project_id || p.slug}
                   data-testid={`bc-similar-${p.project_id || p.slug}`}
                   href={`/detalle-proyecto/${encodeURIComponent(p.slug || p.project_id)}`}
                   style={{
                     display: 'block', padding: '8px 10px', borderRadius: 8,
                     background: 'rgba(255,255,255,0.04)',
                     border: '1px solid rgba(255,255,255,0.06)',
                     fontFamily: 'DM Sans', fontSize: 11, color: 'var(--cream)',
                     textDecoration: 'none', lineHeight: 1.4,
                   }}>
                  <div style={{ fontWeight: 600 }}>{p.name || p.project_id}</div>
                  <div style={{ fontSize: 9, fontFamily: 'DM Mono, monospace', color: 'rgba(240,235,224,0.55)', textTransform: 'uppercase' }}>
                    {p.zone_slug || '—'}
                    {p.precio_min ? ` · $${Math.round((p.precio_min || 0) / 1000).toLocaleString('es-MX')}k` : ''}
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Chat area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {messages.map((m, i) => (
            <div key={i} style={{
              display: 'flex',
              justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
            }}>
              <div style={{
                maxWidth: '78%',
                background: m.role === 'user'
                  ? 'linear-gradient(90deg, #6366F1, #EC4899)'
                  : 'rgba(255,255,255,0.06)',
                borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                padding: '9px 12px',
                fontFamily: 'DM Sans', fontSize: 13,
                color: 'var(--cream)',
                lineHeight: 1.55,
              }}>
                {m.content}
              </div>
            </div>
          ))}

          {loading && (
            <div style={{ display: 'flex' }}>
              <div style={{
                background: 'rgba(255,255,255,0.06)', borderRadius: '14px 14px 14px 4px',
                padding: '9px 14px', display: 'flex', gap: 4, alignItems: 'center',
              }}>
                {[0, 1, 2].map(d => (
                  <div key={d} style={{
                    width: 5, height: 5, borderRadius: '50%',
                    background: '#6366F1', opacity: 0.6,
                    animation: `bounce 1.2s ${d * 0.2}s infinite ease-in-out`,
                  }} />
                ))}
              </div>
            </div>
          )}

          {/* Checklist CTA */}
          {SHOW_CHECKLIST_STAGES.has(stage) && convId && (
            <div style={{ marginTop: 8 }}>
              <button
                onClick={() => setShowChecklist(s => !s)}
                style={{
                  fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600,
                  padding: '5px 12px', borderRadius: 9999, cursor: 'pointer',
                  border: '1px solid rgba(99,102,241,0.4)',
                  background: 'rgba(99,102,241,0.08)', color: '#a5b4fc',
                }}
              >
                {showChecklist ? 'Ocultar checklist' : 'Ver checklist de esta etapa'}
              </button>
              {showChecklist && <div style={{ marginTop: 10 }}><StageChecklist conversationId={convId} stageNum={stage} /></div>}
            </div>
          )}

          {/* Lead capture CTA after many messages */}
          {messages.length >= 10 && !leadSent && !leadModal && (
            <div style={{ textAlign: 'center', marginTop: 10 }}>
              <button
                onClick={() => setLeadModal(true)}
                style={{
                  fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600,
                  padding: '8px 18px', borderRadius: 9999, cursor: 'pointer',
                  background: 'linear-gradient(90deg, #6366F1, #EC4899)',
                  color: '#fff', border: 'none',
                }}
              >
                Conectarme con un asesor DMX
              </button>
            </div>
          )}
          {leadSent && (
            <div style={{ textAlign: 'center', color: '#34D399', fontSize: 12, fontFamily: 'DM Sans', fontWeight: 600 }}>
              Un asesor DMX te contactara pronto.
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.06)',
          padding: '10px 14px', display: 'flex', gap: 8,
        }}>
          <input
            type="text"
            data-testid="buyer-coach-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            placeholder="Escribe tu pregunta..."
            style={{
              flex: 1, background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 9999, color: 'var(--cream)',
              fontFamily: 'DM Sans', fontSize: 13,
              padding: '8px 14px', outline: 'none',
            }}
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            style={{
              width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(90deg, #6366F1, #EC4899)',
              border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: (!input.trim() || loading) ? 0.4 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M12 5l7 7-7 7" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>
      </div>

      {/* Lead capture modal */}
      {leadModal && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 10, borderRadius: 'inherit',
        }}>
          <div style={{
            background: 'rgba(13,16,23,0.98)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 14, padding: 24, width: '90%', maxWidth: 320,
          }}>
            <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 15, color: 'var(--cream)', marginBottom: 16 }}>
              Conectar con asesor
            </div>
            <input
              type="email"
              placeholder="Tu email"
              value={leadForm.email}
              onChange={e => setLeadForm(f => ({ ...f, email: e.target.value }))}
              style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13, padding: '8px 12px', marginBottom: 10, boxSizing: 'border-box' }}
            />
            <input
              type="tel"
              placeholder="WhatsApp (opcional)"
              value={leadForm.whatsapp}
              onChange={e => setLeadForm(f => ({ ...f, whatsapp: e.target.value }))}
              style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13, padding: '8px 12px', marginBottom: 10, boxSizing: 'border-box' }}
            />
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 16, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={leadForm.consent}
                onChange={e => setLeadForm(f => ({ ...f, consent: e.target.checked }))}
                style={{ marginTop: 2, accentColor: '#6366F1' }}
              />
              <span style={{ fontSize: 10, color: 'var(--cream-3)', fontFamily: 'DM Sans', lineHeight: 1.5 }}>
                Acepto que mis datos sean usados para contacto comercial. LFPDPPP.
              </span>
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setLeadModal(false)} style={{ flex: 1, fontFamily: 'DM Sans', fontSize: 12, padding: '8px 0', borderRadius: 9999, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--cream-3)' }}>
                Cancelar
              </button>
              <button
                onClick={handleCaptureLead}
                disabled={!leadForm.email || !leadForm.consent}
                style={{ flex: 1, fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600, padding: '8px 0', borderRadius: 9999, cursor: 'pointer', background: 'linear-gradient(90deg,#6366F1,#EC4899)', color: '#fff', border: 'none', opacity: (!leadForm.email || !leadForm.consent) ? 0.5 : 1 }}
              >
                Enviar
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-4px); }
        }
      `}</style>
    </div>
  );
}
