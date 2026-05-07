// W2.4 SA5 — useFeatureFlag hook + FeatureFlagsContext provider
import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { getMyFeatureFlags } from '../api/superadminCommercial';

const TTL_MS = 5 * 60 * 1000;

const FeatureFlagsContext = createContext({
  enabled: [],
  all: [],
  loading: true,
  isSuperadmin: false,
  refresh: () => {},
});

export function FeatureFlagsProvider({ children }) {
  const [state, setState] = useState({ enabled: [], all: [], loading: true, isSuperadmin: false });
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
    } catch {
      setState(s => ({ ...s, loading: false }));
    }
  }, []);

  useEffect(() => {
    // Initial fetch only if logged in (cookie present)
    if (typeof window !== 'undefined' && document.cookie.includes('dmx_session')) {
      refresh();
    } else {
      // Also try if there's a token in localStorage (safer)
      if (localStorage.getItem('dmx_token')) refresh();
      else setState(s => ({ ...s, loading: false }));
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
