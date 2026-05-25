// W7.AS.3.D · Round 2 · SuggestedReplies — panel inferior modo "piloto" para el
// asesor. 3 respuestas sugeridas (contextual · heurística local mientras no exista
// endpoint de suggestions en Round 1) con "Enviar" (1 clic) o "Editar antes".
// Atajos de teclado Cmd+1 / Cmd+2 / Cmd+3 (o Ctrl en Windows/Linux).
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, Send, Pencil, RefreshCw } from 'lucide-react';

// Genera 3 sugerencias contextuales a partir del último mensaje del lead.
function buildSuggestions(lastUserMessage) {
  const t = (lastUserMessage || '').toLowerCase();
  if (/(precio|cuesta|cuánto|cuanto|presupuesto|enganche)/.test(t)) {
    return [
      'Con gusto. ¿Cuál es el rango de presupuesto que tienes en mente y en qué zona? Así te comparto las mejores opciones.',
      'Tenemos opciones para distintos presupuestos. ¿Buscas algo para vivir o como inversión? Te preparo una propuesta a tu medida.',
      'Te puedo conectar ahora con un asesor para ver disponibilidad y precios reales actualizados. ¿Te parece bien?',
    ];
  }
  if (/(cita|visita|agendar|ver|conocer|recorrido)/.test(t)) {
    return [
      '¡Perfecto! Podemos agendar una visita. ¿Qué día y horario te acomodan mejor?',
      'Con gusto coordino tu recorrido. ¿Prefieres entre semana o fin de semana?',
      'Te agendo con uno de nuestros asesores para que te acompañe en la visita. ¿Mañana o pasado?',
    ];
  }
  if (/(invertir|inversión|inversion|plusvalía|plusvalia|renta|retorno)/.test(t)) {
    return [
      'Excelente, tenemos desarrollos con buena proyección de plusvalía. ¿Buscas renta o reventa?',
      '¿Cuál es tu horizonte de inversión? Con eso te muestro los proyectos con mejor retorno estimado.',
      'Te comparto un análisis de plusvalía por zona. ¿Te interesa CDMX o algún corredor específico?',
    ];
  }
  return [
    '¡Gracias por escribir! Cuéntame qué buscas (zona, presupuesto, compra o inversión) y te oriento.',
    'Con gusto te ayudo. ¿Qué es lo más importante para ti en este momento de tu búsqueda?',
    '¿Te gustaría que un asesor te contacte para darte una atención más personalizada?',
  ];
}

export default function SuggestedReplies({ lastUserMessage = '', onSend, disabled = false }) {
  const { t } = useTranslation('conversation_round2_ui');
  const [seed, setSeed] = useState(0);
  const [editingIdx, setEditingIdx] = useState(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const suggestions = useMemo(() => {
    const base = buildSuggestions(lastUserMessage);
    if (!seed || base.length === 0) return base;
    const offset = seed % base.length;        // "Regenerar" rota el orden
    return base.slice(offset).concat(base.slice(0, offset));
  }, [lastUserMessage, seed]);

  const doSend = useCallback(async (text) => {
    if (!text || !text.trim() || disabled || sending) return;
    setSending(true);
    try {
      if (onSend) await onSend(text.trim());
      setEditingIdx(null);
      setDraft('');
    } finally {
      setSending(false);
    }
  }, [onSend, disabled, sending]);

  // Cmd+1 / Cmd+2 / Cmd+3 → enviar sugerencia n
  useEffect(() => {
    const handler = (e) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 3 && suggestions[n - 1]) {
        e.preventDefault();
        doSend(suggestions[n - 1]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [suggestions, doSend]);

  const startEdit = useCallback((idx) => {
    setEditingIdx(idx);
    setDraft(suggestions[idx] || '');
  }, [suggestions]);

  return (
    <div style={{
      borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 12,
      background: 'rgba(255,255,255,0.02)', borderRadius: 12, padding: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Sparkles size={15} style={{ color: 'var(--theme-primary, #6366F1)' }} />
        <span style={{ fontWeight: 700, fontSize: 13 }}>{t('suggestedReplies.title')}</span>
        <span style={{ fontSize: 10.5, padding: '2px 7px', borderRadius: 6, background: 'rgba(99,102,241,0.18)', color: 'var(--theme-primary, #818CF8)' }}>
          {t('suggestedReplies.pilot_mode')}
        </span>
        <button type="button" onClick={() => setSeed((s) => s + 1)} disabled={disabled}
          style={{ marginLeft: 'auto', background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--cream, #F0EBE0)', padding: '5px 9px', cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 5 }}>
          <RefreshCw size={12} /> {t('suggestedReplies.regenerate')}
        </button>
      </div>
      <p style={{ margin: '0 0 10px', fontSize: 11.5, color: 'rgba(240,235,224,0.5)' }}>{t('suggestedReplies.hint')}</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {suggestions.map((s, i) => (
          <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10, background: 'rgba(255,255,255,0.03)' }}>
            {editingIdx === i ? (
              <>
                <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3}
                  style={{ width: '100%', background: 'rgba(0,0,0,0.25)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--cream, #F0EBE0)', padding: 8, fontSize: 13, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }} />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button type="button" onClick={() => doSend(draft)} disabled={sending}
                    style={btnPrimary(sending)}>
                    <Send size={13} /> {sending ? t('suggestedReplies.sending') : t('suggestedReplies.send')}
                  </button>
                  <button type="button" onClick={() => { setEditingIdx(null); setDraft(''); }}
                    style={btnGhost}>{t('kbGaps.cancel')}</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ flex: '0 0 auto', fontSize: 10.5, fontWeight: 700, padding: '2px 6px', borderRadius: 5, background: 'rgba(255,255,255,0.08)', color: 'rgba(240,235,224,0.7)' }}>⌘{i + 1}</span>
                  <span style={{ fontSize: 13, lineHeight: 1.45 }}>{s}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button type="button" onClick={() => doSend(s)} disabled={disabled || sending} style={btnPrimary(disabled || sending)}>
                    <Send size={13} /> {t('suggestedReplies.send')}
                  </button>
                  <button type="button" onClick={() => startEdit(i)} disabled={disabled} style={btnGhost}>
                    <Pencil size={13} /> {t('suggestedReplies.edit')}
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function btnPrimary(isDisabled) {
  return {
    background: isDisabled ? 'rgba(99,102,241,0.4)' : 'linear-gradient(135deg,#6366F1,#EC4899)',
    border: 'none', borderRadius: 8, color: '#fff', padding: '7px 12px',
    cursor: isDisabled ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 12.5,
    display: 'flex', alignItems: 'center', gap: 6,
  };
}
const btnGhost = {
  background: 'transparent', border: '1px solid var(--border)', borderRadius: 8,
  color: 'var(--cream, #F0EBE0)', padding: '7px 12px', cursor: 'pointer', fontSize: 12.5,
  display: 'flex', alignItems: 'center', gap: 6,
};
