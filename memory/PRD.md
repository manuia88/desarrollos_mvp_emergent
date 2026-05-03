# PRD — DesarrollosMX (DMX) Platform

**Repo:** github.com/manuia88/desarrollos_mvp_emergent  
**Stack:** FastAPI + MongoDB + React  
**Current phase:** Phase 4

---

## Architecture Overview

4 portals: developer · asesor · inmobiliaria · comprador + public marketplace  
Backend: FastAPI routers (batch1–batch19.5), MongoDB, AI integrations  
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

### B0 through B18.5
[see previous PRD entries — B0 Foundation through B18.5 Fix-pass]

### B19: Onboarding Tour + Personalization + Keyboard Shortcuts + Cross-portal + Modo Presentación _(2026-05-03)_
- react-joyride@3.1.0, 5 tours, 12+ keyboard shortcuts, KeyboardHelpDialog
- Org branding (PUT/GET/logo upload), useBranding, BrandingPage admin
- cross_portal_events collection, crossPortalToast, useCrossPortalEvents polling
- PresentationModeProvider, presentation.css, anonymize.js (deterministic hash)
- Applied to: LeadKanban, LeadDrawer, DesarrolladorInventario, DesarrolladorDashboard
- Tests: 17/17 pytest passing (subA:5, subB:7, subC:5)

### B19.5: Fix-Pass — Branding + PII completar al 100% _(2026-05-03)_

#### Branding 3 lugares faltantes
- **PDF** (routes_dev_batch5.py + routes_dev_batch7.py): `_build_pdf` loads `org.branding` from `db.organizations` via `branding_helpers.get_org_branding()`. Logo rendered in cover section via `reportlab.platypus.Image`. `_build_study_pdf` now accepts `org_branding` param — passed from caller after async DB fetch.
- **Email** (routes_dev_batch4_1.py + routes_dev_batch4_3.py): `email_footer_html(branding)` helper generates footer with org logo + display_name + tagline. `_reminder_email_html` accepts `org_branding` param. `_send_cita_email` loads branding from DB and injects footer.
- **Public booking page** (routes_dev_batch16.py + PublicBookingPage.js): `_get_dev_branding(db, tenant_id)` added. GET `/api/public/projects/{slug}/booking` returns `dev_branding` field. Frontend applies `--page-primary`/`--page-accent` CSS vars locally. Hero logo + CTA button uses `primary_color`. Footer with `display_name + tagline` rendered in ALL booking states (enabled/disabled).

#### PII anonymize + pricing-blur completados
- **DesarrolladorLeads.js**: `usePresentationMode + anonymizeLead` applied to table rows + LeadDrawer. `pii-anonymize` class on nombre/email/teléfono. `internal-only` on notes section.
- **DesarrolladorPricing.js**: `blurPriceCSS + revealPrice(click→3s→re-blur)` on current_price + suggested_price columns.
- **Leads route fixed**: `/desarrollador/leads` was redirecting to CRM tab — restored to `DesarrolladorLeads.js`.
- **Joyride import fixed**: `import { Joyride } from 'react-joyride'` (named export).

#### New Backend Module
- `branding_helpers.py`: `get_org_branding(db, tenant_id)`, `logo_url_to_local_path(url)`, `email_footer_html(branding)`, `email_header_html(branding)`

#### Tests B19.5 (5 passing)
- `tests/test_batch19_5.py`: booking page returns dev_branding with correct shape, valid hex colors, DMX defaults fallback, email_footer_html renders display_name, email_footer_html(None) uses DMX defaults

**Total tests (B19 + B19.5): 22/22 passing**

---

## Prioritized Backlog

### P0 — Critical next
- B20: Dubai portal + i18n Arabic support
- Public marketplace AI search (Claude/GPT integration)

### P1 — High value
- Branding applied to PDF via logo download from external URLs (currently skipped for http logos)
- Tour analytics: step completion rates per role
- Cross-portal WebSocket real-time (vs polling 30s)

### P2 — Backlog
- Branding preview in email template editor
- org.tenant_id mapping for all existing project slugs

---

## SHA at B19.5 close
Latest commit: 5e547b5
