// W1.5 ZZ.1.1 — InlineEditableField
import React, { useState, useEffect, useRef } from 'react';
import { Edit3, Check, X } from 'lucide-react';

/**
 * Inline editable field with click-to-edit, Enter to save, Esc to cancel.
 * Props:
 *   - value: current value (any primitive: string/number/null)
 *   - onSave: async (newValue) => void (throws on failure)
 *   - type: 'text' | 'number' | 'textarea' (default 'text')
 *   - placeholder
 *   - testId: data-testid prefix
 *   - mono: bool (use mono font when displayed)
 *   - disabled: bool — show value but no edit button
 *   - parser: optional fn to parse input string → final value (e.g., commas → integers)
 */
export default function InlineEditableField({
  value,
  onSave,
  type = 'text',
  placeholder = 'Sin definir',
  testId = 'inline-field',
  mono = false,
  disabled = false,
  parser = null,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value == null ? '' : String(value));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const inputRef = useRef(null);

  useEffect(() => { setDraft(value == null ? '' : String(value)); }, [value]);
  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus(); }, [editing]);

  const start = () => { setErr(''); setDraft(value == null ? '' : String(value)); setEditing(true); };
  const cancel = () => { setEditing(false); setErr(''); };

  const commit = async () => {
    setErr('');
    let parsed = draft;
    if (parser) {
      try { parsed = parser(draft); } catch (e) { setErr(e.message || 'Valor inválido'); return; }
    } else if (type === 'number') {
      const cleaned = draft.replace(/[^0-9.\-]/g, '');
      if (cleaned === '' || cleaned === '-') parsed = null;
      else {
        const n = Number(cleaned);
        if (!Number.isFinite(n)) { setErr('Número inválido'); return; }
        parsed = n;
      }
    } else {
      parsed = draft.trim() === '' ? null : draft.trim();
    }
    setBusy(true);
    try { await onSave(parsed); setEditing(false); }
    catch (e) { setErr(e.message || 'Error al guardar'); }
    finally { setBusy(false); }
  };

  const onKey = (e) => {
    if (e.key === 'Enter' && type !== 'textarea') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') cancel();
  };

  const displayVal = (value == null || value === '') ? placeholder : String(value);
  const isPlaceholder = (value == null || value === '');
  const fontFam = mono ? 'DM Mono, monospace' : 'DM Sans';

  if (editing) {
    return (
      <div data-testid={`${testId}-edit-wrap`} style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
        {type === 'textarea' ? (
          <textarea
            ref={inputRef}
            data-testid={`${testId}-input`}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={onKey}
            rows={2}
            style={{
              flex: '1 1 200px', padding: '6px 10px', borderRadius: 8,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(var(--theme-rgb),0.45)',
              color: 'var(--cream)', fontFamily: fontFam, fontSize: 12, outline: 'none', resize: 'vertical',
            }}
          />
        ) : (
          <input
            ref={inputRef}
            data-testid={`${testId}-input`}
            type={type === 'number' ? 'text' : 'text'}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={onKey}
            placeholder={placeholder}
            style={{
              flex: '1 1 120px', padding: '5px 10px', borderRadius: 9999,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(var(--theme-rgb),0.45)',
              color: 'var(--cream)', fontFamily: fontFam, fontSize: 12, outline: 'none', minWidth: 80,
            }}
          />
        )}
        <button data-testid={`${testId}-save`} onClick={commit} disabled={busy}
          style={{
            padding: '4px 9px', borderRadius: 9999, background: 'rgba(74,222,128,0.18)',
            border: '1px solid rgba(74,222,128,0.40)', color: '#4ADE80',
            cursor: busy ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3,
            fontFamily: 'DM Sans', fontSize: 11, fontWeight: 700, opacity: busy ? 0.7 : 1,
          }}><Check size={10} /> Guardar</button>
        <button data-testid={`${testId}-cancel`} onClick={cancel} disabled={busy}
          style={{
            padding: '4px 8px', borderRadius: 9999, background: 'transparent',
            border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(240,235,224,0.55)',
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3,
            fontFamily: 'DM Sans', fontSize: 11, fontWeight: 600,
          }}><X size={10} /> Cancelar</button>
        {err && <span style={{ fontFamily: 'DM Sans', fontSize: 10.5, color: '#F87171' }}>{err}</span>}
      </div>
    );
  }

  return (
    <span data-testid={`${testId}-display`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{
        fontFamily: fontFam, fontSize: 12,
        color: isPlaceholder ? 'rgba(240,235,224,0.35)' : 'var(--cream)',
        fontStyle: isPlaceholder ? 'italic' : 'normal',
      }}>{displayVal}</span>
      {!disabled && (
        <button data-testid={`${testId}-edit-btn`} onClick={start} title="Editar"
          style={{
            padding: '2px 5px', borderRadius: 9999, background: 'transparent', border: 'none',
            color: 'rgba(var(--theme-rgb),0.65)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
          }}><Edit3 size={10} /></button>
      )}
    </span>
  );
}
