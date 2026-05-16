# Rediseño Asesor · Blueprint Maestro DMX

**Versión**: 1.0 · 2026-05-15
**Estado**: 🟡 propuesta · pre-validación founder
**Base**: análisis exhaustivo de 10 CRMs líderes (Wise Agent · Follow Up Boss · Tokko Broker · EasyBroker · Respond.io · GoHighLevel · Leadsales · HubSpot · Clay · Brand24)
**Contexto**: ciclo de venta inmobiliaria CDMX 3-8 meses · asesor 70% del tiempo en celular · WhatsApp canal #1 con 95% penetración

---

## 1 · Filosofía del rediseño

**5 principios no negociables:**

1. **Mobile-first absoluto** · cada pantalla diseñada para iPhone con pulgar primero · desktop es bonus
2. **WhatsApp como ciudadano de primera clase** · NO add-on · inbox unificado nativo con WABA oficial
3. **IA integrada en cada flujo** · no como módulo separado · invisible al asesor
4. **Pipeline automático no manual** · cambios de etapa son consecuencia de acciones · no clicks adicionales
5. **Cada dato accionable** · todo número/lista en el dashboard lleva a una acción de 1 tap

---

## 2 · Estado actual vs propuesta

### Sidebar HOY (17 tabs · saturado)

```
PRINCIPAL:    Inicio · Mi perfil · Mini Market · Desarrollos · Contactos · Búsquedas · Citas
OPERACIÓN:    Captaciones · Tareas · Operaciones · Leads Dev
PERFORMANCE:  Comisiones · Ranking · Studio · Briefings · Tráfico+Clima · Links tracking
```

### Sidebar PROPUESTO (8 tabs · -53%)

```
🏠 HOY              · daily briefing + tareas + acciones urgentes
💬 CONVERSACIONES   · inbox unificado WhatsApp + Email + SMS (NUEVO)
👥 LEADS            · pipeline kanban + Smart Lists + perfil 360°
🏢 DESARROLLOS      · aliados + inventario (ya consolidado)
🏘️ MIS PROPIEDADES  · captaciones con wizard + CMA + tracking (ex-Captaciones)
💼 OPERACIONES      · cierres + visitas + comisiones (consolidado)
📢 CRECIMIENTO      · mini-market + sequences + leads-dev + forms
🤖 ATLAX            · AI hub (plan venta IA + briefing + studio + AI bot 24/7)
```

**Mi perfil y Ranking** → menú de usuario (no sidebar) · son configuración/gamificación, no flujo diario.

---

## 3 · Síntesis de hallazgos · 10 CRMs analizados

### Tabla maestra · features observadas vs DMX actual

| Feature | Wise | FUB | Tokko | EB | Respond | GHL | LS | HS | Clay | B24 | DMX hoy | Gap |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **WhatsApp inbox unificado** | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | 🔴 CRÍTICO |
| **WhatsApp QR / Business API** | ❌ | ❌ | ✅ QR | ✅ WABA | ✅ WABA | ✅ WABA | ✅ QR | ✅ WABA | ❌ | ❌ | ❌ | 🔴 CRÍTICO |
| **Pipeline kanban c/ validations** | ❌ | ✅ | ⚠️ | ⚠️ | ✅ | ✅ | ⚠️ | ✅ | ❌ | ❌ | ⚠️ sin validations | 🟠 ALTO |
| **Smart Lists / filtros guardados** | ✅ | ✅ | ❌ | ⚠️ | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ | ❌ | 🟠 ALTO |
| **Lead profile con timeline unificado** | ⚠️ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ❌ | ❌ | ⚠️ parcial | 🟠 ALTO |
| **Buyer Profile estructurado** | ❌ | ❌ | ❌ | ✅ | ⚠️ | ⚠️ | ❌ | ✅ | ❌ | ❌ | ⚠️ | 🟠 ALTO |
| **Templates / Quick Replies** | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ⚠️ Plan venta IA | 🟡 MEDIO |
| **Tareas con notif push** | ⚠️ | ⚠️ | ❌ | ⚠️ iCal | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ | ⚠️ | 🟠 ALTO |
| **CMA automático** | ❌ | ❌ | ❌ | ✅✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ DRPI separado | 🟡 MEDIO |
| **Wizard captación propiedad** | ❌ | ❌ | ⚠️ | ⚠️ form largo | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ form kanban | 🟠 ALTO |
| **Documents tracking** | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ | ❌ | ✅ | ❌ | ❌ | ⚠️ Studio | 🟡 MEDIO |
| **Auto-agendado público (Calendly)** | ❌ | ❌ | ⚠️ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | 🟡 MEDIO |
| **Sequences multi-canal** | ✅ Drip | ✅ Action Plan | ❌ | ❌ | ✅ Workflow | ✅✅ | ❌ | ✅ | ❌ | ❌ | ❌ | 🟠 ALTO |
| **AI Bot 24/7 conversation** | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ AI Agent | ❌ | ✅ Breeze | ❌ | ❌ | ⚠️ Atlax | 🟡 MEDIO |
| **Reporte automático al propietario** | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 🟡 MEDIO |
| **Forms / Landing capture** | ✅ WP | ❌ | ❌ | ❌ | ✅ | ✅✅ | ❌ | ✅ | ❌ | ❌ | ⚠️ landing públicas | 🟡 MEDIO |
| **Lead scoring híbrido** | ⚠️ Rank | ⚠️ Stage | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ | ✅✅ | ⚠️ | ⚠️ Trust+Smart | 🟡 MEDIO |
| **Bolsa MLS / Co-broker** | ❌ | ❌ | ✅ Red | ✅✅ MLS | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ Aliados | 🟢 BAJO |
| **Auto-asignación leads** | ⚠️ | ✅ RR | ❌ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ❌ | ❌ | ⚠️ Smart Match | 🟡 MEDIO |
| **Custom fields configurables** | ⚠️ | ❌ | ❌ | ⚠️ | ❌ | ✅ | ❌ | ✅✅ | ❌ | ❌ | ❌ | 🟢 BAJO |
| **Brand monitoring** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅✅ | ❌ | 🟢 BAJO |
| **Reseñas integradas** | ❌ | ❌ | ⚠️ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | 🟢 BAJO |

**Leyenda:** ✅ feature completa · ⚠️ parcial · ❌ ausente

---

## 4 · Lo que DMX YA tiene que NADIE más tiene (diferenciadores)

| Feature DMX | Justificación competitiva |
|---|---|
| **Plan Venta IA con RAG + DISC** | Único CRM mexicano con coaching de venta personalizado por DISC profile del lead |
| **Visit Auto-Prep con 7 fuentes** | Brief de 1h antes de cada visita con clima · tráfico · zona · DISC · historial · comparables |
| **Smart Match Lead-to-Asesor** | Routing IA cuando developer envía lead · matchea por DISC compatibility + zona + capacity |
| **DRPI + Risk Score** | Datos macro CDMX por colonia que NINGÚN CRM tiene (índice precios diario · puntaje riesgo) |
| **Auto-Approve Engine 3-gate** | Solicitud Mini Market evalúa trust + zona + deals automáticamente |
| **ELO Ranking** | Gamificación cross-asesores estilo chess · único en sector |
| **Atlax Bubble global** | Chat AI context-aware en cualquier pantalla · memory 3-niveles |
| **Studio Wave** | Brochures + videos AI nativos · ningún competidor lo tiene integrado |
| **Briefing IE ejecutivo** | Reportes 2-3 páginas para meetings · pre-built |
| **Tráfico+Clima briefing** | Mapbox + Open-Meteo + Claude tips de conversación · único |

**Conclusión:** DMX ya está adelante en IA + datos CDMX · le falta CRM clásico bien hecho (WhatsApp + inbox + pipeline + tareas + lead profile).

---

## 5 · Top 8 features críticas que faltan (priorizadas)

### 🔴 CRÍTICAS (sin esto el CRM no funciona en MX)

**1. WhatsApp Business API + Inbox unificado**
Sin WhatsApp nativo, el asesor sigue trabajando fuera del CRM en su WA personal · CRM muere por desuso. Es el #1 absoluto.
*Implementación:* 360dialog BSP o Meta Cloud API directo + GetStream Chat (como Tokko/Leadsales) + threading + templates HSM + ventana 24h detection.

**2. Pipeline kanban con guard-rails**
Founder reportó bug: kanban actual permite mover citas/ofertas con 1 click sin validación. Implementar confirmaciones modales + hard validations (ej. ofertando→ganada requiere doc subido).

**3. Lead profile 360° con timeline unificado + Buyer Profile estructurado**
Hoy: Contactos tiene datos básicos + plan venta IA. Falta: timeline cronológico que merge WA + email + visitas + notas + cambios stage + actividad en marketplace. Y campos estructurados de comprador (presupuesto · zona · enganche · timeline · uso).

### 🟠 ALTAS (eficiencia diaria del asesor)

**4. Smart Lists guardables (filtros)**
"Hot leads sin contactar 5d" · "Recorridos próximos 7d" · "Pipeline frío" · "Leads de portal X". Sin esto el asesor se pierde en 40 leads.

**5. Tareas con push notifications + recurrencia**
Hoy tasks DMX no envía push. En ciclo 3-8 meses sin recordatorios push = leads olvidados. Recurrencia semanal para nurturing.

**6. Sequences multi-canal (WhatsApp + email)**
Cadencias automáticas: "Nuevo lead → mensaje día 0 → día 3 → día 7 → día 30". Detener automático si responde. Crítico en ciclos largos.

**7. Captaciones rediseñadas con wizard + AVM integrado**
Founder pidió este específicamente. Wizard estilo onboarding (4-5 pasos) en lugar de form kanban. AVM Hedonic auto-calcula precio sugerido con range low/mid/high + 15 comparables 1km.

### 🟡 MEDIAS (diferenciación + retención)

**8. Reporte propietario automático mensual**
Cada 1° de mes envío WhatsApp al propietario con: leads recibidos · visitas · views portal · status. EasyBroker lo tiene manual · DMX puede hacerlo automático.

---

## 6 · Propuesta de estructura nueva por tab

### TAB 1 · 🏠 HOY (Inicio rediseñado)

**Hero:** "Buenos días, {nombre}. Tienes {N} cosas urgentes hoy."

**Widgets en orden mobile-first:**
1. **🔥 Urgente (1 tap)** · leads sin contactar > 72h con botón WA directo inline
2. **📅 Citas de hoy** · con AI prep auto-generado tap-to-view
3. **💬 WhatsApp sin responder** · cuenta + lista colapsada
4. **✅ Tareas vencidas + hoy** · checkbox swipe-to-complete
5. **🎯 Tu día (Smart Match)** · top 5 acciones priorizadas por IA (ya existe)
6. **📊 KPIs semana** · 3 cards: leads activos · conv. rate · MXN pipeline

**Eliminar:** widgets vacíos · cards de "métricas" sin acción.

### TAB 2 · 💬 CONVERSACIONES (NUEVO)

**Layout mobile-first (lista → conversación → perfil):**
- Lista de conversaciones con preview · badge unread · indicator de tiempo sin respuesta
- Filtros: Todos · Mis · Sin asignar · Sin leer · Por etapa
- Conversación: burbujas estilo WA · timestamp · ticks ✓✓ · audio inline
- Quick Replies con `/` slash command y variables `{nombre}` `{precio}`
- Templates HSM aprobados por Meta cuando ventana 24h cerrada
- Auto-asignación al asesor del lead
- Botón "Convertir a Lead" si número desconocido

### TAB 3 · 👥 LEADS (Contactos+Búsquedas consolidados)

**Vistas (toggle):**
- **Kanban Pipeline** (default) · 6 etapas + descarte · drag-drop con validations
- **Lista** · tabla con columnas configurables
- **Mapa** · pins de leads por zona de interés

**Smart Lists pinned:**
- 🔥 Calientes sin contactar
- 📅 Recorridos próximos 7d
- 💬 Por responder
- ❄️ Fríos (>30d sin actividad)
- 🎯 Match con propiedad X

**Perfil 360° (al tap):**
- Header: foto · nombre · stage · score · DISC badge
- Timeline cronológico unificado (WA + email + visitas + notas + cambios stage)
- Buyer Profile estructurado (campos editables inline)
- Propiedades de interés (vinculadas)
- Plan Venta IA generable
- Acciones rápidas: WA · llamada · agendar visita · tarea

### TAB 4 · 🏢 DESARROLLOS (ya consolidado)

- Sub-tab Aliados · developers que te aprobaron
- Sub-tab Inventario · propiedades disponibles

### TAB 5 · 🏘️ MIS PROPIEDADES (Captaciones rediseñado)

**Vista lista con cards (no kanban):**
- Wizard de captación 4 pasos al click "+ Captar"
  - Paso 1: Tipo + Operación + Dirección (con autocomplete Mapbox)
  - Paso 2: Características (recámaras · baños · m² · piso)
  - Paso 3: AVM auto + ajuste manual de precio sugerido
  - Paso 4: Propietario + comisión + publicación

**Por propiedad:**
- CMA generable 1 tap con 15 comparables 1km
- Documents (escrituras · planos · brochure) con tracking de quien abrió
- Reporte mensual al propietario auto-WhatsApp
- Clientes interesados (vinculados)

### TAB 6 · 💼 OPERACIONES (consolidado)

**3 sub-tabs:**
- **Cierres** · operaciones en negociación con wizard 6 pasos (ya existe)
- **Visitas** · calendario + auto-prep IA + Google Calendar sync + link público auto-agendado
- **Comisiones** · dashboard $$$ MTD/YTD + ISR estimado + breakdown por operación

### TAB 7 · 📢 CRECIMIENTO

- **Mini Market** · solicitar acceso a developers nuevos (ya existe)
- **Leads Dev** · leads que developers envían (ya existe)
- **Forms** · landing pages capturar leads con UTM
- **Sequences** · cadencias automáticas multi-canal WA + email

### TAB 8 · 🤖 ATLAX (AI Hub)

- Plan Venta IA · ya existe
- Briefing IE · ya existe
- Tráfico+Clima · ya existe
- Studio Wave · brochures · videos · virtual staging
- **AI Bot 24/7** · NUEVO · chatbot WhatsApp que califica leads cuando asesor offline

---

## 7 · Bugs/issues actuales (founder reportó)

| # | Bug | Solución |
|---|---|---|
| 1 | Kanban sin validations · mover citas con 1 click | Agregar modal confirmación + hard min-fields gate |
| 2 | Captaciones sin AVM/CMA | Integrar AVM Hedonic existente + comparables 1km en wizard |
| 3 | Sin módulo WhatsApp QR | Construir Conversaciones tab (#1 prioridad) |
| 4 | Sidebar saturado 17 tabs | Consolidar a 8 tabs propuestos |
| 5 | Captaciones form raw sin UX | Wizard 4 pasos estilo onboarding |
| 6 | Nombres confusos (Captaciones · Argumentario) | Renombrados a "Mis Propiedades" · "Plan Venta IA" |

---

## 8 · Plan de batches priorizado (Wave 5+)

### W5.ASR.1 · CRÍTICAS WhatsApp (40-50h)
- WhatsApp Business API setup (360dialog)
- Conversaciones tab (inbox unificado)
- Threading + templates HSM + ventana 24h
- Auto-asignación al asesor del lead

### W5.ASR.2 · Pipeline + Lead Profile (35-45h)
- Pipeline kanban con validations (modal confirmación)
- Tiempo en etapa · badges alerta
- Lead Profile 360° con timeline unificado
- Buyer Profile estructurado (8 campos nuevos)

### W5.ASR.3 · HOY + Smart Lists (20-30h)
- Inicio rediseñado mobile-first
- Smart Lists con queries guardables
- Tasks con push notifications

### W5.ASR.4 · Captaciones rediseño + CMA (30-40h)
- Wizard 4 pasos
- AVM Hedonic integrado en paso 3
- CMA 1-tap con 15 comparables
- Documents tracking

### W5.ASR.5 · Sequences + Forms (25-35h)
- Sequences multi-canal WA+email
- Auto-stop on reply
- Forms con UTM tracking

### W5.ASR.6 · Reportes automáticos + AI Bot (30-40h)
- Reporte propietario auto mensual
- AI Bot 24/7 WhatsApp con Knowledge Base
- Custom fields configurables

### W5.ASR.7 · Mobile-first refactor global (40-50h)
- Refactor todas las vistas a mobile-first
- PWA installable (W5.22 ya planeado)
- Push notifications nativas

### W5.ASR.8 · Cleanup + Polish (15-25h)
- Renombrar tabs (Captaciones → Mis Propiedades)
- Consolidar sidebar 17→8
- Mover Mi perfil/Ranking a menú usuario
- Eliminar/redirigir routes viejos

**Total estimado:** 235-315h (~6-8 semanas con 1 senior · 3-4 semanas con 2)

---

## 9 · 3 cosas que DMX debe replicar SÍ o SÍ (consenso de los 10 análisis)

### #1 · WhatsApp Business API como ciudadano de primera clase
**De:** Tokko · Leadsales · Respond.io · GoHighLevel · HubSpot · EasyBroker
**Por qué:** 95% penetración WhatsApp en MX. Asesor que no responde por WA dentro del CRM = CRM muerto.
**Implementación recomendada:** 360dialog BSP ($15-50/mes/número) + GetStream Chat para mensajería real-time + Meta templates aprobados para ventana 24h.

### #2 · Pipeline visual automático con timeline unificado
**De:** Follow Up Boss · HubSpot · GoHighLevel · Respond.io
**Por qué:** Asesor con 20-40 leads no puede recordar manualmente · pipeline debe actualizarse solo por acciones (envió WA → "Contactado").
**Implementación:** Triggers PostgreSQL en messages/tasks/properties → UPDATE leads.stage_id automático. Timeline = view sobre activities table.

### #3 · IA contextual integrada en cada flujo (no como add-on)
**De:** Clay · HubSpot Breeze · GoHighLevel · Respond.io
**Por qué:** Asesor mexicano NO va a escribir prompts ni configurar workflows. Necesita IA que aparezca cuando la necesita.
**Implementación:** DMX ya tiene Atlax + Plan Venta IA + Visit Prep · falta integrar más:
- IA en el compositor de WhatsApp (sugerencias inline)
- IA en captaciones (sugiere precio + amenities desde dirección)
- IA en perfil de lead (calificación automática del lead score)

---

## 10 · 3 cosas que NINGÚN CRM analizado tiene y DMX debe construir

### Diferenciadores únicos para LATAM real estate:

**1. CMA con DRPI + datos macro CDMX**
EasyBroker tiene CMA pero con precios de publicación · NO de cierre. DMX puede tener CMA con precio de cierre real (DRPI diario) + Risk Score zona + Phase 5 Foundation (construction cost · DENUE · zone score).

**2. Asesor Performance Coach IA (post-cierre)**
Después de cada operación cerrada · IA analiza el flow completo (cuánto tardó cada etapa · qué objeciones manejó · qué emails funcionaron) y genera feedback personalizado al asesor. Ningún CRM lo tiene.

**3. Marketplace cross-org con Smart Match dual**
Tokko/EasyBroker tienen MLS pero no tienen Smart Match. DMX puede combinar bolsa de propiedades + Smart Match cross-org · asesor recibe sugerencias automáticas cuando un lead suyo matchea con propiedad de otro asesor de la red.

---

## 11 · Decisiones pendientes para founder

| # | Decisión | Opciones |
|---|---|---|
| 1 | ¿WhatsApp Business API o QR Web? | Recomendación: WABA oficial (360dialog · $15-50/mes/número · legal · sin riesgo ban) vs QR Web (gratis · risk ban Meta) |
| 2 | ¿Mantener sub-tabs Aliados/Inventario en Desarrollos? | Sí · ya validado contigo · NO tocar |
| 3 | ¿Renombrar Captaciones → Mis Propiedades? | Recomendación: SÍ · "Mis Propiedades" o "Mi Inventario" · más claro |
| 4 | ¿Eliminar Briefings/Tráfico+Clima del sidebar y meter en Atlax? | Recomendación: SÍ · son herramientas no flujos diarios |
| 5 | ¿Mover Mi Perfil + Ranking a menú usuario? | Recomendación: SÍ · son settings/gamificación |
| 6 | ¿Pipelines separados Compradores vs Vendedores? | Recomendación: SÍ · HubSpot lo tenía · etapas son distintas |
| 7 | ¿Sequences solo WhatsApp o multi-canal? | Recomendación: multi-canal · empezar WA · agregar email después |
| 8 | ¿Build AI Bot 24/7 ahora o post-MVP? | Recomendación: post-MVP · primero el inbox manual · luego automatización |

---

## 12 · Reglas de oro (NO romper)

1. **Mobile-first siempre** · cualquier feature nueva pasa por test mobile antes de aprobar
2. **WhatsApp en todos los flujos** · no hay "Mensaje" ambiguo · es WhatsApp explícito
3. **Pipeline se actualiza solo** · cero clicks manuales para cambiar stage
4. **IA invisible** · el asesor no escribe prompts · la IA aparece cuando agrega valor
5. **Cero ruido** · widgets vacíos eliminados · solo lo que aporta a la jornada del día
6. **Acción inline** · cada dato en pantalla lleva a una acción en 1 tap
7. **Backward compat** · routes viejos redirigen · no se rompen links existentes
8. **Datos del país** · CDMX-first (colonias · alcaldías · DRPI · Risk Score · DENUE)

---

## 13 · Métricas de éxito post-rediseño

| Métrica | Baseline (hoy) | Target post-rediseño |
|---|---|---|
| Tiempo respuesta primer lead (WA) | desconocido (fuera CRM) | < 5 min mediana |
| % asesores activos diarios | 30-40% | 80%+ |
| Leads gestionados por asesor | 15-20 | 30-50 (sin pérdida de calidad) |
| Conversión Lead→Visita | desconocido | tracking explícito desde día 1 |
| Tiempo en CRM mobile vs desktop | desktop dominante | 70% mobile (alineado al uso real) |
| NPS de asesores | desconocido | 50+ post-W5.ASR.8 |

---

## 14 · Inspiración por CRM (qué tomar de cada uno)

| CRM | Lo mejor que aporta · DMX debe robar esto |
|---|---|
| **Wise Agent** | Important Dates auto (cumpleaños · aniversarios) con acción WA inline |
| **Follow Up Boss** | Smart Lists pinned como pantalla de inicio · sistema de pausa de Action Plans al detectar respuesta |
| **Tokko** | Inbox WhatsApp QR · Fast Replies con variables · widget Pendientes con tiempo de inactividad |
| **EasyBroker** | CMA visual compartible · auto-asignación de leads · vistas guardadas Compradores/Vendedores |
| **Respond.io** | Lifecycle stages con inbox automático por etapa · Workflows visuales · AI Agents con knowledge base |
| **GoHighLevel** | Pipeline 100% inmobiliario con 19 etapas en español MX · workflow builder canvas |
| **Leadsales** | Programar mensaje inline · audit log historial · menú contextual mensaje (Responder/Destacar/Reenviar) |
| **HubSpot** | Pipeline kanban con probabilidades · Breeze AI con citas verificables · custom fields configurables |
| **Clay** | Columnas accionables con IA · Sculptor copiloto natural language · AI Context de negocio |
| **Brand24** | Storm Alerts configurables · referencias numéricas en informes IA |

---

## 15 · Rollback completo si rediseño falla

```bash
# Restaurar sidebar al estado actual
git checkout HEAD -- frontend/src/config/navByRole.js

# Restaurar pages individuales
git checkout HEAD -- frontend/src/pages/advisor/

# Eliminar pages nuevas si se crearon
rm frontend/src/pages/asesor/AsesorConversaciones.js
# etc.

# Resetear backend si se tocó
git checkout HEAD -- backend/routes/conversations.py
```

Riesgo bajo si cada batch es independiente · validar visual + commit local antes de push.

---

**Última actualización:** 2026-05-15
**Mantenedor:** Claude Code · founder Manuel Acosta
