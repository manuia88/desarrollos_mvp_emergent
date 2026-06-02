# Catálogo Quirúrgico — Campaña completa del Módulo Asesor (2026-06)
Registro exhaustivo: **77 commits**, cada hallazgo, fix, decisión y atasco. Fuente: git log + auditorías.
Compañero del playbook de proceso (`MODULE_HARDENING_PLAYBOOK.md`).

═══════════════════════════════════════════════════════════════════
## FASE 0 · REDISEÑO UI — Board de Leads (B7) · ~10 iteraciones
═══════════════════════════════════════════════════════════════════
- Línea de búsqueda enriquecida (recámaras·zona) + badge de score sin encimarse con el pin.
- Inteligencia de pipeline en columnas + cerrar panel FOCO + demo recámaras.
- Barra de segmentos+precio · specs con iconos · `$` junto al título · temp emoji en acción.
- Segmentos incisivos + filtros Precio/Zona dropdown.
- **Filtros: 3 reintentos** (una línea nowrap → 2 líneas 5 pos/5 neg → panel en flujo no-flotante)
  porque los dropdowns Precio/Zona **se encimaban** (founder: "tercera vez, hazlo bien").
- Forma de pago: Contado / Propio+Crédito / +Infonavit-o-Fovissste + tipo crédito + plazo numérico.
- Filtro **Precio en pesos MXN** con signo `$`, separadores y **multi-rango** (OR entre rangos).
- Tarjetas de **altura uniforme** (filas de altura fija · que no se corten palabras ni nombres).

## FASE 0b · Ficha / Modelo de gusto (B5.4) · 4 commits
- "Qué le gusta" **por-lead** en la ficha (cuartos/características/zona/presupuesto inferidos de 👍/👎).
- Renombrado: "Modo Tinder" → **"Galería Personalizada"** (corrección del founder).
- Panel de gusto: botón ✕ + título/subtítulo que aclaran utilidad.
- **Bug UI:** modal "Agregar propiedad" abría como hoja inferior sin opciones → centrado + demo con mensaje claro.

═══════════════════════════════════════════════════════════════════
## FASE 1 · AUDITORÍA DE ARQUITECTURA (commit 489ff6c2)
═══════════════════════════════════════════════════════════════════
Hallazgos (workflow multi-agente): **DOS universos de leads** (db.leads vs asesor_contactos
unidos solo por JOIN frágil de email) · **8 cables ROTOS**: landing→asesor sin puente · DISC
muerto · citas_booked=0 · battle card mal · comisión al default · getBuyerScore ruta inexistente
(404 silencioso) · identidad lead sin teléfono · hilo de actividad omitía tareas/citas. Plan
Etapa 0-6 trazado. Docs actualizados (WAVE_PROGRESS + ROADMAP + BACKLOG).

═══════════════════════════════════════════════════════════════════
## FASE 2 · CABLEADO E0-E6 · 16 commits (cada cable conectado)
═══════════════════════════════════════════════════════════════════
- **E0 (fixes aislados):** citas_booked incluye estados español (gerente ya no ve 0) · battle
  card cuenta leads (era ISO-string vs datetime) · comisión cae a inmobiliaria_dev_partnerships.
- **E0.1+E0.5:** `services/buyer_identity.py` resolvedor canónico de comprador (email+teléfono) ·
  enchufado en list_contactos + ficha/intel · **nuevo GET /api/asesor/lead/{id}/buyer-score** ·
  getBuyerScore FE ya no apunta a ruta 404.
- **E0.6:** DISC/tono vivo (disc_profiles.predominant_type → fallback tier) · dejó de leer campos
  muertos y de forzar un 'S' falso.
- **E0.7a:** regla de asignación → lead marketplace público va a inmobiliaria DMX (NO se reparte).
- **E0.7:** seed Livoo Bienes Raíces system-default (Manuel=Gerente, Claudia=Asesor+receptora, sin contraseñas).
- **E0.7b:** `services/lead_bridge.py` puente leads→asesor_contactos (idempotente por source_lead_id,
  dedup vs alta manual, candado user_id real, FAIL-OPEN) · enganchado en /api/cita + /api/leads/public.
- **E0.8:** `services/lead_activity.py` hilo canónico (lead_events) · record_activity + read_lead_events.
- **E1.1:** `services/lead_segments.py` 11 segmentos server-side (tier+etapa+recencia real) · foco rojo compuesto.
- **E1.2:** board V2 usa c.segments del servidor (fallback demo) · preserva 11 chips del founder.
- **E2.1:** captura rápida del perfil de compra en ficha (chips forma pago + plazo → guardan en búsqueda).
- **E2.2a:** auto-extract del perfil desde WhatsApp (extract_buyer_profile) → pre-llena SOLO campos vacíos.
- **E2.2b:** gusto en la tarjeta del board (taste_line, altura fija, fallback "sin señal").
- **E3.1:** agenda unificada (citas + tareas en una lista con filtro/completar inline).
- **E3:** Actividad completa (hilo + conversaciones WhatsApp + swipes 👍/👎).
- **E4:** Cmd+J copiloto consciente del CRM (incluye asesor_contactos, antes ciego a su libreta).
- **E5:** tablero del gerente (AsesorEquipo) · des-ocultar SuperadminCopilot · `demand_engine` real
  (reemplaza heatmap random) · `close_probability_tuning` que APRENDE pesos de cierres reales (cron diario).
- **E6:** botón "Ejecutar" por-agente corre SOLO ese agente · quita intel.enrichment muerto · link Galería expira 90d.

═══════════════════════════════════════════════════════════════════
## FASE 3 · AUDITORÍAS DE PRODUCCIÓN · 5 RONDAS (34 frentes)
═══════════════════════════════════════════════════════════════════
**Ronda 1 (13 blockers 🔴 + ~15 🟡):** wa-template sin auth filtra PII · outbound-claim cross-tenant ·
insights/daily-feed leen PII de cualquier lead · Atlax 56 tools sin allow-list + identidad del JSON LLM ·
salt LFPDPPP en el bundle · sin rate-limit públicos · /leads/public mass-assignment asesor_id ·
close_probability_tuning INERTE · demanda NaN · CERO índices CRM · build_buyer_index escanea todo ·
created_at mixto. 🟡: team-metrics cross-tenant · buyer-score fallback sin scope · Fernet débil ·
tokens en logs · prompt-injection en argumentario · pixel XSS · Livoo seed duplica · record_activity sin dedup.
**Ronda 2:** Setup Livoo NO funciona en deploy fresco (seed no setea users.role/tenant_id · ruteo asigna
inm_user_id no user_id real · backfill_owner CÓDIGO MUERTO) · **CI ROJO** (mi E3 rompió test_asesor_overview
4→9 sources) · WhatsApp envía FALSO-éxito (tier off → {ok:queued} pero no manda) · webhook Meta sin firma.
**Ronda 3-4:** familias de bugs (enum mismatch ~16 · races ~28) · raíz: sin modelo canónico de lead /
8 puertas de creación · is_within_budget FAIL-OPEN (63 importers) · sin error boundary · colecciones sin TTL.
**Ronda 5 (8 frentes) + Sentry:** 336 copias de _now()/_iso() · 4 nombres de owner · 4 vocabularios de stage ·
god files (advisor.py 3646 líneas) · sin api-client FE · audit_log+audit_logs duplicado · Sentry: datetime
no-serializable (4 endpoints) · UserOut.get · KG ruido · ScoreOut tipo · free_audit event-loop · replays 80% presupuesto.
**Hallazgo URGENTE:** 2 dumps de ~25 secretos en texto plano en el working tree (gitignored, no en historial).

═══════════════════════════════════════════════════════════════════
## FASE 4 · REPARACIONES · pasos 1-4b + lotes A-H · 14 commits
═══════════════════════════════════════════════════════════════════
- **paso 1 (670a41bf):** borrar 2 dumps de secretos · register allowlist 400 · is_within_budget + studio_video FAIL-CLOSED.
- **paso 2 (0a9c2dc3):** familias Sentry (datetime→ISO whatsapp.create_template · free_audit event-loop · ScoreOut
  len no lista · KG before_send filtro · replays 0%+PII mask) · register→400+test (9 casos) · CI verde (overview 9 sources).
- **dominio (8e2df3c0):** desarrollosmx.com→.io (16 refs / 12 archivos).
- **paso 3 (7f31230f):** 18 índices asesor_* (asesor_indexes.py) · status_v2 único + backfill_status_v2.
- **paso 4 (da8c80ac):** CAS doble-XP · compensación cita huérfana · idempotencia conversación (índice único parcial).
- **paso 4b (b989c7f9):** dedup duro leads activos (campo `activo` + índice único parcial + reconcile_lead_activo).
- **Batch A (c66cc0e1):** 8 candados IDOR (wa-template auth · insights gate · daily-feed scope · buyer-score scope ·
  outbound_claim CAS+tenant · bulk_re_route tenant · /leads/public valida asesor_id · team-metrics+timeseries scope · visit-briefing fail-open).
- **Batch B (eb11408b):** Atlax PUBLIC_TOOLS allow-list (30) bloquea las 26 privilegiadas en _exec_tool.
- **Batch C (2884b78e):** rate_limit.py + en /leads/public · endorsements · landing · swipe-cita.
- **Batch D (f451c594):** CORS env-driven · demo accounts solo DEV_MODE · warning ADMIN_PASSWORD/Fernet.
- **Batch E (af171b88):** pixel sanitizer (iframe src + data:text/html) · argumentario-rag delimita campos del lead.
- **Batch F (4473719b):** React error boundary global → reporta Sentry + fallback es-MX.
- **Batch G (dd81c21f):** audit_log de dinero + mirror del lead → log.error visible en Sentry.
- **Batch H (e13b812b):** salt LFPDPPP server-only (private_beta_engine) fuera del bundle.

## FASE 5 · campo inmobiliaria + contacto gated + auto-reparable + regresiones
- **contacto gated + auto-reparable (13e42930):** perfil público oculta tel/email → revela al dejar datos · mirror_pending+retry.
- **auditoría final · 2 regresiones propias (307713c1):** dedup falso-bloqueaba solo-email/teléfono (norm "" → ausente) ·
  compensación cita borraba contacto manual → solo desvincula · + _resolve_org cross-tenant · cross-sell IDOR · activo en cierre.
- **campo inmobiliaria ÚNICO (0425bdf6):** resolve_user_inmobiliaria + backfill + outbound/ownership filtran inmobiliaria real.
- **detalles (8da2c973):** XP no se pierde (xp_pending+reconcile) · prompt Atlax alcance público · webhook cross-partner · cita rate-limit.

═══════════════════════════════════════════════════════════════════
## FASE 6 · QA · 7 olas · 7 BUGS LATENTES REALES ENCONTRADOS
═══════════════════════════════════════════════════════════════════
1033 unit + 212 escenarios. Bugs que el QA destapó (escondidos por except silenciosos / solo bajo carga/ataque):
1. `logging` sin importar en advisor.py → NameError en 5 except.
2. `emit_ml_event` args posicionales (firma keyword-only) → evento ML de status de dinero NUNCA se guardaba.
3. cita/b13 sin status_v2 → invisibles a smart lists.
4. move-column (kanban) no seteaba `activo` al cerrar → bloqueaba re-alta.
5. cross_sell_engine partner["type"] sin guard (6 sitios) → 500 en 2 endpoints (barrido de 474 rutas).
6. cross_sell buyer por {"id"} (debe user_id) + b13 sin length-caps.
7. resolve_house_public_receiver caía al id de internal_user sin activar → lead a id no-usuario → NUNCA a Mis Leads.
Olas: qa_sim(45) · qa_sim2(17 concurrencia/escala/integridad) · qa_load(2000 req conc) · qa_redteam(22/22, 0 vuln) ·
qa_sim3(barrido 474 rutas, 0 500) · qa_destructive(22/22 chaos) · qa_journey_full(26/27 día completo, scorecard).

═══════════════════════════════════════════════════════════════════
## DECISIONES ARQUITECTÓNICAS CLAVE (rulings del founder/master-dev)
═══════════════════════════════════════════════════════════════════
- Theming fuente única (.portal-asesor + tokens asesor-aurora · candado check-asesor-theme.sh) · superadmin oscuro NO se toca.
- Pipelines NO se fusionan (3 colecciones, se unifica VISTA no data) · vínculo dev_org_id/project_id intacto.
- emergent RETIRADO · Claude Code construye todo · NO reorganizar carpetas (churn sin valor).
- Atomicidad SIN transacciones (Mongo standalone) → CAS/índice único/compensación.
- NO fusionar vocabularios etapa/status V1 (refactor mayor de board+embudo, alto riesgo, bajo valor sin lanzar) → DIFERIDO.
- Construir para el estado final HOY (stubs que se autollenan) · auto-reparable > alertas (founder no las lee).
- Rol asesor_admin de Manuel = setup manual (NO auto-set, riesgo de demote a superadmin).

═══════════════════════════════════════════════════════════════════
## DÓNDE NOS ATORAMOS / QUÉ TUVIMOS QUE CAMBIAR
═══════════════════════════════════════════════════════════════════
- Filtros Precio/Zona: 3 reintentos por encimado de dropdowns (flotante→panel en flujo).
- Hallazgos de auditoría STALE: muchos ya estaban arreglados → hubo que VERIFICAR código actual (Sentry, anonymized_id, auth_router, Field, PDF float).
- `$nin` no expresable en partialFilterExpression → necesitamos campo derivado `activo`.
- App no bootea local por rutas /app hardcodeadas → redirigir 11 envs storage→/tmp.
- Artefactos del arnés confundidos con bugs (cookies de register, datos viejos, dedup cross-corrida, new_status inválido, Atlax gated-off, regex con letras) → higiene de arnés.
- El **fork de datos** (tenant_id vs dev_org_id vs inmobiliaria_id; owner/asesor_id/assigned_to; status/status_v2/etapa) fue la RAÍZ que reapareció en outbound, ownership, dedup, smart-lists → debió mapearse PRIMERO.
- AskUserQuestion descartado 2× por el founder → esperar, no asumir.
- Reverso del founder en filtros (1 línea → 2 líneas) → adaptarse.
