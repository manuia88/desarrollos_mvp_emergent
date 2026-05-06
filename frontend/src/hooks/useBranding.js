/**
 * Batch 19 Sub-B — useBranding hook
 * Reads org branding from API and applies CSS vars --brand-primary / --brand-accent.
 * Also exposes branding object for components to consume.
 */
import { useState, useEffect } from 'react';

const API = process.env.REACT_APP_BACKEND_URL;

const DMX_DEFAULTS = {
  logo_url: null,
  primary_color: '#06080F',
  accent_color: '#F4E9D8',
  display_name: null,
  tagline: null,
};

let _brandingCache = null;

async function fetchBranding() {
  try {
    const res = await fetch(`${API}/api/orgs/me/branding`, { credentials: 'include' });
    if (!res.ok) return DMX_DEFAULTS;
    const data = await res.json();
    return data.branding || DMX_DEFAULTS;
  } catch {
    return DMX_DEFAULTS;
  }
}

function applyCSSVars(branding) {
  const root = document.documentElement;
  if (branding.primary_color) root.style.setProperty('--brand-primary', branding.primary_color);
  if (branding.accent_color)  root.style.setProperty('--brand-accent',  branding.accent_color);
}

export function useBranding(authenticated = true) {
  const [branding, setBranding] = useState(_brandingCache || DMX_DEFAULTS);
  const [loaded, setLoaded] = useState(_brandingCache !== null);

  useEffect(() => {
    if (!authenticated) return;
    if (_brandingCache) { applyCSSVars(_brandingCache); return; }

    fetchBranding().then(b => {
      _brandingCache = b;
      setBranding(b);
      setLoaded(true);
      applyCSSVars(b);
    });
  }, [authenticated]);

  const resetToDefaults = () => {
    _brandingCache = DMX_DEFAULTS;
    setBranding(DMX_DEFAULTS);
    applyCSSVars(DMX_DEFAULTS);
    // Remove custom CSS vars
    const root = document.documentElement;
    root.style.removeProperty('--brand-primary');
    root.style.removeProperty('--brand-accent');
  };

  const updateBranding = (partial) => {
    const merged = { ...branding, ...partial };
    _brandingCache = merged;
    setBranding(merged);
    applyCSSVars(merged);
  };

  return { branding, loaded, resetToDefaults, updateBranding };
}

/** Invalidate the module-level cache (call after PUT branding) */
export function invalidateBrandingCache() {
  _brandingCache = null;
}

export default useBranding;
