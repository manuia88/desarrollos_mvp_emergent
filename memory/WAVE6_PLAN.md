# Wave 6 H2/H3 — Plan Skeleton

**Última actualización**: 2026-05-16 (creado tras consolidar W5 integrado)

**Doc canónico** que captura batches diferidos durante el redesign asesor + originales W6 sketch.

---

## 1 · Batches derivados del redesign asesor (diferidos de W5)

| # | Tema | Horas | Origen | Dependencias |
|---|---|---|---|---|
| **W6.AS.1** | Workflow builder visual + plantillas DMX | 35-45 | Feature 2 Top 5 (GHL · Respond.io · FUB) | W5.ASR.1 (canal WA) · W5.ASR.2 (pipeline estable) |
| **W6.AS.2** | Microsite custom domain + DNS automation | 15-20 | Feature 4 Top 5 ext (EasyBroker) | W5.ASR.4 (subdomain MVP) · DNS+SSL ops |
| **W6.AS.3** | Instagram Lead Ads + DM completo | 10-15 | Feature 3 Top 5 ext | W5.ASR.5 + OAuth Meta consolidado |

**Sub-spec W6.AS.1 — Workflow builder**: drag-drop triggers+condiciones+acciones (estilo react-flow). Triggers: lead nuevo · etapa pipeline · sin respuesta X horas. Acciones: WA · email · tarea · mover etapa · llamar webhook. Condicional IF/ELSE + delays. Plantillas precargadas (nurture 30d · post-visita 24h · etc). Engine async sobre `NurtureIntelligentEngine` ya existente.

**Sub-spec W6.AS.2 — Custom domain**: asesor compra dominio propio (ej. `juanasesor.com`) → CNAME a DMX → SSL auto-provision (Let's Encrypt) → microsite branded. Anti-abuse: rate-limit creación · verificación dominio CNAME válido.

---

## 2 · Batches movidos de W5

| # | Tema | Horas | Por qué |
|---|---|---|---|
| **W6.MOV.1** | W5.7 SOC franquicia (reemplaza Mortgage simulator) | 20 | Founder compró pero no urgente |
| **W6.MOV.2** | W5.13 → W6.13 External Sources Activation (3 tracks: API + cron + manual upload) | **32-45** | Scope expandido · ver §2.1 detalle |
| **W6.MOV.3** | W5.14 Reviews residentes (sentimiento + ranking) | 25 | Alimenta W5.2 sub-score · post-asesor MVP |
| **W6.MOV.4** | W5.16 Marketing distribution (MCP) | ~10 | Candidato mover · consume W5.ASR.* |
| **W6.MOV.5** | W5.8 Construction Quality Index | 25 | Movido founder 2026-05-17 · combina avance+acabados+defectos+cronograma · scoring 0-100 |

### 2.1 W6.13 External Sources Activation · sub-spec detallado

**Tracks paralelos**:

| Track | Qué construye | Fuentes que activa | Horas |
|---|---|---|---|
| **A · API auto-pull** | Cron live API integrations | INEGI DENUE · BANXICO SIE · DataMéxico SE · CONAVI · SESNSP delitos · CENAPRED Atlas Riesgos | 12-15 |
| **B · Cron download parsers** | Scripts cron descargan CSV/Excel · parsean · ingestan a colecciones | SEP Estadística 911 · INEGI Censo ITER · IMSS asegurados · CNBV Portafolio · ENVIPE seguridad · Atlas Riesgo CDMX | 10-15 |
| **C · Admin Upload UI** | Página `/superadmin/data-uploads` · drag-drop · valida schema · audit log fuente+fecha | Notarías CNNyM (PDF anual) · RPP CDMX (PDF trim) · Catastros Miguel Hidalgo/Cuauhtémoc · SHF reportes trim · BMV FIBRAS · CFE/CONAGUA cobertura · cualquier fuente PDF/Excel manual | 10-15 |

**Por qué 3 tracks · no solo API**:
- Muchas fuentes gov MX NO tienen API (Notarías · Catastros · BMV)
- Pero SÍ publican CSV/Excel/PDF periódicos descargables
- Admin Upload UI permite a founder/admin subir manualmente
- Adds defensibility (competidores no se molestan en hacer esto)

**Ver `memory/DATA_SOURCES.md` para detalle por fuente con tipo de ingesta**.

---

## 3 · Batches originales W6 (sketch previo · ~227h documentado en WAVE_PROGRESS)

**Pendiente reconstrucción detallada** — el sketch original W6 ~227h mencionado en `WAVE_PROGRESS.md` encabezado existe pero no está documentado en doc canónico.

| Acción | Owner |
|---|---|
| Reconstruir sketch W6 original desde jsonl sesiones previas | Claude Code (post-W5.1) |
| Validar con founder cuáles batches W6 originales se mantienen vs se subsumen | Founder |

---

## 4 · Roadmap W6 (estimado · post-moves 2026-05-16)

| Bloque | Horas |
|---|---|
| W6.AS.1-3 derivados redesign asesor | 60-80 |
| W6.MOV.1-4 movidos de W5 (5.7 + 5.13 + 5.14 + 5.16 candidato) | 87-100 |
| W6 originales sketch (a reconstruir) | ~227 |
| **Total W6 estimado** | **~374-407h** |

---

## 5 · Riesgos W6

| # | Riesgo | Mitigación |
|---|---|---|
| 1 | Workflow builder depende W5.ASR.1+2 | Si W5 slip, W6 cascade |
| 2 | Custom domain DNS+SSL ops-heavy | Subdomain MVP W5 cubre 90% casos |
| 3 | Originales W6 sketch sin reconstruir | Hacer post-W5.1 antes de planificar |

---

## 6 · Referencias

- `memory/WAVE5_PLAN.md` — plan W5 canónico (origen de batches derivados)
- `memory/WAVE_PROGRESS.md` — sketch original W6 ~227h
- `memory/REDESIGN_ASESOR_FEATURES_MATRIX.md` — features Top 5 con asignación wave

---

**Próximo paso**: reconstruir sketch original W6 desde jsonl + validar con founder qué se mantiene.
