/**
 * W5.ASR.0 · Z-index design tokens.
 * Reemplaza 254 ocurrencias hardcoded · React inline styles requieren
 * JS constants (CSS vars no funcionan en numeric zIndex).
 *
 * Tiers (de bajo a alto):
 *   BASE              · normal flow
 *   DROPDOWN          · menús contextuales · popovers
 *   STICKY            · banners sticky top · footers fixed
 *   MODAL             · modales estándar
 *   DRAWER            · drawers laterales
 *   TOAST             · notifications · feedback temporal
 *   TOUR              · Joyride overlay (post W5.1 fix · disableOverlay=true)
 *   TOUR_TIP          · Joyride tooltip
 *   MODAL_CRITICAL    · wizards 3D · presentaciones · sobre todo
 *   A11Y              · skip-links · alerts críticos
 */
export const Z = {
  BASE: 1,
  DROPDOWN: 100,
  STICKY: 200,
  MODAL: 1000,
  DRAWER: 1100,
  TOAST: 2000,
  TOUR: 5000,
  TOUR_TIP: 5100,
  MODAL_CRITICAL: 9000,
  A11Y: 10000,
};

export default Z;
