// W4.4E — Phase Y.1E · AsistenteChat component
import React, { useEffect, useRef, useState } from 'react';
import { Send, Sparkle, ArrowRight } from '../icons';
import { track } from '../../utils/behavioralTracker';

const GRAD = 'linear-gradient(90deg, var(--theme), var(--theme-3))';

// ─── Message bubble ─────────────────────────────────────────────────────────
function Bubble({ role, content, simulated }) {
  const isUser = role === 'user';
  return (
    <div data-testid={`asistente-msg-${role}`} style={{
      display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', marginBottom: 12,
    }}>
      <div style={{
        maxWidth: '78%', padding: '10px 14px', borderRadius: 16,
        background: isUser ? 'rgba(var(--theme-rgb),0.10)' : '#F6F7FA',
        border: isUser
          ? '1px solid rgba(var(--theme-rgb),0.25)'
          : '1px solid #ECECEC',
        color: 'var(--cream)',
        fontFamily: 'DM Sans', fontSize: 13.5, lineHeight: 1.55,
      }}>
        {simulated && (
          <div style={{
            fontFamily: 'DM Sans', fontWeight: 700, fontSize: 9, letterSpacing: '0.10em',
            color: '#E2982E', marginBottom: 4,
          }}>SIMULATED</div>
        )}
        <div style={{ whiteSpace: 'pre-wrap' }}>{content}</div>
      </div>
    </div>
  );
}

// ─── Lead capture inline card ───────────────────────────────────────────────
function LeadCaptureCard({ onSubmit, isSubmitting }) {
  const [form, setForm] = useState({ nombre: '', whatsapp: '', email: '', mensaje: '' });
  const valid = form.nombre.trim() && form.whatsapp.trim();

  return (
    <div data-testid="asistente-lead-capture" style={{
      padding: 16, borderRadius: 14, marginBottom: 14,
      background: 'linear-gradient(135deg, rgba(var(--theme-rgb),0.10), rgba(var(--theme-rgb),0.08))',
      border: '1px solid rgba(var(--theme-rgb),0.30)', backdropFilter: 'blur(24px)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Sparkle size={14} color="var(--theme)" />
        <h3 style={{ margin: 0, fontFamily: 'Outfit', fontWeight: 700, fontSize: 14, color: 'var(--cream)' }}>
          ¿Te conectamos con un asesor especializado?
        </h3>
      </div>
      <p style={{ margin: '0 0 12px', fontFamily: 'DM Sans', fontSize: 12.5, color: 'var(--cream-2)' }}>
        Déjanos tus datos y un asesor DMX te contacta por WhatsApp en menos de 4 horas hábiles.
      </p>
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr' }}>
        <input
          data-testid="asistente-lead-nombre"
          placeholder="Nombre"
          value={form.nombre}
          onChange={e => setForm({ ...form, nombre: e.target.value })}
          style={inputStyle()}
        />
        <input
          data-testid="asistente-lead-whatsapp"
          placeholder="WhatsApp (+52 ...)"
          value={form.whatsapp}
          onChange={e => setForm({ ...form, whatsapp: e.target.value })}
          style={inputStyle()}
        />
        <input
          data-testid="asistente-lead-email"
          placeholder="Email (opcional)"
          value={form.email}
          onChange={e => setForm({ ...form, email: e.target.value })}
          style={{ ...inputStyle(), gridColumn: '1 / -1' }}
        />
      </div>
      <button
        data-testid="asistente-lead-submit"
        disabled={!valid || isSubmitting}
        onClick={() => onSubmit(form)}
        style={{
          marginTop: 10, padding: '9px 18px', borderRadius: 9999,
          background: !valid || isSubmitting ? 'rgba(var(--theme-rgb),0.30)' : GRAD,
          color: '#fff', border: 'none', cursor: !valid || isSubmitting ? 'not-allowed' : 'pointer',
          fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, opacity: !valid || isSubmitting ? 0.7 : 1,
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}
      >
        {isSubmitting ? 'Enviando…' : 'Conectarme'}
        <ArrowRight size={12} color="#fff" />
      </button>
    </div>
  );
}

function inputStyle() {
  return {
    width: '100%', boxSizing: 'border-box',
    padding: '8px 12px', borderRadius: 10,
    background: '#FFFFFF',
    border: '1px solid #ECECEC',
    color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 12.5,
    outline: 'none',
  };
}

// ─── Loading dots ───────────────────────────────────────────────────────────
function LoadingDots() {
  return (
    <div data-testid="asistente-loading" style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
      <div style={{
        padding: '12px 16px', borderRadius: 16,
        background: '#F6F7FA',
        border: '1px solid #ECECEC',
      }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {[0, 1, 2].map(i => (
            <span key={i} style={{
              width: 6, height: 6, borderRadius: '50%', background: 'var(--theme)',
              animation: `asisDot 0.9s ${i * 0.15}s infinite ease-in-out`,
            }} />
          ))}
        </div>
        <style>{`@keyframes asisDot { 0%,80%,100%{opacity:0.3} 40%{opacity:1} }`}</style>
      </div>
    </div>
  );
}

// ─── Main chat component ────────────────────────────────────────────────────
export default function AsistenteChat({
  messages,
  onSend,
  isLoading,
  onCaptureLead,
  suggestedCapture,
  isCapturing,
  captureSuccess,
  emptyChips = [],
}) {
  const [input, setInput] = useState('');
  const taRef = useRef(null);
  const endRef = useRef(null);

  // Autoscroll on new messages
  useEffect(() => {
    if (endRef.current) endRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isLoading, suggestedCapture]);

  // Autoresize textarea
  useEffect(() => {
    if (taRef.current) {
      taRef.current.style.height = 'auto';
      taRef.current.style.height = Math.min(taRef.current.scrollHeight, 130) + 'px';
    }
  }, [input]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isLoading) return;
    // 'asistente.message_sent' no es un TIPO de evento válido — es el nombre de la función usada.
    // Mandarlo como tipo hacía que el backend lo reescribiera como 'page_view', inflando el conteo
    // de visitas con mensajes de chat (auditoría A–Z 07-24). La firma correcta es
    // track(<tipo>, { feature: <qué se usó> }).
    track('feature_use', { feature: 'asistente.message_sent', metadata: { length: text.length } });
    onSend(text);
    setInput('');
  };

  const onKey = e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const showEmpty = messages.length <= 1; // welcome only

  return (
    <div data-testid="asistente-chat" style={{
      display: 'flex', flexDirection: 'column', flex: 1,
      width: '100%', maxWidth: 720, margin: '0 auto',
      minHeight: 'calc(100vh - 220px)',
    }}>
      {/* Messages area */}
      <div style={{ flex: 1, padding: '20px 16px 12px', overflowY: 'auto' }}>
        {showEmpty && messages.length === 0 && (
          <div style={{
            padding: 24, borderRadius: 14, textAlign: 'center',
            background: '#F6F7FA',
            border: '1px dashed #D8DAE2',
            color: 'var(--cream-3)', fontFamily: 'DM Sans', fontSize: 13.5, lineHeight: 1.55,
          }}>
            Pregúntame: zonas en CDMX, precios por colonia, comparables, qué proyecto se ajusta a tu presupuesto…
          </div>
        )}

        {messages.map((m, i) => (
          <Bubble key={i} role={m.role} content={m.content} simulated={m.simulated} />
        ))}

        {/* Empty chips (after welcome) */}
        {showEmpty && emptyChips.length > 0 && !isLoading && (
          <div data-testid="asistente-empty-chips" style={{
            display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8, justifyContent: 'flex-start',
          }}>
            {emptyChips.map((chip, i) => (
              <button
                key={i}
                data-testid={`asistente-chip-${i}`}
                onClick={() => { setInput(chip); setTimeout(() => taRef.current?.focus(), 50); }}
                style={{
                  padding: '7px 14px', borderRadius: 9999, cursor: 'pointer',
                  background: 'rgba(var(--theme-rgb),0.10)',
                  border: '1px solid rgba(var(--theme-rgb),0.30)',
                  color: 'var(--theme)', fontFamily: 'DM Sans', fontSize: 12, fontWeight: 600,
                  transition: 'background 0.18s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(var(--theme-rgb),0.20)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(var(--theme-rgb),0.10)'; }}
              >{chip}</button>
            ))}
          </div>
        )}

        {isLoading && <LoadingDots />}

        {/* Lead capture inline */}
        {suggestedCapture && !captureSuccess && (
          <LeadCaptureCard onSubmit={onCaptureLead} isSubmitting={isCapturing} />
        )}

        {captureSuccess && (
          <div data-testid="asistente-capture-success" style={{
            padding: '12px 16px', borderRadius: 14, marginBottom: 14,
            background: 'rgba(31,160,106,0.08)', border: '1px solid rgba(31,160,106,0.30)',
            color: '#1FA06A', fontFamily: 'DM Sans', fontSize: 13,
          }}>
            ¡Listo! Un asesor te contactará por WhatsApp en menos de 4 horas hábiles.
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* Input footer */}
      <div style={{
        position: 'sticky', bottom: 0, padding: '14px 16px 18px',
        background: 'linear-gradient(0deg, #FBFAFC 70%, rgba(251,250,252,0))',
      }}>
        <div style={{
          display: 'flex', alignItems: 'flex-end', gap: 8,
          padding: 8, borderRadius: 16,
          background: '#FFFFFF',
          border: '1px solid rgba(var(--theme-rgb),0.30)',
          boxShadow: '0 2px 10px rgba(16,24,40,0.05)',
        }}>
          <textarea
            ref={taRef}
            data-testid="asistente-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKey}
            placeholder="Escribe tu pregunta…"
            rows={1}
            style={{
              flex: 1, padding: '8px 10px', resize: 'none', minHeight: 22, maxHeight: 130,
              background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--cream)', fontFamily: 'DM Sans', fontSize: 13.5, lineHeight: 1.5,
            }}
          />
          <button
            data-testid="asistente-send-btn"
            disabled={!input.trim() || isLoading}
            onClick={handleSend}
            style={{
              padding: '8px 14px', borderRadius: 9999, cursor: (!input.trim() || isLoading) ? 'not-allowed' : 'pointer',
              background: (!input.trim() || isLoading) ? 'rgba(var(--theme-rgb),0.30)' : GRAD,
              color: '#fff', border: 'none',
              fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12.5,
              display: 'inline-flex', alignItems: 'center', gap: 4,
              opacity: (!input.trim() || isLoading) ? 0.6 : 1,
            }}
          >
            <Send size={12} color="#fff" />
            Enviar
          </button>
        </div>
      </div>
    </div>
  );
}
