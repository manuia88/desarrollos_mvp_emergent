"""P2.T2 — close_probability · probabilidad de cierre de un lead (0-100).

Módulo PURO importable por el Closer agent (agent_workforce/closer.py) y por el
orchestrator. NO toca server/asistente/routes/command_center. FAIL-OPEN: ante
cualquier error o ausencia de señales devuelve probabilidad NEUTRAL (50).

Reusa señales ya existentes en el stack:
  · W5.4  buyer_score   → buyer_scores.score (0-100) + tier (hot/warm/cold).
  · W5.15 FSD           → la noción de "confianza por suficiencia de señal"
                          (pocas señales ⇒ confianza BAJA, como sample_size en FSD).
  · W5.19 probability   → _sigmoid (calibración) + _confidence_label (ALTA/MEDIA/BAJA).

Sin ML dedicado: heurística que combina señales del pipeline del asesor
(temperatura, etapa de la búsqueda, engagement reciente, buyer_score).

API:
  close_probability(db, lead_id) -> {"prob": 0-100, "factors": [...], "confidence": "ALTA|MEDIA|BAJA"}
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List

log = logging.getLogger("dmx.close_probability")

NEUTRAL_PROB = 50

# Mapas heurísticos (0..1 = "qué tan cerca del cierre indica esta señal").
_TEMP_MAP = {"caliente": 0.9, "cliente": 0.95, "tibio": 0.5, "frio": 0.2, "frío": 0.2}
_STAGE_MAP = {
    "pendiente": 0.10, "buscando": 0.25, "visitando": 0.45,
    "ofertando": 0.70, "cerrando": 0.90, "ganada": 1.0, "perdida": 0.0,
}

# Reuso W5.19 probability_engine: sigmoid + label. Fallbacks locales si el módulo
# no está disponible (mantiene este módulo importable y FAIL-OPEN en aislamiento).
try:  # pragma: no cover - import wiring
    from probability_engine import _sigmoid as _prob_sigmoid, _confidence_label as _prob_conf_label
except Exception:  # pragma: no cover
    import math

    def _prob_sigmoid(x: float) -> float:
        try:
            return 1.0 / (1.0 + math.exp(-x))
        except OverflowError:
            return 0.0 if x < 0 else 1.0

    def _prob_conf_label(prob_pct: float) -> str:
        dist = abs(prob_pct - 50.0)
        if dist >= 25.0:
            return "ALTA"
        if dist >= 15.0:
            return "MEDIA"
        return "BAJA"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _neutral(reason: str) -> Dict[str, Any]:
    return {"prob": NEUTRAL_PROB, "factors": [{"factor": "neutral", "reason": reason}],
            "confidence": "BAJA"}


def _as_dt(v):
    """Normaliza un ts a datetime aware (acepta datetime o iso str)."""
    if isinstance(v, datetime):
        return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
    if isinstance(v, str):
        try:
            return datetime.fromisoformat(v.replace("Z", "+00:00"))
        except Exception:
            return None
    return None


async def close_probability(db, lead_id: str) -> Dict[str, Any]:
    """Probabilidad de cierre 0-100 para un lead. FAIL-OPEN → prob neutral (50)."""
    try:
        lead = await db.asesor_contactos.find_one(
            {"id": lead_id}, {"_id": 0, "emails": 1, "temperatura": 1, "owner_id": 1},
        )
        if not lead:
            return _neutral("lead_no_encontrado")

        # M1 · pesos APRENDIDOS de cierres reales (≈default si poca data). FAIL-OPEN.
        try:
            from close_probability_tuning import get_weights as _cp_weights
            W = await _cp_weights(db)
        except Exception:
            W = {"buyer_score": 1.5, "temperatura": 1.0, "stage": 2.0, "ofertas": 1.0, "engagement": 1.0}

        factors: List[Dict[str, Any]] = []
        signals: List[tuple] = []  # (valor 0..1, peso)

        # 1 · buyer_score (W5.4) — vía email → users.user_id → buyer_scores.
        try:
            email = (lead.get("emails") or [None])[0]
            if email:
                u = await db.users.find_one({"email": email}, {"_id": 0, "user_id": 1})
                uid = (u or {}).get("user_id")
                if uid:
                    bs = await db.buyer_scores.find_one(
                        {"user_id": uid}, {"_id": 0, "score": 1, "tier": 1})
                    sc = (bs or {}).get("score")
                    if isinstance(sc, (int, float)):
                        signals.append((max(0.0, min(100.0, float(sc))) / 100.0, W["buyer_score"]))
                        factors.append({"factor": "buyer_score", "value": round(float(sc), 1),
                                        "tier": (bs or {}).get("tier")})
        except Exception:
            pass

        # 2 · temperatura del lead.
        temp = (lead.get("temperatura") or "").lower()
        if temp in _TEMP_MAP:
            signals.append((_TEMP_MAP[temp], W["temperatura"]))
            factors.append({"factor": "temperatura", "value": temp})

        # 3 · etapa de la búsqueda (kanban) — señal directa de cercanía al cierre.
        try:
            busq = await db.asesor_busquedas.find_one(
                {"contacto_id": lead_id}, {"_id": 0, "stage": 1, "offers": 1})
            stage = (busq or {}).get("stage")
            if stage in _STAGE_MAP:
                signals.append((_STAGE_MAP[stage], W["stage"]))
                factors.append({"factor": "stage", "value": stage})
            if (busq or {}).get("offers", 0) and (busq or {}).get("offers", 0) >= 1:
                signals.append((0.85, W["ofertas"]))
                factors.append({"factor": "ofertas", "value": busq.get("offers")})
        except Exception:
            pass

        # 4 · engagement reciente (último evento en timeline).
        try:
            last = None
            async for row in db.asesor_contacto_timeline.find(
                {"contacto_id": lead_id}, {"_id": 0, "ts": 1}).sort("ts", -1).limit(1):
                last = _as_dt(row.get("ts"))
            if last:
                age_days = (_now() - last).total_seconds() / 86400.0
                rec01 = 1.0 if age_days < 3 else (0.6 if age_days < 7 else (0.3 if age_days < 14 else 0.1))
                signals.append((rec01, W["engagement"]))
                factors.append({"factor": "engagement_dias", "value": round(age_days, 1)})
        except Exception:
            pass

        if not signals:
            return _neutral("sin_senales")

        wsum = sum(w for _, w in signals)
        val = sum(v * w for v, w in signals) / wsum if wsum else 0.5

        # Calibración W5.19: sigmoid centrado en 0.5. val=0.5→50%, val=1→~88%, val=0→~12%.
        prob = int(round(_prob_sigmoid((val - 0.5) * 4.0) * 100))
        prob = max(0, min(100, prob))

        # Confianza: label W5.19 por distancia a 50%, degradado por suficiencia de
        # señal (espíritu FSD: pocas señales ⇒ menos confianza).
        confidence = _prob_conf_label(prob)
        if len(signals) < 2:
            confidence = "BAJA"

        return {"prob": prob, "factors": factors, "confidence": confidence}
    except Exception as exc:  # FAIL-OPEN
        log.warning(f"[close_probability] fail-open: {exc}")
        return _neutral("fail_open")
