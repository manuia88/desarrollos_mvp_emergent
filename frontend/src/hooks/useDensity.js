/**
 * Batch 18 Sub-A — useDensity hook
 *
 * Loads density preference from /api/preferences/me (new B18 endpoint).
 * Applies CSS class to <body>: density-comfortable | density-compact | density-spacious.
 * Returns { density, setDensity }.
 *
 * Designed to be called once at root level (PortalLayout) so the body class
 * is applied as soon as the user session is established.
 */
import { useState, useEffect, useCallback } from 'react';

const API = process.env.REACT_APP_BACKEND_URL;
const VALID = ['comfortable', 'compact', 'spacious'];
const ALL_CLASSES = VALID.map(d => `density-${d}`);

// Module-level cache: avoids re-fetch across component instances
let _cache = null;
let _promise = null;

function applyBodyClass(density) {
  document.body.classList.remove(...ALL_CLASSES);
  document.body.classList.add(`density-${density}`);
}

async function fetchDensity() {
  try {
    const res = await fetch(`${API}/api/preferences/me`, { credentials: 'include' });
    if (!res.ok) return 'comfortable';
    const data = await res.json();
    return VALID.includes(data.density) ? data.density : 'comfortable';
  } catch {
    return 'comfortable';
  }
}

export function useDensity() {
  const [density, setDensityState] = useState(_cache || 'comfortable');

  // Load once on mount
  useEffect(() => {
    if (_cache !== null) {
      applyBodyClass(_cache);
      setDensityState(_cache);
      return;
    }
    if (!_promise) {
      _promise = fetchDensity()
        .then(d => { _cache = d; return d; })
        .catch(() => { _cache = 'comfortable'; return 'comfortable'; });
    }
    _promise.then(d => {
      setDensityState(d);
      applyBodyClass(d);
    });
  }, []);

  // Keep body class synced with state
  useEffect(() => {
    applyBodyClass(density);
  }, [density]);

  const setDensity = useCallback(async (newDensity) => {
    if (!VALID.includes(newDensity)) return;
    _cache = newDensity;
    _promise = null;
    setDensityState(newDensity);
    applyBodyClass(newDensity);
    try {
      await fetch(`${API}/api/preferences/me`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ density: newDensity }),
      });
    } catch (_) {}
  }, []);

  return { density, setDensity };
}

/** Invalidate the module-level cache (call after explicit preference save). */
export function invalidateDensityCache() {
  _cache = null;
  _promise = null;
}

export default useDensity;
