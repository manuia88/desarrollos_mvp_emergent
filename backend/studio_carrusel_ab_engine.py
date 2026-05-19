"""W5.22 Z.2 Sub-B — Studio Carrusel A/B Engine.

Chi-square test reusado de W5.FF5 ab_testing_engine pattern.
Criterio: chi2 >= 3.84 (p<0.05, 1 df) + min 30 events por arm.
"""
from __future__ import annotations

import logging
import math
from datetime import datetime, timezone
from typing import Any, Dict, Optional

log = logging.getLogger("dmx.studio_carrusel_ab")

CHI2_THRESHOLD = 3.84  # p < 0.05, df=1
MIN_EVENTS_PER_ARM = 30


def _chi_square(a_conv: int, a_total: int, b_conv: int, b_total: int) -> Dict[str, Any]:
    """Chi-square 2x2 (conversiones vs no-conversiones)."""
    if a_total < MIN_EVENTS_PER_ARM or b_total < MIN_EVENTS_PER_ARM:
        return {
            "stat": 0.0,
            "significant": False,
            "winner": None,
            "reason": f"Insuficientes eventos: A={a_total}, B={b_total} (min {MIN_EVENTS_PER_ARM})",
        }

    a_no = a_total - a_conv
    b_no = b_total - b_conv
    n = a_total + b_total

    # Expected frequencies
    e_a_conv = (a_conv + b_conv) * a_total / n
    e_b_conv = (a_conv + b_conv) * b_total / n
    e_a_no = (a_no + b_no) * a_total / n
    e_b_no = (a_no + b_no) * b_total / n

    def _term(o, e):
        if e == 0:
            return 0.0
        return (o - e) ** 2 / e

    chi2 = _term(a_conv, e_a_conv) + _term(b_conv, e_b_conv) + _term(a_no, e_a_no) + _term(b_no, e_b_no)
    significant = chi2 >= CHI2_THRESHOLD

    winner = None
    if significant:
        rate_a = a_conv / a_total if a_total else 0
        rate_b = b_conv / b_total if b_total else 0
        winner = "A" if rate_a >= rate_b else "B"

    return {"stat": round(chi2, 4), "significant": significant, "winner": winner}


async def get_ab_stats(db, group_id: str, user_id: str) -> Optional[Dict[str, Any]]:
    group = await db.studio_carrusel_ab_groups.find_one(
        {"id": group_id, "user_id": user_id}, {"_id": 0}
    )
    if not group:
        return None

    stats = group.get("stats") or {}
    a_clicks = stats.get("a_clicks", 0)
    b_clicks = stats.get("b_clicks", 0)
    a_conv = stats.get("a_conversions", 0)
    b_conv = stats.get("b_conversions", 0)

    chi = _chi_square(a_conv, a_clicks, b_conv, b_clicks)
    rate_a = round(a_conv / a_clicks * 100, 2) if a_clicks else 0
    rate_b = round(b_conv / b_clicks * 100, 2) if b_clicks else 0

    return {
        **group,
        "chi_square": chi,
        "conversion_rate_a": rate_a,
        "conversion_rate_b": rate_b,
        "auto_winner": chi.get("winner"),
        "can_declare": chi.get("significant", False),
    }


async def declare_winner(db, group_id: str, user_id: str, winner_variant: Optional[str] = None) -> Dict[str, Any]:
    """Declara ganador manual o automatico."""
    group = await db.studio_carrusel_ab_groups.find_one(
        {"id": group_id, "user_id": user_id}, {"_id": 0}
    )
    if not group:
        return {"ok": False, "error": "Grupo A/B no encontrado"}

    if winner_variant:
        winner_id = (
            group.get("variant_a_carrusel_id") if winner_variant == "A"
            else group.get("variant_b_carrusel_id")
        )
    else:
        stats = group.get("stats") or {}
        chi = _chi_square(
            stats.get("a_conversions", 0), stats.get("a_clicks", 0),
            stats.get("b_conversions", 0), stats.get("b_clicks", 0),
        )
        if not chi.get("significant"):
            return {"ok": False, "error": chi.get("reason", "Prueba no significativa aun")}
        w = chi.get("winner")
        winner_id = (
            group.get("variant_a_carrusel_id") if w == "A"
            else group.get("variant_b_carrusel_id")
        )

    await db.studio_carrusel_ab_groups.update_one(
        {"id": group_id},
        {"$set": {"winner_id": winner_id, "status": "stopped",
                  "decided_at": datetime.now(timezone.utc)}},
    )
    return {"ok": True, "winner_carrusel_id": winner_id, "group_id": group_id}
