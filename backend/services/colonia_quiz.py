"""Phase 4 Batch 26 · services — Quiz Colonia: matching algorithm.

10 preguntas → top 3 colonias por match ponderado.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List

log = logging.getLogger("dmx.colonia_quiz")

# ─── Pesos por dimensión de IE Engine ────────────────────────────────────────
# Cada respuesta suma puntos a las dimensiones de la colonia

BUDGET_RANGES = {
    "lt3m":  (0,        3_000_000),
    "3to6m": (3_000_000, 6_000_000),
    "6to12m":(6_000_000, 12_000_000),
    "gt12m": (12_000_000, 999_999_999),
}

# Tags lifestyle por colonia (para matching)
COLONIA_LIFESTYLE_TAGS: Dict[str, List[str]] = {
    "polanco":           ["shopping", "gastronomy", "nightlife", "culture"],
    "lomas-chapultepec": ["nature", "family", "shopping"],
    "roma-norte":        ["culture", "nightlife", "gastronomy"],
    "roma-sur":          ["culture", "gastronomy"],
    "condesa":           ["gastronomy", "culture", "nightlife", "nature"],
    "juarez":            ["nightlife", "culture", "gastronomy"],
    "cuauhtemoc":        ["culture", "shopping"],
    "del-valle-centro":  ["family", "nature"],
    "narvarte":          ["family", "gastronomy"],
    "napoles":           ["family"],
    "escandon":          ["family", "gastronomy"],
    "anzures":           ["family", "nature", "shopping"],
    "doctores":          ["culture", "nightlife"],
    "coyoacan-centro":   ["nature", "culture", "family"],
    "pedregal":          ["nature", "family"],
    "santa-fe":          ["shopping"],
}

# Score mínimo requerido por uso
USE_SCORE_REQS: Dict[str, Dict[str, int]] = {
    "vivir":           {"seguridad": 50, "movilidad": 40},
    "invertir-renta":  {"plusvalia": 55, "movilidad": 50},
    "invertir-plusvalia": {"plusvalia": 60},
}

# Movilidad: si el usuario usa transporte público, priorizar alta movilidad
MOVILIDAD_WEIGHT = {
    "auto": 0.5,
    "transporte": 1.2,
    "bici": 1.0,
    "mixto": 0.8,
}


async def match_colonias(
    answers: Dict[str, Any],
    top_n: int = 3,
) -> List[Dict[str, Any]]:
    """
    Algoritmo de matching:
    1. Filtra colonias fuera del rango de presupuesto
    2. Aplica score ponderado contra IE Engine scores
    3. Penaliza por lifestyle mismatch
    4. Devuelve top N con reasons
    """
    from data_seed import COLONIAS

    budget_key = answers.get("presupuesto", "3to6m")
    price_min, price_max = BUDGET_RANGES.get(budget_key, (0, 999_999_999))
    uso = answers.get("uso", "vivir")
    lifestyle_prio = answers.get("lifestyle", [])
    movilidad = answers.get("movilidad", "mixto")
    seguridad_imp = answers.get("seguridad_importance", "alta")  # "muy alta"|"alta"|"media"
    etapa_vida = answers.get("etapa_vida", "pareja")
    recamaras = int(answers.get("recamaras_min", 1))

    scored = []
    for c in COLONIAS:
        price_m2 = (c.get("price_m2") or 50) * 1000  # data_seed en miles
        scores = c.get("scores", {})

        # ── Filtro de presupuesto ─────────────────────────────────────────────
        # Suponiendo ~80m² promedio; si precio total potencial > max → penalizar
        estimated_total = price_m2 * 80
        if estimated_total > price_max * 1.3:
            continue  # demasiado caro para el budget
        if estimated_total < price_min * 0.5 and budget_key != "lt3m":
            continue  # demasiado barato (baja calidad para budgets altos)

        score = 0.0
        reasons = []

        # ── Uso ───────────────────────────────────────────────────────────────
        reqs = USE_SCORE_REQS.get(uso, {})
        for dim, min_val in reqs.items():
            actual = scores.get(dim, 50)
            if actual >= min_val:
                score += 15
                if dim == "plusvalia":
                    reasons.append(f"Alta plusvalía ({actual}/100)")
                elif dim == "movilidad":
                    reasons.append(f"Buena movilidad ({actual}/100)")
                elif dim == "seguridad":
                    reasons.append(f"Seguridad sólida ({actual}/100)")

        # ── Seguridad importance ──────────────────────────────────────────────
        seg_score = scores.get("seguridad", 50)
        if seguridad_imp == "muy alta":
            score += (seg_score / 100) * 25
            if seg_score >= 65:
                reasons.append(f"Seguridad excelente ({seg_score}/100)")
        elif seguridad_imp == "alta":
            score += (seg_score / 100) * 15
        else:
            score += 5

        # ── Movilidad ────────────────────────────────────────────────────────
        mob_score = scores.get("movilidad", 50)
        mob_weight = MOVILIDAD_WEIGHT.get(movilidad, 0.8)
        score += (mob_score / 100) * 15 * mob_weight
        if mob_score >= 70 and movilidad == "transporte":
            reasons.append(f"Excelente transporte público ({mob_score}/100)")

        # ── Lifestyle ────────────────────────────────────────────────────────
        colonia_tags = COLONIA_LIFESTYLE_TAGS.get(c["id"], [])
        matching_tags = [t for t in (lifestyle_prio or []) if t in colonia_tags]
        lifestyle_bonus = len(matching_tags) * 8
        score += lifestyle_bonus
        if matching_tags:
            tag_labels = {"nightlife": "vida nocturna", "family": "ambiente familiar",
                          "nature": "naturaleza", "culture": "cultura",
                          "gastronomy": "gastronomía", "shopping": "compras"}
            reasons.append(f"Ideal para: {', '.join(tag_labels.get(t, t) for t in matching_tags[:2])}")

        # ── Etapa de vida ────────────────────────────────────────────────────
        vida_score = scores.get("vida", 50)
        if etapa_vida == "familia con hijos" and scores.get("educacion", 0) >= 60:
            score += 12
            reasons.append(f"Buena oferta educativa ({scores.get('educacion', 0)}/100)")
        elif etapa_vida in ("soltero", "pareja") and scores.get("comercio", 0) >= 60:
            score += 10
        score += (vida_score / 100) * 10

        # ── Momentum ─────────────────────────────────────────────────────────
        momentum_raw = c.get("momentum", "0%")
        try:
            mom = float(str(momentum_raw).replace("%", "").replace("+", ""))
        except Exception:
            mom = 0
        if mom > 5:
            score += 8
            reasons.append(f"Crecimiento de precio: {momentum_raw}")

        # ── Plusvalía ─────────────────────────────────────────────────────────
        pv = scores.get("plusvalia", 50)
        score += (pv / 100) * 12

        # Limitar reasons a 3
        reasons = reasons[:3]
        if not reasons:
            reasons = [f"Calidad de vida: {scores.get('vida', 50)}/100"]

        scored.append({
            "colonia_id": c["id"],
            "nombre": c["name"],
            "alcaldia": c["alcaldia"],
            "match_pct": 0,  # calculamos después
            "raw_score": score,
            "avg_price_m2": price_m2,
            "top_3_reasons": reasons,
            "projects_count": 0,  # se enriquece después
        })

    if not scored:
        # Fallback: top 3 por score IE vida
        for c in COLONIAS:
            scored.append({
                "colonia_id": c["id"],
                "nombre": c["name"],
                "alcaldia": c["alcaldia"],
                "raw_score": c.get("scores", {}).get("vida", 50),
                "avg_price_m2": (c.get("price_m2") or 50) * 1000,
                "top_3_reasons": ["Buena calidad de vida global"],
                "projects_count": 0,
            })

    # Normalizar a pct (0-100) sobre max score
    max_s = max(x["raw_score"] for x in scored) or 1
    for x in scored:
        x["match_pct"] = min(98, int(x["raw_score"] / max_s * 98))

    scored.sort(key=lambda x: x["raw_score"], reverse=True)
    return scored[:top_n]
