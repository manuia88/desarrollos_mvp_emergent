/**
 * Phase 4 Batch 23 — useKeyboardShortcuts (centralized hook).
 *
 * Subscribe-style keyboard registry to coordinate global shortcuts across
 * portal layouts. First wired with Cmd+J for AI Copilot toggle. Designed to
 * grow into B19 keyboard help dialog without breaking existing handlers.
 *
 * Usage:
 *   useKeyboardShortcuts([
 *     { combo: 'mod+j', label: 'Abrir Copilot', handler: () => copilot.toggle() },
 *   ]);
 *
 * Combo grammar: tokens joined with '+'. Supports modifiers `mod` (cmd on mac,
 * ctrl elsewhere), `shift`, `alt`, plus a single key (case-insensitive).
 */
import { useEffect, useRef } from 'react';

const isMac = typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || '');

function parseCombo(combo) {
  const parts = String(combo).toLowerCase().split('+').map(s => s.trim()).filter(Boolean);
  const out = { key: null, mod: false, shift: false, alt: false };
  for (const p of parts) {
    if (p === 'mod' || p === 'cmd' || p === 'ctrl') out.mod = true;
    else if (p === 'shift') out.shift = true;
    else if (p === 'alt' || p === 'option') out.alt = true;
    else out.key = p;
  }
  return out;
}

function matches(e, parsed) {
  if (!parsed.key) return false;
  if (e.key.toLowerCase() !== parsed.key) return false;
  const modPressed = isMac ? e.metaKey : e.ctrlKey;
  if (parsed.mod !== modPressed) return false;
  if (parsed.shift !== e.shiftKey) return false;
  if (parsed.alt !== e.altKey) return false;
  return true;
}

function isEditableTarget(target) {
  if (!target) return false;
  const tag = (target.tagName || '').toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

/**
 * @param shortcuts Array<{ combo: string, handler: (e) => void,
 *                          label?: string, allowInInput?: boolean }>
 */
export default function useKeyboardShortcuts(shortcuts) {
  const ref = useRef(shortcuts);
  ref.current = shortcuts;

  useEffect(() => {
    const handler = (e) => {
      const list = ref.current || [];
      for (const sc of list) {
        if (!sc?.combo || !sc?.handler) continue;
        const parsed = parseCombo(sc.combo);
        if (!matches(e, parsed)) continue;
        if (!sc.allowInInput && isEditableTarget(e.target)) continue;
        e.preventDefault();
        try { sc.handler(e); } catch { /* noop */ }
        break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}

/** Public registry for B19 KeyboardHelpDialog (future). */
export const SHORTCUTS_REGISTRY = [
  { combo: 'mod+k', label: 'Buscar (Universal Search)', scope: 'global' },
  { combo: 'mod+j', label: 'Abrir Copilot DMX', scope: 'global' },
];

export { isMac };
