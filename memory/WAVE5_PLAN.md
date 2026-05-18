# Wave 5 H2 — Plan Integrado Canónico

**Última actualización**: 2026-05-16 (founder validó orden · arranca W5.1 AVM ML)

**Documento canónico** que consolida:
1. Los 22 batches W5 originales (recuperados desde jsonl sesión `b5ec2643`)
2. Los 6 batches asesor redesign (W5.ASR.0-5 · síntesis 10 CRMs · Top 5 features)
3. Pipeline asesor 7+2 etapas (vs 19 GHL · founder validó simplificación)
4. Z-index tokens sistémicos (cleanup pre-redesign en W5.ASR.0)
5. Cross-portal impact (developer/superadmin/comprador) por feature
6. Lead sources social media (FB Lead Ads W5 · IG W5/6 · TikTok W7)

---

## 0 · Pre-batch · Operativo founder (paralelo · día 0)

| Acción | Owner | ETA |
|---|---|---|
| Iniciar trámite Meta App Review (Facebook Business Verification + permisos WhatsApp QR + FB Lead Ads) | Founder ops | 2-4 sem |
| Upgrade Apify FREE → STARTER $49/mo (desbloquea W5.4/5.5/5.9) | Founder ops | Antes de arrancar W5.4 |
| Confirmar disponibilidad WA QR vía Baileys o whatsapp-web.js (decisión provider) | Founder + Claude | Día 0 W5.ASR.1 |

---

## 1 · Wave 5 — Orden de ejecución consolidado

### 1.1 Pre-redesign cleanup (W5.ASR.0)

| Batch | Tema | Horas | Owner |
|---|---|---|---|
| **W5.ASR.0** | Cleanup pre-batch:<br>· Z-index design tokens CSS (`--z-base/dropdown/sticky/modal/drawer/toast/tour/tour-tip/modal-critical/a11y`)<br>· Sweep 93 ocurrencias hardcoded → tokens<br>· Merge `frontend/src/pages/advisor/` + `pages/asesor/` (eliminar split)<br>· Fix pipeline guard-rails en `backend/routes/dev_batch4_2.py` (hard-rules antes UI nueva)<br>· Trigger Meta App Review (founder ops paralelo) | 5-7 | Claude Code |

### 1.2 Patrón STUB MODE (founder decision 2026-05-16)

Todos los batches "bloqueados" (Meta App Review · Apify upgrade · OAuth pendientes) **SE CONSTRUYEN AHORA en modo STUB**. Arquitectura completa + UI funcional + stubs en lugar de API real. Cuando founder paga/recibe approval, flip env var = activo. Cero rework.

Pattern probado en W4.18.1 Apify Trends (STUB MODE shipped · espera upgrade $49/mo).

### 1.3 Checklist canónico (único · refleja avance real)

| # | Batch | Status | SHA / Notas |
|---|---|---|---|
| **W5.1** | AVM ML productionization | ✅ | `f8834a4`+`8f52419` (26h) |
| **W5.2** | Zone Score desagregado | ✅ | `e36fb9f` (17h) |
| **W5.3** | Forecast multi-horizonte ARIMA | ✅ | P1 `5425023` + P2A `f8834a4` + P2B `e633f73` (44h) |
| **W5.4** | Buyer Score · motor 7D + asesor + hooks | ✅ STUB | merge `7c02d1f` (origen `6e1bf21`) · 23h · Apify STUB determinista |
| **W5.5** | Live Pulse | ✅ | P1 Backend `5fed918` + P2 UI superadmin 4 tabs + widgets + aurora fix `d9d538e` (27h total · STUB Apify trend_velocity · cron default weekly · escalable via env var cuando readiness ≥61) |
| **W5.6** | Scenario Storyteller · narrativa multi-módulo | ✅ | merge `fb3caa5` (origen `8cb2ef0`) · ~16h (cierre ciclo · NO aislado) |
| ~~**W5.7**~~ | SOC franquicia | ➡️ W6 | Movido founder 2026-05-16 |
| ~~**W5.8**~~ | Construction Quality Index | ➡️ W6 | Movido founder 2026-05-17 · ~25h |
| **W5.9** | Climate Migration | ⬜ STUB | Apify fallback · ~25h |
| **W5.10** | Social/Ads Multi-tenant + IA | ⬜ STUB | 233h · Meta OAuth stub · activa cuando App Review |
| **W5.11** | Entity Resolution + Governance | ✅ | P1 engine+audit + P2 UI superadmin `c10f63e` + P3 dispute resolution `6be6798` + aurora audit fix `0d92469` (36h total) · P4 form+WA+CRM ya estaba shipped en B4.1 2026-05-02 (POST /api/cita completo) |
| **W5.12** | Knowledge Graph completo | ✅ | P1 Backend `bb49837` + P2 UI superadmin `babacae` + P3 consumers `aa60f3f` + templates fix `32ceab9` (60h total · 14 templates · 5 consumers integrados · cron daily 02/03/04 UTC · cero crash si KG down) |
| ~~**W5.13**~~ | Integrations expand | ➡️ W6 | Movido founder 2026-05-16 |
| ~~**W5.14**~~ | Reviews residentes | ➡️ W6 | Movido founder 2026-05-16 |
| **W5.15** | FSD + Accuracy dashboard | ⬜ | ~25h · revisar solape W5.1 Sub-B |
| **W5.16** | Marketing distribution (MCP) | ⬜ | ~10h |
| **W5.17** | Virtual staging IA | ⬜ | 8h |
| **W5.18** | Dubai full (Phase 11) | ⏸ | 38h · expansión H2 fase 2 (decisión separada) |
| **W5.19** | Probability UX (Kalshi) | ⬜ | 6h |
| **W5.20-21** | Insights Layer Wiki + público | ⬜ | 41h |
| **W5.22+** | Phase Z DMX Studio Marketing | ⬜ | 224h |
| **W5.23** | Dev Battle Card | ⬜ | 12h |
| **W5.ASR.0** | Cleanup pre-batch | ✅ | C1 `f5af028` (z-index 254→tokens) + C2 `ab2cb4f` (advisor→asesor) + C3 `0ad997e` (pipeline guard) — 2026-05-16 |
| **W5.ASR.1** | WhatsApp QR + Inbox unificado | ⬜ STUB | 40-50h · Baileys local + UI completa · activa OAuth FB cuando approve |
| **W5.ASR.2** | Pipeline 7+2 etapas hard-rules | ✅ | P1 `701ead1` + P2 `127af26` (38h) |
| **W5.ASR.3** | Smart Lists + reportes asesor + broker + auto-nurture cron | ✅ | P1 `4d09599` + P2 `e402f78` (28h) |
| **W5.ASR.4** | CMA visual + microsite subdomain | ✅ | P1 `0c7b1a7` + P2 `73ba7dc` (32h) · DNS wildcard founder ops pendiente |
| **W5.ASR.5** | Lead auto-capture STUB | ✅ | P1 `9dd9cce` + P2 `9af5aef` (28h) |

### 1.4 Orden sugerido próximos batches

1. **W5.ASR.1** WhatsApp QR STUB (40-50h) ← próximo
2. W5.11 Entity Resolution + Governance (~30h) ← próximo
7. W5.11 Entity Resolution + Governance (~30h)
8. W5.12 Knowledge Graph (~35h)
9. W5.5 Live Pulse STUB (~25h)
10. W5.9 Climate Migration STUB (~25h)
11. W5.15 FSD + Accuracy (~25h)
12. W5.17 Virtual staging (8h)
13. W5.19 Probability UX (6h)
14. W5.23 Dev Battle Card (12h)
15. W5.16 Marketing distribution MCP (~10h)
16. W5.10 Social/Ads STUB (233h)
17. W5.20-21 Insights Layer (41h)
18. W5.22+ Phase Z Studio Marketing (224h)

### 1.5 Total W5

| Bloque | Horas |
|---|---|
| Shipped | 131 (W5.1+W5.2+W5.3+W5.ASR.0+W5.6+W5.4) |
| En proceso | 0 |
| Restante | ~483-547 |
| **Total W5 ajustado** | **~625-689** |

Buildables AHORA (sin bloqueo): **22 de 26 batches** · solo W5.18 Dubai realmente diferido.

---

## 2 · Decisiones founder

| # | Decisión | Resolución |
|---|---|---|
| 1 | ¿Cuál batch primero? | ✅ W5.1 AVM ML SHIPPED 2026-05-16 emergent preview |
| 2 | ¿Mover W5.7 + W5.13 + W5.14 a W6? | ✅ Confirmado founder 2026-05-16 · movidos |
| 3 | ¿Phase Z (224h) sigue en W5? | Sí (W5.22+ ya en plan) |
| 4 | ¿Cuándo Meta App Review? | ✅ Iniciado founder ops 2026-05-16 · ETA 2-4 sem |
| 5 | ¿Cuándo upgrade Apify $49/mo? | ✅ Diferido hasta completar build (founder 2026-05-16) |
| 6 | Próximo batch post-W5.1 | Pendiente decidir · candidatos W5.2 (no bloqueado · ~15-20h) o W5.6 Scenario Storyteller |

---

## 3 · Pipeline asesor 7+2 etapas (sub-spec W5.ASR.2)

**Reducción**: 19 GHL → 7 activas + 2 paralelas. Cada transición con hard-rule (fix bug founder "1-click sin validación").

### 7 etapas activas

| # | Etapa | Entrada | Hard-rule salida | Modelos AI que tocan |
|---|---|---|---|---|
| 1 | **Lead nuevo** | Auto-capture portal/email/FB Ads/web | Asesor escribe 1ª vez | Trust Score (compute) · DISC (parse 1er msg) · Smart Match |
| 2 | **Contactado** | Sale de 1 | Lead respondió + budget+timeline declarados | DISC update · Plan Venta IA sugiere respuestas |
| 3 | **Calificado** | Budget/timeline OK | Cita propuesta y aceptada | Smart Match propone props · Risk Score |
| 4 | **Visita** | Cita confirmada | Visita realizada (asesor marca outcome) | Visit Auto-Prep 7 fuentes |
| 5 | **Negociación** | Oferta enviada | Oferta aceptada por ambas partes | DRPI · AVM (W5.1) · CMA |
| 6 | **Cierre** | Apartado firmado | Notaría/escritura completada | Documents (W7) · Trust Score actualiza |
| 7 | **Vendido** | Operación cerrada | Terminal (no más transiciones) | ELO asesor · comisiones |

### 2 paralelas

| Estado | Trigger | Comportamiento |
|---|---|---|
| 🟡 **Nurture** | Lead sin actividad 30 días | Workflow auto re-engagement (depende W6 workflow builder) |
| 🔴 **Perdido** | Asesor marca con razón estructurada | Terminal con causa (no comprador · no presupuesto · competencia · etc) |

### Hard-rules de transición (anti-bug founder)

| De → A | Validación obligatoria |
|---|---|
| 1 → 2 | Asesor escribió 1ª vez (mensaje en thread) |
| 2 → 3 | Budget declarado + timeline declarado en notes |
| 3 → 4 | Cita registrada en calendar + lead confirmó |
| 4 → 5 | Outcome de visita marcado (interés/no/follow-up) |
| 5 → 6 | Apartado documentado (monto + fecha) |
| 6 → 7 | Notaría completada (referencia escritura) |

---

## 4 · Z-index tokens sistémicos (sub-spec W5.ASR.0)

**Auditoría 2026-05-15**: 93 ocurrencias hardcoded · 0 tokens · caos.

### Tokens propuestos (CSS variables en `frontend/src/index.css`)

| Token | Valor | Uso |
|---|---|---|
| `--z-base` | 1 | normal flow |
| `--z-dropdown` | 100 | popovers · menús contextuales |
| `--z-sticky` | 200 | banners sticky tope |
| `--z-modal` | 1000 | modales estándar |
| `--z-drawer` | 1100 | drawers laterales |
| `--z-toast` | 2000 | toasts/notifications |
| `--z-tour` | 5000 | Joyride overlay (post-fix · era 9000) |
| `--z-tour-tip` | 5100 | Joyride tooltip |
| `--z-modal-critical` | 9000 | wizards 3D · presentaciones |
| `--z-a11y` | 10000 | skip links · alerts crit |

### Sweep target (W5.ASR.0)

Reemplazar 93 ocurrencias hardcoded en:
- `frontend/src/pages/developer/*` (30)
- `frontend/src/pages/superadmin/*` (53)
- `frontend/src/pages/advisor/+asesor/*` (8)
- `frontend/src/pages/comprador/*` (2)

---

## 5 · Cross-portal impact (qué cambia en cada portal por feature)

| Feature | Developer | Superadmin | Comprador |
|---|---|---|---|
| **W5.ASR.1 WA QR + Inbox** | Inbox broker manager (`InmobiliariaLeads.js` + `DesarrolladorCRM.js`) ve threads de sus asesores · reasigna | Health monitor `SuperadminWhatsApp.js` (ya existe) ext con QR sessions + WA-web heartbeat · audit LFPDPPP retention · provider toggle Twilio/Baileys | `CompradorChat.js` (polling 30s) reusa misma thread store · buyer ve avatar asesor + última hora · bidireccional |
| **W5.ASR.2 Pipeline 7+2** | Manager view cross-asesor (`AsesoresMetrics.js` ext con pipeline rollup) · Smart Lists broker-level | Pipeline templates default per-tier en `SuperadminTenants.js` · validación hard-rules per-tenant config | Stage "Visita" → notif en `CompradorDashboard.js` (W4.17 notifications_engine cubre) |
| **W5.ASR.3 Smart Lists + reportes** | Reportes broker `MetricasEquipo.js` + cross-asesor | Reportes agregados en `SuperadminCommercial.js` | No-op directo |
| **W5.ASR.4 CMA + Share + Microsite** | CMA reusable a nivel proyecto (`DesarrolladorPricingLab.js` ya tiene DRPI) · share-link analytics en `tracking_links.py` · reusa `hedonic_regression_engine` | Plantillas CMA + dominio asesor `{slug}.asesores.desarrollosmx.io` gestionado en Tenants · DNS automation → W6 · anti-abuse rate-limit | **Microsite ES vista buyer-side** · landing público sin auth `/a/{asesor-slug}` con properties + CMA + form lead · reusa `AsesoresLanding.js` pattern |
| **W5.ASR.5 Lead capture + FB Ads** | FB Lead Ads del developer → routea al asesor del developer vía `SmartRoutingEngine` (ya existe) · tab "Fuentes conectadas" en `DesarrolladorConfiguracion.js` | OAuth secrets vault + rate-limit per tenant + parser library central + cost tracking en `SuperadminAiCost.js` · página `SuperadminLeadSources.js` ext | UTM/source en buyer profile · LFPDPPP banner "captado vía FB" en `CompradorPrivacy.js` |

---

## 6 · Lead sources social media (alcance W5.ASR.5 + diferidos)

| Fuente | Mecanismo | Wave | Riesgo |
|---|---|---|---|
| **Facebook Lead Ads** | Meta Lead Ads webhook (OAuth FB page · mismo flujo que WA QR) | W5.ASR.5 | Meta App Review 2-4 sem |
| **Instagram Lead Ads + DM** | Meta Conversations API (instala junto a FB) | W5/W6 | Comparte OAuth |
| **TikTok Lead Generation** | TikTok for Business API | W7 | Sin Lead Ads oficial MX maduro |
| **Inmuebles24/Lamudi email** | Email alias parser (ej. `leads@asesor-slug.dmx.io`) | W5.ASR.5 | — |
| **Landing propia** | Form → `landings.py` (ya existe) | ✅ Producción | — |

---

## 7 · Top 5 features cross-CRM (origen W5.ASR batches)

Cada feature **activa modelos AI/ML existentes** y **no se pisa con las otras 4**.

| # | Feature | Wave | CRMs de origen | Modelos AI que activa |
|---|---|---|---|---|
| 1 | WhatsApp QR + Inbox unificado | W5.ASR.1 | Leadsales · GHL · Respond.io | DISC · Plan Venta IA · Trust Score · Smart Match |
| 2 | Workflow builder + sequences | W6.AS.1 | GHL · Respond.io · FUB | DISC (rama) · Visit Auto-Prep · Risk Score · Plan Venta IA |
| 3 | Lead auto-capture multi-fuente | W5.ASR.5 + W7 ext | EasyBroker · Wise Agent · Clay | Trust Score · Smart Match · DISC · pipeline |
| 4 | CMA + Share Link + Microsite | W5.ASR.4 + W6 ext | EasyBroker · Tokko | DRPI · AVM (W5.1) · `hedonic_regression_engine` |
| 5 | Pipeline 7+2 + Smart Lists + reportes | W5.ASR.2 + W5.ASR.3 | GHL · FUB · EasyBroker · HubSpot | ELO ranking · Trust Score · todos cruzan aquí |

**Flujo end-to-end**: Lead llega por Inmuebles24 → captura auto + enrichment **(3)** → cae en pipeline etapa 1 **(5)** → Trust+DISC computan al instante **(3+1)** → workflow dispara WA personalizado por DISC **(2+1)** → asesor responde desde inbox con sugerencia Plan Venta IA **(1)** → al avanzar a "Cita", workflow envía CMA + share link **(2+4)** → visita con Auto-Prep → cierra → pipeline mueve a "Vendido" **(5)** → reporte broker automático **(5)**.

---

## 8 · Riesgos & dependencias críticas

| # | Riesgo | Mitigación |
|---|---|---|
| 1 | Meta App Review 2-4 semanas bloquea WA QR + FB Lead Ads | Iniciar día 0 W5 (paralelo a W5.1 AVM) |
| 2 | WA QR Baileys/whatsapp-web.js ToS gris (ban riesgo) | Arquitectura provider-agnostic (Twilio prod / Baileys dev) · `whatsapp_engine` ya lo soporta |
| 3 | Split `advisor/` vs `asesor/` deuda técnica | Cleanup W5.ASR.0 antes de redesign |
| 4 | Bug pipeline "1-click sin validación" | Hard-rules W5.ASR.0 antes de UI nueva W5.ASR.2 |
| 5 | Workflow builder depende F1+F5 | Si W5.ASR.1 slip, W6 cascade |
| 6 | Custom domain microsite DNS+SSL ops-heavy | Subdomain MVP W5 · custom domain W6 |
| 7 | LFPDPPP cross-portal compliance | Banner + audit log + retention 90d en cada canal |
| 8 | Apify FREE plan limita W5.4/5.5/5.9 | Upgrade $49/mo cuando arranquen |
| 9 | TikTok Lead Ads inmaduro en MX | Diferir a W7 |
| 10 | ~60% código backend ya existe (`whatsapp_engine` · `NurtureIntelligentEngine` · `LeadJourneyTimeline` · `hedonic_regression_engine` · `landings.py` · `tracking_links.py`) | Es **conectar**, no reescribir |

---

## 9 · Roles & ownership

| Quién | Qué hace |
|---|---|
| **Founder Manuel** | Ops paralelo (Meta App Review · Apify upgrade · validación visual · decisión scope) · copy-paste prompts emergent · reporta resultados |
| **Emergent** | Construye features (BUILD only · no tests · no grep · no verify) · 80-130 líneas prompt canónico |
| **Claude Code** | Cleanup pre-batch (W5.ASR.0) · grep + tests + verify post-emergent · docs canónicos · arquitectura |

---

## 10 · Referencias

- `memory/BACKLOG_ENHANCEMENTS.md` — backlog completo con scope detallado
- `memory/WAVE_PROGRESS.md` — progreso de waves
- `memory/REDESIGN_ASESOR_FEATURES_MATRIX.md` — matriz ~95 features cross-CRM
- `memory/REDESIGN_ASESOR_BLUEPRINT.md` — síntesis 10 CRMs + propuesta UX
- `memory/feedback_emergent_prompt_template.md` — plantilla canónica prompts emergent
- `memory/feedback_zernio_decision.md` — decisión W5.10 build directo +28h

---

**Próximo paso**: arrancar W5.1 AVM ML (Hedonic público). Ver `WAVE5_PROMPT_W5.1_AVM_ML.md` para prompt emergent (build).
