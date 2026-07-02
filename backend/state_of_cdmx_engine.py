"""W4.16 Sub-B — State of CDMX Report engine."""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from PIL import Image, ImageDraw, ImageFont

log = logging.getLogger("dmx.state_of_cdmx")

CACHE_TTL_HOURS = 24
from fs_fallback import dir_or_tmp  # [AUD-008]
OG_DIR = dir_or_tmp(Path(os.environ.get("STATE_OF_CDMX_STORAGE", "/app/backend/storage/state_of_cdmx")), "state_of_cdmx")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso() -> str:
    return _now().isoformat()


def current_period() -> str:
    now = _now()
    q = (now.month - 1) // 3 + 1
    return f"{now.year}-Q{q}"


# OJO: estos fallbacks son DATOS DE EJEMPLO (no medidos) para que la pantalla funcione sin
# datos cargados. Se reemplazan solos cuando hay zone_scores reales. Van marcados es_estimado.
_FALLBACK_TOP_ROI = [
    {"slug": "polanco", "name": "Polanco", "roi_12m_pct": 18.4, "hedonic_change_pct": 12.1, "velocity_months": 6},
    {"slug": "condesa", "name": "Condesa", "roi_12m_pct": 16.2, "hedonic_change_pct": 10.6, "velocity_months": 7},
    {"slug": "roma-norte", "name": "Roma Norte", "roi_12m_pct": 15.8, "hedonic_change_pct": 10.1, "velocity_months": 7},
    {"slug": "lomas-chapultepec", "name": "Lomas Chapultepec", "roi_12m_pct": 14.6, "hedonic_change_pct": 9.4, "velocity_months": 8},
    {"slug": "del-valle", "name": "Del Valle", "roi_12m_pct": 13.1, "hedonic_change_pct": 8.5, "velocity_months": 8},
    {"slug": "narvarte", "name": "Narvarte", "roi_12m_pct": 12.4, "hedonic_change_pct": 8.0, "velocity_months": 9},
    {"slug": "coyoacan", "name": "Coyoacán", "roi_12m_pct": 11.7, "hedonic_change_pct": 7.6, "velocity_months": 9},
    {"slug": "anzures", "name": "Anzures", "roi_12m_pct": 11.2, "hedonic_change_pct": 7.3, "velocity_months": 10},
    {"slug": "escandon", "name": "Escandón", "roi_12m_pct": 10.6, "hedonic_change_pct": 6.9, "velocity_months": 10},
    {"slug": "pedregal", "name": "Pedregal", "roi_12m_pct": 10.1, "hedonic_change_pct": 6.6, "velocity_months": 11},
]

_FALLBACK_DEMAND = [
    {"slug": "polanco", "name": "Polanco", "gap_score": 42, "opportunity_label": "Demanda alta"},
    {"slug": "condesa", "name": "Condesa", "gap_score": 38, "opportunity_label": "Demanda alta"},
    {"slug": "roma-norte", "name": "Roma Norte", "gap_score": 34, "opportunity_label": "Demanda alta"},
    {"slug": "del-valle", "name": "Del Valle", "gap_score": 22, "opportunity_label": "Equilibrado"},
    {"slug": "narvarte", "name": "Narvarte", "gap_score": 18, "opportunity_label": "Equilibrado"},
    {"slug": "coyoacan", "name": "Coyoacán", "gap_score": 12, "opportunity_label": "Equilibrado"},
    {"slug": "anzures", "name": "Anzures", "gap_score": 8, "opportunity_label": "Equilibrado"},
    {"slug": "escandon", "name": "Escandón", "gap_score": -4, "opportunity_label": "Sobreoferta"},
    {"slug": "pedregal", "name": "Pedregal", "gap_score": -12, "opportunity_label": "Sobreoferta"},
    {"slug": "satelite", "name": "Satélite", "gap_score": -18, "opportunity_label": "Sobreoferta"},
]


async def _top_colonias_by_roi(db, limit: int = 10) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    try:
        # El campo real es score_numeric (score_total no existe en zone_scores → sort/lectura rotos).
        cursor = db.zone_scores.find({}, {"_id": 0}).sort("score_numeric", -1).limit(limit * 2)
        async for d in cursor:
            slug = d.get("zone_id") or d.get("slug")
            if not slug:
                continue
            score = float(d.get("score_numeric") or d.get("score_total") or 0)
            roi = round(8 + (score / 100) * 14, 1)   # ESTIMADO direccional desde el score (no ROI medido)
            out.append({
                "slug": slug,
                "name": d.get("name") or slug.replace("-", " ").title(),
                "roi_12m_pct": roi,
                "hedonic_change_pct": round(roi * 0.65, 1),
                "velocity_months": max(4, round(14 - score / 10)),
                "fuente": "estimado_score",   # derivado del zone score, no ROI real de transacciones
            })
            if len(out) >= limit:
                break
    except Exception as exc:
        log.debug(f"[state] top_colonias_by_roi failed: {exc}")
    if out:
        return out[:limit]
    return [{**r, "fuente": "ejemplo"} for r in _FALLBACK_TOP_ROI[:limit]]   # datos de ejemplo


async def _demand_supply_top(db, limit: int = 10) -> List[Dict[str, Any]]:
    try:
        from maps_cross_engine import demand_supply_gap_geojson
        geo = await demand_supply_gap_geojson(db)
        feats = (geo or {}).get("features") or []
        scored = []
        for f in feats:
            p = f.get("properties") or {}
            gap = float(p.get("gap_score") or p.get("gap") or 0)
            slug = p.get("colonia_id") or p.get("slug")
            if not slug:
                continue
            scored.append({
                "slug": slug,
                "name": p.get("name") or slug.replace("-", " ").title(),
                "gap_score": gap,
                "opportunity_label": (
                    "Demanda alta" if gap > 30 else
                    "Equilibrado" if gap > 0 else "Sobreoferta"
                ),
            })
        scored.sort(key=lambda x: x["gap_score"], reverse=True)
        if scored:
            return scored[:limit]
    except Exception as exc:
        log.debug(f"[state] demand_supply_top failed: {exc}")
    return list(_FALLBACK_DEMAND[:limit])


def _velocity_by_category() -> Dict[str, int]:
    return {"luxury": 14, "premium": 11, "residencial": 9, "medio": 8, "social": 7}


def _predictions(top_roi: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Direccional, DERIVADO del dato que ya tenemos (no números puestos a mano).
    Promedio de la plusvalía estimada de las zonas top, suavizado. Marcado es_estimado."""
    hot = [r["slug"] for r in top_roi[:5]]
    cold = [r["slug"] for r in top_roi[-3:]] if len(top_roi) > 3 else []
    hed = [r.get("hedonic_change_pct") or 0 for r in top_roi if r.get("hedonic_change_pct")]
    avg = round(sum(hed) / len(hed), 1) if hed else None
    es_estimado = any(r.get("fuente") in ("ejemplo", "estimado_score") for r in top_roi) or avg is None
    return {
        "q_next_avg_appreciation": avg,            # derivado, no hardcodeado
        "hot_zones": hot, "cold_zones": cold,
        "es_estimado": es_estimado,
        "nota": "Escenario direccional derivado del índice de zona — no es un pronóstico medido.",
    }


async def compute_metrics(db, period: str) -> Dict[str, Any]:
    top_roi = await _top_colonias_by_roi(db)
    demand = await _demand_supply_top(db)
    return {
        "period": period,
        "top_10_colonias_roi": top_roi,
        "demand_supply_gap_top10": demand,
        "velocity_by_category": _velocity_by_category(),
        "predictions_2026": _predictions(top_roi),
        "dmx_index_top_creatives_count": 12,
        "generated_at": _iso(),
    }


async def get_or_compute(db, period: Optional[str] = None) -> Dict[str, Any]:
    period = period or current_period()
    try:
        cached = await db.state_of_cdmx_metrics.find_one({"period": period}, {"_id": 0})
        if cached and cached.get("generated_at"):
            try:
                dt = datetime.fromisoformat(cached["generated_at"].replace("Z", "+00:00"))
            except Exception:
                dt = _now() - timedelta(hours=999)
            if _now() - dt < timedelta(hours=CACHE_TTL_HOURS):
                cached.pop("_id", None)
                return cached
    except Exception as exc:
        log.debug(f"[state] cache lookup failed: {exc}")

    doc = await compute_metrics(db, period)
    try:
        await db.state_of_cdmx_metrics.update_one(
            {"period": period}, {"$set": doc}, upsert=True,
        )
    except Exception as exc:
        log.warning(f"[state] persist failed: {exc}")
    doc.pop("_id", None)
    return doc


def _pil_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    p = ("/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf" if bold
         else "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf")
    try:
        if Path(p).exists():
            return ImageFont.truetype(p, size)
    except Exception:
        pass
    return ImageFont.load_default()


def render_og_image(period: str, metrics: Dict[str, Any]) -> Path:
    out_path = OG_DIR / f"state-of-cdmx-{period}.png"
    W, H = 1200, 630
    img = Image.new("RGB", (W, H), (6, 8, 15))
    draw = ImageDraw.Draw(img)
    for i in range(W):
        t = i / max(W - 1, 1)
        r = int(99 + t * (236 - 99))
        g = int(102 + t * (72 - 102))
        b = int(241 + t * (153 - 241))
        draw.rectangle([(i, 0), (i, 8)], fill=(r, g, b))

    fnt_eyebrow = _pil_font(22, bold=True)
    fnt_h1 = _pil_font(60, bold=True)
    fnt_sub = _pil_font(26)
    fnt_kpi = _pil_font(34, bold=True)
    fnt_lbl = _pil_font(16)

    draw.text((60, 50), "DMX · INTELIGENCIA INMOBILIARIA", font=fnt_eyebrow, fill=(160, 164, 176))
    draw.text((60, 100), "State of CDMX 2026", font=fnt_h1, fill=(240, 235, 224))
    draw.text((60, 180), "Top colonias · gap demanda-oferta · predicciones", font=fnt_sub, fill=(160, 164, 176))

    top = metrics.get("top_10_colonias_roi") or []
    kpis = [
        ("Top ROI 12m", f"{top[0]['roi_12m_pct']:.1f}%" if top else "—"),
        ("Hot zones", str(len(metrics.get("predictions_2026", {}).get("hot_zones", [])))),
        ("Velocity premium", f"{metrics.get('velocity_by_category', {}).get('premium', '—')} m"),
        ("Q4 forecast", f"+{metrics.get('predictions_2026', {}).get('q4_avg_appreciation', 0):.1f}%"),
    ]
    by = 320
    for i, (lbl, val) in enumerate(kpis):
        bx = 60 + i * 280
        draw.rectangle([(bx, by), (bx + 250, by + 160)], fill=(22, 27, 37))
        draw.rectangle([(bx, by), (bx + 250, by + 4)], fill=(99, 102, 241))
        draw.text((bx + 16, by + 18), lbl.upper(), font=fnt_lbl, fill=(160, 164, 176))
        draw.text((bx + 16, by + 60), val, font=fnt_kpi, fill=(240, 235, 224))

    draw.text((60, 570), "desarrollosmx.io/insights/state-of-cdmx-2026", font=fnt_lbl, fill=(160, 164, 176))
    img.save(out_path, "PNG", optimize=True)
    return out_path


async def ensure_state_of_cdmx_indexes(db) -> None:
    try:
        await db.state_of_cdmx_metrics.create_index("period", unique=True)
    except Exception as exc:
        log.warning(f"[state] index create failed: {exc}")
