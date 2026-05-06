/**
 * ChatComposer — Phase 4 Batch 29
 * Barra inferior del chat. Enter envía, Shift+Enter salto.
 * Props: onSend(text), disabled, loading
 */
import React, { useRef, useState } from 'react';
import { Send } from '../icons';

export default function ChatComposer({ onSend, disabled = false, loading = false }) {
  const [text, setText] = useState('');
  const textareaRef = useRef(null);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || loading || disabled) return;
    onSend(trimmed);
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleInput = (e) => {
    setText(e.target.value);
    // Auto-resize
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  };

  return (
    <div style={{
      display: 'flex', gap: 10, alignItems: 'flex-end',
      padding: '12px 16px',
      background: 'rgba(13,16,23,0.95)',
      borderTop: '1px solid rgba(240,235,224,0.08)',
    }}>
      <textarea
        ref={textareaRef}
        value={text}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        disabled={disabled || loading}
        placeholder="Escribe un mensaje… (Enter envía)"
        rows={1}
        data-testid="chat-composer-input"
        style={{
          flex: 1, minHeight: 38, maxHeight: 120,
          padding: '9px 12px', borderRadius: 10,
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(240,235,224,0.15)',
          color: 'var(--cream, #F0EBE0)',
          fontFamily: 'DM Sans', fontSize: 13,
          resize: 'none', outline: 'none',
          lineHeight: '1.5',
          transition: 'border-color 0.15s',
        }}
      />
      <button
        onClick={handleSend}
        disabled={!text.trim() || loading || disabled}
        data-testid="chat-composer-send"
        style={{
          width: 38, height: 38, borderRadius: 9999, border: 'none', flexShrink: 0,
          background: text.trim() && !loading
            ? 'linear-gradient(90deg,#6366F1,#EC4899)'
            : 'rgba(240,235,224,0.08)',
          color: text.trim() && !loading ? '#fff' : 'rgba(240,235,224,0.3)',
          cursor: text.trim() && !loading && !disabled ? 'pointer' : 'not-allowed',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background 0.15s',
        }}
        aria-label="Enviar"
      >
        <Send size={15} />
      </button>
    </div>
  );
}
