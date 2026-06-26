"""coaching_analysis · P2.T3 · módulo PURO de análisis de performance del asesor.

Reúne señales ya existentes (sin recalcular nada propio) para producir un mapa de
patrones + sugerencias accionables que el Coach agent (coach.py) convierte en un tip:

    1. SOC franchise score (W6.MOV.1 · soc_franchise_engine.compute_soc_score)
       → score 0-100 + level + breakdown de 5 dimensiones (dimensión más débil = patrón).
    2. Ranking relativo (soc_franchise_engine.list_franchisees) → posición vs pares.
    3. Operaciones (db.asesor_operaciones) → patrón temporal de cierres (día de la semana
       donde más/menos cierra · base para el tip "agenda visitas mar-jue").

LLM Claude es OPCIONAL: si EMERGENT_LLM_KEY está disponible se usa para redactar una
sugerencia más natural · siempre con ai_budget.track_ai_call. FAIL-OPEN total: cualquier
fallo (engine, DB, LLM) cae a la heurística y nunca levanta excepción.

NO toca shared (server/asistente/routes/command_center/orchestrator/agent_common/__init__).
Solo IMPORTA helpers read-only (soc_franchise_engine, ai_budget) y consulta colecciones.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.coaching_analysis")

# Días de la semana en español (0=lunes … 6=domingo · weekday() de datetime).
_WEEKDAYS_ES = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
_WON_STATUSES = {"cerrada", "cobrada", "pagando"}  # alineado con _build_kpis_trend (advisor.py)

# Umbral: una dimensión SOC se considera débil si < este score (0-100).
_WEAK_DIM_THRESHOLD = 50.0

# Etiquetas legibles de las 5 dimensiones del breakdown SOC.
_DIM_LABELS = {
    "lead_conversion": "conversión de leads",
    "nps_proxy": "satisfacción de clientes",
    "response_time": "tiempo de respuesta",
    "revenue_30d": "ingresos del mes",
    "compliance": "cumplimiento de procesos",
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_dt(val: Any) -> Optional[datetime]:
    """Normaliza str ISO / datetime → datetime aware. FAIL-OPEN None."""
    if isinstance(val, datetime):
        return val if val.tzinfo else val.replace(tzinfo=timezone.utc)
    if isinstance(val, str) and val:
        try:
            dt = datetime.fromisoformat(val.replace("Z", "+00:00"))
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except Exception:
            return None
    return None


async def _soc_signals(db, user_id: str) -> Dict[str, Any]:
    """Reúsa soc_franchise_engine (W6.MOV.1). FAIL-OPEN {} si engine ausente/falla."""
    try:
        import soc_franchise_engine as soc
        result = await soc.compute_soc_score(db, user_id, use_cache=True)
        return result or {}
    except Exception as e:
        log.warning(f"[coaching_analysis] SOC signals fallaron: {e}")
        return {}


async def _ranking_position(db, user_id: str) -> Optional[Dict[str, Any]]:
    """Posición del asesor en el ranking SOC. FAIL-OPEN None."""
    try:
        import soc_franchise_engine as soc
        # Top amplio: suficiente para ubicar a la mayoría de asesores.
        items = await soc.list_franchisees(db, limit=200, use_cache=True)
        if not items:
            return None
        for idx, it in enumerate(items):
            if it.get("user_id") == user_id:
                return {
                    "position": idx + 1,
                    "total": len(items),
                    "delta_week": it.get("delta_week"),
                }
        return {"position": None, "total": len(items), "delta_week": None}
    except Exception as e:
        log.warning(f"[coaching_analysis] ranking fallback: {e}")
        return None


async def _closing_temporal_pattern(db, user_id: str) -> Optional[Dict[str, Any]]:
    """Analiza día-de-semana de cierres (últimos 90d) → mejor/peor día.

    Reúsa db.asesor_operaciones (misma colección que _build_kpis_trend en advisor.py).
    FAIL-OPEN None si no hay datos suficientes.
    """
    try:
        since = (_now() - timedelta(days=90)).isoformat()
        ops = await db.asesor_operaciones.find(
            {"owner_id": user_id, "status": {"$in": list(_WON_STATUSES)},
             "fecha_cierre": {"$gte": since}},
            {"_id": 0, "fecha_cierre": 1},
        ).limit(500).to_list(500)
        counts = [0] * 7
        total = 0
        for op in ops:
            dt = _parse_dt(op.get("fecha_cierre"))
            if dt is None:
                continue
            counts[dt.weekday()] += 1
            total += 1
        if total < 3:
            return None  # muestra insuficiente para un patrón confiable
        best_idx = max(range(7), key=lambda i: counts[i])
        worst_idx = min(range(7), key=lambda i: counts[i])
        return {
            "total_cierres": total,
            "best_day": _WEEKDAYS_ES[best_idx],
            "best_day_count": counts[best_idx],
            "worst_day": _WEEKDAYS_ES[worst_idx],
            "worst_day_count": counts[worst_idx],
            "by_weekday": {_WEEKDAYS_ES[i]: counts[i] for i in range(7)},
        }
    except Exception as e:
        log.warning(f"[coaching_analysis] patrón temporal fallback: {e}")
        return None


def _weakest_dimension(breakdown: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Extrae la dimensión SOC más débil del breakdown. FAIL-OPEN None."""
    if not isinstance(breakdown, dict):
        return None
    worst_key = None
    worst_score = None
    for key, label in _DIM_LABELS.items():
        dim = breakdown.get(key)
        score = dim.get("score") if isinstance(dim, dict) else None
        if score is None:
            continue
        try:
            score = float(score)
        except Exception:
            continue
        if worst_score is None or score < worst_score:
            worst_score = score
            worst_key = key
    if worst_key is None:
        return None
    return {"key": worst_key, "label": _DIM_LABELS[worst_key], "score": round(worst_score, 1)}


async def _llm_refine_suggestion(
    db,
    user_id: str,
    tenant_id: Optional[str],
    patterns: List[Dict[str, Any]],
    base_suggestion: str,
) -> Optional[str]:
    """LLM OPCIONAL · redacta un tip más natural a partir de los patrones detectados.

    Siempre registra costo vía ai_budget.track_ai_call. FAIL-OPEN None (usa heurística).
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return None
    try:
        from llm_client import LlmChat, UserMessage

        system = (
            "Eres un coach de ventas inmobiliarias en México. Devuelve UN solo consejo "
            "accionable, concreto y motivador, en español, máximo 160 caracteres, sin "
            "comillas ni preámbulo. Tutea al asesor."
        )
        pattern_lines = "\n".join(
            f"- {p.get('summary', '')}" for p in patterns if p.get("summary")
        ) or "- Sin patrones destacados."
        user_prompt = (
            f"Patrones de performance del asesor:\n{pattern_lines}\n\n"
            f"Borrador de consejo: {base_suggestion}\n\n"
            "Reescribe el consejo en una sola línea accionable."
        )
        model = "claude-haiku-4-5-20251001"
        chat = LlmChat(
            api_key=api_key,
            session_id=f"coach-{user_id}",
            system_message=system,
        ).with_model("anthropic", model)
        resp = await chat.send_message(UserMessage(text=user_prompt))
        text = (resp or "").strip().strip('"').strip()

        # Track de costo (fire-and-forget · nunca rompe).
        try:
            import ai_budget
            in_tokens = (len(system) + len(user_prompt)) // 4
            out_tokens = len(text) // 4
            await ai_budget.track_ai_call(
                db,
                dev_org_id=tenant_id or user_id or "default",
                model=model,
                tokens=in_tokens + out_tokens,
                call_type="coaching_tip",
                tokens_in=in_tokens,
                tokens_out=out_tokens,
                feature_key="agent_coach",
            )
        except Exception as track_err:
            log.warning(f"[coaching_analysis] track_ai_call falló: {track_err}")

        return text[:200] if text else None
    except Exception as e:
        log.warning(f"[coaching_analysis] LLM refine fallback heurística: {e}")
        return None


async def analyze_performance(
    db,
    user_id: str,
    tenant_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Analiza performance del asesor reusando SOC + ranking + operaciones.

    Returns:
        {
            "patterns": [ {key, summary, severity, data?} ],
            "suggestions": [ {text, cta_actions[], source: "heuristic"|"llm"} ],
        }
    FAIL-OPEN: ante cualquier fallo devuelve {"patterns": [], "suggestions": []}.
    """
    patterns: List[Dict[str, Any]] = []
    suggestions: List[Dict[str, Any]] = []
    try:
        soc = await _soc_signals(db, user_id)
        ranking = await _ranking_position(db, user_id)
        temporal = await _closing_temporal_pattern(db, user_id)

        # Si NINGUNA señal respondió (p.ej. DB caída), no inventamos un tip genérico:
        # FAIL-OPEN real → sin sugerencias (el agente devolverá []).
        has_signal = bool(soc) or ranking is not None or temporal is not None
        if not has_signal:
            return {"patterns": [], "suggestions": []}

        # Patrón 1 · dimensión SOC más débil.
        weak = _weakest_dimension(soc.get("breakdown"))
        if weak and weak["score"] < _WEAK_DIM_THRESHOLD:
            patterns.append({
                "key": "weak_dimension",
                "summary": f"Tu punto más bajo es {weak['label']} ({weak['score']}/100).",
                "severity": "high" if weak["score"] < 30 else "medium",
                "data": weak,
            })

        # Patrón 2 · ranking relativo.
        if ranking and ranking.get("position"):
            pos = ranking["position"]
            total = ranking.get("total") or pos
            delta = ranking.get("delta_week")
            sev = "low"
            summary = f"Estás en el lugar {pos} de {total} asesores."
            if delta is not None and delta < 0:
                sev = "medium"
                summary += f" Bajaste {abs(delta)} pts esta semana."
            patterns.append({
                "key": "ranking",
                "summary": summary,
                "severity": sev,
                "data": ranking,
            })

        # Patrón 3 · temporal de cierres.
        if temporal:
            patterns.append({
                "key": "temporal_closing",
                "summary": (
                    f"Cierras más en {temporal['best_day']} y menos en "
                    f"{temporal['worst_day']}."
                ),
                "severity": "low",
                "data": temporal,
            })

        # ── Sugerencia heurística (siempre disponible · base del fallback) ──
        base_text = "Mantén el ritmo: prioriza tus leads calientes hoy."
        cta = ["ver_dashboard"]
        if temporal:
            base_text = (
                f"Tus cierres caen en {temporal['worst_day']}: agenda visitas clave "
                f"entre martes y jueves para aprovechar tu mejor día ({temporal['best_day']})."
            )
            cta = ["ver_agenda", "ver_dashboard"]
        elif weak and weak["score"] < _WEAK_DIM_THRESHOLD:
            base_text = (
                f"Enfócate en mejorar tu {weak['label']}: es tu dimensión más baja "
                f"({weak['score']}/100) y la que más mueve tu score."
            )
            cta = ["ver_dashboard"]
        elif ranking and ranking.get("position") and ranking["position"] > 1:
            base_text = (
                f"Vas en el lugar {ranking['position']}: contacta 3 leads más hoy para "
                "subir en el ranking esta semana."
            )
            cta = ["ver_dashboard"]

        source = "heuristic"
        text = base_text
        # ── LLM opcional para redactar mejor ──
        refined = await _llm_refine_suggestion(db, user_id, tenant_id, patterns, base_text)
        if refined:
            text = refined
            source = "llm"

        suggestions.append({"text": text, "cta_actions": cta, "source": source})
    except Exception as e:
        log.warning(f"[coaching_analysis] analyze_performance FAIL-OPEN: {e}")
        return {"patterns": [], "suggestions": []}

    return {"patterns": patterns, "suggestions": suggestions}
