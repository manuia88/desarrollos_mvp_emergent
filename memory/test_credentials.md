# Test Credentials — DesarrollosMX

## Email/password test accounts

| Role | Email | Password | Portal |
|------|-------|----------|--------|
| superadmin | admin@desarrollosmx.com | Admin2026! | all |
| advisor | asesor@demo.com | Asesor2026! | `/asesor/*` — CRM Pulppo+ |
| developer_admin | developer@demo.com | Dev2026! | `/desarrollador/*` — Portal Desarrollador |
| developer_member (internal_role: comercial) | comercial.test@acme.com | SafePass2026! | `/desarrollador/*` (invited via B3 flow) |
| developer_member (internal_role: obras) | obras.test@acme.com | ObrasSafe2026! | `/desarrollador/*` (invited via B3 flow) |
| developer_member (internal_role: marketing) | final.test@acme.com | MktSafe2026! | `/desarrollador/*` (invited via B3 flow) |

Note: The internal-users accounts above were created via Phase 4 Batch 3 activation flow
(`POST /api/dev/invitations/{token}/accept`) and can log in at `/api/auth/internal/login`
or the standard `/api/auth/login`.

Use `/api/auth/login` with JSON body `{email, password}` to get cookies, then call any `/api/*` endpoint with `credentials: include`.

## Google OAuth (optional)
- Tipo: Emergent-managed Google Auth
- URL: https://auth.emergentagent.com/?redirect=...
- Cualquier cuenta de Google → crea usuario con role `buyer` por defecto.
- Upgrade de rol a `advisor` requiere actualización directa en MongoDB o endpoint admin (pendiente).

## Roles disponibles
| Role | Description |
|------|-------------|
| buyer | Comprador — acceso público + perfil |
| advisor | Asesor inmobiliario (Phase 4 CRM) |
| asesor_admin | Admin de agencia de asesores |
| developer_admin | Admin de constructora |
| superadmin | Operaciones DMX |

## Seed data público (no requiere login)
- `GET /api/colonias` → 16 colonias CDMX
- `GET /api/developments` → 15 desarrollos (10 developers)

## Seed demo CRM (requiere login asesor)
- `POST /api/asesor/_seed-demo` → crea 6 contactos, 3 búsquedas, 2 captaciones, 4 tareas, 2 operaciones.
- Idempotente: re-ejecutar no duplica (chequea flag `seed: True`).

## Single-session
- Cada login invalida session_token anterior del mismo usuario (aplicado solo en flujo Google OAuth).
