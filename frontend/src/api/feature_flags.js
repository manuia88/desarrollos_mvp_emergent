// W5.FF1 Sub-B · Feature flags API client minimalista.
// Consumes legacy endpoint /api/me/feature-flags (W2.4 SA5 · backward compat aditiva).
// FAIL-OPEN: 401/5xx/network error → null (caller decide fallback).

const API = process.env.REACT_APP_BACKEND_URL;

const _headers = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('dmx_token') || ''}`,
});

/**
 * Fetch enabled features for the current authenticated user.
 * Returns the full payload {tenant_id, enabled, all, is_superadmin, tier?, cached_at?, expires_in_s?}
 * or null on 401 / 5xx / network error (FAIL-OPEN at caller).
 */
export async function fetchMyFeatures() {
  try {
    const r = await fetch(`${API}/api/me/feature-flags`, {
      headers: _headers(),
      credentials: 'include',
    });
    if (r.status === 401) return null;
    if (!r.ok) {
      // 5xx → log warning, return null
      // eslint-disable-next-line no-console
      console.warn(`[feature_flags] HTTP ${r.status} fetching /api/me/feature-flags · FAIL-OPEN null`);
      return null;
    }
    return await r.json();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`[feature_flags] network error · FAIL-OPEN null`, e);
    return null;
  }
}
