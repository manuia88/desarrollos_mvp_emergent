# AUDIT FASE 11 — Red Team adversarial (white-box)
Fecha: 2026-06-10 · READ-ONLY · análisis white-box; los payloads para staging están en `payloads_staging.md` (NO ejecutar contra producción)

## RESUMEN EJECUTIVO
La superficie tiene **control de acceso roto a nivel de objeto (BOLA/IDOR)** como vector dominante, confirmado ejecutando cross-tenant en QA5. Encadenado con un **endpoint sin auth** (`funnel`) y un **default de admin público**, produce cadenas de ataque que vuelcan o corrompen datos de TODOS los tenants. La superficie de IA tiene **prompt injection** directa e indirecta sin frontera de confianza.

## REGISTRO DE VECTORES
| vector | OWASP | ubicación | ¿explotable? (según código/runtime) | severidad |
|---|---|---|---|---|
| Mutación de inventario ajeno (unit-fields filtra solo unit_id) | API1 BOLA / A01 | routes/developer.py unit-fields | **SÍ — confirmado ejecutando (QA5): 200, flipea unidad de otro tenant** | P0 |
| CAS débil unit-status → doble venta | A04 Insecure Design | unit-status PATCH | **SÍ — 3/10 concurrentes pasan** | P0 |
| IDOR lectura insights/battle-card/sankey | API1 BOLA | insights.py, battle_card.py, funnel suggestion | **SÍ — A lee BI de B (200)** | P0 |
| Endpoint sin auth | API5 BFLA | funnel.py:84/147 | **SÍ — 200 sin sesión** | P0 |
| Default admin público | A07 / A05 | server.py:1287 `Admin2026!` | SÍ si ADMIN_PASSWORD no seteada en prod | P0 |
| Stripe webhook fail-open | A05 / A08 | public_api_v1.py:591 | SÍ si STRIPE_WEBHOOK_SECRET ausente | P0 |
| Argumentario LLM con PII ajena | API1 / LLM06 | agentic_crm.py:1244 | SÍ (find_one sin org) | P0 |
| Prompt injection directa | LLM01 | dev_batch11.py:762, studio_buyer_copy:142 | SÍ (input crudo, sin frontera) | P1 |
| Prompt injection INDIRECTA (datos externos/scrapeados al prompt) | LLM01 | RAG/context en studio_copy:521, datos de fuentes externas | Probable (contenido de terceros sin sanitizar) | P1 |
| getattr(user,"id") rompe dueño per-asesor | A01 | lead_enrichment.py:80 (+33) | SÍ (gate per-asesor neutralizado) | P1 |
| Salt PII en bundle → des-anonimización | A02 | posthog.js:21 | SÍ (salt público + fuerza bruta de user_ids) | P1 |
| Sin rate-limit login → fuerza bruta | A07 | routes/auth | SÍ | P1 |
| API v1 sin throttle de ráfaga | API4 | public_api_auth.py | SÍ (martilleo hasta cuota) | P1 |
| XSS almacenado en bulletins | A03 | BulletinPage.js (dangerouslySetInnerHTML) | Posible si no-admin escribe + sin sanitizar | P2 |
| NoSQL operator injection | A03 | ids/params | **NO — bloqueado (strings, sin $where)** | 🟢 |
| Escalada de rol por token | A01 | JWT | **NO — rol/tenant desde BD** | 🟢 |
| Path traversal en PDF/storage | A03 | renderers | **NO — id no entra a open()** | 🟢 |

## CADENAS DE ATAQUE (peor escenario realista)
**Cadena 1 — Volcado de inteligencia de TODOS los tenants (P0):**
`GET /api/funnel/{id}` sin auth para enumerar/confirmar project_ids → con cualquier sesión dev, `GET /api/dev/projects/{otro_project_id}/insights/market-value|resumen` y `/battle-card/{id}` → cosechar precios, GMV, leads, conversión y posición competitiva de cada desarrollador del marketplace. Rompe el aislamiento multitenant completo (solo lectura).

**Cadena 2 — Sabotaje de competidor (P0, escritura):**
Sesión dev legítima → `PATCH /inventario/unit-fields` con `dev_id` propio + `unit_id` de un competidor → marcar sus unidades como vendidas / cambiar precios / envenenar su `dev_id` → corromper su ficha pública, su absorción y el cubo. Daño comercial directo a otro tenant.

**Cadena 3 — Toma total (P0, si ADMIN_PASSWORD no seteada):**
`admin@desarrollosmx.io` / `Admin2026!` → superadmin → todos los datos de todos los tenants + paneles de licenciamiento de datos.

**Cadena 4 — Desbloqueo de productos de pago (P0):**
Si falta `STRIPE_WEBHOOK_SECRET` → POST webhook falso de "suscripción enterprise" → desbloquear tier enterprise de la API v1 → exfiltrar grafo de demanda / índices / bancabilidad por zona (productos vendibles) sin pagar.

**Cadena 5 — Prompt injection indirecta (P1, LLM):**
Lead con nombre/notas maliciosas (o dato externo scrapeado con instrucciones ocultas) → entra crudo al prompt del argumentario/copy → el modelo obedece instrucciones inyectadas → puede inducir salida manipulada o intentar exfiltrar contexto de otro lead/tenant que esté en el prompt. Sin frontera de confianza system/usuario.

## PROMPT INJECTION / SEGURIDAD LLM (detalle)
1. **Puntos de entrada de input no confiable a prompts:** `dev_batch11.py:762` (unit_number/prototype/colonia), `studio_buyer_copy_engine.py:142/521` (context_extra + RAG con nombre proyecto/colonia + DirectorMemory del asesor), argumentario (nombre/notas del lead). El **RAG/datos de terceros** es el vector de inyección INDIRECTA.
2. **Inyección directa:** input del usuario se concatena sin separar de las instrucciones del sistema; los system prompts no dicen "trata el bloque como datos, no instrucciones".
3. **Frontera de confianza:** NO existe separación clara instrucción/contenido.
4. **Tools expuestas:** revisar si el modelo puede disparar acciones (escribir BD, mandar WhatsApp) desde una inyección — el flujo agéntico (closer/nurturer) es el de mayor riesgo; verificar gates de aprobación humana.
5. **Exfiltración:** una inyección podría pedir el system prompt o datos de otro lead en el contexto.
6. **Manejo de salida:** confirmar que la salida del LLM no se renderiza como HTML sin sanitizar (los 2 dangerouslySetInnerHTML están en bulletins, no en salida LLM — verificar).
- **Costo (O3.3):** `dev_batch11` SÍ tiene guard de presupuesto; `studio_buyer_copy` NO → un atacante puede disparar LLM en bucle sin tope.

**Fix transversal LLM:** sanitizar+capear cada campo de usuario/externo; system prompt defensivo; separar contenido no confiable; guard de presupuesto en todas las llamadas; aprobación humana antes de acciones agénticas; sanitizar salida si se renderiza.
