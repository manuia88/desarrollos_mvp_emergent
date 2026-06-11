# AUDIT — RESUMEN EJECUTIVO
DMX (`desarrollos_mvp_emergent`) · 2026-06-10 · auditoría formal 12 fases (READ-ONLY) + 5 rondas QA previas (QA1–QA5).
Veredicto sin suavizar abajo. Detalle por fase en `AUDIT_FASE_*.md`; checklist accionable en `memory/QA_FIX_CHECKLIST.md`.

## 1. STACK DETECTADO
Python + **FastAPI** 0.104 · **MongoDB** (Motor async, NoSQL **sin RLS** → aislamiento 100% en capa de app) · **Pydantic** validación · JWT HS256 + **bcrypt** · **React (CRA)** 18 · Stripe · OpenAI/Anthropic/Emergent LLM · Sentry · PostHog · Mapbox. 311 .py backend + 214 routers + 893 archivos front. DB `desarrollosmx`: 390 colecciones, 100 con datos; **las colecciones de negocio (developments/transactions/leads/asesor_*) están VACÍAS → corre sobre seed in-memory** (por eso casi todo bug es LATENTE: estalla con dato real).

## 2. CONTEO POR SEVERIDAD (aprox., deduplicado)
- **P0 (bloqueante): ~11**
- **P1 (alto): ~16**
- **P2 (medio): ~22**
- **P3 (bajo): ~7**

## 3. LOS P0 — GO / NO-GO DE PRODUCCIÓN
| # | P0 | Fase | Confirmado |
|---|----|------|-----------|
| 1 | **Mutación cross-tenant**: un dev sobrescribe el inventario (precio/estatus) de otro (unit-fields filtra solo unit_id) | 1/11 | ejecutado QA5 |
| 2 | **IDOR lectura cross-tenant**: insights ×8, battle-card ×5, sankey, deseabilidad — leen datos de otro tenant (solo validan rol) | 1/11 | ejecutado QA5 |
| 3 | **`funnel` SIN autenticación** — 200 sin sesión | 1/11 | ejecutado QA5 |
| 4 | **CAS débil** → doble venta en unit-status (3/10 concurrentes) | 1 | ejecutado QA5 |
| 5 | **Default admin público** `admin@desarrollosmx.io / Admin2026!` si no se setea ADMIN_PASSWORD | 2 | código |
| 6 | **Stripe webhook fail-open** sin secreto → cobros falsos | 10 | código |
| 7 | **Bug `score_total`→`score_numeric`**: corrompe TODOS los números financieros (tier F para todo, bancabilidad, AVM) | 6 | poblado QA5 |
| 8 | **Observabilidad muerta** (Sentry DSN inválido) → errores invisibles en prod | 4/10 | ejecutado QA4 |
| 9 | **Pipeline ML inerte** (`emit_ml_event` mal llamado ×16) + WhatsApp no clasifica | 5 | runtime QA5 |
| 10 | **43 colecciones leídas sin escritor** (18 = nombre mal con gemelo lleno) → features muestran 0/None | 5 | barrido QA5 |
| 11 | **Honestidad: "ventas reales / para bancos / vivo" sobre datos demo (md5)** — productos de datos vendidos sobre semilla | cross | QA3/5 |
+ habilitadores P0/P1: `getattr(user,"id")` rompe dueño per-asesor (×33); salt PII en el bundle (des-anonimización).

## 4. TOP 10 RIESGOS POR IMPACTO REAL
1. **Ruptura total de aislamiento multitenant** (lectura + escritura cross-tenant) — un competidor lee y SABOTEA a otro. *El #1.*
2. **`funnel` sin auth + IDOR** encadenados → volcado de la inteligencia de negocio de todos los desarrolladores.
3. **Default admin público** → toma total del sistema si falta una env.
4. **Vender a bancos/fondos una calificación calculada sobre datos demo** — riesgo legal/credibilidad (tu regla #1).
5. **Bug de `score`** → todo número financiero (yield, bancabilidad, tier) es falso con datos reales.
6. **Stripe fail-open** → fraude de facturación / desbloqueo gratis de productos de pago.
7. **Observabilidad muerta** → operar a ciegas; los demás bugs silenciosos nunca alertan.
8. **No escala** a 10k (full-scans del Grafo, sin índices, sin caché, LLM sin tope) → cae en cientos de usuarios.
9. **Pipeline ML inerte + 43 colecciones vacías** → media plataforma "viva" en realidad muestra 0/None.
10. **Prompt injection** (directa e indirecta) en la superficie de IA, sin frontera de confianza.

## 5. CAPACIDAD DE ESCALA
Techo estimado: **cientos** de usuarios concurrentes (no 10k) una vez con dato real. Cae primero: Estudio/Grafo (full-scan por request) y endpoints LLM (latencia + costo sin tope), luego saturación del pool de Mongo por queries sin índice. Hoy "parece rápido" solo porque la BD está casi vacía. Script de carga listo en `/load-tests/dmx_load.js` para medir números reales en staging. **No medido contra staging aún** (requiere acción tuya).

## 6. RED TEAM — cadenas de ataque
- **Cadena 1 (lectura, P0):** funnel sin auth → IDOR insights/battle-card → volcado de BI de todos los tenants.
- **Cadena 2 (escritura, P0):** sesión dev → unit-fields con unit_id ajeno → sabotear inventario/precio de competidor.
- **Cadena 3 (P0):** admin default → superadmin → todo.
- **Cadena 4 (P0):** Stripe webhook falso → tier enterprise → exfiltrar productos de datos (grafo/índices/bancabilidad).
- **Cadena 5 (LLM, P1):** lead/dato externo malicioso → prompt injection indirecta → manipular salida / exfiltrar contexto ajeno.
Aislamiento entre tenants: **ROTO** (confirmado). Prompt injection: superficie real sin mitigación.

## 7. VEREDICTO HONESTO — ¿listo para producción?
**NO.** Hoy no se puede lanzar con usuarios reales de múltiples tenants. El aislamiento multitenant está roto (lectura Y escritura, confirmado ejecutando), hay una cuenta admin con credencial pública por default, el webhook de pagos acepta eventos falsos, y la observabilidad está apagada (no verías el ataque). Además se venden productos de datos calculados sobre datos demo.

**Lo BUENO:** la arquitectura es sólida, el contrato front↔back está limpio, el login no es escalable por token, bcrypt es fuerte, y **casi todo es LATENTE porque la BD aún es semilla** → estás en el momento correcto para arreglar antes de prender (coincide con tu doctrina "no hay prisa, prender al final"). Casi todos los P0 tienen **fix central de bajo riesgo** (un cambio mata muchos hermanos).

### MÍNIMO INDISPENSABLE antes de lanzar (en orden)
1. **Aislamiento multitenant**: `assert_dev_project`/owner-check en TODO endpoint de entidad propia (insights, battle-card, funnel, deseabilidad, attribution, lead_match, argumentario) + filtrar `dev_id` en las mutaciones (unit-fields) + CAS atómico en unit-status. + arreglar `getattr(user,"id")`→`user_id`.
2. **Credenciales/pagos**: fail-closed si falta ADMIN_PASSWORD / STRIPE_WEBHOOK_SECRET / JWT_SECRET en prod.
3. **Observabilidad**: DSN de Sentry real (sin esto no ves nada).
4. **Honestidad**: marcar todo lo derivado de seed como "demo/preliminar"; no vender índices/bancabilidad como "ventas reales" hasta tener dato real (`units_history`).
5. **Bug `score_numeric`** (1 cambio) + nombres de colección (18 renombres) + `emit_ml_event` (firma).
6. **Login rate-limit** + headers de seguridad + salt PII al backend.
7. Antes de escala real: índices + matar full-scans del Grafo + tope de presupuesto LLM.

## 8. LO QUE NO PUDE VERIFICAR DESDE EL CÓDIGO (requiere acción tuya)
- Correr `/load-tests/dmx_load.js` y los `payloads_staging.md` contra **staging** (no producción) para números reales y confirmación de los IDOR/cadenas.
- **Backups / point-in-time recovery** de Mongo → panel del proveedor.
- Config real de **deploy/headers** en la plataforma Emergent (CORS_ORIGINS, HTTPS, security headers a nivel proxy).
- TTL exacto del JWT + flujo de recuperación de contraseña (token de reset).
- Auditoría línea-por-línea de `log.*` con PII de clientes (no exhaustiva).
- Validación uniforme de uploads (tamaño/tipo/storage privado).

---
*No se modificó ningún archivo de la aplicación. Esta auditoría solo generó los reportes `AUDIT_FASE_*.md`, `AUDIT_RESUMEN_EJECUTIVO.md`, `payloads_staging.md` y `/load-tests/dmx_load.js`.*
