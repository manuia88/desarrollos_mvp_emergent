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
- [ ] P0.5 · 🆕 **Default admin público** [F2]: server.py:1287 `ADMIN_PASSWORD` default `Admin2026!` / `admin@desarrollosmx.io`. Fail-closed en prod si falta.
- [ ] P0.6 · 🆕 **Stripe webhook fail-open** [F10/F11]: acepta JSON sin firma si falta STRIPE_WEBHOOK_SECRET → cobros falsos. Rechazar en prod.
- [ ] P0.7 · **Observabilidad muerta** [F4/F10] ✅EJEC: SENTRY_DSN es token, no URL → errores invisibles. Poner DSN real.
- [ ] P0.8 · **Bug `score_total`→`score_numeric`** [F6] ✅EJEC (poblado): corrompe tier/yield/bancabilidad/AVM (12+ sitios). 1 cambio central.
- [ ] P0.9 · **18 colecciones leídas con nombre mal** [F5] (gemelo lleno): behavioral_tracking_events→behavioral_events · zone_subscores→zone_scores · ie_engine_scores→ie_scores · properties→dmx_units · zones→dim_zones · asesor_leads→asesor_contactos · asesor_citas→appointments · favoritos→buyer_favorites · etc.
- [ ] P0.10 · **Pipeline ML inerte** [F5] ✅EJEC: emit_ml_event mal llamado ×16 + classify_reply no existe (WhatsApp) + track_ai_call wizard.
- [ ] P0.11 · **Honestidad: "ventas reales/para bancos/vivo" sobre seed md5** [F11+QA3]: contar desde units_history; sin dato → "demo/preliminar". (bancabilidad, Cerebro, simulador, generador, índices vendibles, flags verified.)
- [ ] P0.12 · 🆕 **Cadenas de ataque** [F11]: cerrar las 4 cadenas (funnel→IDOR dump · mutación inventario · admin default · Stripe→tier enterprise). Se resuelven con P0.1-P0.6.

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
- [ ] P1.10 · 🆕 **JWT_SECRET default efímero** [F3]: rompe sesiones al reiniciar/multi-instancia. Fail-closed en prod.
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
