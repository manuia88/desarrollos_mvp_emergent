# Asesor Module · Redesign Plan Total (2026-05-26)

**Founder approved:** rediseño completo módulo asesor · 6 fases · 16 terminales CC paralelas · ~116h trabajo · ~44h calendar · audit doble-pase post c/fase.

**Trigger:** post-W7.AS.3 cierre · founder reportó "sidebar confuso, no entiendo qué hace cada cosa, mala UX". 35 tabs visibles en sidebar actual.

**Regla canónica preservada:** NO ORPHANS (`feedback_no_orphan_features.md`). Cada terminal verifica callsite/route antes push. Audit detecta orphans como 🔴 ALTO.

**Patrón paralelismo:** validado 8 iteraciones W7.AS.3. Git worktree aislado · 1 terminal owner shared + N puros.

---

## F1 · Sidebar reorg (BLOQUEA · 1 terminal · 4h)

**Owner shared files:**
- `frontend/src/config/navByRole.js` (reorg ASESOR_NAV de 35 → 10 grupos)
- `frontend/src/components/asesor/AsesorSidebar.js` (NEW · submenús desplegables · user menu pie · búsqueda inline)
- `frontend/src/components/asesor/AsesorLayout.js` (MOD usar AsesorSidebar nuevo)

**Nuevo sidebar (10 tabs · 70% menos ruido):**
```
🏠 Inicio
👥 Mis Leads (Contactos + Búsquedas unificados)
📅 Agenda (Citas + Tareas unificados)
🏢 Inventario (Desarrollos + Captaciones + Mini Market)
💬 Conversaciones IA ▾ (Playground · Bandeja)
🤖 Automatizaciones ▾ (Workflows · Plantillas marketplace)
🎨 Studio Marketing ▾ (Brand Kit · Videos · Carruseles · Landings · 5 más)
📢 Anuncios Meta ▾ (Conectar · Campañas)
📊 Mi Performance ▾ (Comisiones · Ranking · SOC · Análisis · CMA)
─────
👤 Avatar+nombre abajo izq (Mi perfil + Configuración fuentes + Links tracking)
```

**NO toca rutas existentes** (preserva URLs). Solo reorg visual sidebar.

---

## F2 · Cycle-Closers UX (3 terminales paralelas · 18h trabajo · 6h calendar)

| Terminal | Features | Horas |
|---|---|---|
| **F2.A** | Status pills color-coded (W5.4 tier) + Inline preview hover lead + Task-based dashboard "Hoy: 3 visitas" (combina Citas+Leads+Workflow) | 8h |
| **F2.B** | Bulk actions leads (W6.AS.1 wire) + Smart suggestions "3 leads sin contacto 7d → WhatsApp" + Pinned items VIP | 6h |
| **F2.C** | Custom dashboard widgets + Notification prefs (notifications_engine) + Recent items últimos 5 | 4h |

**Cycle-closers:** todos consumen ≥1 feature shipped W5/W6/W7. NO orphans.

---

## F3 · ML/IA Core (3 terminales paralelas · 24h trabajo · 10h calendar)

| Terminal | Features | Horas | Cierra ciclos |
|---|---|---|---|
| **F3.A** ⭐ | **Inline AI Atlax embedded** · botón flotante per página · contextual help via 54 tools · streaming responses | 8h | 54 tools Atlax + asistente + RAG W7.AS.3 |
| **F3.B** | Auto-categorización lead en captura · LLM hot/warm/cold al ingest · dispara workflow | 6h | W7.AS.1 Lead Enrichment + W5.4 Buyer Score + W6.AS.1 |
| **F3.C** | Smart notifications priorización (ordena por conversion probability) + Drift-aware UI banner amarillo si quality cae | 10h | W5.4 + notifications_engine + W5.5 + W7.AS.3 drift_detector |

---

## F4 · ML/IA Advanced (3 terminales paralelas · 28h trabajo · 10h calendar)

| Terminal | Features | Horas | Cierra ciclos |
|---|---|---|---|
| **F4.A** | Predictive Cmd+K con embeddings · búsqueda semántica intent | 6h | W5.12 KG + RAG |
| **F4.B** | Next-best-action engine · "este lead 3d sin respuesta → enviar WA plantilla X" | 10h | W7.AS.1 + Workflow + Plan Venta IA + W6.4 Marketplace |
| **F4.C** | Auto-summarize conversación + Time-of-day intelligent scheduling + Sentiment-aware composer | 12h | W7.AS.3 engine + W5.5 signals + confidence_score |

---

## F5 · Design System Polish (3 terminales paralelas · 24h trabajo · 8h calendar)

| Terminal | Features | Horas |
|---|---|---|
| **F5.A** | Tokens unificados (spacing 4/8/12/16/24/32 · type scale 5 tamaños · color tokens semánticos · icon system 16/20/24) | 8h |
| **F5.B** | Skeleton loaders + Optimistic UI + Toast notifications + Smooth transitions (Framer Motion) + Branded loading/404 | 8h |
| **F5.C** | Card system unificado · Status pills extend · Voice/Tone strings es-MX humanizados ("Algo falló, ¿le echamos otra?") | 8h |

---

## F6 · Add-on Layer (3 terminales paralelas · 18h trabajo · 6h calendar)

| Terminal | Features | Horas |
|---|---|---|
| **F6.A** | Tooltips contextuales c/tab + Contextual help (?) per página + In-app changelog + Pro-tips inline | 6h |
| **F6.B** | Onboarding tour primera vez (Shepherd.js) + AI-powered empty states ("¿prospecto por ti?") + Density toggle compact/comfortable | 6h |
| **F6.C** | A11y (focus visible + contraste WCAG AA + reduce motion) + Mobile responsive (sidebar collapse + bottom nav) | 6h |

---

## Total · Cycle-closers logrados

| Cycle-closer | Features que conecta |
|---|---|
| Atlax 54 tools | Inline AI (F3.A) + Predictive Cmd+K (F4.A) + Voice-to-action (futuro) |
| W7.AS.1 Lead Enrichment | Auto-cat (F3.B) + Next-best-action (F4.B) + Time-of-day (F4.C) |
| W5.4 Buyer Score | Status pills (F2.A) + Auto-cat (F3.B) + Smart notifs (F3.C) |
| W6.AS.1 Workflow | Bulk actions (F2.B) + Auto-cat dispara (F3.B) + Next-best (F4.B) |
| W7.AS.3 confidence | Drift banner (F3.C) + Sentiment composer (F4.C) |
| W7.AS.3 drift_detector | Drift-aware UI (F3.C) |
| W5.12 Knowledge Graph | Predictive Cmd+K (F4.A) + Atlax RAG context |
| W6.4 Marketplace plantillas | Next-best-action sugiere plantilla (F4.B) |
| Plan Venta IA | Next-best-action (F4.B) + AI empty states (F6.B) |
| notifications_engine | Smart notifs (F3.C) + Notification prefs (F2.C) |
| W5.5 Live Pulse | Smart notifs (F3.C) + Time-of-day (F4.C) |
| W5.25 Widget Analytics | Predictive prefetch (F4.x si añade) |

**TOTAL:** 12 cycle-closers · 21 features que multiplican valor de 19 features W7.AS.3 + features shipped W5/W6.

---

## Decisiones canónicas Master Dev

| Decisión | Razón |
|---|---|
| F1 en serie · F2-F6 paralelas | F1 owner shared files (sidebar) · resto puede correr en paralelo después |
| 1 terminal owner shared por fase | Patrón W7.AS.3 validado · evita race condition |
| Audit forense doble-pase post c/fase | 6 audits × 30 min = 3h extra · obligatorio "0 backlog" |
| Founder ruling 0 backlog | Findings se arreglan en mismo round · NO se difieren |
| Feature flags para inestables | Permite merge sin exposer a usuarios si algo sale mal |
| NO tocar rutas existentes | URLs preservadas · solo reorg visual + nuevas features |

---

## Cronograma estimado · 5 días calendar

| Día | Mañana | Tarde | Output |
|---|---|---|---|
| 1 | F1 sidebar (4h) | F2 3 terminales arranca | Sidebar nuevo + F2 work in progress |
| 1 noche | — | F2 merge + audit doble-pase | F2 cerrado |
| 2 | F3 ML/IA core (3T · 10h) | — | 3 features ML/IA |
| 2 noche | — | F3 merge + audit | F3 cerrado |
| 3 | F4 ML/IA advanced (3T · 10h) | — | 5 features ML/IA |
| 3 noche | — | F4 merge + audit | F4 cerrado |
| 4 | F5 design polish (3T · 8h) | F5 merge + audit | F5 cerrado |
| 5 | F6 add-ons (3T · 6h) | F6 merge + audit + docs canónicos | **REDESIGN COMPLETO** |

---

## Próximo paso

F1 prompt listo en chat. Founder pega en 1 terminal CC. Espera SHA + smoke + audit · luego arranca F2 con 3 prompts paralelos.
