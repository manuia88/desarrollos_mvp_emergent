════ QA + STRESS · AUDITORÍA FUNCIONAL DEL BACKEND ════

login superadmin: ✅

── Barrido de los GET seguros (lecturas)…

CLASE                  #   qué significa
LIVE                 470   responde CON datos → prendido y funcional
VACIO_dormant        111   responde 200 pero sin datos → dormido/stub o sin dato aún
NECESITA_PARAMS       82   pide query-params (no es fallo; se prueba aparte)
GUARDADO               8   401/403 → protegido (correcto)
404                    3   ruta no encontrada con GET directo
4xx                    6   otro error de cliente
TOTAL                681

── 🔴 ENDPOINTS ROTOS (5xx / sin respuesta): 0

── ⚪ VACÍOS/dormant (muestra de 15 de 111):
    /api/accuracy/per-zone
    /api/activity/feed
    /api/agent-workforce/status
    /api/agentic-crm/nurture/sequences
    /api/agentic-crm/replies
    /api/agentic-crm/routings
    /api/agentic-crm/visit-prep/dossiers
    /api/asesor/alertas
    /api/asesor/argumentario/recent
    /api/asesor/atlax-settings
    /api/asesor/autopilot/log
    /api/asesor/briefing/traffic/recent
    /api/asesor/briefings
    /api/asesor/briefings/summary
    /api/asesor/busquedas

── 🔥 STRESS de concurrencia (120 req · 24 hilos) en endpoints calientes:
    ✅ /api/superadmin/catalogo
        ok 120/120 · err 0 · p50 72ms · p95 200ms · 246.2 req/s
    ✅ /api/health
        ok 120/120 · err 0 · p50 26ms · p95 29ms · 907.3 req/s
    ✅ /api/superadmin/genoma/salud-dato
        ok 120/120 · err 0 · p50 252ms · p95 284ms · 94.1 req/s

════ VEREDICTO ════
De 681 GET sin params: 470 LIVE con datos · 111 dormant · 0 ROTOS.
✅ CERO endpoints con error de servidor en el barrido de lecturas.
