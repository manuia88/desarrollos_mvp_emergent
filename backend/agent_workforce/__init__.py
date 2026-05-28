"""P2 · AI Agent Workforce.

5 agentes de fondo (Prospector · Nurturer · Closer · Analyst · Coach) que detectan
acciones y las insertan en `command_center_actions` (contrato P1 · ver routes/advisor.py)
para que aparezcan en la cola del Command Center con badge "🤖 {agente}".

Arquitectura (clave para paralelismo · T1/T2/T3):
- Cada agente = función PURA `async def run_<agent>(db, user_id, tenant_id) -> List[dict]`
  · retorna lista de acciones (vía build_action) · FAIL-OPEN (return [] si falla) · NO inserta.
- El ORCHESTRATOR colecta de los 5, dedup, cap per-agente, y UPSERTA por (user_id, dedup_key).
- T2/T3 (closer/analyst/coach) se importan FAIL-OPEN: si aún no existen → skip.

Owner shared (T1): orchestrator + cron + server wiring + Atlax #56 + Prospector + Nurturer.
"""
