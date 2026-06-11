# Lead Registration Rules · DMX canónico

**Última actualización**: 2026-05-17 (persistidas desde sesión 25b3b744 del 2026-05-01 · referencia para W5.11 P3+P4)

**Doc canónico** que define cómo se registra un lead en DMX, cuántos brokers pueden hacerlo, qué pasa en disputa, y cómo se comunica el flujo. Estas reglas vienen del founder (Manuel) y son **inviolables** — todo cambio debe pasar por él.

---

## 0 · Regla núcleo (UPDATE 2026-05-01 L581)

> **"2+ asesores pueden registrar al mismo lead en DIFERENTES proyectos, pero solo 1 asesor puede registrar al mismo lead en el MISMO proyecto."**

**Por qué**: los clientes NO son propiedad de un asesor. Comparar entre proyectos es normal. Una política "1 lead = 1 broker global" tira el negocio.

**Quién arbitra mismo-lead+mismo-proyecto+diferente-asesor**: el **developer (dev)** según sus políticas internas. DMX NO arbitra — solo facilita la comunicación.

---

## 1 · Flow `POST /api/cita` · 6 checks en orden

| # | Check | Scope | Acción si match | Status lead resultante |
|---|---|---|---|---|
| **1** | Exact match (phone OR email) | MISMO `project_id` · status ≠ `closed` | **409 BLOCK** + Plantilla WA 2 | NO se crea |
| **2** | Similarity ≥85% (score = phone×0.5 + email×0.3 + name×0.2) | MISMO `project_id` | Crea lead + notif `developer_admin` + Plantilla 2 | `under_review` + `suspected_match_id` |
| **3** | Velocity (≥5 leads/30min mismo asesor) | Global por `asesor_id` | Crea lead + notif dev + Plantilla 2 (razón velocity) | `under_review` + `velocity_flag=true` |
| **4** | Geo mismatch (área tel vs colonia proyecto) | Informativo | NO block · solo metadata | sin cambio |
| **5** | Cross-project active follow-up | DIFERENTE proyecto · mismo `client_global_id` | Notif al asesor original SI `activity_score ≥ 1.0` | sin cambio en lead nuevo |
| **6** | Success | — | Crea lead + appointment + Resend email + .ics + Plantilla 1 | `nuevo` |

### 1.1 Anti-fraude (founder L554)

> "los asesores cambian 1 o varios dígitos del teléfono o correo. si nombre/teléfono/correo hay un 85% de coincidencia → 'Tu registro está en revisión'."

**Flag `under_review` UNIFICADO** (L561): mismo mensaje "en revisión" aplica a duplicate exacto Y match ≥85%. El founder lo prefirió así por simplicidad UX.

### 1.2 Recency-weighted activity score (Check 5)

Reemplaza la regla vieja "2 acciones/30 días":

| Antigüedad acción | Peso |
|---|---|
| ≤ 7 días | 1.0 |
| 7-14 días | 0.5 |
| 14-21 días | 0.25 |
| > 21 días | 0 |

**Activo si score ≥ 1.0**.

Cuenta: notas, WA, email, llamada, status drag, doc share, reschedule.
NO cuenta: system auto-notes.

---

## 2 · DMX como inmobiliaria semilla (L574)

> "el lead que se registra a cita SIN asesor cae a la BD directa de DMX. NO cae como lead directo de dev. Se trata como lead de inmobiliaria DMX. Es mi inmobiliaria."

**Implicación**: leads del marketplace público sin asesor asignado → entran al pool DMX y se rutean al asesor disponible vía round-robin/score.

### 2.1 IMPLEMENTADO 2026-06-11 (Tanda 30) — y reconciliación de tenant

- **El tenant real es `dmx_root`, NO `dmx_house`.** Las reglas (2026-05-17) lo nombraron `dmx_house`, pero el código vivo (`backend/routes/inmobiliaria.py` `_resolve_inmobiliaria_id`) resuelve la inmobiliaria del superadmin a **`dmx_root`**. Se alineó el pool a `dmx_root` para NO crear un tenant paralelo. **Si ves `dmx_house` en docs viejos = es `dmx_root`.**
- **Primer caso real cableado**: el comprador pide visita desde su Asistente de Compra (`buyer.request_visit` del Cerebro) → `exec_buyer_request_visit` crea el doc en `visit_requests` con `owner_org="dmx_root"`, el dev/propiedad queda como **metadato** (`about_developer_id`/`about_dev_org_id`), NUNCA como dueño.
- **Ruteo (Tanda 31-32 · ZONA → CARGA → CIERRES · founder lo aprobó "así estás bien" 2026-06-11)**: `backend/house_pool_engine.py` — `is_house_asesor_doc` (role advisor/asesor_admin + tenant None/dmx_root; `asesor_freelance`/tenant externo = NO casa). `pick_house_asesor(zone)` ordena por `(carga asc, cierres desc)` SOLO entre los que CUBREN la colonia (`asesor_profiles.colonias`); si nadie cubre → fallback a todos por carga→cierres (nunca varado). Prioridad: **1) zona que cubre · 2) menos cargado (la carga manda sobre cierres, no sobrecargar a la estrella) · 3) más cierres (`asesor_operaciones` cerradas = ranking)**. Marca `assigned_by`='zona+carga'|'carga' (visible en el tablero del superadmin). NO tope de carga (founder lo dejó así).
- **Consumo (founder eligió "los dos")**: superadmin ve todo + asigna (`/api/superadmin/inmobiliaria/leads` · página `SuperadminInmobiliariaLeads`, nav "Leads inmobiliaria"); asesor de la casa toma/acepta/devuelve (`/api/asesor/inmobiliaria/solicitudes` · página `AsesorSolicitudesVisita`, nav "Visitas de marketplace"). Vuelta al comprador: `/api/comprador/visitas` (Solicitada→Confirmada).
- **ERROR corregido**: la Tanda 29 enrutó la visita al **dev dueño de la propiedad** (`routes/dev_visit_requests.py`, tab en DesarrolladorLeads) — VIOLABA la regla inviolable §5. Borrado/revertido en Tanda 30. **NUNCA enrutar leads de marketplace al dev.**

---

## 3 · Formulario `<NewCitaModal>` · 5 secciones

```
① CLIENTE
   - nombre completo (required)
   - celular +52 default (required · 10 dígitos · validador)
   - correo (required · email format)

② CITA
   - project_id (dropdown · pre-filled si entry = página proyecto)
   - fecha (date picker · solo futuras)
   - hora (slots 30min via /availability)
   - modalidad: presencial | videollamada

③ PRESUPUESTO Y PAGO
   - range slider MXN min/max
   - checkboxes multi: recursos_propios | credito_hipotecario | infonavit | cofinavit

④ ASESOR
   - read-only (user logueado)
   - editable solo si role = admin

⑤ CONSENTIMIENTO LFPDPPP
   - checkbox required
   - link aviso privacidad
```

### 3.1 Extensión schema `leads`

```python
{
  "payment_methods": list[str],  # ["recursos_propios", "credito_hipotecario", ...]
  "lfpdppp_consent": {
    "accepted_at": datetime,
    "ip": str,        # hashed sha256 (LFPDPPP compliance)
    "user_agent": str
  },
  "presupuesto_min": int,  # MXN
  "presupuesto_max": int,  # MXN
  "client_global_id": str  # hash determinista phone+email (cross-project linking · NO blocking)
}
```

### 3.2 Dual entry

- Botón **"Agendar Cita"** en `/desarrollador/desarrollos/:slug` (contexto proyecto)
- Tab central **`/asesor/citas`** (contexto asesor multi-proyecto)

---

## 3bis · Pantallas que ve el ASESOR (verbatim founder · recuperado 2026-06-03 · el resumen las botó)

> Origen: sesión 25b3b744 (2026-05-02 L554/L561), reconfirmado 609a7747 (2026-06-03 L3667: "seguir forma A... mensaje y enlace a whatsapp que diga, ponte en contacto con el dev, para más información").

**3 resultados al enviar el registro:**

1. **ÉXITO (no había registro previo):** "Lead registrado con éxito" + **botón WhatsApp directo al dev** para confirmar la cita. WA al dev pre-llenado: *"Hola! Agendé la siguiente cita: [todo el form]. ¿Me puedes apoyar a confirmar?"*

2. **DUPLICADO EXACTO mismo proyecto → FORMA A (bloquea, NO se crea):** se muestra la tarjeta ⏳ (la misma de "en revisión", reusada a propósito por el founder) con: **"Ponte en contacto con el dev, para más información"** + **botón WhatsApp con el dev.** (Hoy el código bloquea con 409 pero le falta esta pantalla amable → pendiente cablear.)

3. **SOSPECHA (≥85% match o velocidad) → EN REVISIÓN** (`under_review`, SÍ se crea). Mockup textual founder:
```
⏳ Tu registro está en revisión
Detectamos información similar a un lead ya registrado.
El desarrollador validará en menos de 24h.
Si tienes urgencia, contacta directo:
[📱 WhatsApp con desarrollador]
```

## 3ter · Loop de confirmación al COMPRADOR (botado por el resumen)

- Al lead se le envía confirmación (WhatsApp/mail · **desde el número del asesor**) **24h antes Y 2h antes** de la cita.
- Botones: **confirmar / cancelar / reagendar** → el **CRM del asesor se actualiza en automático** (confirmar→confirmada · cancelar→cerrado_perdido · reagendar→nueva fecha). El asesor no mueve nada a mano.

## 3quater · Permiso clave (botado por el resumen)

- El **dev VE los datos reales del cliente** (el lead vive en su BD), pero **NUNCA la conversación asesor↔lead** — solo un **resumen IA + recomendaciones**. Asesor ve solo lo suyo; gerente/dev ven el agregado.

## 3-5 · Dos sistemas de ACCESO ya construidos (distintos del registro por-lead)

- **Autorización / whitelist (Phase 13 · Batch 36):** el asesor solicita acceso al **inventario de un dev** (por `dev_org_id`, no por proyecto). Dev aprueba/rechaza/revoca en `/desarrollador/solicitudes`. Datos exclusivos (comisión real, contacto dev) **scrubbed** hasta aprobar. **Auto-aprobación por Trust Score** (`auto_approve_engine`, 3 gates: enabled + trust ≥ umbral + deals en zona). Código: `advisor_whitelist.py`, `advisor_authorization.py`, `auto_approve_engine.py`, `data_scoping.py`.
- **Disputas / arbitraje (W5.11 P3):** `/desarrollador/disputas`. Rechazo → **cooldown 90 días** server-side `(asesor_id, project_id)` (CHECK 0 en `POST /api/cita`, no bypasseable). Código: `disputes.py`, `dev_batch4_1.py`.
- "se le autoriza" del founder (registro por-lead) = **primero-en-registrar** gana ese (lead+proyecto); 2°/3°/4° → arbitraje del dev. NO es la whitelist (esa es acceso a inventario).

---

## 4 · Estados del lead

### 4.1 `leads.status`

```
nuevo · under_review · contactado · calificado · cita_agendada
cerrado_ganado · cerrado_perdido
```

**`under_review`** es el estado gating de disputa (duplicate / 85% match / velocity flag).

### 4.2 `appointments.status`

```
agendada · confirmada · realizada · cancelada · no_show · reagendada
```

### 4.3 Campos auxiliares de disputa

| Campo | Tipo | Significado |
|---|---|---|
| `suspected_match_id` | ObjectId | Lead existente con el que coincide ≥85% |
| `velocity_flag` | bool | Asesor registró ≥5 leads en 30min |
| `client_global_id` | str | Hash phone+email cross-project (NO blocking) |
| `geo_metadata.mismatch` | bool | Área telefónica vs colonia proyecto no coincide |

---

## 5 · SLA disputa

**No hay timer formal en las reglas**. La disputa la resuelve el `developer_admin` via WhatsApp con el asesor.

Único SLA explícito (L561 UX): **"El desarrollador validará en menos de 24h"**.

---

## 6 · Plantillas WhatsApp (deep-link `wa.me`)

### Plantilla 1 · status `nuevo` (success)
```
Hola [Dev], acabo de agendar una cita para [Proyecto] el [Fecha] a las [Hora].
¿Podemos confirmar disponibilidad?
— [Asesor]
```

### Plantilla 2 · status `under_review` (duplicate / 85% / velocity)
```
Hola [Dev], el sistema detectó posible coincidencia con un registro previo
para el cliente [Nombre]. ¿Me confirmas si ya tienen este lead en su base?
— [Asesor]
```

### Plantilla 3 · Movement alert al asesor original (Check 5, mensaje genérico per L587)
```
🔔 [Cliente] está activo.
Otro asesor lo está atendiendo en otro proyecto.
Está comparando, cerca de decidir.
Tu ventaja: ya construiste relación.
Cierra quien suma valor cuando más importa.
Tu última actividad: hace [N] días.
```

**Reglas tone** (L587):
- NO incluir nombre del otro asesor ni proyecto específico (genérico)
- NO mencionar "los clientes no son propiedad de nadie" (founder lo descartó)

---

## 7 · Referencias

- Sesión origen: `25b3b744-fdb5-4491-93b8-4b16f4aee391.jsonl` (2026-05-01)
- Líneas clave founder: L547 (formulario), L554 (anti-dup), L561 (flag unificado), L574 (DMX semilla), L581 (regla núcleo), L587 (tone)
- Engine que ejecuta checks 1-4: `backend/entity_resolution_engine.py` (W5.11 P1)
- Audit inmutable: `backend/audit_immutable_engine.py` (W5.11 P1)
- UI dev para arbitrar: `/desarrollador/disputas` (W5.11 P3 · próximo)

---

## 8 · Reglas inviolables (NO cambiar sin founder)

1. **2+ asesores DIFERENTE proyecto = SIEMPRE permitido**
2. **2+ asesores MISMO proyecto = solo 1 gana · arbitra el dev**
3. **Match ≥85% multi-campo = `under_review`, NO block** (excepto exact match 100% mismo proyecto = 409 block)
4. **DMX NO arbitra disputas** · facilita comunicación dev↔asesor vía WA
5. **Leads sin asesor = pool DMX `dmx_house`** (no van directo a dev)
6. **Mensajes de disputa = genéricos** (sin nombrar asesor ni proyecto del otro)
