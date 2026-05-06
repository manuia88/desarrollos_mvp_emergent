/**
 * Batch 19 Sub-C — usePresentationMode
 * Global context + hook for Presentation Mode.
 *
 * Features:
 *  - Reads/persists via PATCH /api/preferences/me
 *  - Applies body class .presentation-mode
 *  - Saves/restores density + sidebar state on toggle
 *  - Mobile guard: shows toast + returns early if isMobile
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useIsMobile } from './useIsMobile';

const API = process.env.REACT_APP_BACKEND_URL;

const DEFAULT_CONFIG = {
  active: false,
  anonymize_pii: true,
  hide_pricing: false,
  hide_internal_notes: true,
};

const PresentationModeContext = createContext({
  isActive: false,
  config: DEFAULT_CONFIG,
  toggle: () => {},
  setConfig: () => {},
});

async function fetchPrefs() {
  try {
    const res = await fetch(`${API}/api/preferences/me`, { credentials: 'include' });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

async function persistPresentationMode(pm) {
  try {
    await fetch(`${API}/api/preferences/me`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ presentation_mode: pm }),
    });
  } catch {}
}

function applyBodyClass(active) {
  if (active) {
    document.body.classList.add('presentation-mode');
  } else {
    document.body.classList.remove('presentation-mode');
  }
}

function showMobileToast() {
  // Fire a lightweight DOM toast (no dependency on toast library)
  const div = document.createElement('div');
  div.style.cssText = `
    position:fixed; bottom:24px; left:50%; transform:translateX(-50%);
    background:rgba(13,16,23,0.92); border:1px solid rgba(255,255,255,0.16);
    color:var(--cream,#F0EBE0); padding:10px 18px; border-radius:9999px;
    font:600 12px/1 'DM Sans',sans-serif; z-index:9999;
    backdrop-filter:blur(8px); white-space:nowrap;
    animation:slideUp 0.25s ease;
  `;
  div.textContent = 'Modo presentación solo disponible en desktop';
  div.id = 'pm-mobile-toast';
  document.body.appendChild(div);
  setTimeout(() => { if (div.parentNode) div.parentNode.removeChild(div); }, 3000);
}

export function PresentationModeProvider({ children }) {
  const isMobile = useIsMobile();
  const [config, setConfigState] = useState(DEFAULT_CONFIG);
  const [prevDensity, setPrevDensity] = useState('comfortable');
  const [prevSidebar, setPrevSidebar] = useState(false);

  // Load persisted state on mount
  useEffect(() => {
    fetchPrefs().then(prefs => {
      if (!prefs) return;
      const pm = prefs.presentation_mode;
      if (pm) {
        const merged = { ...DEFAULT_CONFIG, ...pm };
        setConfigState(merged);
        if (merged.active) {
          applyBodyClass(true);
        }
      }
    });
  }, []);

  const toggle = useCallback(() => {
    if (isMobile) {
      showMobileToast();
      return;
    }

    setConfigState(prev => {
      const nextActive = !prev.active;
      const next = { ...prev, active: nextActive };

      if (nextActive) {
        // Save current density + sidebar state before activating
        const currentDensity = (() => {
          const cl = document.body.classList;
          if (cl.contains('density-compact')) return 'compact';
          if (cl.contains('density-spacious')) return 'spacious';
          return 'comfortable';
        })();
        setPrevDensity(currentDensity);

        // Apply spacious density in presentation mode
        document.body.classList.remove('density-comfortable', 'density-compact', 'density-spacious');
        document.body.classList.add('density-spacious');

        applyBodyClass(true);
      } else {
        // Restore density
        setPrevDensity(d => {
          document.body.classList.remove('density-comfortable', 'density-compact', 'density-spacious');
          document.body.classList.add(`density-${d}`);
          return d;
        });
        applyBodyClass(false);
      }

      persistPresentationMode(next);
      return next;
    });
  }, [isMobile]);

  const setConfig = useCallback((partial) => {
    setConfigState(prev => {
      const next = { ...prev, ...partial };
      persistPresentationMode(next);
      if (next.active !== prev.active) {
        applyBodyClass(next.active);
      }
      return next;
    });
  }, []);

  return (
    <PresentationModeContext.Provider value={{
      isActive: config.active,
      config,
      toggle,
      setConfig,
      prevDensity,
      prevSidebar,
    }}>
      {children}
    </PresentationModeContext.Provider>
  );
}

export function usePresentationMode() {
  return useContext(PresentationModeContext);
}

export default usePresentationMode;
