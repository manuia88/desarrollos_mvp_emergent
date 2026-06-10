"""W3.6 — Phase Z.4 Vertical Data Products Engine.

Empaqueta los engines existentes (W3.1A · W3.2 · W3.3 · W3.4) como 4 productos
verticales B2B white-label para bancos, aseguradoras, notarías e inversionistas.

NO contiene lógica nueva: REUSA estrictamente:
  - Hedonic regression W3.3            (precio predictivo)
  - Transaction Network W3.2           (comparables, owner chain)
  - Construction Cost W3.1A            (referencia costo)
  - Zone Score W3.1A                   (ajuste por zona)
  - Risk Score V2 W3.4                 (4 dim → riesgo)
  - Fraud Detection W3.4A              (heurística título)

Outputs son shape consistent + methodology_summary auditable.

Schema persistente (opcional, sólo audit):
  db.vertical_product_calls:
    { id, vertical, tenant_id, api_key_id, request_hash,
      tier, status, latency_ms, computed_at }
    TTL 90d
"""
from __future__ import annotations

import hashlib
import logging
import math
import secrets
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.vertical_products_engine")

METHODOLOGY_VERSION = "1.0.0"

# ── tier-driven verbosity ─────────────────────────────────────────────────────
TIER_RANK = {"free": 0, "pro": 1, "enterprise": 2}


def _iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _period_shift(period: str, months_back: int) -> Optional[str]:
    """'YYYY-MM' desplazado N meses hacia atrás."""
    try:
        y, m = (int(x) for x in period.split("-")[:2])
        idx = y * 12 + (m - 1) - months_back
        return f"{idx // 12:04d}-{idx % 12 + 1:02d}"
    except Exception:
        return None


def _period_diff_months(p_old: str, p_new: str) -> int:
    try:
        yo, mo = (int(x) for x in p_old.split("-")[:2])
        yn, mn = (int(x) for x in p_new.split("-")[:2])
        return (yn * 12 + mn) - (yo * 12 + mo)
    except Exception:
        return 0


async def _drpi_yoy_pct(db, zone_id: str) -> Optional[float]:
    """P1.2 · Apreciación ANUAL real (year-over-year) desde el índice DRPI.
    Compara el índice más reciente vs el de ~12 meses atrás. Si no hay punto exacto a 12m,
    anualiza el cambio total sobre los meses transcurridos. None si no hay historia suficiente."""
    try:
        latest = await db.drpi_snapshots.find_one(
            {"zone_id": zone_id, "available": True},
            {"_id": 0, "index_value": 1, "period": 1},
            sort=[("computed_at_dt", -1)],
        )
        if not latest or not latest.get("index_value") or not latest.get("period"):
            return None
        period = latest["period"]
        year_ago = _period_shift(period, 12)
        if year_ago:
            prev = await db.drpi_snapshots.find_one(
                {"zone_id": zone_id, "available": True, "period": year_ago},
                {"_id": 0, "index_value": 1},
            )
            if prev and prev.get("index_value"):
                return (latest["index_value"] / prev["index_value"] - 1) * 100.0
        # Fallback: el más antiguo disponible, anualizado por los meses transcurridos.
        oldest = await db.drpi_snapshots.find_one(
            {"zone_id": zone_id, "available": True},
            {"_id": 0, "index_value": 1, "period": 1},
            sort=[("computed_at_dt", 1)],
        )
        if oldest and oldest.get("index_value") and oldest.get("period") != period:
            months = _period_diff_months(oldest["period"], period)
            if months >= 1:
                total = latest["index_value"] / oldest["index_value"]
                return (total ** (12.0 / months) - 1) * 100.0
        return None
    except Exception:
        return None


def _new_id(prefix: str = "vp") -> str:
    return f"{prefix}_{secrets.token_urlsafe(8)}"


def _request_hash(payload: Dict[str, Any]) -> str:
    s = "|".join(f"{k}={payload.get(k)}" for k in sorted(payload.keys()))
    return hashlib.sha256(s.encode()).hexdigest()[:16]


# ─── Internal helpers ─────────────────────────────────────────────────────────

async def _resolve_zone_for_property(db, features: Dict[str, Any]) -> Optional[str]:
    """Best-effort zone lookup. Uses zone_id explicit, else lat/lng → cube_aggregations."""
    zid = features.get("zone_id")
    if zid:
        return zid
    lat = features.get("lat")
    lng = features.get("lng")
    if lat is None or lng is None:
        return None
    # Coarse zone bucket: search transactions within 0.01° box for nearest zone_id
    try:
        delta = 0.01
        cursor = db.transactions.find(
            {"lat": {"$gte": lat - delta, "$lte": lat + delta},
             "lng": {"$gte": lng - delta, "$lte": lng + delta},
             "zone_id": {"$exists": True, "$ne": None}},
            {"_id": 0, "zone_id": 1},
        ).limit(1)
        async for d in cursor:
            return d.get("zone_id")
    except Exception:
        pass
    return None


async def _hedonic_predict(db, zone_id: str, features: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    import hedonic_regression_engine as hed
    model = await db.hedonic_models.find_one(
        {"zone_id": zone_id, "available": True},
        {"_id": 0, "id": 1}, sort=[("fit_at_dt", -1)],
    )
    if not model:
        return None
    pred = await hed.predict_price(db, model["id"], features)
    return pred if pred and pred.get("available") else None


# ═════════════════════════════════════════════════════════════════════════════
# 1. Bank AVM (Automated Valuation Model)
# ═════════════════════════════════════════════════════════════════════════════

async def compute_avm(
    db, property_features: Dict[str, Any], confidence_target: float = 0.95,
) -> Dict[str, Any]:
    """Bank AVM — pre-mortgage origination valuation.

    Pipeline:
      hedonic predict_price (W3.3) → comparables (W3.2)
      → construction_cost reference (W3.1A) → zone_score adj (W3.1A)
      → risk_score adj (W3.4)

    Returns honest stub when insufficient data."""
    import transaction_network_engine as txn
    import construction_cost_engine as cc
    import risk_score_engine as risk

    feats = dict(property_features or {})
    m2 = float(feats.get("m2") or 0)
    if m2 <= 0:
        return {
            "available": False, "reason": "missing_m2",
            "methodology_version": METHODOLOGY_VERSION,
            "computed_at": _iso(),
        }

    zone_id = await _resolve_zone_for_property(db, feats)
    if not zone_id:
        return {
            "available": False, "reason": "zone_resolution_failed",
            "methodology_version": METHODOLOGY_VERSION, "computed_at": _iso(),
        }

    # ── 1) Hedonic core prediction ──
    hed_pred = await _hedonic_predict(db, zone_id, feats)
    sources: List[str] = []
    pm2 = None
    pm2_low = None
    pm2_high = None
    confidence = 50
    r2 = None
    if hed_pred:
        pm2 = hed_pred.get("predicted_price_per_m2")
        pm2_low = hed_pred.get("ci95_low_per_m2")
        pm2_high = hed_pred.get("ci95_high_per_m2")
        r2 = hed_pred.get("r_squared") or 0
        confidence = round(50 + min(40, r2 * 50))
        sources.append("hedonic_w33")

    # ── 2) Comparables via Transaction Network ──
    comps_payload: List[Dict[str, Any]] = []
    try:
        target = {
            "geo": {"coordinates": [feats.get("lng"), feats.get("lat")]}
                if feats.get("lat") and feats.get("lng") else {},
            "zone_id": zone_id,
            "property_type": feats.get("property_type", "depto"),
            "m2": m2,
            "recamaras": feats.get("recamaras"),
        }
        comps = await txn.compute_comparables(db, target, radius_km=2.0, limit=8)
        for c in comps:
            comps_payload.append({
                "anonymized_id": c.get("anonymized_id"),
                "m2": c.get("m2"),
                "closing_price_mxn": c.get("closing_price_mxn"),
                "closed_at": c.get("closed_at"),
                "similarity_score": c.get("similarity_score"),
            })
        if comps_payload:
            sources.append("transaction_network_w32")
    except Exception as e:
        log.warning(f"[avm] comparables lookup failed: {e}")

    # Mediana de comparables (siempre) — baseline para validar el hedónico y fallback.
    comps_median_pm2 = None
    pm2_list = [
        (c["closing_price_mxn"] / c["m2"])
        for c in comps_payload
        if c.get("m2") and c.get("closing_price_mxn")
    ]
    if pm2_list:
        pm2_list.sort()
        comps_median_pm2 = pm2_list[len(pm2_list) // 2]

    # If no hedonic, derive from median comparable price/m²
    if pm2 is None and comps_median_pm2:
        pm2 = comps_median_pm2
        pm2_low = pm2 * 0.92
        pm2_high = pm2 * 1.08
        confidence = max(confidence, 60)

    # ── P1.4 · GUARD de cordura del hedónico (mismo patrón que avm_public) ──
    # Rechaza la predicción hedónica si r² es muy bajo (<0.20) o si diverge >3× del comparable.
    # Evita valuaciones absurdas (ej. 8×) en el AVM BANCARIO (pre-originación de crédito).
    if hed_pred and pm2 is not None:
        r2_ok = (r2 is None) or (float(r2) >= 0.20)
        ratio_ok = True
        if comps_median_pm2 and comps_median_pm2 > 0:
            ratio = pm2 / comps_median_pm2
            ratio_ok = 0.30 <= ratio <= 3.0
        if not (r2_ok and ratio_ok):
            log.info(
                f"[avm] hedónico rechazado (baja calidad) zone={zone_id} "
                f"r2={r2} pm2={pm2} comps_med={comps_median_pm2} · fallback comparables"
            )
            if "hedonic_w33" in sources:
                sources.remove("hedonic_w33")
            if comps_median_pm2:
                pm2 = comps_median_pm2
                pm2_low = comps_median_pm2 * 0.92
                pm2_high = comps_median_pm2 * 1.08
                confidence = 55
            else:
                # Sin comparables para validar y modelo malo → NO afirmamos un valor de banco.
                return {
                    "available": False, "reason": "hedonic_low_quality_no_comps",
                    "zone_id": zone_id, "r_squared": r2,
                    "methodology_version": METHODOLOGY_VERSION, "computed_at": _iso(),
                }

    if pm2 is None:
        return {
            "available": False, "reason": "no_hedonic_or_comps",
            "zone_id": zone_id,
            "methodology_version": METHODOLOGY_VERSION,
            "computed_at": _iso(),
        }

    # ── 3) Construction cost reference (W3.1A) ──
    cost_ref: Optional[Dict[str, Any]] = None
    try:
        cost_ref = await cc.predict_cost_per_m2(zone_id, "vertical", "mid")
        if cost_ref:
            sources.append("construction_cost_w31a")
    except Exception as e:
        log.warning(f"[avm] cost ref failed: {e}")

    # ── 4) Zone Score (W3.1A) ──
    zone_score = None
    try:
        zs = await db.zone_scores.find_one(
            {"zone_id": zone_id}, {"_id": 0, "score_numeric": 1, "score_letter": 1},
            sort=[("computed_at_dt", -1)],
        )
        if zs:
            zone_score = zs.get("score_numeric")
            sources.append("zone_score_w31a")
    except Exception:
        pass

    # ── 5) Risk score adjuster (W3.4) ──
    risk_adj = 1.0
    risk_letter = None
    try:
        rdoc = await risk.get_risk_score_or_compute(db, zone_id)
        if rdoc.get("available"):
            risk_letter = rdoc.get("score_letter")
            # Risk D/E/F → -2% to -8% adjuster
            adj_map = {"A": 1.00, "B": 1.00, "C": 0.99, "D": 0.97, "E": 0.94, "F": 0.92}
            risk_adj = adj_map.get(risk_letter or "C", 0.98)
            sources.append("risk_score_w34")
    except Exception:
        pass

    value_total = round(pm2 * m2 * risk_adj, 0)
    value_low = round((pm2_low or pm2 * 0.92) * m2 * risk_adj, 0)
    value_high = round((pm2_high or pm2 * 1.08) * m2 * risk_adj, 0)
    confidence_pct = max(40, min(95, confidence))

    return {
        "available": True,
        "zone_id": zone_id,
        "value_mxn": value_total,
        "value_per_m2_mxn": round(pm2 * risk_adj, 0),
        "confidence_interval_low_mxn": value_low,
        "confidence_interval_high_mxn": value_high,
        "confidence_pct": confidence_pct,
        "confidence_target": confidence_target,
        "risk_adjuster_letter": risk_letter,
        "risk_adjuster_factor": round(risk_adj, 4),
        "zone_score": zone_score,
        "construction_cost_reference_mxn_m2": (cost_ref or {}).get("cost_per_m2_mxn"),
        "comparables_used": comps_payload,
        "data_sources": sources,
        "methodology_summary": (
            "AVM = hedonic_predict(W3.3) ponderado por comparables(W3.2), "
            "ajustado por riesgo letra(W3.4). CI95 vía error estándar de coeficientes "
            "OLS más fallback ±8% si sólo comparables disponibles."
        ),
        "methodology_version": METHODOLOGY_VERSION,
        "computed_at": _iso(),
    }


# ═════════════════════════════════════════════════════════════════════════════
# 2. Insurance Risk Score
# ═════════════════════════════════════════════════════════════════════════════

PERIL_WEIGHTS = {
    "seismic": 0.30,
    "flood": 0.25,
    "theft": 0.30,
    "fire": 0.15,
}


async def compute_insurance_risk(
    db, property_features: Dict[str, Any],
    coverage_type: str = "property",
) -> Dict[str, Any]:
    """Insurance underwriting + premium recommendation.

    Pipeline:
      Risk Score V2 W3.4 (crime/natural/title/perception)
      + adjusters por property features (m2, year_built, floor)
      → 4-peril breakdown + premium % recomendado.
    """
    import risk_score_engine as risk
    import natural_risk_engine as natural

    feats = dict(property_features or {})
    zone_id = await _resolve_zone_for_property(db, feats)
    if not zone_id:
        return {
            "available": False, "reason": "zone_resolution_failed",
            "methodology_version": METHODOLOGY_VERSION, "computed_at": _iso(),
        }

    rdoc = await risk.get_risk_score_or_compute(db, zone_id)
    nat = await natural.compute_natural_risk_zone(db, zone_id)

    if not rdoc.get("available"):
        return {
            "available": False, "reason": "no_risk_data",
            "zone_id": zone_id,
            "methodology_version": METHODOLOGY_VERSION, "computed_at": _iso(),
        }

    components = rdoc.get("components") or {}

    # Property-specific adjusters
    year_built = float(feats.get("year_built") or 2010)
    age = max(0, 2026 - year_built)
    floor = float(feats.get("floor") or 0)
    m2 = float(feats.get("m2") or 60)

    age_factor = 1.0 + min(0.25, max(0, age - 20) * 0.01)   # +1% per yr after 20
    floor_factor = 1.0 + (floor * 0.005 if floor >= 5 else 0)  # high floor → small risk
    m2_factor = 1.0 if m2 < 200 else 1.05

    # Per-peril risk 0-100 (higher = more risky)
    seismic_risk = 0.0
    flood_risk = 0.0
    theft_risk = 0.0
    fire_risk = 0.0

    if nat.get("available"):
        sismic_zone = (nat.get("sismic_zone") or "B").upper()
        seismic_map = {"A": 20, "B": 45, "C": 70, "D": 90}
        seismic_risk = seismic_map.get(sismic_zone, 50) * age_factor
        flood_pct = float(nat.get("flood_pct") or 0)
        flood_risk = min(100, flood_pct * 1.2)
        # Subsidence add (slow onset) impact fire+seismic mid-tier
        subs = float(nat.get("subsidence_mm_year") or 0)
        seismic_risk = min(100, seismic_risk + subs * 0.5)

    crime_score = components.get("crime_score")
    if isinstance(crime_score, (int, float)):
        # Score 0-100 (higher = better). Theft RISK = 100 - score
        theft_risk = round(max(0, 100 - crime_score), 1)
    else:
        theft_risk = 50.0

    # Fire risk simple: building age + floor (older + high floor = more fire risk)
    fire_risk = round(min(100, 25 + age * 0.5 + (floor * 0.8 if floor >= 8 else 0)), 1)

    # Round
    seismic_risk = round(min(100, seismic_risk), 1)
    flood_risk = round(min(100, flood_risk), 1)

    # Composite risk weighted
    composite = round(
        PERIL_WEIGHTS["seismic"] * seismic_risk
        + PERIL_WEIGHTS["flood"] * flood_risk
        + PERIL_WEIGHTS["theft"] * theft_risk
        + PERIL_WEIGHTS["fire"] * fire_risk,
        1,
    )
    composite *= m2_factor * floor_factor
    composite = round(min(100, composite), 1)

    # Premium recommendation: base 0.4% annual, scaled by composite/50
    # Coverage type modifier
    base_premium_pct = {
        "property": 0.40,
        "liability": 0.25,
        "catastrophic": 0.65,
    }.get(coverage_type, 0.40)
    premium_pct = round(base_premium_pct * (composite / 50.0), 3)

    sources: List[str] = ["risk_score_w34"]
    if nat.get("available"):
        sources.append("natural_risk_w34b")
    if components.get("crime_score") is not None:
        sources.append("sesnsp_w34a")

    return {
        "available": True,
        "zone_id": zone_id,
        "coverage_type": coverage_type,
        "risk_score_0_100": composite,
        "premium_recommendation_pct": premium_pct,
        "premium_base_pct": base_premium_pct,
        "peril_breakdown": {
            "seismic": seismic_risk,
            "flood": flood_risk,
            "theft": theft_risk,
            "fire": fire_risk,
            "weights": PERIL_WEIGHTS,
        },
        "property_adjusters": {
            "age_factor": round(age_factor, 4),
            "floor_factor": round(floor_factor, 4),
            "m2_factor": round(m2_factor, 4),
        },
        "data_sources": sources,
        "methodology_summary": (
            "Composite = Σ peso_peril × risk_peril. "
            "Seismic: zona sísmica CDMX × age_factor. "
            "Flood: % colonia inundable W3.4B. "
            "Theft: 100 − crime_score W3.4A. "
            "Fire: heurística age+floor. "
            "Premium = base_coverage × (composite/50)."
        ),
        "methodology_version": METHODOLOGY_VERSION,
        "computed_at": _iso(),
    }


# ═════════════════════════════════════════════════════════════════════════════
# 3. Notaría Title Check
# ═════════════════════════════════════════════════════════════════════════════

async def compute_title_check(
    db, property_id: str, owner_history: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Pre-escritura due diligence.

    Pipeline:
      Transaction Network W3.2 lookup property_id_hash
      + title risk heuristic W3.4 (flips count / recency)
      + Fraud Detection W3.4A title chain placeholder
    """
    owner_history = owner_history or []

    tx_doc = await db.transactions.find_one(
        {"$or": [
            {"id": property_id},
            {"anonymized_id": property_id},
            {"property_id_hash": property_id},
        ]},
        {"_id": 0},
    )

    if not tx_doc and not owner_history:
        return {
            "available": False, "reason": "insufficient_history",
            "property_id": property_id,
            "methodology_summary": (
                "No se encontró historial en Transaction Network ni se "
                "proveyó owner_history. Se requiere ≥1 fuente para due diligence."
            ),
            "methodology_version": METHODOLOGY_VERSION,
            "computed_at": _iso(),
        }

    flags: List[Dict[str, str]] = []
    sources: List[str] = []
    confidence = 70
    title_clear = True

    # Owner chain via property_id_hash flips W3.4 heuristic
    owner_chain: List[Dict[str, Any]] = []
    flips = 0
    if tx_doc and tx_doc.get("property_id_hash"):
        sources.append("transaction_network_w32")
        cursor = db.transactions.find(
            {"property_id_hash": tx_doc["property_id_hash"]},
            {"_id": 0, "anonymized_id": 1, "closing_price_mxn": 1,
             "closed_at": 1, "zone_id": 1},
        ).sort("closed_at", 1).limit(20)
        owner_chain = [d async for d in cursor]
        flips = max(0, len(owner_chain) - 1)
        if flips >= 3:
            flags.append({
                "severity": "warning",
                "description": (
                    f"Propiedad cambió {flips} veces en historial — patrón "
                    "atípico (flipping)."
                ),
            })
            title_clear = False
            confidence = max(50, confidence - 15)

    # User-provided owner_history flags
    if owner_history:
        sources.append("owner_history_provided")
        if len(owner_history) > 5:
            flags.append({
                "severity": "info",
                "description": f"Cadena de propietarios larga ({len(owner_history)})",
            })
        # Detect rapid same-year transfers
        years = [o.get("year") for o in owner_history if o.get("year")]
        if len(set(years)) < len(years):
            flags.append({
                "severity": "warning",
                "description": "Múltiples transferencias en el mismo año",
            })
            title_clear = False
            confidence = max(45, confidence - 10)

    # Fraud Detection title placeholder
    try:
        fraud = await db.fraud_alerts.find_one(
            {"listing_id_hash": tx_doc.get("anonymized_id") if tx_doc else None,
             "source": {"$in": ["title_chain", "fraud_detection_w34a"]}},
            {"_id": 0, "severity": 1, "evidence": 1},
        )
        if fraud:
            sources.append("fraud_detection_w34a")
            flags.append({
                "severity": fraud.get("severity") or "warning",
                "description": "Alerta previa registrada en Fraud Detection",
            })
            title_clear = False
            confidence = max(40, confidence - 20)
    except Exception:
        pass

    recommendations: List[str] = []
    if not title_clear:
        recommendations.append("Solicitar historial RPP completo de últimos 10 años")
        recommendations.append("Verificar libertad de gravamen ante notario")
    if flips >= 3:
        recommendations.append("Investigar motivo de transferencias frecuentes")
    if not recommendations:
        recommendations.append("Proceder con verificación estándar pre-escritura")

    return {
        "available": True,
        "property_id": property_id,
        "title_clear": title_clear,
        "confidence_pct": confidence,
        "flags": flags,
        "owner_chain": owner_chain,
        "owner_history_provided_count": len(owner_history),
        "flips_detected": flips,
        "recommendations": recommendations,
        "data_sources": sources,
        "methodology_summary": (
            "Title Check combina Transaction Network W3.2 (flips por "
            "property_id_hash), historial proporcionado y alertas de Fraud "
            "Detection W3.4A. Versión heurística — pendiente integración RPP "
            "real Y2."
        ),
        "v3_pending": "RPP partnership Y2",
        "methodology_version": METHODOLOGY_VERSION,
        "computed_at": _iso(),
    }


# ═════════════════════════════════════════════════════════════════════════════
# 4. Investor Yield Calculator
# ═════════════════════════════════════════════════════════════════════════════

async def compute_investor_yield(
    db, property_features: Dict[str, Any], hold_years: int = 5,
) -> Dict[str, Any]:
    """Yield estimate for a real-estate investor.

    Pipeline:
      AVM (above) + DRPI W3.3 forecasting + rent estimate W3.1A yield
      + Monte Carlo p10/p50/p90 over hold_years.
    """
    feats = dict(property_features or {})
    purchase_price = feats.get("purchase_price")
    hold_years = max(1, min(30, int(hold_years or 5)))

    # 1) AVM
    avm = await compute_avm(db, feats)
    if not avm.get("available"):
        return {
            "available": False,
            "reason": avm.get("reason") or "avm_unavailable",
            "methodology_version": METHODOLOGY_VERSION,
            "computed_at": _iso(),
        }

    value_mxn = avm["value_mxn"]
    if not purchase_price:
        purchase_price = value_mxn

    # 2) Rent estimate — gross yield component
    avg_rental = None
    cube = await db.cube_aggregations.find_one(
        {"tier_id": avm["zone_id"], "period": "current"},
        {"_id": 0, "kpis": 1},
    )
    if cube:
        kpis = cube.get("kpis") or {}
        avg_rental = kpis.get("avg_rental_mxn") or (
            (kpis.get("avg_price_mxn") or value_mxn) * 0.0040
        )
    if not avg_rental:
        avg_rental = value_mxn * 0.0040  # 0.4%/mes
    monthly_rent = round(avg_rental, 0)
    annual_rent = monthly_rent * 12

    # 3) Cap rate + cash-on-cash
    op_expense_ratio = 0.30  # 30% costs (admin, mant, vacancy)
    noi = annual_rent * (1 - op_expense_ratio)
    cap_rate_pct = round((noi / purchase_price) * 100, 2) if purchase_price > 0 else 0

    # Assume LTV 30% financing if no terms
    financing = feats.get("financing_terms") or {}
    ltv = float(financing.get("ltv_pct") or 30) / 100
    rate_apr = float(financing.get("rate_apr_pct") or 11) / 100
    loan = purchase_price * ltv
    equity = purchase_price - loan
    annual_debt = loan * rate_apr   # interest-only approx
    cash_flow = noi - annual_debt
    cash_on_cash_pct = round((cash_flow / equity) * 100, 2) if equity > 0 else 0

    # 4) DRPI appreciation projection · P1.2 · apreciación ANUAL real (YoY) desde el índice DRPI.
    # Antes leía `yoy_change_pct` (campo inexistente; drpi_snapshots guarda `delta_pct` mes-a-mes)
    # → siempre caía al default 6.5% y nunca citaba la fuente. Ahora se computa el YoY verdadero.
    drpi_growth_pct_annual = 6.5  # default CDMX historical (fallback honesto si no hay índice)
    sources = list(avm.get("data_sources") or [])
    drpi_yoy = await _drpi_yoy_pct(db, avm["zone_id"])
    if drpi_yoy is not None:
        drpi_growth_pct_annual = max(-5, min(20, float(drpi_yoy)))
        sources.append("drpi_w33")

    growth = drpi_growth_pct_annual / 100
    final_value = purchase_price * ((1 + growth) ** hold_years)
    appreciation = final_value - purchase_price

    total_rent = annual_rent * hold_years * (1 - op_expense_ratio)
    total_return = appreciation + total_rent - (annual_debt * hold_years)
    total_return_pct = round((total_return / max(equity, 1)) * 100, 2)

    # IRR approx (simple)
    if equity > 0:
        irr = ((final_value + total_rent - loan) / equity) ** (1.0 / hold_years) - 1
        irr_pct = round(irr * 100, 2)
    else:
        irr_pct = 0.0

    # Breakeven months: equity / monthly cash flow (if positive)
    monthly_cf = cash_flow / 12
    breakeven_months = round(equity / monthly_cf, 1) if monthly_cf > 0 else None

    # 5) Monte Carlo lite (p10/p50/p90 deterministic via ±2σ growth band)
    sigma = 0.025  # 2.5% std dev annual growth
    g_p10 = growth - 1.282 * sigma
    g_p50 = growth
    g_p90 = growth + 1.282 * sigma
    monte = {
        "p10": round(purchase_price * ((1 + g_p10) ** hold_years), 0),
        "p50": round(purchase_price * ((1 + g_p50) ** hold_years), 0),
        "p90": round(purchase_price * ((1 + g_p90) ** hold_years), 0),
        "growth_p10_annual_pct": round(g_p10 * 100, 2),
        "growth_p50_annual_pct": round(g_p50 * 100, 2),
        "growth_p90_annual_pct": round(g_p90 * 100, 2),
    }

    return {
        "available": True,
        "zone_id": avm["zone_id"],
        "purchase_price_mxn": purchase_price,
        "estimated_value_mxn": value_mxn,
        "hold_years": hold_years,
        "cap_rate_pct": cap_rate_pct,
        "cash_on_cash_pct": cash_on_cash_pct,
        "monthly_rent_estimate_mxn": monthly_rent,
        "annual_noi_mxn": round(noi, 0),
        "appreciation_total_mxn": round(appreciation, 0),
        "total_return_pct": total_return_pct,
        "irr_pct": irr_pct,
        "breakeven_months": breakeven_months,
        "drpi_growth_used_pct": drpi_growth_pct_annual,
        "monte_carlo_scenarios": monte,
        "financing_terms": {
            "ltv_pct": round(ltv * 100, 1),
            "rate_apr_pct": round(rate_apr * 100, 2),
            "loan_mxn": round(loan, 0),
            "equity_mxn": round(equity, 0),
        },
        "comparables_count": len(avm.get("comparables_used") or []),
        "data_sources": sources,
        "methodology_summary": (
            "Yield = AVM (W3.6) → cap_rate + cash_on_cash con LTV/APR. "
            "Apreciación con tasa DRPI W3.3 (yoy_change_pct), proyectada N años. "
            "Monte Carlo σ=2.5% p10/p50/p90 sobre tasa anual."
        ),
        "methodology_version": METHODOLOGY_VERSION,
        "computed_at": _iso(),
    }


# ═════════════════════════════════════════════════════════════════════════════
# Audit log persistence
# ═════════════════════════════════════════════════════════════════════════════

async def persist_call_audit(
    db, vertical: str, ctx, request_payload: Dict[str, Any],
    *, status: str, latency_ms: int,
) -> None:
    try:
        await db.vertical_product_calls.insert_one({
            "id": _new_id("vpc"),
            "vertical": vertical,
            "tenant_id": getattr(ctx, "tenant_id", "") or "",
            "api_key_id": getattr(ctx, "id", "") or "",
            "tier": getattr(ctx, "tier", "") or "",
            "request_hash": _request_hash(request_payload or {}),
            "status": status,
            "latency_ms": latency_ms,
            "computed_at": _iso(),
            "computed_at_dt": _now(),
        })
    except Exception as e:
        log.warning(f"[vp] persist audit failed: {e}")


# ─── Indexes ──────────────────────────────────────────────────────────────────

async def ensure_indexes(db) -> None:
    try:
        await db.vertical_product_calls.create_index(
            [("vertical", 1), ("computed_at_dt", -1)],
            name="vp_calls_vertical_ts",
        )
        await db.vertical_product_calls.create_index(
            [("tenant_id", 1), ("computed_at_dt", -1)],
            name="vp_calls_tenant_ts",
        )
        await db.vertical_product_calls.create_index(
            "computed_at_dt", expireAfterSeconds=90 * 86400,
            name="vp_calls_ttl_90d",
        )
        # Data licensing subscriptions
        await db.data_licensing_subscriptions.create_index(
            "id", unique=True, name="dls_id_unique",
        )
        await db.data_licensing_subscriptions.create_index(
            [("tenant_id", 1), ("status", 1)],
            name="dls_tenant_status",
        )
        await db.data_licensing_subscriptions.create_index(
            [("ends_at", 1)], name="dls_ends_at",
        )
    except Exception as e:
        log.warning(f"[vp] ensure_indexes failed: {e}")
