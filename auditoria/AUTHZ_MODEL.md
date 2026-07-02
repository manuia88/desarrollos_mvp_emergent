# MODELO DE AUTORIZACIÓN — fuente única de verdad (leads · conversaciones · producto)

> Regla de negocio del founder (2026-07-02). Esto es LO CANÓNICO: el código y las auditorías se validan
> contra este documento. Cambios aquí = cambios de política (requieren OK del founder).
> Relacionado: `HALLAZGOS.md` (Batch 6/7), memoria `authz-model-leads`.

## 1. Reglas confirmadas (founder)
- **Asesor** → SOLO sus propios leads (los que su inmobiliaria le asignó). Nunca de otro asesor ni de otra inmobiliaria.
- **Inmobiliaria** (admin/director) → TODOS los leads de SUS asesores, dentro de su propia inmobiliaria.
- **Dev** (developer_admin/director) → el ESTADO/etapa en SU pipeline de los leads que una inmobiliaria registró en SUS desarrollos. NO las conversaciones/mensajes/notas con el cliente.
- **Superadmin** → todo, a todos los niveles.
- **PROHIBIDO** → compartir compradores/leads entre inmobiliarias distintas o cross-org (casamentera, "red comercial", alianzas que muevan compradores).
- **PERMITIDO** → asesor/inmobiliaria registrado con un dev accede a la INFO DE PRODUCTO del dev (desarrollos, precios, inventario, fotos, ficha, amenidades, esquemas de pago). No compradores.

## 2. Matriz de permisos (quién ve qué)
| Recurso | Asesor | Inmobiliaria | Dev | Superadmin |
|---|---|---|---|---|
| Sus propios leads | ✅ | ✅ (de sus asesores) | — | ✅ |
| Leads de OTRO asesor de su misma inmobiliaria | ❌ | ✅ | — | ✅ |
| Leads de OTRA inmobiliaria | ❌ | ❌ | — | ✅ |
| Conversaciones/mensajes/notas con el cliente | ✅ (suyos) | ✅ (de sus asesores) | ❌ | ✅ |
| Pipeline-status (etapa/estado) de leads en el desarrollo del dev | — | ✅ (suyos) | ✅ (los registrados en sus desarrollos) | ✅ |
| Identidad/contacto del comprador (nombre/tel/email) | ✅ (suyos) | ✅ (de sus asesores) | ✅ (leads en SUS desarrollos) | ✅ |
| Info de PRODUCTO del dev (desarrollos/precios/inventario/fotos) | ✅ (si registrado) | ✅ (si registrada) | ✅ (propia) | ✅ |
| Agregado de mercado (demanda por colonia, etc.) | según §4.5 | según §4.5 | según §4.5 | ✅ |

## 3. Definiciones (para que el código no adivine)
- **"Conversación" (off-limits al dev):** mensajes de chat, hilos de WhatsApp, notas del asesor, resúmenes del copiloto IA, emails, transcripciones de llamada. TODO esto es del asesor/inmobiliaria dueños.
- **"Pipeline-status" (visible al dev):** etapa (nuevo→contactado→visita→oferta→cierre), fecha de última actividad, y el desarrollo/unidad de interés. Sin PII de conversación.
- **Colecciones sensibles por-tenant:** leads, asesor_contactos, asesor_operaciones, asesor_tareas, asesor_busquedas, appointments, conversations/mensajes, health_scores, tracking_links, weekly_briefs, report_files/templates, cash_flow_forecasts.

## 4. Casos límite — DECIDIDOS por el founder (2026-07-02)
- **4.1 El dev SÍ ve la identidad/contacto del comprador** (nombre/tel/email) de los leads registrados en SUS desarrollos, junto con el pipeline-status. Lo ÚNICO que el dev NUNCA ve son las **conversaciones/mensajes/notas** con el cliente. ✅ decidido.
- **4.2 Offboarding del asesor:** al desactivarlo pierde acceso a TODOS los leads al instante; quedan con la inmobiliaria. ✅ decidido.
- **4.2b Candado de re-registro de asesor ✅ IMPLEMENTADO (AUD-058):** un asesor que sigue en el roster (status active/suspended) de OTRA inmobiliaria NO puede registrarse aquí hasta que esa inmobiliaria lo dé de BAJA (elimine su fila) o pasen **3 meses** desde su alta/última actividad. En `invite_internal_user` → `_assert_asesor_reregister_allowed` (fail-safe: fila en otra org sin fecha databable → bloquea). Evita doble-registro / que se lo "roben".
- **4.3 Reasignación de lead dentro de la inmobiliaria:** el nuevo asesor gana acceso, el anterior lo pierde; la inmobiliaria siempre ve todo. ✅ decidido.
- **4.4 Acceso de superadmin AUDITADO en el PORTAL SUPERADMIN:** superadmin ve todo, y cada acceso queda registrado en el portal superadmin. El asesor y la inmobiliaria **NUNCA se enteran** (no se les notifica). ✅ decidido.
- **4.5 Visibilidad de info gobernada desde SUPERADMIN (estilo GoHighLevel):** superadmin usa plantillas/control-plane para determinar qué información se le muestra a quién. Toda la configuración de visibilidad vive en superadmin (no hardcodeada). Conecta con feature-visibility (W5.FF) + granularidad. ✅ decidido.
- **4.6 Asesor con varias inmobiliarias:** implícito por 4.2b — un asesor está ligado a UNA inmobiliaria activa a la vez; sus leads se acotan por esa pertenencia, nunca se mezclan.

## 5. Cómo se HACE CUMPLIR (upgrade de ingeniería · anti-recaída)
El Batch 6 encontró 21 fugas porque el scope estaba escrito a mano en cada query (fácil de olvidar → fail-open). Upgrade:
1. **Un solo candado:** toda lectura de una colección sensible pasa por `tenant_scope` (helper único por rol) — nunca scoping a mano.
2. **Serializer con lista-blanca para el dev:** el endpoint de pipeline del dev solo puede emitir los campos permitidos (etapa/fecha/desarrollo/comprador-enmascarado); imposible filtrar conversaciones aunque el doc las tenga (igual que el fix AUD-027).
3. **Guard de CI (test que rompe el build):** un test que detecta cualquier query nueva sobre `leads`/conversaciones sin scope, y falla. Así no se re-introduce la clase de fuga.
4. **Fail-CLOSED por defecto:** sin tenant/rol resuelto → cero resultados, nunca "todos" (raíz de AUD-023/035/036).
5. **Prohibiciones como código:** eliminar (no solo candar) los mecanismos de compartir-comprador cross-org (casamentera, etc.) — Batch 7 los está mapeando.

## 6. Estado
- Batch 6 (✅): 15 fugas de aislamiento corregidas + 6 decisiones de producto.
- Batch 7 (✅): 12 violaciones del modelo corregidas (AUD-049..057) + candado re-registro (AUD-058) + feature de feedback estructurado (`FEEDBACK_SIGNALS_SPEC.md`). §4.1–4.6 confirmadas por el founder.
- **Enforcement (§5) — estado:** (1) candado ÚNICO role-aware `assert_lead_owner` ✅ (AUD-051, todos los callers lo reusan) · (2) resumen del dev sin conversación (serializer estructurado) ✅ (AUD-056) · (3) fail-CLOSED por defecto ✅ (AUD-051/035/036) · (4) prohibiciones eliminadas (casamentera) ✅ (AUD-049). Enforcement vía **suite de regresión** que bloquea cada recaída (`test_aud_batch6_tenant.py`, `test_aud_batch7_authz.py`, `test_feedback_signals.py`) + este doc como spec de revisión. El guard estático tipo grep se omitió a propósito (cientos de falsos positivos en lecturas legítimas → ruido que se termina ignorando; el choke-point + tests dan mejor señal).
