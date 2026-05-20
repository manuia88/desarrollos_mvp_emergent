// W5.22 Z.8.7 Sub-B2 · TemplateDispatcher · lazy load 10 monolithic templates por key
import React, { Suspense, lazy } from 'react';

// Mapeo template_key -> lazy import (solo se descarga el chunk del template renderizado)
const REGISTRY = {
  luxury: lazy(() => import('./LuxuryTemplate')),
  investor: lazy(() => import('./InvestorTemplate')),
  family: lazy(() => import('./FamilyTemplate')),
  first_home: lazy(() => import('./FirstHomeTemplate')),
  boutique: lazy(() => import('./BoutiqueTemplate')),
  urgent: lazy(() => import('./UrgentTemplate')),
  scrollytelling: lazy(() => import('./ScrollytellingTemplate')),
  video_first: lazy(() => import('./VideoFirstTemplate')),
  social_proof: lazy(() => import('./SocialProofTemplate')),
  compare: lazy(() => import('./CompareTemplate')),
};

// Aliases conservadores (compat con builder Z.8.6 que usa keys ligeramente distintas)
const ALIASES = {
  videofirst: 'video_first',
  social: 'social_proof',
  socialproof: 'social_proof',
  scrolly: 'scrollytelling',
  firsthome: 'first_home',
};

export const TEMPLATE_KEYS = Object.keys(REGISTRY);

export function resolveTemplateKey(key) {
  if (!key) return 'luxury';
  const k = String(key).toLowerCase().trim();
  if (REGISTRY[k]) return k;
  if (ALIASES[k]) return ALIASES[k];
  return 'luxury';
}

function FallbackFrame() {
  return (
    <div data-testid="tpl-z87-loading" style={{ minHeight: '70vh', display: 'grid', placeItems: 'center', background: '#06080F', color: 'rgba(240,235,224,0.6)', fontFamily: 'DM Sans, sans-serif' }}>
      Cargando plantilla...
    </div>
  );
}

export default function TemplateDispatcher({ templateKey, intake = {}, copy = null, isPreview = false }) {
  const resolved = resolveTemplateKey(templateKey || intake?.template_key);
  const Comp = REGISTRY[resolved];
  if (!Comp) return null;
  return (
    <Suspense fallback={<FallbackFrame />}>
      <Comp intake={intake} copy={copy} isPreview={isPreview} />
    </Suspense>
  );
}
