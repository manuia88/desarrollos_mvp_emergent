# Backlog — Enhancements diferidos

Mejoras decididas pero pospuestas (con el porqué). No perderlas.

---

## P2 #3 — "Staged a tu gusto" (amueblado virtual por estilo en la ficha-experiencia)
**Diferido 2026-06-28 · founder: "documentado y seguimos".**

**Qué:** en el image-reveal de `AtlaxExperiencia`, revelar el MISMO cuarto **amueblado en el estilo preferido del
comprador** (moderno / cálido / minimalista) — el wow visual máximo de la personalización.

**Por qué se difiere (no técnico):** requiere **gasto en Replicate** (la generación de staging cuesta por imagen) +
es **lento** (~10-30s, no en vivo → hay que pre-generar 2-3 estilos por dev y cachear) + es **imagen GENERADA** (regla
anti-alucinación: etiquetar "amueblado virtual").

**Listo para construir cuando el founder autorice el gasto:**
- El motor YA existe: `virtual_staging_engine.py` + `routes/virtual_staging.py` (`POST /api/virtual-staging`
  {input_image_url, room_type, styles[1-3]}).
- `REPLICATE_API_TOKEN` YA está en el env.
- Patrón a seguir (igual que P2 #4 parallax): endpoint que pre-genera por dev en **background** + cachea + sirve; la
  experiencia revela la variante que matchea el estilo del comprador (de `visitor_taste.keys.features`:
  moderno/lujo/madera → estilo). Cold-start del perfilador.

**Costo aprox:** ~3 estilos × N fotos clave × por dev (Replicate). Controlable: solo el cuarto del hero, solo devs
activos, trigger manual del dev/founder.

---

## Áreas de oportunidad diferidas (sesión 2026-06-28)
**Tras solucionar #1 (harness e2e), #3 (loop de aprendizaje), #4 (cold-start), #8 (seguridad/rate-limit).**

- **#5 — Lift readout (¿la personalización sube el engagement?):** la instrumentación YA está (`experiencia_views`
  {personalized,basis} + conteo en el intel del founder). El READOUT comparativo (dwell personalizada vs estándar) se
  difiere: con datos semilla es ruidoso + el join experiencia↔dwell es flojo. Construir cuando haya volumen real.
- **#6 — Performance a escala:** materializar `demand-twin` + `donde-vivir` en cron (como el cache de taste). Diferido:
  PREMATURO al scale actual (dashboard calls, ~100ms). Hacer cuando el tráfico lo pida.
- **#2 — Deploy + validar con datos reales:** ACCIÓN DEL FOUNDER (memoria: "tú prendes; yo dejo listo"). Correr
  `scripts/smoke_e2e.py` pre-deploy.
- **#7 — Pipeline de video real del dev (Studio/3DGS) + gate de calidad de foto:** el "wow" depende de contenido real.
  Build mayor (subida + storage + el gate). Backlog.

## Terminal de Zona — rediseño UI/UX (diferido a módulo SUPERADMIN · 2026-06-29)
**Estado:** la página `/superadmin/terminal-zona` VERIFICADA renderizando con dato real (founder confirmó "sí se ve").
Backend completo: 120 compuestas · 4 escalas · 16 atributos · financiero · AirROI · riesgo natural+crimen.
**Diferido:** mejorar mucho la UI/UX (founder: "hay que mejorar mucho la UI/UX, lo revisamos en el módulo de superadmin").
Construida funcional, no pulida — el rediseño visual va cuando toque el portal superadmin.

## Auditoría F4 (2026-07-06) — diferidos conscientes
Aplicados en el commit de auditoría: bucket+cache espejo · copilot (disponibles/nombres/prompt/caps) · Atlax raíz (texto→compilador+amenidades+K canónico) · email alertas (caliente real + claves nuevas en matcher/descripción) · CTA banner + señal espejo_view · quick actions · alertas de corte del asesor · brief con tensión · copilot dev con tensión.
Diferidos (~1-3h c/u, orden sugerido):
- **Ficha pública**: espejo del corte del desarrollo + likes k-anon (GET /interes es huérfano; cablear en DataBlock Disponibilidad de FichaVenta).
- **/zona**: migrar demanda_zona (conteo EXACTO sin k-anon, routes/public.py:471) a espejo_con_lente bandas — deuda de doctrina.
- **SimuladorEnganche componente compartido** → montar también en ComercializacionTab (donde el dev decide el enganche).
- **CorteLeadCard compartida** → drawer de AsesorBusquedas (por búsqueda, no solo busquedas[0] de Ficha360) + selector multi-búsqueda en Ficha360.
- **Universo zonas público**: campo universo en EspejoCorteIn (la tool Atlax ya lo pasa vía texto).
- **buyer_alerts tipo corte_caliente** (logueados) + cablear register_match_handler (huérfano) desde send_alert.
- **Espejo baseline al guardar búsqueda** ('tu corte SE calentó' = delta, no estado) + alerta standalone sin new_props.
- **Permalink corte**: ?corte=b64 en Explorador + aiFilters/mensualidad en URL del marketplace.
- **Lentes faltantes**: inmobiliaria (admin ve cortes de SUS asesores — hoy owner-only) + partner/licencia (k≥5 solo agregados).
- **GET /api/dev/market/consulta**: corte libre con lente dev (la lente existe sin consumidor).
- **Smoke-tests HTTP** de los 4 endpoints F4 (401/403/owner-scope/rate-limit) con TestClient.
- **Espejo de zona en panel colonia** del marketplace (gancho para llenar los 4 campos al llegar del mapa).
- **describeFilters compartido**: deduplicar SaveSearchModal/CompradorSavedSearches/_describe_filters en un solo helper.

## F6 (2026-07-06) — diferidos conscientes
Shipped: lente partner + publicar corte (🌐) + /api/v1/cuts/{slug} + scopes en keys + suscripción auto-emite key. Diferidos:
- **Metering→Stripe**: cost_usd_cents=0 hardcodeado (public_api_auth.py:179) + cron rollup mensual api_call_logs → invoice item (Stripe engine solo cobra flat).
- **/api/v1/market/cube**: wrap del licensable del Hub con re-gate K=5 (hoy solo superadmin lo ve; bundle $120k sin endpoint).
- **/api/v1/zones/{id}/indices**: bundle indices_dmx_suite ($80k) sin endpoint v1 (motor dmx_indices listo, es wrapper).
- **Seed derrota a has_real_sales**: bundles auto-marcados sellable con datos demo (data_doctrine.py:30 — marcar seeds source:'seed' y excluir).
- **IAB público sin gate ≥3 devs** (dmx_indices.py:104 — extraer devs_por_col a helper compartido).
- **Digest semanal partner**: segmento 'partner' en newsletter_pulse + bloque 'tu corte esta semana' (delta 7d de cube_corte_snapshots).
- **Historia retro de demanda** para cortes solo-colonia (dmx_market_snapshots, etiquetada 'solo demanda, retroactiva').
