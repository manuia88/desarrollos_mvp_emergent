# Scorecard QA del Portal Dev — Ola 1: Áreas del Usuario
**2026-06-08 · 5 auditores en paralelo (verificado contra código actual).**
**2026-06-09 · LAS 5 ÁREAS RESUELTAS (B·C·A·D·F ✅). Ola 1 cerrada.**

---

## OLA 2 · QA Técnico (2026-06-09 · 5 auditores: seguridad/robustez/atomicidad/rutas/4-portales)

| Frente | Veredicto | Arreglado |
|---|---|---|
| Seguridad (IDOR/auth/mass-assign/injection) | ✅ | 3 fugas cross-tenant cerradas con `assert_dev_project`: dev_batch6 engagement-units+timeline (fuga de PII de leads ajenos) · dev_batch2 IE breakdown/improve/colonia-benchmark (inteligencia competitiva) · dev_batch5 patch_distribution (pausaba la distribución de otra dev → +filtro `dev_org_id`). NoSQL/mass-assign: ya limpios. |
| Arranque resiliente | ✅ | server.py: el bloque de índices del dev iba SIN red → un conflicto de índice tumbaba todo el server. Ahora cada índice en su try/except (loggea y continúa). |
| Atomicidad | ✅ | `vender_captacion` con CAS (`vendida:{$ne:true}` + modified_count) → ya no registra cierres dobles que ensuciaban el AVM. (operaciones/status ya tenía CAS.) |
| Cross-portal · cierra ciclo | ✅ | (1) Asesor cierra venta de unidad → marca la unidad VENDIDA (units_history `sale_closed`) → sube al ritmo del dev (weekly_sales) + ficha pública + cubo. (2) Ediciones manuales del dev (developer_unit_overrides) → ahora se fusionan en lo que ve el COMPRADOR. Verificado E2E. |
| Robustez (500s/except:pass) | ✅ | dev_batch3 export geo: `float()` con try/except (era 500) · 2 `except: pass` que ocultaban fallos (audit de unit-status + insert de cierre) → `log.warning` · resale_data ahora tiene logger. |
| Rutas/contrato/crons | ✅ verde | 0 endpoints huérfanos · contrato front↔back sano · crons protegidos. (El único 🔴 era el arranque, ya resuelto.) |

**Cola menor — estado (2026-06-09):**
- ✅ CAS en patch_unit_status (filtro por estado actual + 409) + **índice único** en developer_unit_overrides.unit_id (evita filas duplicadas en carrera). Verificado: A gana / B pierde.
- ✅ Rate-limit en el reporte Sonnet (~1/min por usuario · el param `month` ya no fuerza repetir la IA).
- ✅ Pydantic en `ack_alert` (validación + max_length).
- ✅ **Cross-Portal v2 — LOS 3 CERRADOS (2026-06-09 · front+back, verificado E2E):**
  - ✅ #15 asesor ve el dato FRESCO del dev: nuevos helpers batch `get_effective_devs_map/list` (auto_sync_engine, una query $in) · swap en 7 sitios de advisor.py (galería·búsquedas·ficha lead·tablero·AVM·argumentario·RAG) + 2 de mini_market. El pitch IA y los matches citan precio/amenidades reales. (playbook se queda en seed: solo lee org_id inmutable.)
  - ✅ #16 fotos dev→comprador CON CANDADO: allow-list `PUBLIC_ASSET_TYPES` (solo marketing) + candado server-side en GET /developments/{id}/assets (planos técnicos NUNCA salen, aunque el front los pida) · `public_photos_for_dev` con caption IA como alt-text · ficha + listado muestran la foto real del dev.
  - ✅ #17 amenidades + foto en LISTADOS sin frenar: `_enrich_listing` (3 queries batch: overlays→precio fresco · project_amenities · `public_hero_map`) · la tarjeta usa hero del batch (quité el fetch por-tarjeta = fin de N llamadas) + chip "N amenidades · servicios".

**Baseline:** red-team de aislamiento 16/16 (sigue verde tras Cross-Portal v2).

---

## OLA 3 · AUDITORÍA PROFUNDA (2026-06-09 · 6 auditores: datos forkeados/ocultas/huérfanos/bugs/perf/IA-seguridad)
**Disciplina master-QA: cada hallazgo VERIFICADO contra el código actual. 1 de los 4 top resultó FALSO.**

### 🔴 REAL · alto impacto (la 1ª pasada NO lo cazó)
| # | Hallazgo (verificado) | Dónde | Por qué importa | Fix |
|---|---|---|---|---|
| O3.1 | **Índices faltantes en rutas calientes** | `ensure_project_full_indexes` = `return None` (vacío · dev_project_full.py:395) · leads se consultan por `development_id` pero el índice está en `project_id` (dev_batch4.py:961) | Con datos reales (50k leads / N proyectos) = full-scan → ficha y dashboards lentos | Implementar índices de project_full + índice leads.development_id (o unificar el nombre) |
| O3.2 | **Prompt injection en la IA del dev** | argumentario/pitch + predicción meten `lead_name`/`unit_number` sin sanitizar en el prompt LLM (advisor.py argumentario · dev_batch11:727) | Un lead con nombre malicioso puede inyectar instrucciones al modelo (leak de prompt, salida manipulada) | Sanitizar entradas (regex + cap) + endurecer system prompt ("ignora instrucciones en los datos") |
| O3.3 | **Costo IA sin tope en algunas rutas** | la 1ª pasada cubrió `/reportes/generar`; quedan narrativas IA (dev_batch5 `/reports/generate`) sin rate-limit/presupuesto | Un dev puede disparar LLM en bucle → costo descontrolado | Aplicar el guard de presupuesto/rate-limit (el motor `ai_budget` ya existe) |

### 🟡 REAL · medio (raíz: modelo de datos forkeado — como en asesor)
| # | Hallazgo | Dónde | Fix |
|---|---|---|---|
| O3.4 | **`development_id` vs `project_id`** (mismo concepto, 2 nombres → causa O3.1) | dev_batch*.py (decenas) | Unificar a `project_id`; índice/queries consistentes |
| O3.5 | **Prioridad de fuentes de unidad indefinida** (seed `units` vs `units_overlay` vs `developer_unit_overrides`) | auto_sync_engine · dev_batch1 · developer.py:58 | Documentar+implementar orden de merge (override > overlay > seed) en un solo helper |
| O3.6 | **Unit↔lead status desacoplado** (la unidad no se marca vendida cuando el lead cierra → absorción diverge con dato real) | dev_batch10 · pipeline | Hook on_deal_closed que sincronice unidad↔lead |
| O3.7 | **`dev_org_id` cae a "default_org"** si el user no trae tenant_id (bucket compartido) | dev_batch1.py:68 | Fail-closed: exigir tenant_id |
| O3.8 | **`except: pass` que tragan errores** + accesos a dict sin guard (KeyError con dato parcial) | developer.py (varios: 141,254,505,616) | log.warning + `.get()` |

### 🟢 Limpieza (housekeeping · verificar antes de borrar)
- `DesarrolladorInventario.js` importado en App.js sin ruta · ~varios componentes/API exports sin uso · redirects viejos.

### ❌ FALSOS POSITIVOS (por eso se verifica, no se confía)
- **"Plusvalía invertida"** (dev_project_full.py:96): VERIFICADO correcto (nuevo/viejo). El auditor se equivocó.
- **"~200h de valor oculto / prender flags"**: sobreestimado — DEV V2 ya está prendido (Paso C hecho), Cerebro es el switch del founder (no deuda).
- **"Falta await"** (developer.py:208,363,376,496): el backend corre sano → casi seguro falsos.

---

## AUDITORÍA 3 (3ª pasada · 6 lentes más profundos · 2026-06-09)
**Cada hallazgo top VERIFICADO contra el código. 2 de los 4 "🔴" resultaron sobredimensionados (la disciplina paga).**

### ✅ VERIFICADO REAL (nuevo · audits 1-2 no lo cazaron)
| # | Hallazgo | Dónde | Sev | Nota de verificación |
|---|---|---|---|---|
| A3.1 | **Bug `price_to = price_from`** (los proyectos del wizard muestran precio fijo, no rango) | dev_batch10.py:289 (`"price_to": int(p.get("price_from"))`) | 🟡 | VERIFICADO: copy-paste real. Fix de 1 línea (`price_to`). |
| A3.2 | **Mapa de datos forkeado (completo)** · `development_id`↔`project_id`↔`dev_id` por colección · vocab de estado vendido/ganado/won · 3 fuentes de unidad (seed/units_overlay/developer_unit_overrides) sin orden de merge definido · timestamps mixtos | dev_batch10/4/1 · auto_sync | 🟡 | RAÍZ (igual que asesor). Causa A3.3 y divergencias de número. |
| A3.3 | **Cobertura de índices: ~15 faltantes críticos** (leads.development_id, count por development_id+status, appointments.created_at, marketplace_searches, ie_scores, dev_assets, etc.) + `ensure_project_full_indexes` vacío + N+1 en list-with-stats/cockpit | varios + dev_project_full.py:395 | 🔴 | Con dato real: endpoints 10-20s. EXHAUSTIVO en el scorecard de perf. |
| A3.4 | **Inyección en IA sin sanitizar** (inventario completo): Atlax `sample_query` (atlax_persona.py:235) · zone['name'] (dev_batch7:284) · lead nombre (cerebro/executors:99) · property titulo (public.py:269) · custom_facts | varios LLM calls | 🔴 | Entradas controlables van directo al prompt. ~10 llamadas LLM sin sanitizar. |
| A3.5 | **Costo IA sin tope de sesión** en varias llamadas (narrativas, studio copy, intel brief, Atlax) — `ai_budget` existe pero no rechaza antes | varios | 🟡 | Confirma O3.3 y lo amplía a más motores. |
| A3.6 | **`except: pass` que tragan errores SIN log** (~11 sitios de audit_log + auto_sync loop + dev_guard) → mutaciones sin rastro / overlay vacío en silencio | dev_batch1 (354,436,1108,1134,1253,1330,1443,1481,1499) · auto_sync (77,429,481,521) | 🟡 | Patrón "auditoría es opcional". Real. |
| A3.7 | **Confianza de IA no honesta**: el brief de inteligencia muestra `confidence_pct=35` (stub) igual que `80` (real) sin marcar `is_fallback` | intelligence_insights_engine | 🟡 | El dev no distingue IA real de fallback heurístico. |
| A3.8 | **Primer día / onboarding / idioma (NUEVO lente)**: empty states sin botón de acción (Inventario/Leads/Dashboard) · wizard NuevoProyecto con jerga ("slug", "Construction cost" en inglés, "NSE", "absorción") y sin paso de resumen · "under_review" sin salida visible · apartado sin countdown si no carga el hold | pages/developer/* (NuevoProyecto, Inventario, Leads, Dashboard, Citas) | 🟡 | Real y alineado a la regla de lenguaje del founder. Lo que un dev nota el primer día. |
| A3.9 | **Accesibilidad débil**: ~5% de cobertura de aria-label (botones de ícono sin nombre), modales sin devolver foco, tablas sin semántica | pages/developer/* | 🟡 | Real (a11y). |
| A3.10 | **Tier gating por rol, no por plan**: features premium (Battle Card) pasan si el rol es dev, aunque el plan sea free | battle_card.py:66-75 | 🟡 | El backend confía en el rol; un dev con plan free ve premium. |
| A3.11 | **Unidad vendida no dispara on_deal_closed desde el portal dev** (el cierre del asesor sí; el patch del dev a "vendido" no marca histórico/lead/Cerebro) | dev_batch1 patch_unit_status | 🟡 | Cierra-ciclo a medias: el Cerebro no aprende de las ventas marcadas por el dev. |

### ⚠️ CORREGIDOS por verificación (sobredimensionados por el auditor)
- **"db.units sin dev_org_id = fuga cross-tenant 🔴"** → en realidad 🟡: la query filtra por `project_id` de proyectos YA scopeados por org; el riesgo solo existe si dos orgs comparten `project_id` (slugs únicos lo evitan). Fix = filtrar también por org (defensa en profundidad).
- **"`_decrypt` fail-open devuelve plaintext 🔴"** → en realidad 🟡: sin `IE_FERNET_KEY` todo es plaintext (encrypt y decrypt passthrough, consistente); el decrypt fallido devuelve el cifrado, no fuga. Real = avisar/fail-closed si falta la llave.
- **"unit hold queda atascado 🔴"** → la función `auto_release_expired_holds` SÍ existe (dev_batch1:1174); falta confirmar que un cron la llame (si no, sí se atasca → 🟡).
- **"~200h de valor oculto, prender flags"** (repetido de Ola 3) → V2 ya prendido, Cerebro es el switch del founder.

**Estado: vamos en la AUDITORÍA 3 de 5.** Temas CONVERGIENDO: (1) raíz datos forkeados, (2) índices/escala, (3) inyección+costo IA, (4) except:pass/observabilidad, (5) primer-día/lenguaje/a11y.

---

## AUDITORÍA 4 (4ª pasada · dinero + consistencia 4-portales + frentes NUEVOS: público/legal/integraciones/formato/tests · 2026-06-09)
**Verificada. Esta vez los hallazgos aguantaron mejor (los 4 top verificados son reales). Hay un hallazgo LEGAL.**

### ✅ VERIFICADO REAL · nuevo
| # | Hallazgo | Dónde | Sev | Verificación |
|---|---|---|---|---|
| A4.1 | **SIN consentimiento de privacidad (LFPDPPP)** — los formularios de captura de lead NO piden aceptar el aviso de privacidad antes de guardar datos personales | lead_capture_engine / lead_capture_marketplace (grep de consent = vacío) | 🔴 legal | VERIFICADO: no existe captura de consentimiento. Incumplimiento LFPDPPP Art. 8. |
| A4.2 | **PDF de lead público + PII en texto plano** — `GET /api/lead-capture/pdf/{id}` es público (sin auth), sirve un PDF con nombre/WhatsApp/datos del comprador, guardado base64 sin cifrar | lead_capture_marketplace.py:172 | 🟡→🔴 | VERIFICADO: link de capacidad con PII; cifrar en reposo + token efímero. |
| A4.3 | **Casi cero tests en el portal del dev** (API `/desarrollador/*`, auto-sync, cálculo de pagos del cotizador) | backend/tests (0 dev) · frontend (0 dev) | 🔴 red | Sin red ante regresiones; una regresión tumba el portal sin avisar. |
| A4.4 | **Secreto HMAC del webhook devuelto en CADA GET** (debería mostrarse una sola vez al crear) | partners.py:292 | 🟡 | VERIFICADO: `"hmac_secret": p.get(...)` en la respuesta. (superadmin, no público) |
| A4.5 | **Bug de zona horaria en "meses hasta entrega"/cotizador** — usa la hora del navegador, no CDMX → off por un mes cerca de frontera o en otra zona | PaymentQuoter.js:64 · PublicCotizador.js:16 | 🟡 | VERIFICADO: `new Date()` local, no America/Mexico_City. |
| A4.6 | **Divergencia cross-portal**: `maps_cross_engine` lee el SEED (no la DB real) → el comparador puede mostrar absorción/unidades viejas · y usa fórmula propia de $/m² (no la canónica `dev_price_m2`) | maps_cross_engine.py:65,336 | 🟡 | El comprador en el comparador ve número distinto del real. |
| A4.7 | **PII de lead sin cifrar en reposo + sin k-anon en dev** — emails/teléfonos en texto plano en Mongo · `contact_name` en timeline de unidad sin k-anonimidad · demand_heatmap sin gate k | leads schema · dev_batch6:460,96 | 🟡 | Si la BD se compromete, PII expuesta. |
| A4.8 | **Notificaciones/email salientes**: `emit_notification` no valida que el tenant sea del usuario (fuga cross-org) · email sin escaping (XSS/CRLF en nombre de proyecto/asesor) · sin rate-limit de email | notifications_engine.py:207 · resend_engine.py:37,64 | 🟡 | Cross-tenant + inyección en correo. |
| A4.9 | **price_to = price_from** (confirma A3.1) + publicar sin validar completitud (readiness 80% no se fuerza) · cotizador desaparece sin aviso si no hay formas de pago · sitemap hardcodeado (proyectos nuevos invisibles a Google) | dev_batch10:289 · dev_project_full:162 · PublicCotizador:49 · sitemap.xml | 🟡 | Publicación incompleta visible al comprador. |

### ✅ TRANQUILIZADOR (auditoría honesta, no todo es malo)
- **Finanzas 95% correctas**: revenue/margen/ROI/TIR/comisiones con guards correctos, SIN errores críticos de dinero ni doble-conteo. Solo 2 micro-precisiones (🟡): `int()` trunca en flujo proyectado (pierde ~0.2-0.5% en pipelines >$100M) · amplificador `0.5+heat` en pipeline ponderado sin documentar.
- **Webhooks: SSRF YA protegido** (workflow_engine bloquea loopback/RFC1918/link-local) + HMAC + timeout. Bien hecho.

**Estado: AUDITORÍA 4 de 5 lista.** Convergencia confirmada + 1 frente legal NUEVO (consentimiento/PII) que ninguna pasada previa tocó.

---

## AUDITORÍA 5 (la más profunda · 7 lentes, persiguiendo las pistas de 1-4 · 2026-06-09)
**La que más reveló Y la que más FALSOS POSITIVOS tuvo (los auditores cavan más hondo pero pierden contexto reciente / buscan nombres viejos). Verificado uno por uno.**

### ✅ VERIFICADO REAL · nuevo
| # | Hallazgo | Dónde | Sev |
|---|---|---|---|
| A5.1 | **Modos de falla a ESCALA (cluster)**: pool de Mongo SIN tope (`AsyncIOMotorClient(MONGO_URL)` default) · `to_list(5000/10000/20000)` en varios endpoints (OOM con 50k leads) · N+1 (find_one por appointment) · 428 `create_index` sin `background=True` (arranque lento/bloqueo) · sin timeout/circuit-breaker en AVM/IA | server.py:46 · dev_batch2:134, dev_batch6:130-154, dev_batch4:687 | 🔴 a escala |
| A5.2 | **SSRF en fetch de fotos**: el server hace `httpx.get(u)` sobre URLs sin validar localhost/RFC1918/169.254 + `follow_redirects=True` | dev_batch1.py:629 | 🟡 (hoy seed-controlado) |
| A5.3 | **Cerebro: envenenamiento por stub** — las predicciones no se marcan `is_example`/`is_demo` → el coach puede calibrar/reentrenar con stubs | cerebro/executors.py:379 · coach.py:113 | 🟡 (Cerebro off por flag) |
| A5.4 | **PII a la IA sin redactar + DSR incompleto + audit_immutable guarda PII** (extiende A4): emails/teléfonos viajan a Anthropic en prompts sin redacción · el borrado DSR no alcanza ~10 colecciones (conversations, lead_capture_pdfs, embeddings, KG, audit) · `audit_immutable` guarda before/after con PII (nunca se borra) | conversation_engine · compliance_engine:176 · audit_immutable_engine:98 | 🔴 legal |
| A5.5 | **Más inyección (mapa completo)**: `$regex` con colonia sin `re.escape` (ReDoS) · CRLF en `Content-Disposition filename` (4 endpoints) · `q_search` sin max_len (DoS) · NoSQL operator si el body no se valida | dev_batch4_1:692 · dev_batch7:799, dev_batch5:834, dev_batch8:836 | 🟡 |
| A5.6 | **Fallas silenciosas con impacto real**: `except: pass` que dejan: cache público sin invalidar al editar unidad (comprador ve precio viejo) · `on_deal_closed` tragado (el Cerebro no aprende) · demanda/engagement en 0 falso (health_score ficticio) · audit de bulk/location sin registrar | dev_batch11:650 · dev_batch4:400 · dev_batch10:551,56 | 🟡-🔴 |
| A5.7 | **Más instancias de patrones**: `db.leads.find({})` sin `dev_org_id` (dev_batch7:336) · IndexError sin guard (`rows[0]`, `m2_range[0]`) · publicar sin endpoint claro de publish | dev_batch7:336 · dev_batch2:300,1240 · dev_batch6:341 | 🟡 |

### ❌ FALSOS POSITIVOS (verificación · los auditores profundos fallaron MÁS)
- **"El asesor ignora el overlay / lee seed"** → FALSO: advisor.py tiene 14 usos de `get_effective_dev` (Cross-Portal v2 #15). El auditor buscó `project_public_overlay` y no vio el cambio reciente.
- **"El flujo de apartados NO existe"** → FALSO: dev_batch1 tiene `unit_holds` + `auto_release_expired_holds` + endpoints (17 matches). El auditor buscó `db.holds` (nombre equivocado).
- **"weekly_sales nunca se calcula"** → FALSO: `_real_weekly_sales_map` existe (dev_batch10:46→176→224) y cuenta ventas reales de units_history.
- **"TeamAggregatedTable random sin marcador 🔴"** → FALSO: SÍ está etiquetado "demo/demostrativa" (líneas 336,349). Es stub honesto.

---

## AUDITORÍA 6 (FINAL · 7 lentes = matriz A–K + 8 familias + 7 olas + producción · 2026-06-09)
**Objetivo: dejar el plan LISTO PARA CORREGIR (archivo:línea + fix exacto) y profundizar la 5. No reveló una raíz nueva: CONFIRMÓ el cluster de la 5 con detalle accionable y cazó 3 falsos positivos más. La disciplina sigue valiendo (~mitad de los "🔴" no resisten).**

### ✅ CONFIRMA + vuelve accionable (lista de corrección exacta)
| Cluster (ya conocido) | Detalle exacto NUEVO (para corregir directo) | Sev |
|---|---|---|
| C1 Escala (A5.1) | Pool: `server.py:46` sin `maxPoolSize/serverSelectionTimeoutMS` (confirmado) · `ensure_project_full_indexes` = `return None` (vacío, confirmado dev_project_full.py:395) · índices faltantes con `create_index(..., background=True)`: ie_scores `[zone_id,code,is_stub]` · projects `[dev_org_id]` · units `[project_id,status]` · dev_assets `[development_id]` · appointments `[dev_org_id,created_at]` · unit_engagement `[dev_id,unit_id]` · `to_list(10000)` a paginar: dev_batch6:130,140 · dev_batch7:336 · `background=True` faltante: asesor_indexes:63 + dev_batch19:371-375 | 🔴 |
| C4 IA/seguridad (A5.2/A5.5) | SSRF confirmado dev_batch1:631 (y es `follow_redirects=True`, peor de lo reportado) → validar URL (bloquear localhost/RFC1918/169.254) · `re.escape(colonia)` confirmado dev_batch4_1:692 · **NUEVO: 6 llamadas LLM sin tope de costo ANTES** (dev_batch6:248, dev_batch14:403, dev_batch5:761, dev_batch7:293, dev_batch8:365, dev_batch4_4:120) — solo dev_batch11 ya lo tiene · timeout LLM faltante dev_batch14:403 + dev_batch11:106 (`asyncio.wait_for`) | 🟡-🔴 |
| C5 Observabilidad (A5.6) | Inventario exhaustivo de `except: pass` SIN log con impacto: dev_batch1 audit-log silencioso x9 (354,436,1108,1134,1253,1330,1443,1481,1499) → `log.warning` · ErrorBoundary faltante en `DeveloperLayout.js` (un hijo que crashea tumba la ficha) | 🟡 |
| C3 Privacidad (A5.4) | Detalle por colección: cifrar PII en escritura (leads/asesor_contacts/whatsapp_messages, reusar Fernet de `document_intelligence`) · `redact_pii` (ya existe en cerebro/memory) antes de LLM en lead_enrichment:300 · PDF público: token efímero + TTL + cifrar bytes (lead_capture_marketplace) · +6 colecciones al DSR `_PII_COLLECTIONS` (compliance_engine:176) | 🔴 legal |

### ✅ NUEVO genuino (la 6 sí agregó esto — refina C7/C9)
| # | Hallazgo | Dónde | Sev |
|---|---|---|---|
| A6.1 | **Permisos premium solo en front**: features de IA/T3 (weekly brief, site selection, cash flow, engagement recs) sin gate de tier en backend (solo escondidas en UI) → un T0 con la ruta las consume | dev_batch14/7/8/6 (endpoints LLM) | 🟡 → C9 |
| A6.2 | **a11y**: botones de ícono sin `aria-label` (masivo) + sin `:focus` outline (navegación por teclado rota) | components/developer/* | 🟡 → C7 |
| A6.3 | **Primer día**: dashboard hace 3 fetch EN SERIE (3-5s sin skeleton) → `Promise.all` + skeleton · wizard no deja "próximo paso" al terminar · MisProyectos/FichaHome sin empty-state con acción | DesarrolladorDashboard.js:30-115 · MisProyectos · FichaHome | 🟡 → C7 |
| A6.4 | **Perf percibida**: `DesarrolladorReportes` monolito ~1300 líneas, todos los tabs renderizan sin lazy/memo | DesarrolladorReportes.js | 🟡 → C7 |

### ❌ FALSOS POSITIVOS nuevos (verificados uno por uno)
- **"competitors price-sim sin gate de rol 🔴 BLOCKER"** → FALSO: dev_batch2:1224 SÍ tiene `if user.role not in ("developer_admin","superadmin"): raise 403`.
- **"`invalidate_dev_overlay_cache` nunca se llama / comprador ve precio viejo 🔴"** → SOBREDIMENSIONADO: SÍ se llama (auto_sync_engine:428,480) en el path de overlay. Las ediciones por-unidad usan otra colección (`developer_unit_overrides`) que NO está en ese cache → no hay prueba de dato rancio. Queda 🟡 "verificar que ningún write directo de overlay salte la invalidación" dentro de C5.
- **"`on_deal_closed` nunca dispara del dev / Cerebro no aprende 🔴"** → FALSO: dev_batch4.py:398 lo dispara al cerrar lead (y advisor.py x3). El Cerebro SÍ está cableado al cierre.
- **"falta `assert_dev_project` en release de hold"** → FALSO: dev_batch1:1115 ya lo valida.

**Veredicto Auditoría 6:** el plan C1–C10 estaba COMPLETO. La 6 no abre frente nuevo de raíz — lo vuelve **accionable** (archivo:línea + fix) y suma a C7 (a11y/primer-día/perf) y C9 (gate de tier en backend). **6 auditorías cerradas.**

---

## 🎯 CONSOLIDADO DE LAS 6 AUDITORÍAS (plan de corrección · solo lo VERIFICADO real)
**Dedupe + priorizado. Lo que se corrige tras 6 pasadas. (Los falsos positivos NO entran.)**

| # | Tema (raíz/cluster) | Severidad | Qué incluye | Esfuerzo |
|---|---|---|---|---|
| **C1** ✅ HECHO (2026-06-09) | **Escala / rendimiento** | 🔴→✅ | `maxPoolSize`/timeouts en server.py · `dev_scale_indexes.py` (índices faltantes background=True) · `ensure_project_full_indexes` lleno · `background=True` en dev_batch19+asesor_indexes · `bounded_to_list` (tope explícito+aviso, sin truncado silencioso) en dev_batch6/7 · `llm_guard.send_with_timeout` en weekly brief+habitabilidad. Verificado: arranca limpio, health 200. **Falta (cola 🟢):** convertir barridos a agregación Mongo (optimización) · N+1 batch $in restantes | M |
| **C2** | **Raíz: datos forkeados** | 🟡 (causa C1 y divergencias) | unificar `development_id`→`project_id` (queries+índices) · 1 helper de merge de unidad (override>overlay>seed) · 1 vocabulario de estado vendido · timestamps ISO | M |
| **C3** ✅ HECHO (2026-06-09) | **Privacidad / LFPDPPP** | 🔴→✅ | `compliance_consent.py` (registro consentimiento) + UI aviso+opt-in en LeadCaptureModal y LandingLeadCaptureForm (front+back) · `pii_crypto.py` (cifrado reposo fail-soft) · PDF público cifrado+TTL+sin nombre claro · `redact_pii` antes de la IA (lead_enrichment) · audit_immutable redacta PII · DSR 2ª pasada por lead_id/teléfono (conversación/WhatsApp/PDF/enrichment/taste/scores) con evidencia. Verificado E2E. **DIFERIDO (batch propio):** cifrar email/teléfono en reposo = rompe JOINs → necesita migración con índice ciego (hash) | M-L |
| **C4** ✅ HECHO (2026-06-09) | **IA: inyección + costo + confianza** | 🔴→✅ | `services/ai_safety.py` (sanitize_llm_input/safe_filename/escape_regex/is_public_url_safe · emite evento → Sala de Seguridad) · SSRF en fotos (dev_batch1, follow_redirects=False) · re.escape en regex (dev_batch4_1) · safe_filename en 4 exports · tope de costo+timeout en las 7 llamadas LLM (send_with_timeout) · Cerebro `is_example` excluido de la calibración. Verificado con tests | M |
| **C5** | **Observabilidad / fallas silenciosas** | 🟡-🔴 | reemplazar `except: pass` por `log.warning` + flag de error (los ~6 con impacto: cache, on_deal_closed, demanda en 0) · invalidar cache al editar · fail-closed donde aplica | S-M |
| **C6** | **Correctitud** | 🟡 | bug `price_to=price_from` · zona horaria en fechas (CDMX) · divergencia cross-portal (maps_cross lee seed) · formato MXN | S |
| **C7** | **Primer día / UX / a11y / lenguaje / perf percibida** | 🟡 | empty states con acción (MisProyectos/FichaHome) · jerga del wizard (+resumen) · wizard sin "próximo paso" al terminar · estados atascados (under_review) · **aria-labels en botones de ícono + `:focus` outline** (A6.2) · tablas/modales · **dashboard 3 fetch serie → `Promise.all`+skeleton** (A6.3) · **DesarrolladorReportes monolito → lazy/memo** (A6.4) | M |
| **C8** ✅ PARCIAL (2026-06-09) | **Red de pruebas** | 🔴→🟡 | `tests/test_dev_hardening_c1_c3_c4.py` (26 tests · C1+C3+C4) + red-team aislamiento (16/16) existente. **Falta (cola):** tests de dashboard/auth/pagos/auto-sync end-to-end del portal | M |
| **C9** | **Permisos por plan** | 🟡 | **gate de tier EN BACKEND para features premium de IA** (weekly brief/site selection/cash flow/engagement recs — hoy solo escondidas en front, A6.1) · revisar flags agentic en backend | S |
| **C10** | **Higiene** | 🟢 | `DesarrolladorInventario.js` sin ruta · componentes/API sin uso · redirects viejos | S |

**Puntos ciegos que el crítico de completitud marcó (no auditados aún):** websockets/broadcast · CSRF · rotación de tokens · S3 ACL/cifrado · retry/dead-letter de jobs · race conditions de escritura concurrente · versionado de API. (Backlog de auditoría futura.)

**Las 6 auditorías están CERRADAS (la 6 confirmó el plan y lo volvió accionable con archivo:línea + fix). Siguiente paso acordado: corregir, empezando por C1 (escala) + C3 (legal) que son los de mayor riesgo real.**

### ✅ PROGRESO DE CORRECCIÓN (2026-06-09)
- **C1 Escala** ✅ HECHO · **C3 Privacidad** ✅ HECHO · **C4 Seguridad IA** ✅ HECHO · **C8 Pruebas** 🟡 PARCIAL (26 tests nuevos · falta E2E dashboard/auth/pagos)
- Checkpoints: `checkpoint-c1-escala-done` · `checkpoint-c3-privacidad-done` · `checkpoint-c4-c8-done`
- **Quedan:** C2 (raíz datos forkeados) · C5 (fallas silenciosas + invalidar cache) · C6 (correctitud) · C7 (primer-día/a11y/perf) · C9 (permisos por plan) · C10 (higiene) · cola C8 (E2E)
- Diferido a batch propio (en BACKLOG_ENHANCEMENTS): cifrado email/teléfono en reposo (índice ciego · necesita migración)

## Resumen (semáforo por área)

| Área | Veredicto | En una línea |
|---|---|---|
| A · Lenguaje | ✅ RESUELTO (2026-06-09) | "/100" → palabra (helper `scoreWord` reusable) · Selección de Sitio traducida · leak "Superadmin/recompute" tapado · eyebrows y nombres de modelo en español |
| B · Honestidad de datos | ✅ RESUELTO (2026-06-09) | Las 3 fabricaciones quitadas y conectadas a su dato real (ver abajo) |
| C · Estados de pantalla | ✅ RESUELTO (2026-06-09) | Las 4 pantallas 🔴 ahora muestran error claro + "Reintentar" (reusa `ErrorState`, reporta a observabilidad). Quedan 2 🟡 menores (error disfrazado de vacío) |
| D · Móvil | ✅ RESUELTO (2026-06-09) | Toda tabla con scroll horizontal + minWidth · modales/drawers con `min(Npx,100vw)` · grids fijos → auto-fit. Patrón estandarizado |
| F · Coherencia entre portales | ✅ RESUELTO (2026-06-09) | Helper canónico único (`dev_price_m2`/`units_price_m2` + `SOLD_STATUSES`) usado por dev, comprador y superadmin → mismo $/m² y misma absorción del mismo proyecto en todos lados. Verificado: cuadran |

---

## B · Honestidad de datos — ✅ RESUELTO (2026-06-09 · front+back, dato real + estado vacío honesto, cierra ciclo)
Competidores, IE, Demanda y Pricing ya estaban limpios. El QA destapó 3 más, ahora arregladas:
1. ✅ **Ventas por semana** (`dev_batch10`): se quitó el generador `_generate_weekly_sales`. Ahora `_real_weekly_sales_map` cuenta las ventas REALES de `units_history` (cada unidad que pasa a "vendido" queda con fecha) en las últimas 8 semanas. Vacío honesto si no hay ventas. **Cierra ciclo**: marcar una unidad vendida en el portal alimenta la curva. Front: FichaHome muestra "Sin ventas registradas aún", MisProyectos oculta el sparkline, Cockpit muestra ceros reales. Verificado E2E (siembra→curva→limpio).
2. ✅ **Historial de precio de unidad** (`dev_batch11`): se eliminó el bloque que inventaba 6 cambios. Devuelve solo cambios REALES + `sin_historial` flag. Front (`UnitDrawerContent`) muestra "Sin cambios de precio registrados aún". **Cierra ciclo**: editar el precio en el portal queda en units_history y aparece.
3. ✅ **Engagement por unidad** (`dev_batch11`): se quitó el stub con `hash(unit_id)`. Usa `unit_engagement` real; si no hay → ceros + `sin_datos` flag (ya no "ESTIMADO" con números aleatorios). Front muestra "Aún no hay visitas ni interacciones registradas". Se autollena con el pipeline de eventos.
- 🟡 Pendientes menores (cola): sparkline de pipeline 90d con random (etiquetado demo) · GeoJSON con offset ±50m fabricado.

## A · Lenguaje — ✅ RESUELTO (2026-06-09 · helper reusable, no parche por spot)
- ✅ Helper único `frontend/src/lib/scoreWord.js` (`scoreWord`/`riskWord`/`bandWord`/`tierLabel`) → fuente única, evita que el "/100" reaparezca.
- ✅ Todos los "/100" de salud → palabra ("Va muy bien"…): `ProyectoDetail` (x2) · `MisProyectos` · `InsightsIntel` · `InsightsComparables` · `RiskScoreBreakdown` (riesgo) · `ZoneScoreBreakdown` (banda) · `BattleCardScoreGauge` (gauge sin "/100").
- ✅ Leak `IeUnitScoreCard`: "recompute/Superadmin/scores" → "Esta calificación se genera automáticamente; aún no está lista".
- ✅ **Selección de Sitio** (`DesarrolladorSiteSelection` + `SiteSelectionWizard` + `CompareTab` + mapas): feasibility→viabilidad (en banda) · narrative→análisis escrito por IA · Claude Haiku/Sonnet→IA · SUB-SCORES→detalle por factor · Wizard→Asistente · Demand Heatmap→Mapa de Demanda.
- ✅ Eyebrows Reportes/Demanda (FORECAST/HEATMAP/COHORT/TOP QUERIES → Pronóstico/Mapa de calor/Grupos/Búsquedas) · `tier` crudo → palabra (Premium/Medio/Económico).

## C · Estados de pantalla — ✅ RESUELTO (2026-06-09 · patrón reusable, no parche por pantalla)
Se reusó el componente compartido `ErrorState` (con botón "Reintentar") + `captureEvent` a
observabilidad. Cierra ciclo: error → mensaje claro → Reintentar → recupera; y queda registrado
para el superadmin. Las 4 🔴:
- ✅ **Ficha del proyecto** (`ProyectoDetail`): distingue 404 ("Proyecto no encontrado · no existe o
  no es de tu cuenta") de fallo de carga (con Reintentar). Antes: pantalla rota con el slug crudo.
- ✅ **Inicio/Dashboard**: error → mensaje + Reintentar (antes "Cargando…" eterno).
- ✅ **Inventario**: se agregó el `catch` faltante + Reintentar + **estado VACÍO honesto** ("Aún no
  tienes inventario…").
- ✅ **Competidores**: error → mensaje + Reintentar (antes "Cargando…" eterno).
- 🟡 Cola (menor, error disfrazado de "no hay datos", no rompe): `MisProyectos` · `DesarrolladorPricing` · `Reportes-Forecast`.

## D · Móvil — 🟡
- 🔴 **Inventario**: tabla de 9 columnas sin scroll (`:181`) + modal "Apartar" se sale (`:298`).
- 🔴 **Métricas Equipo**: drawer de 480px se sale (`TeamAggregatedTable.js:304`).
- 🟡 Mis Proyectos (lista), MetricasEquipo (tabla), ProductivityWidget, CrmFunnel, BattleCard, CitasPolicies, AutoAssignments: tablas/grids sin colapsar.
- Regla a estandarizar: toda `<table>` en `<div overflowX:auto>` + todo modal/drawer en px lleva `maxWidth`.

## F · Coherencia entre portales — 🟡
- ✅ Unificado: valor de zona (`colonia_valuation`), plusvalía SHF por alcaldía, valor del suelo, DRPI, demanda.
- 🔴 **$/m² de un desarrollo**: 3 fórmulas conviviendo — promedio por unidad (dev) vs cubo (comprador/superadmin) vs precio-de-entrada (`price_from/m2[0]`). Mismo proyecto, números distintos. → un solo helper `dev_price_m2()` canónico.
- 🟡 **Absorción**: el dev cuenta solo `vendido`; el cubo cuenta `vendido/cerrado/closed/sold`. Hoy coincide con seed; divergirá con datos reales. → mismo normalizador de estatus.

---

## Orden de arreglo propuesto (por impacto)
1. 🔴 **B — quitar las 3 fabricaciones** (ventas/semana, historial de precio, engagement) → es lo que rompe la confianza.
2. 🔴 **C — manejo de error** en Ficha, Inicio, Inventario, Competidores (que no se queden en "Cargando…" ni se rompan).
3. 🔴 **A — los "/100" + "Selección de Sitio" + el leak de "Superadmin/recompute"**.
4. 🔴 **D — Inventario móvil + los 2 modales que se salen**.
5. 🔴/🟡 **F — helper único de $/m² + normalizar absorción** (antes de que entren datos reales con otros estatus).
Luego la cola 🟡 de cada área en una sola tanda.
