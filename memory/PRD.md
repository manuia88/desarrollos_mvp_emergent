# PRD — DesarrollosMX (DMX) Platform

**Repo:** github.com/manuia88/desarrollos_mvp_emergent  
**Stack:** FastAPI + MongoDB + React  
**Current phase:** Phase 4

---

## Architecture Overview

4 portals: developer · asesor · inmobiliaria · comprador + public marketplace  
Backend: FastAPI routers (batch1–batch19), MongoDB, AI integrations  
Frontend: React SPA, Tailwind, Lucide icons, Design tokens (navy/cream palette)

---

## Core Requirements (Static)

- AI-native real estate platform (CDMX H1 + Dubai H1)
- 4 portals with role-based access
- Marketplace público + 3 internal portals
- Full cross-portal sync and data isolation
- Mobile-responsive with i18n (ES/EN)

---

## What's Been Implemented

### B0: Foundation
- PortalLayout + 11 primitives + bundle splitting + AI budget + permissions + i18n

### B0.5: Diagnostic Engine
- 35 probes diagnostic engine

### B10: Sidebar + Navigation
- Sidebar 3 tiers + Mis Proyectos + VentasTab

### B11: Legajo Tabs
- Tabs Legajo + Comercialización + Drawer 7 sections

### B12: Wizard + Drive
- Wizard 7 steps + IA upload Drive

### B13: Cross-portal Sync
- Tracking attribution

### B14: Health Score + Activity Feed
- Notifications + Setup Checklist + Weekly Brief AI

### B15: Google Calendar OAuth
- Availability + Auto-assign

### B16: AI Suggestions
- Smart Empty States + Public Booking /reservar/dmx-keys

### B17: SortableList
- Inline edit + FilterChipsBar + Undo system server-side

### B18: Density Toggle
- Project Switcher (Cmd+/) + Vista Planta 2.0 Interactiva

### B18.5: Fix-pass
- 19 bugs + 5 design violations cleared, useIsMobile hook reactivo, focus-visible global

### B19: Onboarding Tour + Personalization + Keyboard Shortcuts + Cross-portal Sync + Modo Presentación _(2026-05-03)_

#### Sub-Chunk A: Onboarding Tour + Keyboard Shortcuts + Help Dialog
- **react-joyride@3.1.0** installed
- 5 tours configured: `dev_first_login` (7 steps), `asesor_first_login` (5), `inmobiliaria_first_login` (5), `comprador_first_login` (4), `dev_post_first_project` (4)
- Tours auto-start on first login by role (useTour hook)
- Manual restart from /configuracion/preferencias
- Skip → POST /tour-dismiss → permanent dismissal
- `useKeyboardShortcuts` hook: global centralized keyboard shortcuts
  - Cmd+K → UniversalSearch
  - Cmd+/ → ProjectSwitcher
  - Cmd+B → Toggle sidebar
  - Cmd+N → Quick action
  - Cmd+Shift+P → Modo Presentación
  - ? → KeyboardHelpDialog
  - Esc → Close drawer/modal
  - g+h/p/c/l → Navigation shortcuts
- `KeyboardHelpDialog`: modal with sections, search filter, tour restart link

#### Sub-Chunk B: Branding + Cross-portal Sync
- DB: `organizations.branding` schema (logo_url, primary_color, accent_color, display_name, tagline)
- DB: `cross_portal_events` collection
- `routes_branding.py` (in routes_dev_batch19.py): GET/PUT/POST/DELETE /api/orgs/me/branding
- `crossPortalToast.js`: toast bottom-right with portal chips + icons
- `useCrossPortalEvents`: polls /api/orgs/cross-portal/events every 30s
- `useBranding`: applies CSS vars --brand-primary/--brand-accent globally
- `BrandingPage`: /configuracion/branding with live preview (admin only)
- Applied: topbar logo, login page tagline, branding preview card

#### Sub-Chunk C: Modo Presentación
- DB: `user_preferences.presentation_mode` (active, anonymize_pii, hide_pricing, hide_internal_notes)
- PATCH /api/preferences/me extended for presentation_mode
- `PresentationModeProvider` + `usePresentationMode` hook
- `presentation.css`: body.presentation-mode + .pii-anonymize + .pricing-blur + .internal-only
- `anonymize.js`: deterministic hashId (same lead._id → same Lead XXX number)
- Applied to 5 views: LeadKanban, LeadDrawer, DesarrolladorInventario, DesarrolladorDashboard
- Presentation badge (cream, fixed top-center) when active
- Mobile guard: toast "solo desktop" + no-activate
- Toggle restore: density + sidebar state preserved on deactivate
- Settings in /configuracion/preferencias: 3 config toggles + "Activar ahora" button

#### Tests (17 passing)
- `tests/test_batch19_subA.py`: 5 tests (tour-complete/dismiss/arrays/empty/auth)
- `tests/test_batch19_subB.py`: 7 tests (branding GET/PUT/asesor-403/logo<500KB/logo>500KB-413/cross-portal-log/reset)
- `tests/test_batch19_subC.py`: 5 tests (presentation_mode PATCH/partial/deterministic/invalid-fields/unauth)

---

## Prioritized Backlog

### P0 — Critical next
- B20: Dubai portal + i18n Arabic support (planned)
- Public marketplace search with AI (Claude/GPT integration)

### P1 — High value
- Email templates with org branding (header/footer)
- Branding applied to Reports PDF header
- Public booking page /reservar/:slug → apply org branding
- Lead PII anonymize applied to leads list table view (DesarrolladorLeads.js)
- Presentation mode: apply pricing-blur to DesarrolladorPricing.js

### P2 — Nice to have
- Tour analytics: track step drop-off rates
- Cross-portal event WebSocket real-time (vs. polling 30s)
- Branding preview in email template

---

## Next Tasks (B20 + remaining B19 polish)

1. Apply branding to PDF reports (routes_reportes.py header)
2. Apply branding to email templates footer
3. Apply branding to /reservar/:slug public booking page
4. Tour analytics (step completion rates per role)
5. Test keyboard shortcuts on mobile gracefully

## SHA at B19 close
Latest commit: db38fe8 (auto-commit for c021215b-d8ff-4a3e-a3cc-2c60510a89fd)
