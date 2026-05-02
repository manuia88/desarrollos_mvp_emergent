/**
 * Phase 4 Batch 0 — InlineEditField
 * Notion-style click-to-edit. ESC cancels, Enter saves.
 * Props:
 *   value: any
 *   type: 'text' | 'number' | 'currency' | 'date' | 'select'
 *   on_save: async fn(newValue) => void
 *   validate: fn(value) => string | null (error message)
 *   placeholder: string
 *   options: [{ value, label }]  (for type=select)
 *   className: string
 */
import React, { useState, useRef, useEffect } from 'react';
import { Check, Loader2 } from 'lucide-react';

function formatDisplay(value, type) {
  if (value === null || value === undefined || value === '') return '';
  if (type === 'currency' && !isNaN(Number(value))) {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(Number(value));
  }
  return String(value);
}

export function InlineEditField({
  value,
  type = 'text',
  on_save,
  validate,
  placeholder = 'Clic para editar',
  options = [],
  className = '',
  'data-testid': testId,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ''));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const startEdit = () => {
    setDraft(String(value ?? ''));
    setError(null);
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setDraft(String(value ?? ''));
    setError(null);
  };

  const save = async () => {
    const parsed = type === 'number' || type === 'currency' ? Number(draft) : draft;
    if (validate) {
      const err = validate(parsed);
      if (err) { setError(err); return; }
    }
    setSaving(true);
    try {
      await on_save?.(parsed);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      setEditing(false);
    } catch (e) {
      setError(e?.message || 'Error al guardar');
    }
    setSaving(false);
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && type !== 'text') { e.preventDefault(); save(); }
    if (e.key === 'Escape') cancel();
  };

  const handleKeyText = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); }
    if (e.key === 'Escape') cancel();
  };

  if (!editing) {
    return (
      <div
        onClick={startEdit}
        className={`group cursor-pointer min-w-[60px] rounded px-1 py-0.5 hover:bg-[rgba(240,235,224,0.06)] transition-colors flex items-center gap-1.5 ${className}`}
        data-testid={testId || 'inline-edit-field'}
      >
        <span className={`${value !== null && value !== undefined && value !== '' ? 'text-[var(--cream)]' : 'text-[rgba(240,235,224,0.3)]'} text-sm`}>
          {value !== null && value !== undefined && value !== ''
            ? formatDisplay(value, type)
            : placeholder}
        </span>
        {saved && <Check size={11} className="text-emerald-400 shrink-0" />}
      </div>
    );
  }

  return (
    <div className={`relative ${className}`} data-testid={testId || 'inline-edit-field'}>
      {type === 'select' ? (
        <select
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={handleKey}
          className="bg-[rgba(240,235,224,0.08)] border border-[rgba(240,235,224,0.2)] rounded px-2 py-0.5 text-[var(--cream)] text-sm outline-none focus:border-[rgba(240,235,224,0.45)]"
          data-testid="inline-edit-select"
        >
          {options.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      ) : (
        <div className="flex items-center gap-1">
          <input
            ref={inputRef}
            type={type === 'currency' ? 'number' : type}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={save}
            onKeyDown={type === 'text' ? handleKeyText : handleKey}
            className="bg-[rgba(240,235,224,0.08)] border border-[rgba(240,235,224,0.25)] rounded px-2 py-0.5 text-[var(--cream)] text-sm outline-none focus:border-[rgba(240,235,224,0.5)] min-w-[80px]"
            data-testid="inline-edit-input"
          />
          {saving && <Loader2 size={12} className="text-[rgba(240,235,224,0.4)] animate-spin" />}
          {!saving && <Check size={12} className="text-emerald-400 opacity-0 group-hover:opacity-100" />}
        </div>
      )}
      {error && (
        <p className="absolute top-full left-0 mt-0.5 text-[10px] text-red-400 whitespace-nowrap z-10 bg-[#0f1320] px-1 rounded">
          {error}
        </p>
      )}
    </div>
  );
}

export default InlineEditField;
