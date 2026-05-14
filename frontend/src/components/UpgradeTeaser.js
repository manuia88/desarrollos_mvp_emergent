// W2.4 SA5 — UpgradeTeaser
// Wraps a page/feature; shows blurred preview + CTA when feature disabled.
import React from 'react';
import { Lock, Sparkles } from 'lucide-react';
import useFeatureFlag from '../hooks/useFeatureFlag';

const FEATURE_NAMES = {
  studio: 'Studio',
  site_selection: 'Site Selection',
  competidores: 'Análisis Competidores',
  demanda: 'Demanda IE',
  pricing_ai: 'Pricing AI',
  reportes_ia: 'Reportes IA',
  cross_partnerships: 'Cross Partnerships',
  bulk_drive_sync: 'Sync masivo Drive',
  api_access: 'Acceso API',
  advanced_analytics: 'Analytics avanzado',
};

/**
 * <UpgradeTeaser feature="studio">{children}</UpgradeTeaser>
 * - If enabled (or user is superadmin) → renders children
 * - If loading → renders children too (avoid flicker)
 * - If disabled → blurred preview + CTA
 */
export default function UpgradeTeaser({ feature, children, contactUrl = '/contacto?feature=' + encodeURIComponent(feature) }) {
  const { enabled, loading, isSuperadmin } = useFeatureFlag(feature);
  const featureName = FEATURE_NAMES[feature] || feature;

  if (enabled || loading || isSuperadmin) return <>{children}</>;

  // Mobile detection (simple)
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  if (isMobile) {
    return (
      <div data-testid={`upgrade-teaser-${feature}`} style={{
        minHeight: '70vh', padding: 32, display: 'flex',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        textAlign: 'center', gap: 16,
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: 9999,
          background: 'rgba(var(--theme-rgb),0.12)',
          border: '1px solid rgba(var(--theme-rgb),0.32)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Lock size={26} color="var(--theme)" />
        </div>
        <div>
          <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: 'var(--cream)', margin: '0 0 6px' }}>
            {featureName}
          </h2>
          <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.55)', margin: 0, lineHeight: 1.5 }}>
            Esta funcionalidad no está activada en tu cuenta. Contacta a ventas para obtener acceso.
          </p>
        </div>
        <a href={contactUrl} data-testid={`upgrade-cta-${feature}`}
          style={{ padding: '11px 22px', borderRadius: 9999, background: 'linear-gradient(90deg, var(--theme), var(--theme-3))', color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Sparkles size={12} /> Contactar ventas
        </a>
      </div>
    );
  }

  return (
    <div data-testid={`upgrade-teaser-${feature}`} style={{ position: 'relative', minHeight: 480 }}>
      <div aria-hidden style={{ filter: 'blur(4px) opacity(0.4)', pointerEvents: 'none', userSelect: 'none' }}>
        {children}
      </div>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 32,
      }}>
        <div style={{
          maxWidth: 460, padding: '28px 32px', borderRadius: 16,
          background: 'rgba(13,17,28,0.92)', backdropFilter: 'blur(24px)',
          border: '1px solid rgba(var(--theme-rgb),0.32)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center',
        }}>
          <div style={{
            width: 52, height: 52, borderRadius: 9999,
            background: 'rgba(var(--theme-rgb),0.14)',
            border: '1px solid rgba(var(--theme-rgb),0.32)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Lock size={20} color="var(--theme)" />
          </div>
          <div>
            <h2 style={{ fontFamily: 'Outfit', fontWeight: 800, fontSize: 22, color: 'var(--cream)', margin: '0 0 6px', letterSpacing: '-0.02em' }}>
              {featureName} requiere upgrade
            </h2>
            <p style={{ fontFamily: 'DM Sans', fontSize: 13, color: 'rgba(240,235,224,0.55)', margin: 0, lineHeight: 1.55 }}>
              Esta funcionalidad está incluida en planes Pro y Enterprise. Contacta a ventas para activarla.
            </p>
          </div>
          <a href={contactUrl} data-testid={`upgrade-cta-${feature}`}
            style={{ padding: '11px 24px', borderRadius: 9999, background: 'linear-gradient(90deg, var(--theme), var(--theme-3))', color: '#fff', fontFamily: 'DM Sans', fontWeight: 700, fontSize: 13, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Sparkles size={12} /> Contactar ventas para activar
          </a>
        </div>
      </div>
    </div>
  );
}
