# QA & Security Hardening Report — Módulo Asesor (2026-06-01)

Registro canónico de la campaña de auditoría de producción + endurecimiento + QA
exhaustivo del módulo asesor y sus dependencias. Todo verificado; suite unit 1033
verde en cada commit; backend levanta y responde end-to-end.

## 1. Auditoría (5 rondas + auditoría final)
34 frentes de análisis read-only. Veredicto inicial: NO listo para producción.
Familias de causa raíz: sin modelo/identidad canónica de lead, sin índices asesor_*,
sin transacciones/atomicidad, config fail-open + secretos, registro-superadmin abierto,
sin error boundary. Detalle en [[asesor-prod-audit]] (memoria de sesión).

## 2. Reparaciones (pasos 1–4b + lotes A–H)
- **Paso 1 — secretos + auth + presupuesto**: borrados 2 dumps de secretos en texto
  plano; `/api/auth/register` cierra auto-asignación de superadmin (allowlist + 400);
  `is_within_budget` y cuota de video fallan CERRADO + visibles en Sentry.
- **Paso 2 — familias de errores Sentry**: fecha→ISO en respuestas, free-audit event
  loop, ScoreOut tipo, ruido KG filtrado, replays Sentry 0% + PII enmascarada. CI verde.
- **Paso 3 — índices + estados**: 18 índices en 9 colecciones asesor_*; un solo
  vocabulario `status_v2` + backfill en arranque.
- **Paso 4/4b — atomicidad**: CAS en cierre de operación (anti doble-XP); compensación
  de cita huérfana; idempotencia de conversación (índice único parcial); dedup duro de
  leads activos (campo `activo` + índice único parcial + reconcile).
- **Lotes A–H — seguridad**: 8 candados cross-tenant/IDOR; allow-list de 30 tools en el
  asistente público Atlax (chokepoint anti prompt-injection); rate-limit en públicos;
  CORS env-driven + cuentas demo solo dev + Fernet warn; sanitizer de pixel + delimit
  de prompt; React error boundary; observabilidad de fallos silenciosos; salt LFPDPPP
  server-only fuera del bundle.
- **Campo de inmobiliaria ÚNICO**: `leads.inmobiliaria_id` canónico vía resolver +
  backfill; outbound/ownership filtran por inmobiliaria real.
- **Contacto gated**: el perfil público del asesor oculta tel/email; se revela al dejar
  datos (que crean el lead). **Auto-reparable**: leads que no llegan a "Mis Leads" se
  marcan `mirror_pending` y un reintento en arranque los recupera.

## 3. QA simulado (backend real ASGI vs Mongo local) — arneses en `scripts/qa_*.py`
| Arnés | Cobertura | Resultado |
|---|---|---|
| `qa_sim.py` | auth, leads, dedup, IDOR, atlax, rate-limit, gated, dinero, pipeline, CRM, datos | 45/45 |
| `qa_sim2.py` | concurrencia real, escala 5k, integridad, fuzz, viaje 7 etapas | 17/17 |
| `qa_load.py` | 20k docs, ráfaga 2000 req conc-100, churn | 0 errores/0 crashes/198 req/s |
| `qa_redteam.py` | NoSQL inj, IDOR, mass-assign, JWT, auth-bypass, webhook HMAC, prompt-inj, fuzz | 22/22 ataques bloqueados · 0 vuln |
| `qa_sim3.py` | crons, features, métricas, **barrido 474 rutas GET**, idempotencia arranque, contrato | 15/15 · 0 errores 500 |

Total: 1033 unit + 139 escenarios E2E/seguridad/carga.

## 4. Bugs latentes reales encontrados POR el QA (6, todos arreglados)
1. `logging` sin importar en advisor.py → NameError en 5 except.
2. `emit_ml_event` llamado con args posicionales (firma keyword-only) → evento ML de
   cambio de status de dinero nunca se guardaba.
3. Leads de cita/marketplace sin `status_v2` → invisibles a smart lists.
4. `move-column` (kanban) no seteaba `activo` al cerrar → bloqueaba re-alta.
5. `cross_sell_engine` accedía `partner["type"]` sin guard (6 sitios) → 500 en 2 endpoints.
6. `cross_sell` buyer por `{"id"}` (debe `user_id`) + b13 sin length-caps.

## 5. Pendiente del founder al desplegar (NO es código)
Setear por variables de entorno: `CORS_ORIGINS`, `ADMIN_PASSWORD`, `IE_FERNET_KEY`,
`JWT_SECRET`, `LFPDPPP_SALT`. Rotar el GitHub PAT. Al lanzar, prueba de carga real
(k6/Locust) con tráfico de producción (no simulable localmente).

## 6. Residual conocido (no bloqueante)
Unificación completa de vocabularios `etapa` (asesor_contactos) vs `status` V1 (leads)
diferida por riesgo/bajo valor sin lanzamiento. Inline-script en pixels de marketing
permitido a propósito (GTM); el owner edita su propia landing.
