# DMX Enhancements Backlog

Tracking de enhancements diferidos surgidos durante batches B14-B35. Cada item tiene origen (batch where suggested), destino propuesto (phase/batch where to ship), justificación, y costo estimado.

**Regla:** TODO enhancement que founder apruebe diferir DEBE persistirse aquí inmediatamente. No basta con decir "lo metemos en BXX" — sin entry aquí, se pierde.

---

## 🟡 ALTA PRIORIDAD (1-3 batches futuros)

### Trust Score Badge en cards marketplace
- **Origen:** B32 (Asesor Identity)
- **Destino:** B36 (Phase 13 Marketplace asesor whitelist) o sweep pre-launch
- **Qué:** Mostrar mini-badge (foto + Trust Score + DISC pill) en cada card de asesor visible en marketplace + CRM listings
- **Por qué:** Loop competitivo asesor (mejorar perfil = más leads orgánicos) + buyers filter por trust + amplifica conversion WhatsApp Business
- **Costo:** ~2h (reusa TrustScoreBadge B32 component)

### Bilateral Approval dev-side UI para Inmobiliaria-Dev partnerships
- **Origen:** B35 (Phase 18 Inmobiliaria entity)
- **Destino:** B36 (Phase 13 Marketplace whitelist — mismo pattern bilateral)
- **Qué:** Endpoint PATCH approval ya existe; falta UI en portal dev para aprobar/rechazar partnerships solicitadas por inmobiliarias
- **Por qué:** Cierra el loop bilateral cross-tenant (sin esto = unilateral, no production-safe)
- **Costo:** ~1h (UI + notification al dev_admin)

### Score de Alianza per asesor-developer
- **Origen:** B36 (Phase 13 whitelist closure)
- **Destino:** B37 (Phase 14 cross-partnerships) ó sweep post-launch
- **Qué:** Score 0-100 PER partnership específica (asesor X con dev Y), distinto del Trust Score genérico B32. Combina: deals cerrados con ese dev + response time en proyectos del dev + endorsements de clientes que cerraron con esa partnership. Visible en sidebar inventario asesor + tabla solicitudes dev.
- **Por qué:** Incentiva retention partnership (asesor mantiene buena reputación con dev específico) + dev prioriza top performers reales (no solo trust generic). Diferente de Trust Score B32 que es promedio across todos los devs.
- **Costo:** ~2h (reusa Trust Score B32 formula pattern + asesor_metrics B20 con filtro por dev_org_id + endorsements filtered)

### Smart Match B30 → conectar con B34 Lead-to-Asesor
- **Origen:** B30 + B34 (similares conceptos, diferentes scopes)
- **Destino:** Sweep optimization post-launch
- **Qué:** B30 Smart Match buyer↔colonia + B34 Smart Match Lead↔asesor → unificar bajo motor común reusable
- **Por qué:** DRY, ya hay lógica weighted scoring repetida
- **Costo:** ~2h refactor

---

## 🟢 MEDIA PRIORIDAD (Phase específica)

### Auto-WA briefing pre-visita
- **Origen:** B31 (Asesor Tools)
- **Destino:** Phase 8 WhatsApp + Coms (~15h)
- **Qué:** Cuando asesor tiene cita próxima 24h, enviar automáticamente briefing pre-visita (B33 visit_auto_prep) por WhatsApp al cliente como template "Te espero mañana en X. Lleva: ..."
- **Por qué:** Reduce no-shows ~30-40% (estimado emergent). Diferenciador vs Inmuebles24/Lamudi
- **Costo:** ~3h (cuando WhatsApp Business activo)

### Buyer DISC Inferencer
- **Origen:** B32 (clarificación founder)
- **Destino:** Phase Y.3 (Reply Classifier + Buyer DISC)
- **Qué:** AI analiza mensajes acumulados del lead (WA + chat) → infiere DISC → surface insights al asesor "lead tipo D, sé directo"
- **Por qué:** Verdadero valor vs DISC asesor (que es auto-declaración)
- **Estado:** ✅ YA documentado en PRD.md commit `2eb298e` · Phase Y.3 25h → 28h
- **Costo:** Incluido en Y.3 (~3h del total 28h)

### Reply Classifier inbound
- **Origen:** Audit Teckel AI Atlas (B26 era)
- **Destino:** Phase Y.3
- **Qué:** Clasifica intent en mensajes WA/email entrantes + auto-draft response con confidence threshold human-in-loop
- **Por qué:** Cierra el loop CRM end-to-end (Teckel diferencial real)
- **Estado:** ✅ YA documentado en PRD.md Phase Y.3
- **Costo:** Incluido en Y.3 (~5h del total 28h)

### Inmobiliaria War Room dashboard
- **Origen:** B34 (post-Phase 3 closure)
- **Destino:** Phase 13/14/18 Inmobiliaria entity (cuando se construya)
- **Qué:** Dashboard "war room" para director: forecast Claude Sonnet 30/60/90 días + anti-leakage heatmap (asesores sin Daily Feed B34 ejecutado) + Trust Score B32 promedio team + Pipeline mix por DISC
- **Por qué:** Convierte DMX en herramienta gestión vs Salesforce/HubSpot para inmobiliarias LATAM
- **Costo:** ~5h (originalmente B36 standalone)

### Copilot Agentic Actions
- **Origen:** B23 (AI Copilot lateral)
- **Destino:** Phase Y.1 Director Agent (~25h)
- **Qué:** Copilot puede ejecutar acciones (navigate, filter, etc) — no solo responder. Ej: "Llévame al CRM filtrado por leads sin contacto últimos 7 días" → estructured output `{type: 'navigate', url}` ejecutable
- **Por qué:** DAU multiplier + más sticky
- **Estado:** Documentado mentalmente en Phase Y, ahora explícito aquí
- **Costo:** Incluido en Y.1 (~3h del total 25h)

---

## 🔵 BAJA PRIORIDAD (H2 / Polish / Growth)

### Export CSV/PDF Comparables
- **Origen:** B19 (Branding 100%)
- **Destino:** Sweep pre-launch o H2 polish
- **Qué:** Botón "Descargar comparación CSV/PDF" en `/comparar` para dev/asesor compartir benchmark con inversionistas
- **Por qué:** Útil para closing presentations, reusa endpoint PDF B8
- **Costo:** ~30 min

### Widget embebible Comparador iframe
- **Origen:** B27 (Phase 1 closure)
- **Destino:** H2 backlog growth channels
- **Qué:** `<iframe src="/comparar?ids=...&embed=1">` para blogs inmobiliarios y agencias asociadas — backlinks SEO + leads attributed al embedder
- **Por qué:** Low-CAC growth channel, viral organic
- **Costo:** ~3h (modo embed sin Navbar + theming via query params + tracking source)
- **Activar cuando:** después de validar adopción interna del comparador

### Image embeddings real activation
- **Origen:** B24 image search (B25 toggle)
- **Destino:** Cuando portfolio tenga ≥50 proyectos con fotos buenas
- **Qué:** Toggle `IMAGE_EMBEDDINGS_ENABLED=true` activa cron nightly que pre-computa embeddings reales sobre fotos
- **Estado:** ✅ Pipeline + toggle ya construidos en B25 Sub-C — solo flip env var
- **Costo:** $0 código (ya hecho), solo cuando data madure

### Sparklines real price history activation
- **Origen:** B29 (Comparador Premium)
- **Destino:** Cuando proyectos tengan ≥12 meses data en `db.unit_price_history`
- **Qué:** Toggle `PRICE_HISTORY_REAL_DATA=true` activa sparklines reales en lugar de synthetic
- **Estado:** ✅ Toggle ya construido en B30 Sub-B — solo flip env var
- **Costo:** $0 código

### Wrapped scheduler staging activation
- **Origen:** B30 (Phase 2 closure)
- **Destino:** Post-launch cuando tengas users reales
- **Qué:** Activar APScheduler 1ro de mes 6am en producción para auto-generar wrapped mensual + email Resend
- **Estado:** Code listo en B30, solo necesita RESEND_API_KEY activo + bandera de activación
- **Costo:** $0 código, solo configuración cuando tengas user base

### LinkedIn OAuth real
- **Origen:** B32 (LinkedIn import manual stub)
- **Destino:** Phase 8 ó standalone post-launch
- **Qué:** Hoy es manual paste URL + form fields. Activar OAuth real con LinkedIn API requiere LinkedIn partnership program
- **Costo:** ~4h + LinkedIn partnership approval timeline
- **Bloqueador externo:** LinkedIn partnership not guaranteed

### AMPI API real verification
- **Origen:** B35 (Phase 18 Inmobiliaria)
- **Destino:** H2
- **Qué:** Hoy stub formato 8-12 alfanum + manual review. Activar AMPI API real para verificación automática de cédulas
- **Costo:** ~2h + AMPI API access negotiation
- **Bloqueador externo:** AMPI institutional access

### Microsoft OAuth Calendar
- **Origen:** B15 (stub forward-compat)
- **Destino:** Cuando founder tenga Microsoft tenant válido
- **Qué:** B15 dejó CalendarProvider abstracto + Microsoft stub. Solo activar real OAuth + flip card UI
- **Estado:** Code listo, solo falta tenant Microsoft 365
- **Costo:** $0 código, solo configuración tenant

### Mobile push notifications real
- **Origen:** F0 sweep (F0.10)
- **Destino:** F0 sweep batch (~22h)
- **Qué:** iOS APNs + Android FCM real wiring (hoy solo in-app notifications)
- **Costo:** ~2-3h (parte del F0 sweep)

### Web Push API real
- **Origen:** B23 + B14
- **Destino:** F0 sweep / Phase 8
- **Qué:** Service worker + push subscription para notifications navegador desktop
- **Costo:** ~2h

### Google Calendar bidireccional Tareas
- **Origen:** B33 (Calendar bidireccional)
- **Destino:** Sweep post-launch
- **Qué:** Hoy Calendar bidi solo para appointments. Extender a Tareas asesor (sync bidirectional con Google Tasks o Calendar tasks)
- **Costo:** ~3h

### ML Observability Feedback Acceptance Rate
- **Origen:** F0.11 + Phase Y
- **Destino:** Phase Y.5 (Agent observability)
- **Qué:** Dashboard de quien acepta/rechaza sugerencias AI (Argumentario, AI Suggestions, Daily Feed actions) + Feedback Acceptance Rate per agent
- **Estado:** Mencionado en Phase Y.5 originally
- **Costo:** Incluido en Y.5 (~3h del total 9h)

### Studio Wave 1.5 features tier
- **Origen:** Phase 6 master plan
- **Destino:** Phase 6 (~36h ya planeada)
- **Qué:** S1.2 Trim/Reorder/Transitions · S1.3 10 export presets multi-canal · Hook auto + Pacing AI + Re-edit AI
- **Costo:** Ya en Phase 6 plan

### Argumentario Feedback Loop
- **Origen:** B31 (Argumentario AI RAG)
- **Destino:** Phase Y.5 ó sweep ML training
- **Qué:** Asesor da feedback "esta respuesta funcionó" / "no funcionó" → entrenar ML para mejorar KB ranking + suggestions futuras
- **Costo:** ~3h

### Chat Attachments
- **Origen:** B29 (Chat asesor in-app)
- **Destino:** Sweep post-launch ó Phase 8
- **Qué:** Permitir attachments (fotos, PDFs) en chat in-app comprador↔asesor
- **Costo:** ~2h

### Briefing en fichas proyecto público
- **Origen:** B31 (Briefing Tráfico)
- **Destino:** Phase 1 sweep marketing OR Phase 8
- **Qué:** Cuando comprador público abre ficha proyecto, mostrar tiempo viaje + clima a esa zona desde su location (geolocation API browser)
- **Costo:** ~2h

### Bulk-upload-btn render bug fix
- **Origen:** B1 original
- **Destino:** F0 sweep / pre-launch QA
- **Qué:** Botón Bulk Upload no renderiza correctamente en alguna ruta. Diferido sweep H1.
- **Costo:** ~1h debug + fix

### Playwright auth nested routes drop
- **Origen:** Multiple batches (testing infra)
- **Destino:** Phase 20 Polish + Launch (E2E tests)
- **Qué:** Playwright auth se drop en rutas anidadas durante testing automation
- **Costo:** Incluido en Phase 20

### Asesor Wrapped + Share-link público
- **Origen:** Audit Teckel AI Atlas (skipped en Phase 3 split)
- **Destino:** Sweep growth post-launch
- **Qué:** Spotify Wrapped pero para asesor (deals cerrados · response time · NPS · ranking equipo) + share LinkedIn/WhatsApp con og:image
- **Por qué:** Asesor se vuelve marketer DMX hablando de sus achievements
- **Costo:** ~3h (reusa pattern B30 wrapped + B27 share-link)

### Asesor Coach AI proactive
- **Origen:** Audit Teckel AI Atlas
- **Destino:** Phase Y.3 Lead Sub-agent
- **Qué:** AI lateral sugiere acciones específicas: "Lead X tiene 5 días sin contacto, response rate baja, sugiero llamar próxima hora"
- **Estado:** Concepto incluido implícitamente en Phase Y.3 + B34 Daily Feed
- **Costo:** Incluido en Y.3

### Voice Calibration asesor
- **Origen:** Audit Teckel AI Atlas
- **Destino:** Phase Y.4 Adaptive features
- **Qué:** Argumentario aprende del style del asesor (top-performing emails históricos) — para emails/WA salientes
- **Estado:** Mencionado en Phase Y.4 "Caya style adaptive"
- **Costo:** Incluido en Y.4

### Mailbox Warmup + SPF/DKIM/DMARC
- **Origen:** Audit Teckel AI Atlas
- **Destino:** Defer hasta validar demanda outbound real
- **Qué:** Email deliverability infra para outbound massive
- **Costo:** ~5-8h cuando se valide demanda

### Tier "Asesor Pro" comercial
- **Origen:** Audit Teckel AI Atlas
- **Destino:** H2 commercialization
- **Qué:** Tier standalone para asesores independientes ($X/mes) con KPIs comprometidos packaging tipo Teckel
- **Costo:** Comercial, no técnico

### Plan tiers superadmin con visibility granularity (full/leads-only)
- **Origen:** B36 discussion 2026-05-06 (founder reformuló feature descartada)
- **Destino:** H2 commercialization · prerequisite para monetización subscription
- **Qué:** Superadmin (NO dev) crea planes mensuales con niveles visibility:
  - Plan básico: solo leads (asesor puede referir clientes, no ve LPs/comisiones/fotos premium)
  - Plan medio: leads + LPs públicas
  - Plan pro: acceso completo (LPs internas + comisiones + fotos premium + contacto directo dev)
- **Por qué:** Foundation para freemium + tiered pricing asesores. Sin esto, monetización solo es flat fee
- **Costo:** ~5-7h (data scoping per tier + UI superadmin admin plans + Stripe subscription wiring)
- **Dependencias:** Phase 16 BYO AI Keys + cost tracking + Stripe Connect
- **Nota:** NO confundir con feature dev approval (descartada B36) · este es nivel SUPERADMIN para gestión comercial DMX

### Feature flag toggle DISC asesor visibility
- **Origen:** B32 clarification founder
- **Destino:** Decisión post-launch UX
- **Qué:** B32 dejó DISC asesor como auto-declaración secundaria. Si después de feedback users el asesor DISC no aporta → deprecar via feature flag
- **Costo:** Cero (solo flag toggle)

---

## ✅ INCORPORADOS (referencia histórica)

Enhancements que SÍ se persistieron correctamente:

- B14 Sankey atribución diferido B14 → B20 ✅ shipped en B20
- B16 PostHog conversion funnel diferido B16 → B20 ✅ shipped en B20
- B23 Cmd+J shortcut (Cmd+/ ya tomado) → resolved en B23
- B25 Image embeddings pipeline + toggle → shipped en B25 Sub-C
- B27 Share-link comparador og:image → shipped en B27 Sub-C
- B28 Smart Match score → shipped en B30
- B29 Sparklines reales toggle → shipped en B30 Sub-B
- B33 "Tu día hoy" feed dashboard → shipped en B34 Sub-B
- B34 Lead-to-Asesor Smart Match → shipped en B34 Sub-A
