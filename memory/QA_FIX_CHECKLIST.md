---
name: qa-fix-checklist
description: Checklist FINAL priorizado · fusión QA1-QA5 + Auditoría formal 12 fases (2026-06-10) · P0-P3 · marcar [x] al arreglar · fuente única de verdad
metadata:
  type: project
---

# QA Fix Checklist FINAL — QA1–QA5 + Auditoría formal 12 fases (2026-06-10)
Detalle: `QA3_MASTER_REPORT.md` (QA1-5) + `AUDIT_FASE_*.md` + `AUDIT_RESUMEN_EJECUTIVO.md`.
Leyenda: ✅EJEC = confirmado EJECUTANDO (no solo leyendo) · 🆕 = nuevo de la auditoría formal · [F#] = fase de la auditoría.
Conteo: **~12 P0 · ~17 P1 · ~24 P2 · ~8 P3.**
VEREDICTO: **NO listo para producción.** Casi todo LATENTE (BD en semilla) → arreglar antes de prender.

## P0 — Bloqueantes (go/no-go)
- [x] P0.1 · **Aislamiento multitenant — IDOR lectura** ✅ARREGLADO 2026-06-10 (Tanda 1): auth+ownership en funnel(get/breakdown/suggestion/sankey), insights ×8, battle_card ×5, maps_cross battle-card, diagnostic ×5, deseabilidad, grafo-contacto (engine scope owner_id), argumentario (_fetch_lead nunca cross-org), b13 attribution ×2, lead_match ×2. Verificado: cross-dev→403, propio→OK; journey_dev 20/20, redteam 22/22.
- [x] P0.2 · **Aislamiento — MUTACIÓN cross-tenant** ✅ARREGLADO (Tanda 1): `_assert_unit_in_dev` en unit-status/unit-fields/unit-fields-bulk (la unidad debe ser del dev) → A.dev+B.unit = 404 bloqueado (verificado).
- [x] P0.3 · **CAS débil → doble venta** ✅ARREGLADO (Tanda 1): primer-override ahora CAS atómico (filtro `status:{$ne}` + DuplicateKeyError→409). CAS de override existente ya estaba.
- [x] P0.4 · **getattr(user,"id") roto ×33** ✅ARREGLADO (Tanda 1): barrido `"id"`→`"user_id"` en 11 archivos + helper canónico `tenant_scope.actor_id`. Dueño per-asesor (lead_enrichment) ahora compara user_id real.
  · UPGRADES Tanda 1: `tenant_scope.actor_id` (id de actor único) · `_field` (helpers tolerantes a user dict|objeto) · `assert_lead_owner` (candado de lead reusable, tolerante al fork de tenant).
- [x] P0.5 · **Default admin público** ✅ARREGLADO 2026-06-10 (Tanda 2): gate `_prod_env_guard()` aborta el arranque en prod si `ADMIN_PASSWORD` falta o == `Admin2026!`. Verificado (prod sin clave → RuntimeError; con clave válida → OK).
- [x] P0.6 · **Stripe webhook fail-open** ✅ARREGLADO (Tanda 2): en prod (`_is_prod`) rechaza 400 si no hay firma/secret; test-mode solo en dev. (public_api_v1 stripe_webhook)
- [x] P0.7 · **Observabilidad muerta** ✅CÓDIGO (Tanda 2): init_sentry detecta DSN mal-formado (token vs URL) con mensaje claro + el gate loguea error en prod. ⚠️ FALTA ACCIÓN FOUNDER: poner el DSN real (URL) en `SENTRY_DSN` del deploy.
  · BONUS P1.10 (JWT efímero): el mismo gate aborta en prod si falta `JWT_SECRET`. Upgrade: `_is_prod()` + `_prod_env_guard()` = un solo gate de prod-readiness fail-closed.
- [x] P0.8 · **Bug `score_total`→`score_numeric`** ✅ARREGLADO 2026-06-10 (Tanda 3): fix CENTRAL en zone_score_engine (`_with_score_aliases` añade score_total/score/grade en get_score_or_compute + list_all_scores) → arregla a TODOS los readers vía motor; + 2 readers directos a BD (avm_public, state_of_cdmx). Verificado: Polanco tier D/zona 46.2 (antes "F"/0); bancabilidad con zona real.
- [~] P0.9 · **Colecciones leídas con nombre mal** — RECLASIFICADO 2026-06-10 (Tanda 3): NO son renames mecánicos. Verifiqué la forma REAL de los gemelos: la mayoría es **shape-different** → renombrar a ciegas los vuelve "mal" en vez de "vacío" (la clase que combatimos). Por caso: behavioral_events (no tiene context.zone_slug/created_at, usa timestamp sin zona) · ie_score_history (no tiene timestamp/delta) · dim_zones (usa zone_id+geo.{lat,lng} no id/lat/lng) · ie_engine_scores/ie_unit_scores/zone_subscores/comparables/properties (modelos distintos) · empty-twins (asesor_leads→asesor_contactos, dev_leads→leads, asesor_citas→appointments, etc: ambos vacíos hoy). → ACCIÓN: tranche aparte de RECONEXIÓN por-feature (adaptar reader a la forma canónica), NO rename ciego. Priorizar Live Pulse + colonia_intelligence.
- [x] P0.10 · **Pipeline ML inerte** ✅ARREGLADO 2026-06-10 (Tanda 3): `emit_ml_event` ahora posicional-O-keyword (1 cambio de firma resucita los 16 callers · verificado graba evento). `classify_reply` wrapper módulo-level creado (WhatsApp ya clasifica · heurística determinista). `track_ai_call` del wizard corregido (quité cost_usd, agregué tokens).
- [x] P0.11 · **Honestidad: "ventas reales/para bancos/vivo" sobre seed md5** ✅ARREGLADO 2026-06-10 (Tanda 4): helper CENTRAL `data_doctrine.has_real_sales(db)` (mira units_history/transactions, cache 5min) + `honest_label()`. Todo motor que decía "ventas reales/para bancos/vivo" ahora computa `real` y devuelve `data_basis` ("real"|"demo") + `fuente` honesta. Tocados: bancabilidad (score+ranking → "DEMO · catálogo de ejemplo"), cerebro_mercado (lifts), absorcion, generador_producto ("búsquedas reales…señal de demanda, no ventas"), simulador_palancas, estudio_mercado (umbral es_estimado dt<10→dt<30), data_licensing (bundles "BETA · no licenciar hasta ventas reales"). Front: chip ValorTerreno + badge "DATOS DE EJEMPLO" en TerminalMercado. Verificado: backend import OK, front compila.
  · DIFERIDO (menor, baja prioridad): routes/public.py:72 flags verified/track-record dev · copy de plantillas Studio/landing ("datos verificados") · ProbabilityCard · tours.js · App.js:1285 Atlax.
- [x] P0.12 · 🆕 **Cadenas de ataque** ✅CERRADO 2026-06-10 (vía P0.1-P0.6): las 4 cadenas (funnel→IDOR dump · mutación inventario · admin default · Stripe→tier enterprise) quedan cortadas por los fixes de Tanda 1-2 ya verificados.

## P1 — Dinero correcto + auth + integridad
- [ ] P1.1 · IRR pago-bala (+3pp) + break-even falso + ROI +96% en recesión [F8/QA5]. Reusar _compute_tir_anualizada.
- [ ] P1.2 · DRPI lee yoy_change_pct, campo es delta_pct → apreciación siempre 6.5% [QA5].
- [ ] P1.3 · stress_test firma incompatible → 10% score inversión = 50 [F5].
- [ ] P1.4 · compute_avm sin guard r² → valuación 101M (8×) ✅EJEC [QA5]. Copiar guard de avm_public.
- [ ] P1.5 · gap stock−flujo · sellout /12 · renta neta como bruta [QA3/5].
- [ ] P1.6 · Concurrencia ✅EJEC: versión estudio + registrar_prediccion sin índice único → duplicados. Índice único + CAS.
- [ ] P1.7 · "vendido" forkeado (~10 sitios) + "vendida" femenino invisible [F6]. Importar is_sold + incluir vendida.
- [ ] P1.8 · Cubo congelado en seed (override no propaga: dev 23% vs cubo 14%) + 5 fórmulas de absorción [F1/F6].
- [ ] P1.9 · 🆕 **Sin rate-limit en login** [F3/F10]: fuerza bruta. Reusar _rate_limit_check.
- [x] P1.10 · **JWT_SECRET default efímero** ✅ARREGLADO (Tanda 2): `_prod_env_guard` aborta en prod si falta JWT_SECRET.
- [ ] P1.11 · 🆕 **Logout no invalida token** (JWT stateless) [F3]: blocklist/TTL corto + refresh rotación.
- [ ] P1.12 · **Salt PII en el bundle** [F4]: posthog.js:21 + defaults. Mover hashing al backend.
- [ ] P1.13 · 🆕 **Faltan headers de seguridad** [F10]: HSTS/CSP/X-Frame/X-Content-Type (solo CORS hoy). Middleware.
- [ ] P1.14 · Prompt injection directa+indirecta [F7/F11]: sanitizar input/RAG + frontera de confianza + guard presupuesto LLM (studio_copy sin tope).
- [ ] P1.15 · 6 hermanos más del campo [F5]: last_synced_at→computed_at · hedonic coefficients · risk_scores_zone · denue safety_score.
- [ ] P1.16 · 🆕 Cable FE roto: RepliesInbox → /api/asesor/leads (no existe, es /contactos) → 404 [F5].

## P2 — Fuentes, resolvedores, plomería, escala
- [ ] P2.1 · Fuentes "DENUE escondidas" [F10/QA4]: osm_pois (GET→504), 6 IE "active"-stub (FGJ viva), Atlas, Studio Video stub.
- [ ] P2.2 · Resolvedores no centralizados [F6/F9]: precio/m2/colonia (7 slugify, 4 merges). Helpers públicos en data_developments.
- [ ] P2.3 · Índices faltantes [F8]: developer_reports, market_index_snapshots, cerebro_predictions, asesor_busquedas, units.
- [ ] P2.4 · Full-scans del Grafo por request [F8]: empujar filtro al query + caché.
- [ ] P2.5 · Modelos sobre 2000 tx sin sort [F8]: drpi/hedonic/transaction_network/fraud → sesgo. + sort + flag.
- [ ] P2.6 · Cables flywheel [QA3/5]: comprador→grafo · cierre-contacto→cubo · operación cancelada→lost · marketplace_searches read-only.
- [ ] P2.7 · TZ UTC vs CDMX [F8]: snapshot, month_key → cdmx_time. 25 colecciones inertes: cablear o borrar.
- [ ] P2.8 · k-anon 3 vs 5 inconsistente [F1/QA3]. Centralizar K_ANON_MIN.
- [ ] P2.9 · Rate-limit: API v1 sin throttle ráfaga · avm colonias/top · grafo sin compliance log [F10/F11].
- [ ] P2.10 · Frontend guards [F5]: DesarrolladorReportes/SuperadminIndices/ValorTerreno · getForecast sin catch · doble-submit.
- [ ] P2.11 · 🆕 **Sin validación de schema en Mongo** [F6]: todo depende del código. Validators para entidades críticas.
- [ ] P2.12 · 🆕 **XSS bulletins** [F7]: dangerouslySetInnerHTML en BulletinPage (público) sin sanitizar verificado. DOMPurify + confirmar admin-only.
- [ ] P2.13 · 🆕 **File uploads** [F7]: validación uniforme tamaño/tipo/nombre/storage privado (10 puntos de upload).
- [ ] P2.14 · 🆕 **CORS allow_methods/headers = ***  [F10]: acotar a los usados (origins ya explícitos ✅).
- [ ] P2.15 · 🆕 **AdvisorRoute sin guard de rol** [F3]: /desarrollador/estudio-mercado abrible por cualquier logueado (backend 403, pero shell expuesto). Guard de rol dev.
- [ ] P2.16 · 🆕 **Una sola conexión Mongo privilegiada** [F2]: sin credencial de menor privilegio para superficies públicas.

## P3 — Edge, consistencia, cosmético
- [ ] P3.1 · valor_residual cus_manual=0 → CUS=3 → $60M en vez de $0 [F7].
- [ ] P3.2 · Edge motor: coerción colonia_id/categoria/factor dict→str · clamp negativos (defensa en profundidad) [QA5].
- [ ] P3.3 · plazo_meses muerto · tax negativo bajo primer tramo · DataOrigin solo en F1 · falsa precisión [QA5].
- [ ] P3.4 · Inconsistencia cross-engine: costo obra $14k/$22k/$13k · apreciación 4 supuestos [QA5]. Unificar.
- [ ] P3.5 · 🆕 Claves env duplicadas (DB_NAME/MONGO_URL/JWT_SECRET/ADMIN_* ×2) [F0/F2].
- [ ] P3.6 · 🆕 Comentario stale golden_calibration:183 (`# 0.035` vs 0.02) [F9].
- [ ] P3.7 · 🆕 Test roto tests/wave3/test_denue_engine_unit.py (importa módulo borrado) [F5/F9]. Borrar.
- [ ] P3.8 · Inventario TODO/FIXME/HACK pendiente [F9].

## PENDIENTE DE VERIFICAR (requiere acción del founder · no concluyente desde código)
- [ ] Correr `/load-tests/dmx_load.js` + `payloads_staging.md` contra **STAGING** (no prod) → números reales + confirmar IDOR/cadenas.
- [ ] Backups / point-in-time recovery de Mongo → panel del proveedor [F10].
- [ ] Headers de seguridad / CORS reales en la plataforma de deploy (Emergent) [F10].
- [ ] TTL del JWT + flujo de recuperación de contraseña (token de reset) [F3].
- [ ] Auditoría línea-por-línea de log.* con PII de clientes [F4].
- [ ] Cobertura de tests de motores de dinero + rutas superadmin (0 tests) [F9].
- [ ] ÁREAS SIN AUDITAR a fondo (QA6 opcional): superadmin 71 págs · mobile/accesibilidad (founder usa celular) · render PDF datos vacíos/enormes · agentes runtime · deps/CVEs (pip-audit) · migraciones seed→real · templates WhatsApp/email.

## SÓLIDO — confirmado, NO tocar
Contrato FE↔BE limpio (0 drifts) · auth/rol desde BD (escalada por token imposible ✅EJEC) · bcrypt fuerte · k-anon protege con dato real ✅EJEC · NoSQL-injection/path-traversal bloqueados ✅EJEC · valor_residual/impuestos/payment_schemes correctos en bordes · 7 olas ejecutables verdes · .env nunca commiteado · 593 módulos importan limpio.

## ORDEN DE FIX RECOMENDADO (por causa raíz, máximo impacto / mínimo riesgo)
1. **Aislamiento multitenant** (P0.1-P0.4) — el bloqueante #1.
2. **Credenciales/pagos/observabilidad** (P0.5-P0.7) — fail-closed + Sentry real.
3. **score_numeric + nombres colección + emit_ml_event** (P0.8-P0.10) — fixes centrales 1-línea.
4. **Honestidad** (P0.11) — proteger credibilidad antes de vender datos.
5. **Dinero** (P1.1-P1.8) + **auth hardening** (P1.9-P1.13).
6. **Plomería/escala** (P2) antes de carga real.
7. **P3** + verificar pendientes en staging.
