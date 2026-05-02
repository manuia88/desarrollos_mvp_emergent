/**
 * Phase 4 B0 Sub-chunk B — InlineEditField
 * Notion-style click-to-edit with optimistic update + revert on error.
 * Props:
 *   value         — current value
 *   type          — 'text' | 'number' | 'currency' | 'date' | 'select'
 *   onSave        — async fn(newValue) → if throws, value reverts
 *   validate      — fn(value) → string | null
 *   options       — [{value, label}]  (for type=select)
 *   placeholder   — string
 *   user_can_edit — bool (default true); false → read-only
 *   className     — string
 */
import React, { useState, useRef, useEffect } from 'react';
import { Check, Loader2, Pencil, Lock } from 'lucide-react';

function fmtDisplay(value, type) {
  if (value === null || value === undefined || value === '') return null;
  if (type === 'currency') {
    const n = Number(value);
    if (!isNaN(n)) return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(n);
  }
  return String(value);
}

export function InlineEditField({
  value,
  type = 'text',
  onSave,
  validate,
  options = [],
  placeholder = 'Clic para editar',
  user_can_edit = true,
  className = '',
  'data-testid': testId,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ''));
  const [optimistic, setOptimistic] = useState(value);
  const [saving, setSaving] = useState(false);
  const [flashOk, setFlashOk] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  // Sync with parent value changes
  useEffect(() => {
    if (!editing) {
      setOptimistic(value);
      setDraft(String(value ?? ''));
    }
  }, [value, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const startEdit = () => {
    if (!user_can_edit) return;
    setDraft(String(optimistic ?? ''));
    setError(null);
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setDraft(String(optimistic ?? ''));
    setError(null);
  };

  const save = async () => {
    const parsed = (type === 'number' || type === 'currency') ? Number(draft) : draft;
    if (validate) {
      const err = validate(parsed);
      if (err) { setError(err); return; }
    }
    const prevOptimistic = optimistic;
    setOptimistic(parsed); // optimistic update
    setEditing(false);
    setSaving(true);
    try {
      await onSave?.(parsed);
      setFlashOk(true);
      setTimeout(() => setFlashOk(false), 1800);
    } catch (e) {
      setOptimistic(prevOptimistic); // revert
      setError(e?.message || 'Error al guardar');
      setEditing(true);
    }
    setSaving(false);
  };

  const handleKey = (e) => {
    if (e.key === 'Escape') { cancel(); return; }
    if (e.key === 'Enter') { e.preventDefault(); save(); }
  };

  const displayed = fmtDisplay(optimistic, type);

  // READ-ONLY mode
  if (!user_can_edit) {
    return (
      <div
        className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded text-sm ${className}`}
        data-testid={testId || 'inline-edit-field'}
      >
        <span className={displayed ? 'text-[var(--cream)]' : 'text-[rgba(240,235,224,0.3)]'}>
          {displayed || placeholder}
        </span>
        <Lock size={10} className="text-[rgba(240,235,224,0.2)] shrink-0" />
      </div>
    );
  }

  // VIEW mode
  if (!editing) {
    return (
      <div
        onClick={startEdit}
        className={`group relative cursor-pointer min-w-[60px] rounded px-1.5 py-0.5
          hover:bg-[rgba(240,235,224,0.07)] transition-colors flex items-center gap-1.5 ${className}`}
        data-testid={testId || 'inline-edit-field'}
      >
        <span className={`text-sm ${displayed ? 'text-[var(--cream)]' : 'text-[rgba(240,235,224,0.3)]'}`}>
          {displayed || placeholder}
        </span>
        {saving && <Loader2 size={11} className="text-[rgba(240,235,224,0.4)] animate-spin shrink-0" />}
        {flashOk && <Check size={11} className="text-emerald-400 shrink-0" />}
        {!saving && !flashOk && (
          <Pencil size={10} className="text-[rgba(240,235,224,0.2)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        )}
        {error && (
          <span className="absolute left-0 top-full mt-0.5 text-[10px] text-red-400 whitespace-nowrap z-10 bg-[#0d1022] px-1.5 py-0.5 rounded border border-red-400/20">
            {error}
          </span>
        )}
      </div>
    );
  }

  // EDIT mode
  return (
    <div className={`relative ${className}`} data-testid={testId || 'inline-edit-field'}>
      {type === 'select' ? (
        <select
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={handleKey}
          className="bg-[rgba(240,235,224,0.09)] border border-[rgba(240,235,224,0.25)] rounded px-2 py-0.5 text-[var(--cream)] text-sm outline-none focus:border-[rgba(240,235,224,0.5)]"
          data-testid="inline-edit-select"
        >
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <input
          ref={inputRef}
          type={type === 'currency' ? 'number' : type}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={handleKey}
          className="bg-[rgba(240,235,224,0.09)] border border-[rgba(240,235,224,0.28)] rounded px-2 py-0.5 text-[var(--cream)] text-sm outline-none focus:border-[rgba(240,235,224,0.55)] min-w-[80px]"
          data-testid="inline-edit-input"
        />
      )}
      {error && (
        <p className="absolute top-full left-0 mt-0.5 text-[10px] text-red-400 whitespace-nowrap z-10 bg-[#0d1022] px-1.5 py-0.5 rounded border border-red-400/20">
          {error}
        </p>
      )}
    </div>
  );
}

export default InlineEditField;
