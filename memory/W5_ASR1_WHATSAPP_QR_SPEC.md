# W5.ASR.1 · WhatsApp QR + Inbox · Spec canónico

**Versión**: 1.0 · 2026-05-19
**Status**: ⬜ pending build · spec aprobada founder
**Horas estimadas**: 60h (build) + 2h (founder ops VPS/proxy setup)
**Quién shipped**: emergent (UI-heavy 4 pages + drag inbox) o Claude Code (backend Node.js side-car · TBD)
**Bloqueador histórico**: VPS Hostinger pending (founder ops)
**Spec basada en**: análisis profundo GoGHL.ai 2026-05-19 + decisión founder rationale

---

## 1. Resumen ejecutivo

Conectar el WhatsApp personal del asesor inmobiliario a DMX vía QR scan (no API oficial Meta) · para:
1. Capturar leads inbound automático en CRM DMX (W4.6 lead_nurture chain)
2. Atlax (NO ChatGPT) responde inteligente con contexto real estate MX (Zone Score · DRPI · live_pulse · external_insights · etc)
3. Asesor mantiene SU número personal · cualquier mensaje · cualquier horario · sin templates rígidos
4. Cierre conversacional sales · días/semanas · no limitado a ventana 24h Cloud API

**Diferenciador vs GoGHL:** Atlax tiene contexto profundo real estate CDMX (Zone Score · DRPI · BANXICO · Live Pulse) que GoGHL con ChatGPT genérico NO tiene. DMX NO compite con GoGHL · usa misma arquitectura técnica para caso de uso específico real estate MX.

---

## 2. Por qué QR y NO Cloud API · decisión founder explícita

| Limitación Cloud API Meta | Por qué bloquea sales real estate |
|---|---|
| Ventana servicio 24h · pasada ventana solo templates pre-aprobadas | Real estate cycle = días/semanas · follow-ups libres son CORE |
| Templates rígidas · solo variables `{{ }}` | Asesor necesita copy improvisado · personalizado · spontaneous |
| Aprobación templates 1-3 días · puede rechazarse | Bloquea agilidad sales · mata creatividad |
| Costo $0.02-0.04 USD/msg outbound | Per asesor real ~$6 USD/mes (manejable) pero acumula |
| Número dedicado · requiere Meta verification | UX friction · asesor quiere SU número personal |

**Founder rationale (2026-05-19):** "Asesor inmobiliario necesita libertad total · contenido único por lead · momento libre · canal natural. La ventana 24h Meta mata el flujo conversacional sales DMX."

**Trade-off aceptado:** zona gris TOS Meta (no ilegal MX · solo viola contrato) a cambio de UX/business model óptimo. Mitigaciones técnicas reducen riesgo a nivel manejable (GoGHL opera con 15K usuarios activos · ergo Meta tolera escala razonable).

---

## 3. Arquitectura técnica

### 3.1 Stack

| Capa | Tecnología | Razón |
|---|---|---|
| WhatsApp engine | **Baileys** (TypeScript · libsignal protocol) | Más estable que whatsapp-web.js · maintained 2026 · TypeScript-native |
| Runtime sidecar | Node.js 20 LTS + PM2 process manager | Persistent connection · multi-process · auto-restart |
| Host | **VPS Hostinger** (KVM 4 CPU · 8GB RAM · 200GB SSD) | Founder ya tiene Hostinger · single instance soporta ~200-500 sesiones concurrentes |
| Proxy | **Bright Data Residential** pool MX (rotating sticky session) | IPs residenciales mexicanas · evita detección data-center · enterprise pricing $2-3/GB |
| Persistencia sesiones | MongoDB collection `whatsapp_sessions` + filesystem `/var/dmx/wa-sessions/<user_id>/` | Auth tokens survive restart · multi-user isolation |
| Bridge backend | FastAPI proxea Node.js sidecar via localhost:3001 HTTP | DMX backend (Python) sigue siendo entry único · Node.js solo side-car |
| Eventos realtime | Server-Sent Events (SSE) backend → frontend | Realtime inbox sin WebSocket complexity |
| Media storage | Cloudflare R2 (reusa Z.1 asset_library · bucket dmx-studio-assets) | Imágenes · videos · PDFs in/out · public URL via R2 dev domain |
| Audit log | audit_immutable_engine W5.11 SHA-256 chain | Mensajes/eventos críticos · compliance trail |

### 3.2 Topología

```
[Asesor móvil WhatsApp] ←→ [WhatsApp servers Meta]
                                ↕ (QR pairing · proxy MX)
                          [Bright Data proxy pool MX]
                                ↕
                          [VPS Hostinger]
                            ├── Node.js Baileys (port 3001)
                            ├── PM2 process manager
                            └── Sesiones persistidas
                                ↕ (HTTP localhost · webhook)
                          [DMX Backend FastAPI]
                            ├── routes/whatsapp.py
                            ├── whatsapp_qr_engine.py
                            ├── Atlax dispatch (asistente_engine.py)
                            ├── W4.6 lead_journey_engine
                            └── W5.11 audit_immutable
                                ↕
                          [DMX Frontend React]
                            └── /portal/whatsapp inbox UI
```

---

## 4. Schema MongoDB

### 4.1 `whatsapp_sessions`
```
{
  user_id, tenant_id, phone_number, session_status (pending_scan|connected|disconnected|banned),
  baileys_session_path (filesystem ref), proxy_id (Bright Data ref · sticky),
  qr_code_data_url (base64 · solo durante pairing), qr_expires_at,
  connected_at, last_seen_at, disconnect_reason,
  warmup_phase (1-4 · día 1-30 = phase 1 light · luego escala),
  message_count_today, message_count_total,
  created_at, updated_at
}
```

### 4.2 `whatsapp_messages`
```
{
  id, user_id, conversation_id, direction (inbound|outbound),
  remote_jid (WhatsApp ID del lead), remote_name (cache),
  message_type (text|image|video|audio|document|location|template),
  content_text, media_r2_key (si aplica), reply_to_message_id,
  status (sent|delivered|read|failed), error_msg,
  atlax_generated (bool · si Atlax generó la respuesta),
  lead_id (FK a W4.6 leads · si linkado),
  created_at
}
```

### 4.3 `whatsapp_conversations`
```
{
  id, user_id, remote_jid, remote_name, remote_phone,
  lead_id (W4.6), disc_profile_inferred, intent_tags[],
  last_message_at, last_message_preview, unread_count,
  status (active|archived|blocked), labels[],
  created_at
}
```

---

## 5. Endpoints backend

### 5.1 Sesión / pairing (asesor lado portal)
- `POST /api/whatsapp/session/initiate` (T2+) · genera QR code · retorna data_url base64
- `GET /api/whatsapp/session/status` (T2+) · poll status pending→connected
- `POST /api/whatsapp/session/disconnect` (T2+) · cierra sesión voluntaria
- `POST /api/whatsapp/session/reconnect` (T2+) · re-scan post-disconnect

### 5.2 Inbox / conversaciones
- `GET /api/whatsapp/conversations?status=&limit=&skip=` (T2+) · lista con paginación
- `GET /api/whatsapp/conversation/:id` (T2+) · detalle + últimos N mensajes
- `GET /api/whatsapp/conversation/:id/messages?limit=&before=` (T2+) · scroll up history
- `POST /api/whatsapp/conversation/:id/archive` · archiva
- `POST /api/whatsapp/conversation/:id/labels` · add/remove labels

### 5.3 Send messages
- `POST /api/whatsapp/send/text` (T2+) · {to, text, atlax_assisted (bool)}
- `POST /api/whatsapp/send/media` (T2+) · {to, media_r2_key, caption} (foto/video/PDF/audio)
- `POST /api/whatsapp/send/template-quickreply` (T2+) · quick reply DMX (visita · precio · tour · brochure)

### 5.4 Atlax integration
- Webhook interno (Node.js → backend): `POST /internal/whatsapp/inbound` · trigger Atlax dispatch
- Atlax decide: responder automático · o pasar a asesor (UI inbox)
- Asesor puede override · marcar "Atlax responde por mí" toggle per conversation

### 5.5 Realtime SSE
- `GET /api/whatsapp/events?last_event_id=` (T2+ SSE stream) · push mensajes nuevos · status changes
- Frontend mantiene EventSource · re-connects auto

### 5.6 Admin / superadmin
- `GET /api/superadmin/whatsapp/sessions` · monitor todas las sesiones · status · health
- `GET /api/superadmin/whatsapp/banneo-alerts` · cuentas detectadas banned recientes
- `GET /api/superadmin/whatsapp/proxy-stats` · uso Bright Data · GB/día · alertas

---

## 6. Frontend UI · 4 pantallas

### 6.1 Onboarding wizard `/portal/whatsapp/onboarding`
- Step 1: explicación valor · screenshot mockup · "Tu WhatsApp + IA Atlax"
- Step 2: warning gris TOS (consent + checkbox "Entiendo riesgos")
- Step 3: QR code grande (auto-refresh cada 30s)
- Step 4: instrucciones móvil "WhatsApp → Configuración → Dispositivos vinculados → Escanear código"
- Step 5: status realtime: Esperando → Conectando → Conectado ✓
- Step 6: tutorial 60s primeras acciones

### 6.2 Inbox `/portal/whatsapp` (vista principal · estilo WhatsApp Web)
- Layout 30/70: sidebar conversaciones | conversation view
- Sidebar conversations: foto + nombre + last_message_preview + timestamp + unread badge + DISC badge
- Search bar top · filtros: All · Unread · Lead nuevo · Atlax-handled · Manual
- Conversation view:
  - Bubbles (verde outbound · blanco inbound · timestamps · checks ✓✓)
  - Atlax-generated tag (small badge) si aplica
  - Input bar: texto + 📎 (R2 media picker) + quick replies dropdown + Atlax toggle
  - Quick replies DMX-specific: "Agendar visita" · "Más info" · "Precio" · "Tour 3DGS" · "Brochure" · "Compartir landing" (link Z.8)
- Right panel collapsible: lead profile (W4.6 data · DISC · Zone Score relevante · property history)

### 6.3 Settings `/portal/whatsapp/settings`
- Status: Connected/Disconnected (badge color)
- Phone number conectado
- Last activity
- Warmup phase indicator (Día X/30 · escala progresiva)
- Botón "Reconectar (re-scan QR)"
- Botón "Desconectar"
- Toggle "Atlax responde automático" (default ON)
- Configuración respuesta automática: horario activo (default 24/7) · días excepción
- Templates personalizados quick replies (asesor customiza)

### 6.4 Superadmin dashboard `/superadmin/whatsapp-monitor`
- Sección Inteligencia (post-W4.15++ aurora · color morado)
- Stats: sesiones activas · mensajes/día agregado · proxy GB usado · cuentas en warmup · alertas banneo
- Lista sesiones · filtros · acción "Force disconnect" si riesgo detectado
- Gráficos: mensajes/hora · tasa banneo · churn sesiones

---

## 7. Integraciones DMX existentes (esto es el diferenciador)

### 7.1 Atlax dispatch automático
Cuando llega mensaje WhatsApp inbound:
1. `whatsapp_qr_engine.py` recibe webhook Node.js sidecar
2. Llama `asistente_engine.dispatch_atlax(message_text, context={lead_id, conversation_history, disc_profile, user_zones})`
3. Atlax accede a sus 23 tools:
   - Zone Score (W3)
   - DRPI rankings (W5.4)
   - Live Pulse signals (W5.5)
   - External Insights BANXICO/OECD (W5.20)
   - Property data (developments collection)
   - Battle Card (W5.23)
   - Etc
4. Atlax retorna respuesta contextual con citas a fuentes
5. Backend envía vía Node.js sidecar → Baileys → WhatsApp Meta
6. Mensaje aparece en inbox asesor (etiqueta "Atlax respondió")
7. Asesor puede override · editar · agregar follow-up

### 7.2 W4.6 Lead Nurture chain
- Lead nuevo (número desconocido) → auto-create lead en `db.leads` con `source=whatsapp_inbound`
- DISC inferencer W4.6 Y.3D corre sobre primer mensaje → asigna DISC profile
- Si lead responde tarde (>24h sin respuesta) → lead_nurture cron envía follow-up vía mismo WhatsApp QR (libre · sin template)
- Si silencio 7d → mensaje "¿sigues interesado?"
- Si silencio 30d → marcar lead frío · stop sequence

### 7.3 Z.1 Asset Library
- Asesor desde inbox click 📎 → modal R2 picker con sus assets
- Selecciona foto/video/PDF/3DGS scan → envía vía WhatsApp
- Reusa `studio_asset_library.py` upload/list helpers

### 7.4 Z.8 Landing Pages
- Quick reply "Compartir landing" → genera link `/landing/:slug` del development relevante
- Click counter en landing W5.25 widget_embed_analytics tracking
- Lead form en landing alimenta misma conversation WhatsApp (cross-channel)

### 7.5 W5.16 Social Cards
- Quick reply "Tarjeta visual" → genera OG card del development vía W5.16 social_cards endpoint
- Mejor que foto cruda · branded · gradient DMX · texto integrado

### 7.6 Z.2 Carruseles
- Quick reply "Enviar carrusel" → genera carrusel auto vía Z.2 con datos del development + DISC del lead
- Carrusel personalizado · brand kit aplicado · 5 ratios

---

## 8. Estrategia anti-banneo (técnicas reales · sin números inventados)

### 8.1 Proxy MX residencial pool (CRÍTICO)
- Cada sesión sale por IP MX residencial Bright Data
- Sticky session: misma IP mantiene la sesión durante su lifetime
- Si banneo IP detectado · marca IP como `quarantined` en pool · rotación
- Sin proxy = banneo casi garantizado a escala

### 8.2 Warmup gradual (CRÍTICO)
- Día 1-7: máximo 50 mensajes/día outbound recomendado (NO impuesto · solo warning UI)
- Día 8-14: hasta 150/día
- Día 15-30: hasta 300/día
- Día 30+: sin limitación recomendada
- Asesor recibe notificación "Estás en warmup · día X · recomendación max Y msgs hoy"
- Es **recomendación NO impuesta** por DMX (founder decisión 2026-05-19)

### 8.3 Atlax respuestas únicas (NO spintax artificial)
- Cada respuesta Atlax es única por contexto (lead · zona · timing · property mentioned · etc)
- Meta detecta patrones repetidos → Atlax inherently genera distinto
- NO necesitamos spintax engine adicional (ahorro 8-10h dev)

### 8.4 Horarios libres (sin restricciones DMX-side)
- Asesor decide horario · DMX NO impone 9-9
- Atlax respeta horario configurado per asesor (default 24/7 activo)

### 8.5 Sin límites artificiales DMX-side
- Volumen máximo decide asesor según su operación
- Solo warning UI si excede patrón sospechoso (1000+ outbound en 1h)
- NO bloqueo automático DMX (frustración asesor > posible banneo Meta)

### 8.6 Reputación cuenta (preserve real usage)
- Cuentas WhatsApp con uso personal previo (años · contactos · grupos) son MÁS robustas
- Cuentas nuevas creadas solo para spam son banneadas rápido
- Recomendación onboarding: "Usa tu WhatsApp personal real · no crees uno nuevo solo para DMX"

### 8.7 Monitoring + alerts proactivos
- Si sesión desconecta abrupto · alerta inmediata user "Re-escanea"
- Si tasa de banneos cluster detectada (>5 sesiones DMX banneadas <24h) · pause onboarding nuevo · investigar
- Audit log mensajes para compliance LFPDPPP (no contenido full · metadata + opt-in usuario)

---

## 9. Costos infraestructura (data real con disclaimers)

### 9.1 Per asesor escalable

| Item | Costo/asesor/mes |
|---|---|
| Bandwidth proxy Bright Data (~30MB/asesor · enterprise rate $2-3/GB) | $0.06-0.09 |
| VPS Hostinger prorrateado (100 sesiones · $15 VPS) | $0.15 |
| MongoDB Atlas prorrateado | $0.01 |
| Stripe/payment fees · marketing · soporte | (no incluido infra · es CAC) |
| **Total infra DMX per asesor** | **$0.22-0.25 USD/mes** |

⚠️ **Disclaimer:** Bright Data enterprise pricing requiere negociación · $2-3/GB es estimación basada en GoGHL inferencia · puede variar.

### 9.2 Escala 100K asesores

| Recurso | $/mes |
|---|---|
| VPS Hostinger cluster (10 servers × 10K sesiones each · $15 c/u) | $150-500 |
| Bright Data proxy enterprise (3 TB/mes bandwidth) | $6,000-9,000 |
| MongoDB Atlas dedicated tier | $200-500 |
| Monitoring · backups · CDN | $100-200 |
| **Total infra 100K usuarios** | **$6,450-10,200/mes** |

### 9.3 Revenue model

| Opción | Pricing | Margen |
|---|---|---|
| **Incluido en Pro $149/mes** (recommended) | $0 cargo extra | Costo $0.22 vs $149 · 99.85% margen |
| Addon "WhatsApp Connect" $29/mes opcional | $29 USD | 99.2% margen |

Recomendación: **incluir en Pro tier** · usar como retention hook · no nickel-and-dime.

---

## 10. Roadmap build · 10 sub-chunks (60h)

| Sub | Qué hace | h |
|---|---|---|
| **A** | VPS Hostinger setup + Node.js Baileys service base + PM2 + firewall + TLS · founder ops asistido | 6 |
| **B** | Auth/QR flow + session persistence MongoDB + multi-user isolation filesystem | 6 |
| **C** | Bright Data proxy integration + sticky session per WA · rotation logic · pool MX | 4 |
| **D** | Inbound webhook + lead auto-capture W4.6 + **Atlax dispatch automático** | 10 |
| **E** | Outbound API · text/media · warmup recommendations · timing humanizado | 6 |
| **F** | Frontend inbox UI estilo WhatsApp Web · realtime SSE · responsive | 12 |
| **G** | Onboarding QR wizard + reconnect flow + status indicators + warmup UI | 4 |
| **H** | **Quick replies DMX-specific** (visita · precio · tour 3DGS · brochure · landing Z.8 · social cards W5.16) + integración Z.1 R2 media | 5 |
| **I** | Monitoring · disconnect alerts · banneo detection · proxy health · churn signals · audit log | 4 |
| **J** | Polish · edge cases · docs founder ops VPS/Bright Data setup · LFPDPPP compliance toggle | 3 |
| **Total** | | **60h** |

---

## 11. Riesgos honestos (sin endulzar)

| Riesgo | Severidad | Mitigación |
|---|---|---|
| **Cluster banneo Meta** (detecta patrón cross-DMX · banea lote 1000+ cuentas) | 🔴 ALTA | Proxy MX residencial · respuestas únicas Atlax · warmup · monitoring proactivo · pero NUNCA cero |
| Bright Data corta servicio · sube pricing dramatic | 🟡 MEDIA | Backup proxies (SOAX · Smartproxy · IPRoyal) · contratos anuales |
| Baileys library deprecation Meta cambia protocolo WhatsApp Web | 🟡 MEDIA | Library activamente mantenida · histórico 2-3 cambios/año · plan B: switch a alternativa |
| Compliance LFPDPPP México (datos personales conversaciones) | 🟡 MEDIA | NO guardar contenido full (solo metadata) o opt-in explícito user · audit trail W5.11 |
| Sesión desconecta cada ~14d si móvil offline | 🟢 BAJA | Notificación re-scan · auto-reconnect intentos |
| Asesor expone sus contactos personales a DMX (privacy) | 🟢 BAJA | Onboarding consent claro · DMX no extrae lista contactos · solo conversaciones activas |
| Founder ops setup VPS/Bright Data sin experiencia | 🟢 BAJA | Documentar paso-a-paso · setup asistido durante build |

---

## 12. Decisión founder canónica (timestamp 2026-05-19)

**Founder explícito:**
> "No quiero Cloud API. La ventana 24h y los templates pre-aprobados rompen el flujo conversacional sales real estate. Acepto el riesgo gris TOS Meta a cambio de UX/business model óptimo. Replicar arquitectura GoGHL pero tropicalizar a DMX con Atlax como diferenciador principal."

**Implicaciones:**
- W5.10 Social/Ads bloqueado Meta App Review · sigue pending · NO se cancela
- Esta spec NO reemplaza W5.10 · es módulo complementario
- En el futuro · si Meta endurece TOS o cluster banneo masivo · DMX puede pivotar a Cloud API (con costos $6/asesor/mes manejables) · pero NO ahora

---

## 13. Métricas de éxito (post-launch)

| Métrica | Target 6 meses |
|---|---|
| Asesores con WhatsApp conectado | >70% activos |
| Tasa banneo mensual cuentas | <2% |
| Tiempo respuesta Atlax (auto) | <5s p95 |
| Lead capture vía WhatsApp inbound | >30% del total |
| Satisfacción asesor (NPS feature) | >40 |
| Costo infra per asesor | <$0.30/mes |
| Uptime sesiones | >97% |

---

## 14. Cross-references

- **Memoria origen:** chat 2026-05-19 análisis profundo GoGHL.ai + founder rationale
- **Bloqueado por:** VPS Hostinger founder ops pending (mencionado MEMORY.md `W5.ASR.1 WhatsApp QR + Inbox · 40-50h · BLOQUEADO VPS Hostinger`)
- **Reusa:** W4.4 Atlax engine · W4.6 lead_journey + DISC inferencer · Z.1 asset_library R2 · Z.2 carruseles · Z.8 landings · W5.11 audit_chain · W5.16 social_cards · W5.25 widget_embed pattern
- **Spec previa estimaba:** 40-50h · esta v1 corrige a 60h (más fidelidad arquitectura real + integraciones DMX completas)
- **Pricing tier:** incluido Pro $149/mes (no addon · retention hook)

---

## 15. Próximos pasos accionables

| # | Quién | Acción |
|---|---|---|
| 1 | Founder ops | Contratar VPS Hostinger Premium ($15/mes · KVM 4 CPU · 8GB RAM) · 30 min |
| 2 | Founder ops | Sign up Bright Data · plan Pay-as-you-go inicial ($50-100 trial) · activar Mexico residential pool · 20 min |
| 3 | Founder | Pasarme credenciales (VPS IP + SSH key + Bright Data API key + Customer ID) · meterlas en `.env` · 5 min |
| 4 | Build agent (TBD emergent/Claude Code) | Ejecutar 10 sub-chunks · 60h · cherry-pick + audit + merge protocol |
| 5 | Founder | Smoke test · escanear QR con un asesor demo · validar Atlax dispatch + inbox UI · 1h |
| 6 | Roll-out | Primeros 10 asesores beta → 100 → 1K · monitoring cluster banneo · ajustar |
