# Reporte Final · Auditoría del Módulo Asesor

> 2026-05-30 · Workflow multi-agente (14 agentes · 1.25M tokens · 9 grupos / ~35 tabs). Verificado contra el repo real.
> **Hallazgo central: el módulo NO sobra de features, sobra de mala rotulación y motores reales escondidos detrás de flags, labels falsos o gating equivocado. El mayor retorno NO es construir ni borrar: es ENCENDER lo que ya está hecho y apagado.**

## 1. Resumen ejecutivo
- El asesor no sufre de pocas features, sufre de features **escondidas**. De ~35 pestañas solo se recomienda **eliminar 3**. Casi todo lo demás es **renombrar o reagrupar**, no reconstruir.
- **El centro de control existe y está apagado por un flag.** La Ficha360 (perfil unificado del lead) está construida y cableada pero solo vive en Leads V2. Decidir rollout definitivo + limpiar legacy (~685 líneas muertas).
- **6 pestañas tienen nombres que mienten** ("Métricas equipo"=Operaciones; "Briefings PDF" no genera PDF; "Búsquedas guardadas"=pipeline kanban; "Assets Mood Board"=biblioteca de assets). Renombrar = 0 código.
- **Motores completos corriendo sin botón para llegar:** Alertas Predictivas (8 señales, cron diario, 0 refs en nav); Métricas reales (KPIs + sparkline 90d) ocultas mientras el slot apunta mal a Operaciones; Smart Digest corre por email sin UI.
- **3 features de alto valor rotas por un cable suelto:** Bandeja IA pega a endpoints superadmin → 403 (siempre vacía); "Nueva cita" recibe proyectos=[] → nunca crea cita; Workflows no se auto-disparan (`dispatch_event()` sin caller).
- **Datos demo donde debería haber reales:** Mini Market/Inventario leen catálogo estático con nombres de campo que no casan → precios "—" y zona vacía. El matcher corre sobre ese demo.
- **Flujo despedazado:** un lead obliga a recorrer 6-7 pestañas re-tecleando datos que el sistema ya tiene. **No hay post-venta** (lead ganado desaparece: cero recompra/referidos/reseñas).
- **2 sistemas paralelos de tracking links** + **2 generadores de video** (uno subconjunto del otro). Consolidación limpia.

## 2. Veredictos (mapa tab-por-tab resumido)
- **Eliminar (3):** `Videos` (subconjunto de Video Standalone) · `/asesor/links` (duplicado tracking) · `Ranking equipo` (Elo sin motor, hardcoded 1000 · SOC ya hace el ranking real).
- **Rehacer (4):** Bandeja IA (fix gating 403) · Mis workflows (wire dispatch_event) · Mini Market (fuente de datos real) · Citas (arreglar Nueva cita + Calendario).
- **Consolidar:** Leads-developers → Mis Leads · grupo Inventario colapsa (Mini Market + Inventario como tabs de Desarrollos) · tracking links ×2 → 1 · Director IA delega video.
- **Renombrar (6):** Búsquedas guardadas→Pipeline · Métricas equipo→Operaciones · Briefings PDF→Briefings · Assets Mood Board→Biblioteca de Assets · etc.
- **Diferir:** Marketplace plantillas (pago sin Stripe) · Anuncios Meta (stub por Meta App Review, código bueno).
- Todo lo demás (Inicio, Comisiones, SOC, CMA, Carruseles, Landings, Brand Kit, Agentes IA, Tareas, Captaciones…) = **Mantener**.

## 3. Huérfanos / deuda (con evidencia)
- A1 Bandeja IA 403 (`App.js:1018-1036` · `conversation.py:300,310,318`). A2 Nueva cita inerte (`AsesorCitas.js:271` · `NewCitaModal.js:62`). A3 dispatch_event 0 callers. A4 Mini Market campos (`data_developments.py:93,97` vs `AsesorMiniMarket.js:140`). A5 "Datos exclusivos" Inventario vacío (seed grep=0).
- B1 `/asesor/metricas` huérfana de nav (slot apunta a Operaciones · `navByRoleV2.js:127`). B2 Alertas Predictivas 0 refs (`AlertasPage.js` · `server.py:1965`). B3 `/asesor/outbound` fuera de nav. B5 MoodBoardSection sin ruta. B6 data_scoping guards sin callsite. B8 sync_campaign_performance sin caller.
- C. Sin UI: deleteTarea, getCaptacion (drawer), getCitaWaTemplate (copiar WA). D. Stubs: Calendario placeholder; SuggestedReplies = regex local (backend tiene RAG).

## 4. Quick wins (TOP · ya construido en backend, falta exponer)
1. **Alertas Predictivas en el nav** (1 línea) — lo más alto valor/esfuerzo.
2. **Reapuntar slot "Métricas equipo" → `/asesor/metricas`** (2 líneas) — desbloquea KPIs reales + Daily Feed.
3. **Intel del lead en el drawer** (`/contactos/{id}/intel`) — churn/DISC/mejor hora/oferta AVM.
4. **Botón "Enriquecer"** en la card. 5. **Daily Feed en Inicio**. 6. **Smart Digest "Enviar ahora"**. 7. **Tooltip factores de close-probability**. 8. **"Copiar WhatsApp" en Citas**. 9. **Journey timeline en drawer**. 10. **Reapuntar Mini Market a `db.developments` real**.

## 5. Flujos — Ficha360 como contenedor de las 7 etapas (todo con endpoints existentes)
Resumen(`/intel`,`/overview`) · Match(matcher) · Agenda(`POST /api/cita`) · Conversación(Bandeja+argumentario-rag) · Negociación(`busquedas/{id}/visit|offer`) · Cierre(`op-prefill`→wizard prefilled) · Timeline(`/leads/{id}/journey`). **Falta etapa 7 post-venta** (re-engagement/reseñas/referidos sobre workflows).

## 6. Arquitectura propuesta · 9 grupos/35 tabs → 7-8 grupos/~28 tabs
Lead (Ficha360) como centro de gravedad. -3 eliminadas, -1 grupo colapsado, +2 motores expuestos (Alertas, Métricas), 6 renombrados.
1. **Inicio** (+ Daily Feed + Smart Digest). 2. **Mis Leads** (Lista+Ficha360 hub · Pipeline · Leads-dev · **Alertas** · **Outbound** · Conectar fuentes). 3. **Agenda** (Citas fix · Tareas). 4. **Inventario** (Desarrollos[Mini Market+Inventario reales] · Captaciones). 5. **Conversaciones IA** (Playground · Bandeja fix). 6. **Automatizaciones** (Agentes · Workflows wire · Marketplace diferido). 7. **Studio** (Director · Landings · Carruseles · Auto-Content · Video unificado · Brand Kit · Assets · Importar). 8. **Mi Performance** (Métricas NUEVO · Operaciones · Comisiones · SOC[+ranking] · CMA · Briefings). 9. **Herramientas** (Tráfico+Clima · Anuncios Meta diferido).

## Postura final
La deuda no es falta de features — es **features huérfanas, un hub apagado, labels que mienten y gating equivocado.** Plan de mayor ROI = quirúrgico: eliminar 3 redundancias, renombrar 6 labels, exponer 2 motores ya corriendo, arreglar 3 cables sueltos, consolidar el flujo alrededor de la Ficha360. **80% del trabajo es cablear/reagrupar lo existente, no construir.**

## Orden de batches sugerido
B1 Encender/consolidar el Hub (flag + portar intel/overview) → B2 Hub contenedor de etapas + 6 quick wins de cableado → B3 Fixes de fricción dura (Nueva cita, Bandeja 403, cierre prefilled) → B4 Captura unificada + reagrupar nav + renombrar labels → B5 Post-venta sobre workflows.
