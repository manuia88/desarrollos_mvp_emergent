/**
 * Batch 19 Sub-A — useKeyboardShortcuts
 * Registers global keyboard shortcuts on window keydown.
 * Disabled when an input/textarea/select is focused (unless shortcut is Escape).
 *
 * Usage:
 *   useKeyboardShortcuts([
 *     { combo: '?',               handler: openHelpDialog },
 *     { combo: 'mod+k',           handler: openSearch },
 *     { combo: 'mod+/',           handler: openSwitcher },
 *     { combo: 'mod+b',           handler: toggleSidebar },
 *     { combo: 'mod+shift+p',     handler: togglePresentationMode },
 *     { combo: 'g h',             handler: () => navigate('/desarrollador') },
 *   ])
 *
 * combo format:
 *   'mod+k'        → Cmd (Mac) / Ctrl (Windows) + K
 *   'mod+shift+k'  → Cmd/Ctrl + Shift + K
 *   '?'            → single key (no mod)
 *   'g h'          → sequential 2-key chord
 */
import { useEffect, useRef } from 'react';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

function parseCombo(combo) {
  const parts = combo.toLowerCase().split('+');
  return {
    mod:   parts.includes('mod'),
    shift: parts.includes('shift'),
    alt:   parts.includes('alt'),
    key:   parts[parts.length - 1],
    chord: combo.includes(' '),  // e.g. "g h"
    raw:   combo,
  };
}

function matchesCombo(e, parsed) {
  if (parsed.chord) return false; // chords handled separately
  const modPressed = isMac ? e.metaKey : e.ctrlKey;
  if (parsed.mod && !modPressed) return false;
  if (!parsed.mod && (e.metaKey || e.ctrlKey)) return false;
  if (parsed.shift && !e.shiftKey) return false;
  if (!parsed.shift && e.shiftKey && parsed.mod) return false; // mod+key should not fire with shift
  if (parsed.alt && !e.altKey) return false;
  return e.key.toLowerCase() === parsed.key;
}

const FOCUSABLE = ['input', 'textarea', 'select'];

function isFocusedOnInput() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  return FOCUSABLE.includes(tag) || el.isContentEditable;
}

export function useKeyboardShortcuts(shortcuts = []) {
  const chordRef = useRef(null);
  const chordTimerRef = useRef(null);
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  useEffect(() => {
    const parsed = shortcutsRef.current.map(s => ({
      ...s,
      parsed: parseCombo(s.combo),
    }));

    const handler = (e) => {
      // Never block Escape — always fires
      if (e.key !== 'Escape' && isFocusedOnInput()) return;
      // Never use Cmd+P (browser print)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'p' && !e.shiftKey) return;

      // Handle chord sequences (e.g. "g h")
      const chordShortcuts = parsed.filter(s => s.parsed.chord);
      if (chordShortcuts.length > 0 && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const key = e.key.toLowerCase();

        if (chordRef.current) {
          // Second key of chord
          const chord = `${chordRef.current} ${key}`;
          const match = chordShortcuts.find(s => s.parsed.raw === chord);
          if (match) {
            e.preventDefault();
            match.handler(e);
          }
          chordRef.current = null;
          clearTimeout(chordTimerRef.current);
        } else {
          // Possible first key of chord
          const possibleFirst = chordShortcuts.some(s => s.parsed.raw.startsWith(key + ' '));
          if (possibleFirst) {
            chordRef.current = key;
            chordTimerRef.current = setTimeout(() => { chordRef.current = null; }, 600);
            return; // wait for second key
          }
        }
      }

      // Single-key shortcuts
      for (const s of parsed) {
        if (s.parsed.chord) continue;
        if (matchesCombo(e, s.parsed)) {
          e.preventDefault();
          s.handler(e);
          return;
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
      clearTimeout(chordTimerRef.current);
    };
  }, []); // stable — shortcutsRef.current updated via ref
}

export default useKeyboardShortcuts;
