"""P2.T2 — Analyst agent · detecta anomalías en el pipeline personal del asesor.

Agente PURO: RETORNA List[dict] (NO inserta). El orchestrator (T1) hace el upsert
con dedup_key f"{source_agent}:{type}:{lead_id}" + expires_at + user_id.

Contrato de cada dict (T1 añade dedup_key/expires_at/user_id):
  {type, lead_id, title, subtitle, priority, cta_actions[], source_agent}

Detecta caídas en tasa de respuesta / conversión vía compute_pipeline_drift
(reusa W7.AS.3 drift · baseline 30d vs current 7d). FAIL-OPEN → [].
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List

log = logging.getLogger("dmx.agent.analyst")

SOURCE_AGENT = "analyst"
DROP_THRESHOLD = 0.15       # caída relativa ≥ 15% para alertar
PRIORITY_MEDIA = 3          # media (en la queue: 1=urgente, 2=alta, 3=media)


async def run_analyst(db, user_id: str, tenant_id=None) -> List[Dict[str, Any]]:
    """Retorna acciones por anomalías del pipeline personal. FAIL-OPEN → []."""
    out: List[Dict[str, Any]] = []
    try:
        from pipeline_drift_personal import compute_pipeline_drift

        d = await compute_pipeline_drift(db, user_id, tenant_id)

        rr = d.get("response_rate_delta", 0) or 0
        conv = d.get("conversion_delta", 0) or 0

        # Caída de tasa de respuesta (delta negativo = bajó).
        if rr <= -DROP_THRESHOLD:
            pct = abs(int(round(rr * 100)))
            out.append({
                "type": "anomalia_tasa_respuesta",
                "lead_id": None,
                "title": f"📊 Tu tasa de respuesta bajó {pct}% esta semana · revisar",
                "subtitle": "Leads sin seguimiento vs tu promedio de 30 días",
                "priority": PRIORITY_MEDIA,
                "cta_actions": ["ver_pipeline", "ver_leads"],
                "source_agent": SOURCE_AGENT,
            })

        # Caída de conversión.
        if conv <= -DROP_THRESHOLD:
            pct = abs(int(round(conv * 100)))
            out.append({
                "type": "anomalia_conversion",
                "lead_id": None,
                "title": f"📊 Tu conversión bajó {pct}% esta semana · revisar",
                "subtitle": "Cierres vs tu promedio de 30 días",
                "priority": PRIORITY_MEDIA,
                "cta_actions": ["ver_pipeline", "ver_leads"],
                "source_agent": SOURCE_AGENT,
            })

        return out
    except Exception as exc:  # FAIL-OPEN
        log.warning(f"[analyst] run_analyst fail-open: {exc}")
        return []
