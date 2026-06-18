# Mapa de Seguridad del Rediseño (2026-06-17)

Auditoría front+back (2 agentes Opus) ANTES de rediseñar, para no perder funcionalidad. El rediseño es
**solo-visual**: usar `<PublicPageShell>` + componer con `Card/Section/Button`, SIN tocar la lógica de abajo.

## Backend — NO está en riesgo (rediseño es solo-frontend)
- Toda la API pública/marketplace responde 200, cero rotos. Casi todo vive en `routes/public.py` (URLs `/api/*`
  hardcodeadas, sin prefix → **mantener URLs exactas + shapes**).
- **4 cables a NO romper** (no alterar el body/shape que manda el front):
  1. Lead: capture → `lead_bridge.mirror_lead_to_asesor_contacto` → asesor/Cerebro (7 puntos, fail-open). No cambiar el shape de `lead` doc.
  2. `cerebro/coach.on_deal_closed` (aprendizaje).
  3. Watch: `/api/colonia-watch` param `watcher` (localStorage) + shape `{watching[],alerts[]}`.
  4. Overlay dev → ficha: `/api/developments/{id}` fusiona seed + `dev_overlays` + `developer_unit_overrides`.
- 2 fuentes de colonias conviven: 16 seed RAM + 1,811 DB. No unificar a la ligera.

## Frontend — lo que el rediseño NO debe romper
**Arquitectura:** DOS sistemas de nav/tema. V2 (HomeV2/ColoniasV2/AsesoresV2/DesarrolladoresV2 + DevelopmentDetail)
usan `PublicNav`+`LightScope`. ~23 páginas legacy usan `components/landing/Navbar`+`CtaFooter` oscuros. El
rediseño reconcilia vía **`PublicPageShell`** (ya construido).

**Frágil (rompe en silencio) — preservar:**
- **CustomEvents de window** (no props): `atlax:open`, `dmx:ask-atlax`, `lead_capture_trigger`,
  `comparator_basket_updated`. Quitar listener/dispatch = matar asistente/captura/comparador.
- **Mapbox (Mapa.js · lo más frágil):** `<div ref={container}>` con `position:absolute;inset:0` se pasa directo
  a `new mapboxgl.Map`. NO envolver/renombrar/quitar inset. IDs de source/layer hardcodeados por string
  (`colonias`/`centers`/`devs`/`catastro-poly`, `colonias-fill/-outline/-label`, `dev-point`, etc.) → renombrar = romper.
  `generateId:true` + handshake `mapReady`/`isStyleLoaded` → preservar orden. (Bug latente `colonias-labels` vs
  `colonias-label` — NO tocar en el pase visual.)
- **Tracking (rompible en silencio):** regex de URL por pathname (`/colonia/:slug`, `/desarrollo/:id`), scroll del
  BODY (`useBehavioralTracker`), `data-ph-capture`/`.ph-mask` de PostHog, cookies `dmx_ref`. Un wrapper
  `overflow:auto` rompe el scoring de lead.
- **Cientos de `data-testid`** load-bearing (tests + tracking). Tratar como contrato estable.
- **Contratos de URL/query** (deep-links): Marketplace (`subscore_min`/`filter-by`/`forecast_delta_min`),
  Comparator (`?colonia=` y `?ids=&type=`), Simulador (`?precio&colonia&m2&plazo`), HomeV2 (`?colonia`).
- **Clases CSS en `<style>` inline** acopladas al markup (`.dev-grid`, `.detail-grid`, `.dmx-photo`, etc.) →
  renombrar JSX sin el `<style>` rompe hover/responsive.
- **Pricing A/B** `_applyPriceMod` (DevelopmentDetail) — el precio pasa por aquí, no bypassear.
- **Altura del navbar (60px)** → math sticky de Marketplace (`top:60/130`, `calc(100vh-130px)`). PublicNav debe
  igualar la altura o ajustar offsets.
- **`#ie-scores`** ancla (destino de smooth-scroll desde marketplace) — mantener el id.
- **Inyección a `document.head`** (og/twitter/JSON-LD) en ficha + landings SEO — preservar useEffect+cleanup.
- **2 floating en bottom:24 right:24** (AtlaxBubble + WhatsAppAsesorCTA en ficha) — vigilar solape.

## Orden de rediseño por riesgo (de menor a mayor)
1. **Seguras:** AsesoresV2/DesarrolladoresV2 (ya V2, sin endpoints) · landings SEO estáticas.
2. **Media:** Marketplace (preservar 4 modales, toggle lista/mapa, sticky math, comparator basket, AtlaxBubble).
3. **Alta:** PropertyDetail · las landings con lead-form.
4. **Máxima:** DevelopmentDetail (8 tabs, behavioral tracker, A/B, gate, meta injection, tour 3D) · Mapa (Mapbox).

**Regla de oro:** `<PublicPageShell>` + restyle a tokens claros + upgrades de diseño, SIN tocar handlers,
CustomEvents, IDs de Mapbox, data-testid, clases de `<style>`, ni contratos de URL. Verificar en vivo cada una.
</content>
