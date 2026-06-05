"""Dev Price History — capa de captura + serie de plusvalía (historial de precios).

  · record_price_event(): captura inmutable de cada cambio de precio (el flywheel/moat).
  · GET /api/dev/projects/{id}/price-history: serie de precios en el tiempo + % desde
    lanzamiento + anualizado + precios por prototipo. Usa eventos reales si los hay;
    si no, deriva del histórico del seed (estimado honesto que se autollena).

Primer ladrillo del Motor de Historial de Precios (memory/PRICE_HISTORY_APPRECIATION_SPEC.md).
"""
from __future__ import annotations

import logging
from collections import defaultdict
from datetime import datetime, timezone
from statistics import median
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request

log = logging.getLogger("dmx.price_history")
router = APIRouter(prefix="/api/dev", tags=["price_history"])

SEED_LABEL_MONTHS = {"Lanzamiento": 0, "+6 meses": 6, "+12 meses": 12, "Hoy": 18}
DEFAULT_SPAN = 18


def _db(req: Request):
    return req.app.state.db


async def _auth(req: Request):
    from server import get_current_user
    user = await get_current_user(req)
    if not user:
        raise HTTPException(401, "No autenticado")
    if user.role not in ("developer_admin", "developer_member", "superadmin"):
        raise HTTPException(403, "Rol no autorizado")
    return user


def _user_dev_ids(user) -> List[str]:
    from tenant_scope import user_dev_ids
    return user_dev_ids(user)


def _month_str(base: datetime, months: int) -> str:
    total = (base.year * 12 + (base.month - 1)) + months
    return f"{total // 12:04d}-{total % 12 + 1:02d}"


def _months_between(a: str, b: str) -> int:
    ya, ma = int(a[:4]), int(a[5:7])
    yb, mb = int(b[:4]), int(b[5:7])
    return (yb * 12 + mb) - (ya * 12 + ma)


# Huella completa de la unidad (granularidad extrema) → permite analizar plusvalía por
# cualquier dimensión: prototipo, tamaño, nivel, orientación, vista, terraza/roof/balcón, cajones.
_UNIT_FINGERPRINT = (
    "prototype", "m2_privative", "m2_total", "bedrooms", "bathrooms", "level",
    "orientation", "vista", "parking_spots", "parking_type", "bodega",
    "m2_terrace", "m2_roof_garden", "m2_balcony", "status",
)


async def record_price_event(db, dev_id: str, unit: Dict[str, Any], old_price: Optional[float],
                             new_price: Optional[float], *, dev: Optional[Dict] = None,
                             user_id: Optional[str] = None, source: str = "inventory_edit",
                             label: str = "Ajuste de lista") -> None:
    """Append-only. Captura cada cambio de precio con la huella COMPLETA de la unidad. Fail-open."""
    try:
        if not new_price or (old_price is not None and float(old_price) == float(new_price)):
            return
        m2 = unit.get("m2_privative") or unit.get("m2_total") or 0
        doc = {k: unit.get(k) for k in _UNIT_FINGERPRINT}
        doc.update({
            "dev_id": dev_id, "unit_id": unit.get("id"),
            "colonia_id": (dev or {}).get("colonia_id"), "alcaldia": (dev or {}).get("alcaldia"),
            "old_price": old_price, "new_price": new_price,
            "price_per_m2": round(new_price / m2) if m2 else None,
            "delta_abs": round(new_price - old_price) if old_price else None,
            "delta_pct": round((new_price / old_price - 1) * 100, 2) if old_price else None,
            "changed_at": datetime.now(timezone.utc).isoformat(),
            "changed_by": user_id, "source": source, "label": label,
        })
        await db.price_events.insert_one(doc)
    except Exception as e:  # noqa
        log.warning(f"[price-event] {e}")


@router.get("/projects/{project_id}/price-history")
async def price_history(project_id: str, request: Request):
    user = await _auth(request)
    db = _db(request)
    if project_id not in _user_dev_ids(user):
        raise HTTPException(403, "Proyecto no accesible")
    from data_developments import DEVELOPMENTS_BY_ID
    dev = DEVELOPMENTS_BY_ID.get(project_id)
    if not dev:
        raise HTTPException(404, "Proyecto no encontrado")
    now = datetime.now(timezone.utc)

    # ── Snapshot actual por prototipo (seed + overrides) ─────────────────────
    overrides: Dict[str, Dict] = {}
    try:
        async for ov in db.developer_unit_overrides.find({"dev_id": project_id}, {"_id": 0, "unit_id": 1, "price": 1}):
            overrides[ov["unit_id"]] = ov
    except Exception:
        pass
    by_proto: Dict[str, Dict[str, List]] = defaultdict(lambda: {"prices": [], "m2": []})
    for u in dev.get("units", []):
        ov = overrides.get(u["id"], {})
        price = ov.get("price") or u.get("price")
        if price and u.get("prototype"):
            by_proto[u["prototype"]]["prices"].append(price)
            if u.get("m2_privative"):
                by_proto[u["prototype"]]["m2"].append(u["m2_privative"])
    protos = []
    for p, v in by_proto.items():
        m2med = round(median(v["m2"])) if v["m2"] else None
        desde = min(v["prices"])
        protos.append({"prototype": p, "desde": desde, "m2": m2med,
                       "pm2": round(desde / m2med) if m2med else None, "units": len(v["prices"])})
    protos.sort(key=lambda x: x["desde"])

    # ── Serie: eventos reales si hay, si no derivar del seed ─────────────────
    real: Dict[str, List[float]] = defaultdict(list)
    try:
        async for e in db.price_events.find({"dev_id": project_id}, {"_id": 0, "new_price": 1, "changed_at": 1}):
            if e.get("new_price"):
                real[str(e.get("changed_at"))[:7]].append(e["new_price"])
    except Exception:
        pass

    available_real = len(real) >= 2
    series: List[Dict[str, Any]] = []
    if available_real:
        for mk in sorted(real):
            series.append({"period": mk, "price": round(median(real[mk]))})
    else:
        ph = dev.get("price_history") or []
        pts = sorted(ph, key=lambda x: SEED_LABEL_MONTHS.get(x.get("date"), 0))
        for x in pts:
            off = SEED_LABEL_MONTHS.get(x.get("date"), 0)
            series.append({"period": _month_str(now, off - DEFAULT_SPAN), "price": x.get("price")})

    since_launch_pct = annualized_pct = months_span = None
    launch_price = current_price = None
    if len(series) >= 2:
        launch_price = series[0]["price"]
        current_price = series[-1]["price"]
        if launch_price:
            for s in series:
                s["index"] = round(s["price"] / launch_price * 100, 1)
            since_launch_pct = round((current_price / launch_price - 1) * 100, 1)
            months_span = max(1, _months_between(series[0]["period"], series[-1]["period"]))
            annualized_pct = round(((current_price / launch_price) ** (12 / months_span) - 1) * 100, 1)

    return {
        "project_id": project_id, "name": dev.get("name"),
        "source": "eventos_reales" if available_real else "estimado_desde_lanzamiento",
        "series": series,
        "launch_price": launch_price, "current_price": current_price,
        "launch_period": series[0]["period"] if series else None,
        "since_launch_pct": since_launch_pct, "annualized_pct": annualized_pct,
        "months_span": months_span,
        "by_prototype": protos,
    }


async def ensure_price_history_indexes(db):
    try:
        await db.price_events.create_index([("dev_id", 1), ("changed_at", 1)])
    except Exception:
        pass
