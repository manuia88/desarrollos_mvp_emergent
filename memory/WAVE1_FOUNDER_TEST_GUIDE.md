# Wave 1 Founder Smoke Test Guide

Acciones manuales que founder ejecuta para validar Wave 1 end-to-end antes de cerrar y pasar a Wave 2.

**Pre-requisitos:** logged in como `admin@desarrollosmx.com` en preview env.

---

## ✅ W1.1 — Superadmin guard (security)

Sin acción manual — verificado en pytest `test_wave1_1_superadmin_guards.py`.

---

## ✅ W1.2 — Tenants Management

Ruta: `/superadmin/tenants`

1. Login como superadmin → sidebar muestra "Tenants" en tier 1 (antes de "Data Sources")
2. Tabla muestra ≥2 orgs (Constructora Ariel + DMX inmobiliaria si aplica)
3. Filtro `Inmobiliarias` reduce lista correctamente
4. Search "ariel" filtra tenant matching
5. Click "Ver" → drawer abre con 3 tabs (Resumen, Equipo, Auditoría)
6. Click "Impersonar" Constructora Ariel → modal confirm → Sí → redirect `/desarrollador`
7. Banner amarillo arriba muestra countdown mm:ss
8. Click "Salir" en banner → redirect `/superadmin/tenants`, banner desaparece
9. Cambiar status de un tenant a "suspendido" + razón → confirma
10. Logout y login con un user de ese tenant → debe ver "Cuenta suspendida. Contactar soporte."
11. Volver a superadmin, marcar tenant "active" → user puede entrar de nuevo

**Pasa si:** todos los puntos arriba funcionan sin errores.

---

## ✅ W1.3 — System Health Dashboard

Ruta: `/superadmin/health`

1. Sidebar muestra "Salud del sistema" (Activity icon) en tier 2
2. KPI strip muestra 4 valores: Uptime · Probes · Crons OK · Alertas abiertas
3. Sección "Servicios": ≥6 cards (backend_api, mongodb, apscheduler, resend, claude_haiku, claude_sonnet)
4. Sección "Crons": ≥9 cards de jobs APScheduler instrumentados
5. Sección "Probes": link "Ver mapa completo" → navega a `/superadmin/system-map`
6. Click "Test alert" → toast "Alert insertado" → feed muestra alert info nuevo
7. Click "Resolver" en alert → marca resolved + desaparece de tab "Abiertas"
8. Auto-refresh: dejar pestaña abierta 30s → contador "Última actualización" cambia
9. Cambiar a otra pestaña 1min → volver → debe haber refrescado solo cuando volviste

**Pasa si:** todos los puntos arriba funcionan.

---

## ✅ W1.4 — Bulk Drive Ingestion

Ruta: `/superadmin/bulk-ingest`

**Pre-requisito:** tener al menos 1 dev_drive_connection configurada (W1.4 reusa OAuth Drive existente).

1. Sidebar muestra "Ingesta masiva" (FolderUp icon) en tier 1, después de "Tenants"
2. KPI strip: jobs · ingested · pending review · ai cost mes
3. Form top: paste URL Drive folder válida + dejar org vacío → click "Iniciar ingesta"
4. Toast "Job N en cola" → tab Jobs muestra nuevo job status="extracting"
5. Esperar ~30-60s (auto-refresh 10s) → status="completed" o "reviewing"
6. Click "Ver detalle" del job → drawer muestra items extraídos
7. Tab "Cola revisión" muestra items con dedup score 65-85% (pending_review)
8. Por cada item pending: ver name + address + units count + dedup top 3 matches
9. Click "Aprobar como nuevo" → confirma → item desaparece de cola
10. Verificar en `/superadmin/tenants` o admin que development se creó

**Test sample real:** founder pega URL de UN folder con 1-3 proyectos drive conocidos para validar pipeline. NO ingresa 50 proyectos en este smoke — eso es post-Wave 1.

**Pasa si:** al menos 1 proyecto se ingiere correctamente y aparece en `db.developments`.

---

## ✅ W1.5 — Ingestion Quality + Dedup

Mismo route `/superadmin/bulk-ingest`, tab "Cola revisión".

1. En un item pending: click sobre `project_name` → input editable → cambiar nombre → save
2. Verificar que el item ahora muestra "1 edición inline" (counter) — el nombre original AI se preserva
3. Click "Re-extraer" en un item con `_low_confidence=true` → toast "Reanalizando..." → spinner
4. Después de re-extract: campos actualizados, counter "recomputaciones=1"
5. Click "Fusionar con [match X]" → modal MergeDiffVisualizer muestra:
   - Sección "Unidades nuevas" verde
   - Sección "Unidades a actualizar" amber con cols [Campo · Existente · Nuevo]
   - Sección "Sin cambios" gris collapsed
6. Si hay price drop >50% en alguna unit: botón "Confirmar fusión" disabled
7. Click "Confirmar fusión" → audit log captura merge

**Pasa si:** inline edit + diff visualizer + force-match funcionan sin errores.

---

## Resumen ejecutivo

Si los 5 batches pasan smoke → **Wave 1 cerrada** ✅

Acumulado Wave 1:
- 23 endpoints superadmin nuevos, todos con `require_superadmin`
- 4 schemas nuevos (impersonation_sessions, cron_heartbeats, system_alerts, bulk_ingest_jobs/items)
- 9 cron jobs instrumentados con heartbeat
- Pipeline async Drive → Haiku → dedup → schema disgregado funcional
- Manual edit + diff visualizer + force match operacionales

Después de smoke OK → siguiente: **Wave 2 (~120h)** comenzando por SA2 Data Sources Hub o SA5.0 Plan tiers + GHL snapshots.
