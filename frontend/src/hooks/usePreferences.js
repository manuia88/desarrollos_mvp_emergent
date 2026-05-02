/**
 * Phase 4 Batch 0 — usePreferences hook
 * Persistent user preferences synced to backend.
 * Usage:
 *   const { pref, setPref, prefsLoaded } = usePreferences();
 *   const sidebar = pref('sidebar_collapsed', false);
 *   setPref('sidebar_collapsed', true);
 */
import { useState, useEffect, useCallback, useRef } from 'react';

const API = process.env.REACT_APP_BACKEND_URL;

// Module-level cache to avoid re-fetching per component instance
let _cache = null;
let _cachePromise = null;

async function fetchPrefs() {
  const res = await fetch(`${API}/api/user/preferences`, { credentials: 'include' });
  if (!res.ok) return {};
  return res.json();
}

export function usePreferences() {
  const [prefs, setPrefs] = useState(_cache || {});
  const [loaded, setLoaded] = useState(_cache !== null);
  const pendingRef = useRef({});

  // Load prefs once
  useEffect(() => {
    if (_cache !== null) { setPrefs(_cache); setLoaded(true); return; }
    if (!_cachePromise) {
      _cachePromise = fetchPrefs()
        .then(data => { _cache = data; return data; })
        .catch(() => { _cache = {}; return {}; });
    }
    _cachePromise.then(data => {
      setPrefs(data);
      setLoaded(true);
    });
  }, []);

  const pref = useCallback((key, defaultValue) => {
    const v = prefs[key];
    return v !== undefined ? v : defaultValue;
  }, [prefs]);

  const setPref = useCallback(async (key, value) => {
    // Optimistic update
    const updated = { ..._cache, [key]: value };
    _cache = updated;
    setPrefs(updated);

    // Debounced save
    clearTimeout(pendingRef.current[key]);
    pendingRef.current[key] = setTimeout(async () => {
      try {
        await fetch(`${API}/api/user/preferences`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value }),
        });
      } catch (_) {}
    }, 400);
  }, []);

  return { pref, setPref, prefs, prefsLoaded: loaded };
}

export default usePreferences;
