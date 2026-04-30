# Test Credentials — DesarrollosMX

## Auth
- **Tipo**: Google OAuth (Emergent-managed)
- **URL de login**: https://auth.emergentagent.com/?redirect=...
- **No hay usuarios de prueba con contraseña** — el login es 100% OAuth con Google

## Roles disponibles (en schema)
| Role | Description |
|------|-------------|
| buyer | Comprador — acceso público + perfil |
| advisor | Asesor inmobiliario certificado |
| advisor_admin | Admin de agencia de asesores |
| developer_admin | Admin de constructora/desarrolladora |
| superadmin | Operaciones DMX |

## Notas
- Cualquier cuenta de Google puede iniciar sesión → crea usuario con role: buyer por defecto
- Role upgrade debe hacerse directamente en MongoDB o vía endpoint admin (pendiente de implementar)
- Single-session enforcement: nuevo login invalida sesión anterior del mismo usuario

## Seed data (no requiere login)
- GET /api/colonias → 3 colonias (Del Valle Centro, Condesa, Roma Norte)
- GET /api/properties → 3 propiedades
