// W1.2 SA1.1 — useImpersonation hook
// Reads localStorage marker `dmx_impersonation` (synced when impersonate starts)
// and returns active impersonation metadata + helpers.
import { useState, useEffect, useCallback } from 'react';
import { endImpersonation as apiEnd } from '../api/superadminTenants';

const KEY = 'dmx_impersonation';

function readSession() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const sess = JSON.parse(raw);
    if (!sess.expires_at) return null;
    if (new Date(sess.expires_at).getTime() < Date.now()) {
      localStorage.removeItem(KEY);
      return null;
    }
    return sess;
  } catch {
    return null;
  }
}

export function startImpersonation(sess) {
  try { localStorage.setItem(KEY, JSON.stringify(sess)); } catch {}
}

export function clearImpersonationMarker() {
  try { localStorage.removeItem(KEY); } catch {}
}

export default function useImpersonation() {
  const [session, setSession] = useState(readSession);

  // Re-check on storage events + interval
  useEffect(() => {
    const onStorage = (e) => { if (e.key === KEY) setSession(readSession()); };
    window.addEventListener('storage', onStorage);
    const t = setInterval(() => setSession(readSession()), 30000);
    return () => { window.removeEventListener('storage', onStorage); clearInterval(t); };
  }, []);

  const end = useCallback(async () => {
    try { await apiEnd(); } catch {}
    clearImpersonationMarker();
    setSession(null);
  }, []);

  return { session, isImpersonating: !!session, end };
}
