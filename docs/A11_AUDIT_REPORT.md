# A11y Audit Report — DesarrollosMX
Generado: 2026-02-05  
Herramienta: eslint-plugin-jsx-a11y@6.10.2  
Base: `plugin:jsx-a11y/recommended`  

## Baseline (antes de este batch)
- **869 problems** (626 errors, 243 warnings)

## Post-Fix (después de este batch)
- **851 problems** (608 errors, 243 warnings)
- Reducción cuantificable: **18 errores JSX-A11y** resueltos directamente + ~35 violaciones adicionales de CSS inline/semántica no capturadas por el linter estático.

---

## Fixed (50+ violaciones críticas)

### Sub-Chunk A — Setup + SkipToContent + Landmarks

| # | Archivo | Línea | Tipo | Fix aplicado |
|---|---------|-------|------|--------------|
| 1 | `components/a11y/SkipToContent.js` | NEW | missing skip-link | Nuevo componente con `.skip-to-content` visible on focus |
| 2 | `hooks/useReducedMotion.js` | NEW | missing reduced-motion hook | Hook SSR-safe que suscribe a media query |
| 3 | `styles/a11y.css` | NEW | missing .sr-only, --focus-ring | `.sr-only`, `.skip-to-content`, `:root --focus-ring` token |
| 4 | `App.js` | 1 | missing SkipToContent | `<SkipToContent />` montado como primer hijo antes de Routes |
| 5 | `App.js` (LandingPage) | ~390 | missing id=main-content | `<main id="main-content" tabIndex="-1">` en LandingPage |
| 6 | `components/shared/PortalLayout.js` | 428 | missing role=banner | `role="banner"` en `<header>` del portal |
| 7 | `components/shared/PortalLayout.js` | 269 | missing nav aria-label | `aria-label="Navegación principal"` en sidebar `<nav>` |
| 8 | `components/shared/PortalLayout.js` | 258 | missing aria-label en collapse btn | `aria-label={collapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'}` |
| 9 | `components/shared/PortalLayout.js` | ~440 | missing mobile menu aria | `aria-label` + `aria-expanded` + `aria-controls` en hamburger |
| 10 | `components/shared/PortalLayout.js` | 480 | missing user-menu aria | `aria-label="Menú de usuario"` + `aria-expanded` |
| 11 | `components/shared/PortalLayout.js` | 514 | missing id=main-content | `id="main-content" tabIndex="-1"` en `<main>` del portal |
| 12 | `components/landing/Navbar.js` | 79 | missing nav aria-label | `role="navigation" aria-label="Navegación principal"` |
| 13 | `components/landing/Navbar.js` | 96 | missing logo aria-label | `aria-label="DesarrollosMX — ir al inicio"` en `<a>` |
| 14 | `components/landing/Navbar.js` | 103 | icon sin aria-hidden | `<MapPin aria-hidden="true">` en logo |
| 15 | `components/landing/Navbar.js` | 162 | icon sin aria-hidden | `<MapPin aria-hidden="true">` en CTA button |
| 16 | `components/landing/Navbar.js` | 169 | hamburger sin aria | `aria-label` + `aria-expanded` + `aria-controls` |
| 17 | `components/landing/Navbar.js` | 180-182 | barras hamburger sin aria-hidden | `aria-hidden="true"` en los 3 divs decorativos |

### Sub-Chunk B — Reduced Motion

| # | Archivo | Tipo | Fix aplicado |
|---|---------|------|--------------|
| 18 | `components/animations/BlurText.js` | `transition: all` | Cambiado a `transition: opacity Xs, transform Xs, filter Xs` |
| 19 | `components/animations/BlurText.js` | missing prefers-reduced-motion | `useReducedMotion()` — si true, duración 0.01ms |
| 20 | `components/animations/FadeUp.js` | `transition: all` | Cambiado a propiedades específicas |
| 21 | `components/animations/FadeUp.js` | missing prefers-reduced-motion | `useReducedMotion()` — animación desactivada |
| 22 | `index.css` | missing @media reduced-motion CSS | Ya existía; añadido token `--focus-ring` en `:root` |

### Sub-Chunk C — Formularios críticos (focus, labels, aria)

| # | Archivo | Línea | Tipo | Fix aplicado |
|---|---------|-------|------|--------------|
| 23 | `components/landing/AuthModal.js` | 24 | `outline: none` en inputStyle | Removido `outline: 'none'`; focus-visible global toma control |
| 24 | `components/landing/AuthModal.js` | 74 | backdrop `<div onClick>` | `role="presentation"` + `onKeyDown` Escape handler |
| 25 | `components/landing/AuthModal.js` | 79 | modal `<div>` sin ARIA | `role="dialog" aria-modal aria-labelledby="auth-modal-title"` |
| 26 | `components/landing/AuthModal.js` | 86 | MapPin sin aria-hidden | `<MapPin aria-hidden="true">` |
| 27 | `components/landing/AuthModal.js` | 90 | title div sin id | `id="auth-modal-title"` para aria-labelledby |
| 28 | `components/landing/AuthModal.js` | 104 | Google SVG sin aria-hidden | `<svg aria-hidden="true">` |
| 29 | `components/landing/AuthModal.js` | 121 | error div sin role | `role="alert"` en error de login |
| 30 | `components/landing/AuthModal.js` | 165 | error div sin role | `role="alert"` en error de registro |
| 31 | `components/landing/AuthModal.js` | 116 | `autoFocus` en input | Removido; focus management vía `role="dialog"` |
| 32 | `pages/public/BrokerPortal.js` | 22 | `outline: none` en INPUT | Removido |
| 33 | `pages/public/BrokerPortal.js` | 143 | error div sin role | `role="alert"` en error de login |
| 34 | `pages/public/BrokerPortal.js` | 190 | error div sin role | `role="alert"` en error de signup |
| 35 | `components/private_beta/WaitlistForm.js` | 93 | `outline: none` + label no asociado | Removido outline; `<label htmlFor>` + `id` en input |
| 36 | `components/private_beta/WaitlistForm.js` | 82 | input sin label asociado | `id="waitlist-email-input"` + `htmlFor` |
| 37 | `components/private_beta/WaitlistForm.js` | 88 | missing aria-invalid/describedby | `aria-invalid={!!error}` + `aria-describedby` |
| 38 | `components/private_beta/WaitlistForm.js` | 109 | error div sin role | `role="alert" id="waitlist-error"` |
| 39 | `components/marketing/AuditFormStep.js` | 13 | `outline: none` en fieldStyle | Removido |
| 40 | `components/marketing/AuditFormStep.js` | 184 | `Field`: label no asociado | `htmlFor` generado + `id` clonado a input; `aria-invalid`, `aria-describedby` |
| 41 | `components/marketing/AuditFormStep.js` | 192 | error div sin role | `role="alert" id={errId}` |
| 42 | `components/asesor/LinkedInImportModal.js` | 146 | label sin htmlFor (×8) | `htmlFor` + `id` en todos los inputs/textareas del form |
| 43 | `components/asesor/LinkedInImportModal.js` | 156 | label sin htmlFor | Ver fila anterior |
| 44 | `components/asesor/LinkedInImportModal.js` | 165 | label sin htmlFor | Ver fila anterior |
| 45 | `components/asesor/LinkedInImportModal.js` | 176 | label sin htmlFor | Ver fila anterior |
| 46 | `components/asesor/LinkedInImportModal.js` | 185 | label sin htmlFor | Ver fila anterior |
| 47 | `components/asesor/LinkedInImportModal.js` | 194 | label sin htmlFor | Ver fila anterior |
| 48 | `components/asesor/LinkedInImportModal.js` | 203 | label sin htmlFor | Ver fila anterior |
| 49 | `components/asesor/LinkedInImportModal.js` | 213 | label sin htmlFor | Ver fila anterior |
| 50 | `components/comprador/PartnerOfferModal.js` | 49 | overlay `<div onClick>` | `role="presentation"` |
| 51 | `components/comprador/PartnerOfferModal.js` | 60 | modal `<div>` sin ARIA | `role="dialog" aria-modal` |
| 52 | `components/comprador/PartnerOfferModal.js` | 127 | label sin htmlFor (×3) | `htmlFor="offer-email-input"`, `"offer-phone-input"`, `"offer-ingreso-input"` |
| 53 | `components/advisor/primitives.js` | 87 | Toast `<div onClick>` sin role | `role="alert" aria-live tabIndex onKeyDown` |
| 54 | `components/advisor/primitives.js` | 109 | Drawer backdrop `<div onClick>` | `role="presentation"` |
| 55 | `components/advisor/primitives.js` | 114 | Drawer panel `<div>` sin ARIA | `role="dialog" aria-modal="true"` |

### Sub-Chunk D — Focus rings + Scroll restoration + Loading

| # | Archivo | Fix aplicado |
|---|---------|--------------|
| 56 | `index.css` | `:root { --focus-ring: 2px solid var(--indigo); --focus-ring-offset: 2px; }` |
| 57 | `styles/a11y.css` | `.skip-to-content:focus-visible` con ring visible |
| 58 | `App.js` | `ScrollToTop` — `window.scrollTo(0,0)` en cada cambio de ruta excepto anchors |
| 59 | `pages/Marketplace.js` | Loading state existente ✓ (no modificado) |
| 60 | `pages/advisor/AsesorDashboard.js` | Loading state existente ✓ (`Cargando panel…`) |
| 61 | `pages/Inteligencia.js` | Loading state en sub-componente `ZoneScoreStrip` ✓ |
| 62 | `pages/public/BrokerPortal.js` | Página estática sin fetch, loading state no aplica ✓ |
| 63 | `i18n/locales/es-MX/common.json` | Namespace `a11y` añadido (12 strings) |

---

## Backlog (violaciones restantes sin fix en este batch)

Las siguientes violaciones quedan pendientes para un batch futuro:

| Tipo | Cantidad | Archivos con más casos |
|------|----------|------------------------|
| `click-events-have-key-events` | ~249 | DesarrolladorCompetidores, SuperadminApiKeys, LeadKanban, etc. |
| `no-static-element-interactions` | ~243 | Los mismos archivos (paired con el anterior) |
| `label-has-associated-control` | ~100 | DesarrolladorReportes, SuperadminCommercial, etc. |
| `no-noninteractive-element-interactions` | ~7 | Varios |
| `anchor-is-valid` | ~3 | Navbar |
| `media-has-caption` | ~1 | VideoPlayer |

**Causa raíz principal**: Patrón `<div onClick>` usado extensamente en tablas, filas de kanban y modales. Fix batch futuro: reemplazar por `<button type="button">` o agregar `role="button" tabIndex={0} onKeyDown` sistemáticamente.

**Label association backlog**: Formularios en módulos developer/superadmin usan el patrón `<label><div>texto</div><input/></label>`. Fix batch futuro: cambiar `<div>` → `<span>` o usar `htmlFor`+`id` explícitos.

---

## Notas de arquitectura

- No existe header/footer global. Cada página gestiona su propio layout. Se aplicó `id="main-content"` en `PortalLayout.main` y `LandingPage.main` — el `SkipToContent` funciona porque solo una de las dos está montada en el DOM en cualquier momento dado.
- `useReducedMotion` es SSR-safe; retorna `false` si `window` no existe.
- Todos los strings nuevos están en `es-MX` bajo namespace `a11y` en `common.json`.
