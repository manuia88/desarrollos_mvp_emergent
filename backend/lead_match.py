"""B5.3 · Match propiedad↔lead para el ASESOR (heurístico explicable).

Por qué heurístico y no `fit_engine.compute_fit_score`: ese motor usa señales del
COMPRADOR en db.leads (user_id), pero los contactos del asesor suelen NO tener
user_id. Aquí usamos los datos que SÍ tenemos del contacto del asesor:
  - el cuestionario del link (asesor_swipe_profiles.answers),
  - los swipes del tablero (le_gusto / descartada + pass_reason → preferencia revelada).

Devuelve un % + RAZONES en lenguaje llano (lo que el founder pidió: el número solo
no comunica valor; las razones sí). Mejora con cada swipe (recalibrado por rechazo).
"""

from typing import Any, Dict, List, Optional

POSITIVE_STATUS = {"le_gusto", "cita", "visitada", "oferta"}


def aggregate_signals(board_items: List[dict]) -> Dict[str, Any]:
    """Preferencia revelada por los swipes del tablero del lead."""
    liked_colonias, rejected_colonias = set(), set()
    liked_prices: List[int] = []
    budget_ceiling: Optional[int] = None  # de rechazos "fuera de presupuesto"
    for it in (board_items or []):
        st = it.get("status")
        col = (it.get("colonia") or "").strip().lower()
        price = it.get("price")
        if st in POSITIVE_STATUS:
            if col:
                liked_colonias.add(col)
            if price:
                liked_prices.append(int(price))
        elif st == "descartada":
            r = (it.get("pass_reason") or "").lower()
            if "presupuesto" in r and price:
                budget_ceiling = min(budget_ceiling, int(price)) if budget_ceiling else int(price)
            if "colonia" in r and col:
                rejected_colonias.add(col)
    return {
        "liked_colonias": liked_colonias,
        "rejected_colonias": rejected_colonias,
        "liked_prices": liked_prices,
        "budget_ceiling": budget_ceiling,
    }


def match_for(profile: Optional[dict], signals: Dict[str, Any], dev: dict, listed_price=None) -> Dict[str, Any]:
    """→ {score:0-100, reasons:[{ok|warn, text}]} match explicable. dev = development."""
    answers = (profile or {}).get("answers", {}) if profile else {}
    must = " ".join(str(v) for v in answers.values()).lower()
    reasons: List[Dict[str, str]] = []
    score = 62  # base

    col_name = dev.get("colonia") or ""
    col = col_name.strip().lower()
    price = listed_price or dev.get("price_from")
    amenities = [str(a).lower() for a in (dev.get("amenities") or [])]
    stage = (dev.get("stage") or "").lower()
    parking = (dev.get("parking_range") or [0])
    parking_min = parking[0] if parking else 0

    # Presupuesto (techo inferido de rechazos "fuera de presupuesto")
    bc = signals.get("budget_ceiling")
    if bc and price:
        if price <= bc:
            score += 13; reasons.append({"k": "ok", "t": "Dentro de lo que has buscado"})
        else:
            score -= 18; reasons.append({"k": "warn", "t": "Arriba de tu presupuesto aparente"})

    # Zona (gustada vs descartada)
    if col and col in signals.get("liked_colonias", set()):
        score += 15; reasons.append({"k": "ok", "t": f"En {col_name}, zona que te ha gustado"})
    elif col and col in signals.get("rejected_colonias", set()):
        score -= 20; reasons.append({"k": "warn", "t": f"En {col_name}, zona que descartaste"})

    # Qué NO puede faltar (del cuestionario)
    if "estacionamiento" in must and parking_min >= 1:
        score += 6; reasons.append({"k": "ok", "t": "Tiene estacionamiento"})
    if ("amenidad" in must or "gym" in must or "alberca" in must) and amenities:
        score += 6; reasons.append({"k": "ok", "t": f"Amenidades: {', '.join(amenities[:2])}"})
    if "áreas verdes" in must and ("parque" in (dev.get("description") or "").lower()):
        score += 5; reasons.append({"k": "ok", "t": "Cerca de áreas verdes"})
    if "listo para entrar" in must:
        if stage in ("preventa", "pre-venta", "pre venta", "en_construccion"):
            score -= 8; reasons.append({"k": "warn", "t": "Es preventa (no está listo aún)"})
        else:
            score += 5; reasons.append({"k": "ok", "t": "Listo para entrar"})

    # Para qué la busca (invertir → preventa/plusvalía suma)
    if "invertir" in must and stage in ("preventa", "pre-venta", "pre venta", "en_construccion"):
        score += 7; reasons.append({"k": "ok", "t": "Preventa: entras al mejor precio para invertir"})

    score = max(45, min(97, int(round(score))))
    return {"score": score, "reasons": reasons[:4]}
