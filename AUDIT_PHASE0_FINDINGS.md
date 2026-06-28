# Fase 0 · Auditoría de Integridad (4 portales) — 2026-06-27

> Workflow multi-agente: 5 auditores (comprador·asesor·dev·superadmin·integración) + verificación adversarial + síntesis.
> 20 agentes · 935k tokens. **El verificador refutó 6 de 8 "HIGH"** (falsos positivos por confusión de nombres).

## Veredicto de salud
Integridad GENERAL **sólida**; la mayoría de los ciclos del flywheel están vivos; el moat intacto en lectura.
**Patrón transversal genuino:** el dato comportamental del comprador (`buyer_signals`/taste/favoritos) **no se materializa ni
viaja completo entre capas** — se queda en memoria o en el portal donde nació. 8 fallas reales, **ninguna de seguridad**.
**Bloqueador #1:** el cubo OLAP es **ciego a la demanda**.

## Issues confirmados (8)
| # | Portal | Sev | Issue | Fix |
|---|---|---|---|---|
| 1 | integración | 🔴 HIGH | `buyer_signals` nunca alimenta el cubo OLAP (demanda invisible al analítico) | `materialize_buyer_signals_to_cube` en cube_olap_engine + scheduler 04:00, K-anon≥3 |
| 2 | comprador | 🔴 HIGH | Favoritos anónimos NO migran al loguear/registrar (asesor ve lead "sin actividad") | migrar `buyer_favoritos→buyer_favorites` en login (AuthModal) + unificar endpoints |
| 3 | integración | 🔴 HIGH | El gusto NO viaja a Ficha360 al crear contacto (asesor a ciegas) | enriquecer `mirror_lead_to_asesor_contacto` con `taste_compact` (visitor_taste) |
| 4 | asesor | 🔴 HIGH | Bridge inverso (etapa→status db.leads) FAIL-OPEN + contactos manuales huérfanos | bridge crítico + sintetizar lead manual + reconciliación diaria |
| 5 | integración | 🟡 MED | 3 rutas de captura con garantías distintas; `lead_capture.py` no espeja a db.leads | `create_buyer_lead` = fuente única; cerrar rutas laterales |
| 6 | dev | 🟡 MED | leads-cockpit calcula `buyer_score` real pero la UI rankea por heurística | usar `buyer_score.value` cuando `buyer_real=true` |
| 7 | comprador | 🟡 MED | Señales valiosas capturadas en backend pero el front nunca las emite | cablear `photo_zoom`/`zone_intent`/`module_open` en sendBuyerSignal |
| 8 | asesor | 🟡 MED | Dedup email/teléfono en lead_bridge sin `$in` (frágil) | `{'emails': {'$in':[email]}}` (2 líneas) |

## Orden de ataque (cuñas)
1. **FUNDAMENTO** — feed `buyer_signals`→cubo OLAP (#1). Desbloquea recomendaciones/superadmin/taste persistido.
2. **CICLO COMPRADOR→ASESOR** (mismo chunk) — migrar favoritos en login (#2) + `taste_compact` al espejo (#3). El asesor recibe lead con actividad+gusto.
3. **CONSISTENCIA DE LEADS** — bridge inverso crítico + reconciliación + contactos manuales (#4) + cerrar rutas laterales (#5).
4. **WIRING BARATO ALTO-VALOR** — buyer_score en cockpit (#6) + emitir señales front (#7) + `$in` dedup (#8).

## Oportunidades (upgrades encontrados, → backlog)
- `visitor_taste_materialized` (cache TTL 24h, invalida en POST signal) — reusable por asesor+recomendaciones.
- `GET /api/buyer/parecidos-cerraron` (hoy huérfano: `ParecidosCerraron.js` llama endpoint inexistente) → prueba social.
- Exponer `demanda_insatisfecha` a superadmin (`GET /api/superadmin/demand-insights`) + tarjeta "Dónde construir".
- Consumir `buyer_elasticidad` (se escribe, nunca se lee) → insight + casamentera proactiva.
- Surfacear `gap_presentacion`/`rechazo_por_motivo` en superadmin → tarjeta "Studio Opportunity".
- Re-entrenar temperatura del lead post-espejo (job 6h sobre activity_logs + casamentera).
- Discoverability de features ya cableadas pero escondidas (tabs alertas/wrapped/comparador, Formas de Pago en ProyectoDetail).

## Falsos positivos (NO tocar)
"154 endpoints huérfanos" · "3 motores sin UI" · superadminCompliance huérfano · SuperadminDesarrollos sin wiring ·
"pages sin backend devmaster" · "leads no unificados en superadmin" (colecciones aisladas a propósito).
