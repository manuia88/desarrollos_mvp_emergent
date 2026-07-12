// W2.4 SA5 — useFeatureFlag hook + FeatureFlagsContext provider
// W5.FF1 Sub-B (2026-05-18) — Added L3 sessionStorage cache + FAIL-OPEN explícito + useFeatureFlags alias.
//   Backward-compat aditivo: NO romper consumers existentes (UpgradeTeaser · superadminCommercial).
import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { getMyFeatureFlags } from '../api/superadminCommercial';

const TTL_MS = 5 * 60 * 1000;
const SS_KEY = 'dmx_feature_flags';

// ─── L3 sessionStorage cache (defense in depth · W5_FF_FEATURE_VISIBILITY_SPEC §1.2) ──
function _readSS() {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return null;
    const raw = sessionStorage.getItem(SS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.ts !== 'number') return null;
    if (Date.now() - parsed.ts > TTL_MS) return null;
    return parsed.data || null;
  } catch { return null; }
}

function _writeSS(data) {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return;
    sessionStorage.setItem(SS_KEY, JSON.stringify({ ts: Date.now(), data }));
  } catch { /* quota / private mode · silent */ }
}

const FeatureFlagsContext = createContext({
  enabled: [],
  all: [],
  loading: true,
  isSuperadmin: false,
  refresh: () => {},
});

export function FeatureFlagsProvider({ children }) {
  // Hydrate from L3 cache for instant render (no flash). Loading still true so refresh runs.
  const _ss = _readSS();
  const [state, setState] = useState({
    enabled: _ss?.enabled || [],
    all: _ss?.all || [],
    loading: true,
    isSuperadmin: !!_ss?.is_superadmin,
  });
  const lastFetchRef = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const d = await getMyFeatureFlags();
      setState({
        enabled: d.enabled || [],
        all: d.all || [],
        loading: false,
        isSuperadmin: !!d.is_superadmin,
      });
      lastFetchRef.current = Date.now();
      _writeSS(d);
    } catch {
      // FAIL-OPEN explícito: si hay L3 cache válida, úsala; si no, vacío (loading false NO infinito).
      const cached = _readSS();
      if (cached) {
        setState({
          enabled: cached.enabled || [],
          all: cached.all || [],
          loading: false,
          isSuperadmin: !!cached.is_superadmin,
        });
      } else {
        setState({ enabled: [], all: [], loading: false, isSuperadmin: false });
      }
    }
  }, []);

  useEffect(() => {
    // Initial fetch only if logged in (session cookie present).
    // Seguridad: auth es por cookie httponly (access_token) — ya no se lee token de localStorage.
    if (typeof window !== 'undefined' && document.cookie.includes('dmx_session')) {
      refresh();
    } else {
      setState(s => ({ ...s, loading: false }));
    }
    // Auto-refresh on interval (5min)
    const t = setInterval(() => {
      if (Date.now() - lastFetchRef.current >= TTL_MS) refresh();
    }, 60000);
    return () => clearInterval(t);
  }, [refresh]);

  return (
    <FeatureFlagsContext.Provider value={{ ...state, refresh }}>
      {children}
    </FeatureFlagsContext.Provider>
  );
}

/** useFeatureFlag(key) → { enabled, expires_at?, plan_tier?, loading, isSuperadmin } */
export default function useFeatureFlag(featureKey) {
  const ctx = useContext(FeatureFlagsContext);
  const item = (ctx.all || []).find(f => f.feature_key === featureKey);
  return {
    enabled: ctx.isSuperadmin || !!(item && item.enabled),
    expires_at: item?.expires_at,
    plan_tier: item?.plan_tier,
    loading: ctx.loading,
    isSuperadmin: ctx.isSuperadmin,
  };
}

export function useAllFeatureFlags() {
  return useContext(FeatureFlagsContext);
}

// W5.FF1 · Alias spec-friendly · misma API que useAllFeatureFlags.
// Permite que consumers nuevos importen `useFeatureFlags` sin renombrar el legacy.
export const useFeatureFlags = useAllFeatureFlags;

// W5.FF1 · Clear L3 cache (call on logout for security cleanliness).
export function clearFeatureFlagsCache() {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      sessionStorage.removeItem(SS_KEY);
    }
  } catch { /* silent */ }
}
