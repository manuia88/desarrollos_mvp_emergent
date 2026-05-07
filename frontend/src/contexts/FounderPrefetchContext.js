// W2.6 SA8 — Founder global prefetch context.
// Background-loads dashboard data + metrics-cube period rollups so all
// founder-console views feel instant ("Bloomberg Terminal" UX).
// 5min memory cache · auto-revalidate on stale.
import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { getDashboard, listAnomalies, searchCommands, listQuickActions } from '../api/superadminFounderConsole';
import { getTiers, listTier } from '../api/superadminMetricsCube';

const TTL_MS = 5 * 60 * 1000;

const FounderPrefetchContext = createContext(null);

export function useFounderPrefetch() {
  const ctx = useContext(FounderPrefetchContext);
  // Always return safe defaults so consumers don't have to null-check.
  return ctx || { cache: {}, get: () => null, prime: () => {}, isFresh: () => false };
}

export function FounderPrefetchProvider({ user, children }) {
  const [cache, setCache] = useState({});
  const inflightRef = useRef({});

  const set = useCallback((key, value) => {
    setCache(c => ({ ...c, [key]: { value, ts: Date.now() } }));
  }, []);

  const get = useCallback((key) => {
    const e = cache[key];
    return e ? e.value : null;
  }, [cache]);

  const isFresh = useCallback((key) => {
    const e = cache[key];
    return !!e && (Date.now() - e.ts) < TTL_MS;
  }, [cache]);

  const prime = useCallback(async (key, loader) => {
    if (isFresh(key)) return cache[key].value;
    if (inflightRef.current[key]) return inflightRef.current[key];
    inflightRef.current[key] = (async () => {
      try {
        const v = await loader();
        set(key, v);
        return v;
      } catch (e) {
        // swallow — UI surfaces error per-component
        return null;
      } finally {
        delete inflightRef.current[key];
      }
    })();
    return inflightRef.current[key];
  }, [cache, isFresh, set]);

  // Initial parallel prefetch when user is superadmin
  useEffect(() => {
    if (!user || user.role !== 'superadmin') return;
    // Fire-and-forget all in parallel
    prime('dashboard', getDashboard);
    prime('anomalies_open', () => listAnomalies({ status: 'open', limit: 20 }));
    prime('commands', () => searchCommands('', 50));
    prime('quick_actions', listQuickActions);
    prime('cube_tiers', getTiers);
    // Pre-warm all 4 metrics-cube periods at city level (closes W2.5 deferred)
    ['current', '7d', '30d', '90d'].forEach(p => {
      prime(`cube_alcaldia_${p}`, () => listTier('alcaldia', { period: p, limit: 50 }));
    });
  }, [user, prime]);

  // Auto-revalidate every 60s for dashboard + anomalies (top of the funnel)
  useEffect(() => {
    if (!user || user.role !== 'superadmin') return;
    const id = setInterval(() => {
      // Force refresh: clear ts so isFresh is false
      setCache(c => {
        const { dashboard, anomalies_open, ...rest } = c;
        return rest;
      });
      prime('dashboard', getDashboard);
      prime('anomalies_open', () => listAnomalies({ status: 'open', limit: 20 }));
    }, 60000);
    return () => clearInterval(id);
  }, [user, prime]);

  const value = { cache, get, prime, isFresh, set };
  return (
    <FounderPrefetchContext.Provider value={value}>
      {children}
    </FounderPrefetchContext.Provider>
  );
}
