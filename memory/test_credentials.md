# DesarrollosMX — Test Credentials

## Backend admin (legacy auth)
- admin@desarrollosmx.com / Admin2026!
- asesor@demo.com / Asesor2026!
- developer@demo.com / Dev2026!

## Phase 18 Batch 35 — Inmobiliaria admin (Test tenant)
- inm-test-1@desarrollosmx.com / Test12345!  (role: inmobiliaria_admin, tenant_id: inm_4a19f8fd6b79)
  - Empresa: "Inmobiliaria Demo Test", AMPI verified (manual_review pending).
  - Useful para probar `/inmobiliaria` dashboard, `/inmobiliaria/alianzas`, `/inmobiliaria/asesores`.
  - Para crear nuevas inmobiliarias: visita `/inmobiliaria/signup` (público).

## Phase 4 Batch 28 — Portal Comprador (Magic Link)
Magic-link flow es PASSWORDLESS. Para crear una sesión de prueba:
1. POST /api/auth/comprador/magic-link/request body {"email":"buyer@dmx.com"}
2. Si Resend NO está configurado, la respuesta incluye `debug_token`
3. Navegar a `/login-comprador?token={debug_token}` o GET /api/auth/comprador/magic-link/verify?token=...
4. Cookies HttpOnly access_token+refresh_token quedan instaladas → /comprador/* accesible.

Rate limit: 5 magic-link requests / minuto / IP.
Tokens: 24-byte URL-safe, single-use, expires 15 min.
