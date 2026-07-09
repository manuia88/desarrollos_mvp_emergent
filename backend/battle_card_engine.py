"""W5.23 — Battle Card Engine.

5 dimensiones de scoring competitivo para proyectos de desarrolladores.
Colección: battle_card_snapshots (TTL 90d · index project_id + week_iso DESC)

Dimensiones (peso 0.20 c/u):
  precio    : relación precio listado vs AVM W5.1 + velocidad comparables
  ventas    : leads recientes / inventory_size · sigmoid
  zona      : subscores zona W5.2 aggregate
  marketing : tasa de implementación recomendaciones Y.2B
  lead_gen  : funnel behavioral events W4.3

Funciones públicas:
  compute_dimension_scores(db, project_id)
  get_my_score(db, project_id)
  get_top_competitors(db, project_id, zone_slug, limit=3)
  compute_ranking(db, project_id, zone_slug)
  recommend_next_action(db, project_id)
  insufficient_competitors_check(db, zone_slug)
"""
from __future__ import annotations

import logging
import math
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple

log = logging.getLogger("dmx.battle_card")

# ─── Constantes ───────────────────────────────────────────────────────────────
DIM_WEIGHTS = {
    "precio":    0.20,
    "ventas":    0.20,
    "zona":      0.20,
    "marketing": 0.20,
    "lead_gen":  0.20,
}

RECOMMENDED_TEMPLATES = [
    {
        "dim": "precio",
        "action": (
            "Ajustar precio -3% segun velocidad de comparables en zona. "
            "Tu precio listado esta por encima del AVM · esto ralentiza cierres."
        ),
    },
    {
        "dim": "ventas",
        "action": (
            "Acelerar ciclo de ventas: activar seguimiento WhatsApp 48h post-lead. "
            "Leads recientes con baja conversion sugieren tiempo de respuesta alto."
        ),
    },
    {
        "dim": "zona",
        "action": (
            "La zona muestra señal debil en sub-scores. "
            "Evalua campañas de posicionamiento zona o migrar presupuesto a colonias adyacentes."
        ),
    },
    {
        "dim": "marketing",
        "action": (
            "Ejecuta las recomendaciones de marketing pendientes del subagente Y.2B. "
            "Tasa de implementacion por debajo del 50%."
        ),
    },
    {
        "dim": "lead_gen",
        "action": (
            "Optimiza funnel de captacion: agrega CTA en pagina de zona y formulario corto. "
            "Tasa de conversion de visitas a leads por debajo del benchmark."
        ),
    },
]


# ─── Helpers internos ─────────────────────────────────────────────────────────

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso_week(dt: Optional[datetime] = None) -> str:
    d = dt or _now()
    return f"{d.isocalendar()[0]}-W{d.isocalendar()[1]:02d}"


def _sigmoid(x: float) -> float:
    try:
        return 1.0 / (1.0 + math.exp(-x))
    except OverflowError:
        return 0.0 if x < 0 else 1.0


def _clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


def _score_color(score: float) -> str:
    """Verde >=75 · Amarillo 50-75 · Rojo <50"""
    if score >= 75:
        return "green"
    if score >= 50:
        return "yellow"
    return "red"


# ─── Dimensión: precio ────────────────────────────────────────────────────────

async def _dim_precio(db, project_id: str, dev: dict) -> float:
    """0-100. Compara precio listado vs AVM + velocidad comparables zona."""
    try:
        from avm_public_engine import avm_quick_async
        colonia = dev.get("colonia_id") or dev.get("colonia") or ""
        m2_low, m2_high = (dev.get("m2_range") or {}).get("low", 70), (dev.get("m2_range") or {}).get("high", 120)
        m2_mid = (m2_low + m2_high) / 2

        avm = await avm_quick_async(db, colonia, m2_mid, 2, 2, 5)
        avm_val = float(avm.get("precio_estimado") or 0)
        price_from = float(dev.get("price_from") or 0)
        price_to = float(dev.get("price_to") or 0)
        price_mid = ((price_from + price_to) / 2) if price_from and price_to else price_from or price_to

        # AUDITORÍA 07-08: cuando no hay AVM para la colonia, usar los COMPARABLES REALES ingeridos/históricos
        # (dev_competitor_price_snapshots — incluye los cierres retro DECA). Antes esta colección no la leía
        # nadie salvo sus propios writers; ahora alimenta la señal de precio del battle card.
        if avm_val <= 0 and colonia:
            comps = [c async for c in db.dev_competitor_price_snapshots.find(
                {"$or": [{"colonia_id": colonia}, {"zone_id": colonia}]}, {"_id": 0, "price_m2_median": 1})]
            m2s = sorted(float(c["price_m2_median"]) for c in comps if c.get("price_m2_median"))
            if m2s and m2_mid > 0:
                ref_m2 = m2s[len(m2s) // 2]                 # $/m² mediano de comparables de la colonia
                avm_val = ref_m2 * m2_mid                    # referencia sintética para el mismo m² medio

        if avm_val <= 0 or price_mid <= 0:
            return 50.0  # neutral si no hay data

        # z = (avm - price_mid) / avm → positivo si precio < avm (más competitivo)
        price_ratio = avm_val / price_mid
        # Si precio_mid <= avm → competitivo → score alto
        # k=6: ratio 1.05 → ~73%, ratio 1.0 → 50%, ratio 0.95 → ~27%
        score = _sigmoid((price_ratio - 1.0) * 6.0) * 100.0
        return _clamp(score)
    except Exception as exc:
        log.debug(f"[battle_card] dim_precio error {project_id}: {exc}")
        return 50.0


# ─── Dimensión: ventas ────────────────────────────────────────────────────────

async def _dim_ventas(db, project_id: str, dev: dict) -> float:
    """0-100. leads recientes / inventory_size sigmoid."""
    try:
        units_available = int(dev.get("units_available") or 0)
        units_total = int(dev.get("units_total") or 0)
        if units_total <= 0:
            return 50.0

        # Leads últimos 7 días para este proyecto. created_at se guarda como ISO string
        # (dev_batch4_1.py now_iso) → comparar string-vs-string (ISO 8601 ordena cronológico).
        since = (_now() - timedelta(days=7)).isoformat()
        leads_7d = await db.leads.count_documents({
            "project_id": project_id,
            "created_at": {"$gte": since},
        })

        # Velocidad: leads por unidad disponible
        inventory = max(1, units_available)
        velocity = leads_7d / inventory

        # Benchmark: 2 leads/semana/unidad = score 75+
        # sigmoid calibrado: velocity=0.5 → ~73%, velocity=0.2 → ~55%, velocity=0.05 → ~35%
        x = (velocity - 0.2) * 8.0
        score = _sigmoid(x) * 100.0
        return _clamp(score)
    except Exception as exc:
        log.debug(f"[battle_card] dim_ventas error {project_id}: {exc}")
        return 40.0


# ─── Dimensión: zona ─────────────────────────────────────────────────────────

async def _dim_zona(db, zone_slug: str) -> float:
    """0-100. Aggregate sub-scores zona W5.2."""
    try:
        doc = await db.zone_subscores.find_one(
            {"zone_id": zone_slug},
            {"_id": 0, "scores": 1, "total_score": 1},
            sort=[("computed_at", -1)],
        )
        if not doc:
            return 50.0
        # total_score 0-100 directamente
        total = doc.get("total_score")
        if total is not None:
            return _clamp(float(total))
        # fallback: average de scores individuales
        scores = doc.get("scores") or {}
        vals = [float(v) for v in scores.values() if isinstance(v, (int, float))]
        return _clamp(sum(vals) / len(vals)) if vals else 50.0
    except Exception as exc:
        log.debug(f"[battle_card] dim_zona error {zone_slug}: {exc}")
        return 50.0


# ─── Dimensión: marketing ─────────────────────────────────────────────────────

async def _dim_marketing(db, project_id: str, dev_org_id: str) -> float:
    """0-100. Tasa de implementación recomendaciones Y.2B."""
    try:
        total = await db.pricing_recommendations.count_documents(
            {"org_id": dev_org_id}
        )
        if total == 0:
            # Buscar con project_id
            total = await db.pricing_recommendations.count_documents(
                {"project_id": project_id}
            )
        if total == 0:
            return 50.0

        applied = await db.pricing_recommendations.count_documents(
            {"org_id": dev_org_id, "status": {"$in": ["applied", "implemented", "done"]}},
        )
        if applied == 0:
            applied = await db.pricing_recommendations.count_documents(
                {"project_id": project_id, "status": {"$in": ["applied", "implemented", "done"]}},
            )

        implementation_rate = applied / total
        # 0% impl → 20, 50% → 55, 100% → 90
        score = 20.0 + implementation_rate * 70.0
        return _clamp(score)
    except Exception as exc:
        log.debug(f"[battle_card] dim_marketing error {project_id}: {exc}")
        return 50.0


# ─── Dimensión: lead_gen ──────────────────────────────────────────────────────

async def _dim_lead_gen(db, project_id: str, dev_org_id: str) -> float:
    """0-100. Funnel behavioral_events W4.3: visitas → contacto."""
    try:
        since = _now() - timedelta(days=30)
        total_views = await db.behavioral_events.count_documents({
            "org_id": dev_org_id,
            "event_type": {"$in": ["page_view", "property_view", "project_view"]},
            "created_at": {"$gte": since},
        })
        if total_views == 0:
            return 50.0

        contact_events = await db.behavioral_events.count_documents({
            "org_id": dev_org_id,
            "event_type": {"$in": ["contact_click", "whatsapp_click", "form_submit", "lead_created"]},
            "created_at": {"$gte": since},
        })

        conversion_rate = contact_events / total_views
        # benchmark: 5% conversion = 70, 10% = 90, 0.5% = 30
        # sigmoid calibrado
        x = (conversion_rate - 0.03) * 30.0
        score = _sigmoid(x) * 100.0
        return _clamp(score)
    except Exception as exc:
        log.debug(f"[battle_card] dim_lead_gen error {project_id}: {exc}")
        return 50.0


# ─── API Pública ──────────────────────────────────────────────────────────────

async def compute_dimension_scores(db, project_id: str) -> Dict[str, Any]:
    """Retorna dict con 5 scores dimensionales 0-100 para un proyecto."""
    from data_developments import DEVELOPMENTS_BY_ID
    dev = DEVELOPMENTS_BY_ID.get(project_id)
    if not dev:
        return {
            "available": False,
            "reason": "project_not_found",
            "project_id": project_id,
        }

    zone_slug = dev.get("colonia_id") or dev.get("colonia") or ""
    dev_org_id = dev.get("developer_id") or ""

    precio_s    = await _dim_precio(db, project_id, dev)
    ventas_s    = await _dim_ventas(db, project_id, dev)
    zona_s      = await _dim_zona(db, zone_slug)
    marketing_s = await _dim_marketing(db, project_id, dev_org_id)
    lead_gen_s  = await _dim_lead_gen(db, project_id, dev_org_id)

    dims = {
        "precio":    round(precio_s, 1),
        "ventas":    round(ventas_s, 1),
        "zona":      round(zona_s, 1),
        "marketing": round(marketing_s, 1),
        "lead_gen":  round(lead_gen_s, 1),
    }
    return {
        "available": True,
        "project_id": project_id,
        "zone_slug": zone_slug,
        "dev_org_id": dev_org_id,
        "dim_scores": dims,
        "computed_at": _now().isoformat(),
    }


async def get_my_score(db, project_id: str) -> Dict[str, Any]:
    """Composite weighted score 0-100 (uniform weight 0.20 por dimensión)."""
    dims_result = await compute_dimension_scores(db, project_id)
    if not dims_result.get("available"):
        return dims_result

    dims = dims_result["dim_scores"]
    composite = sum(dims[d] * DIM_WEIGHTS[d] for d in DIM_WEIGHTS)
    composite = round(composite, 1)

    return {
        **dims_result,
        "composite_score": composite,
        "color": _score_color(composite),
    }


async def get_top_competitors(
    db, project_id: str, zone_slug: str, limit: int = 3
) -> List[Dict[str, Any]]:
    """Top N proyectos competidores en la misma zona, ranked por composite score."""
    from data_developments import DEVELOPMENTS

    zone_projects = [
        d for d in DEVELOPMENTS
        if (d.get("colonia_id") or d.get("colonia") or "") == zone_slug
        and d["id"] != project_id
    ]

    scored: List[Dict[str, Any]] = []
    for comp_dev in zone_projects:
        cid = comp_dev["id"]
        try:
            cs = await get_my_score(db, cid)
            if cs.get("available"):
                scored.append({
                    "project_id": cid,
                    "name": comp_dev.get("name", cid),
                    "dev_org_id": comp_dev.get("developer_id", ""),
                    "composite_score": cs.get("composite_score", 0),
                    "dim_scores": cs.get("dim_scores", {}),
                    "color": cs.get("color", "yellow"),
                })
        except Exception:
            pass

    scored.sort(key=lambda x: x["composite_score"], reverse=True)
    return scored[:limit]


async def compute_ranking(
    db, project_id: str, zone_slug: str
) -> Dict[str, Any]:
    """Ranking actual + delta vs snapshot semana anterior."""
    from data_developments import DEVELOPMENTS

    zone_projects = [
        d for d in DEVELOPMENTS
        if (d.get("colonia_id") or d.get("colonia") or "") == zone_slug
    ]

    all_scores: List[Tuple[str, float]] = []
    for dev in zone_projects:
        try:
            cs = await get_my_score(db, dev["id"])
            if cs.get("available"):
                all_scores.append((dev["id"], cs["composite_score"]))
        except Exception:
            pass

    if not all_scores:
        return {"available": False, "reason": "no_projects_in_zone"}

    all_scores.sort(key=lambda x: x[1], reverse=True)
    rank_current = next(
        (i + 1 for i, (pid, _) in enumerate(all_scores) if pid == project_id),
        None,
    )

    if rank_current is None:
        return {
            "available": False,
            "reason": "project_not_in_ranking",
            "zone_slug": zone_slug,
        }

    # Delta vs semana anterior
    week_prev = _iso_week(_now() - timedelta(weeks=1))
    prev_snapshot = await db.battle_card_snapshots.find_one(
        {"project_id": project_id, "week_iso": week_prev},
        {"_id": 0, "ranking": 1},
        sort=[("computed_at", -1)],
    )
    prev_rank = prev_snapshot.get("ranking") if prev_snapshot else None
    delta_position = (prev_rank - rank_current) if prev_rank else 0  # positivo = subio

    return {
        "available": True,
        "rank": rank_current,
        "total_in_zone": len(all_scores),
        "delta_position": delta_position,
        "prev_rank": prev_rank,
        "zone_slug": zone_slug,
        "week_iso": _iso_week(),
    }


async def recommend_next_action(db, project_id: str) -> Dict[str, Any]:
    """Recomienda acción específica basada en la dimensión más débil."""
    dims_result = await compute_dimension_scores(db, project_id)
    if not dims_result.get("available"):
        return {
            "available": False,
            "action": "Datos insuficientes para generar recomendacion.",
        }

    dims = dims_result["dim_scores"]
    weakest_dim = min(dims, key=dims.get)
    weakest_score = dims[weakest_dim]

    # Encontrar template para la dimensión más débil
    action_text = next(
        (t["action"] for t in RECOMMENDED_TEMPLATES if t["dim"] == weakest_dim),
        "Revisa las recomendaciones del subagente Y.2A para mejorar performance.",
    )

    return {
        "available": True,
        "weakest_dim": weakest_dim,
        "weakest_score": weakest_score,
        "action": action_text,
        "project_id": project_id,
    }


async def insufficient_competitors_check(db, zone_slug: str) -> bool:
    """True si hay menos de 3 proyectos distintos en la zona (excluyendo developer actual)."""
    from data_developments import DEVELOPMENTS
    count = sum(
        1 for d in DEVELOPMENTS
        if (d.get("colonia_id") or d.get("colonia") or "") == zone_slug
    )
    return count < 3


# ─── Snapshot ─────────────────────────────────────────────────────────────────

async def compute_and_persist_snapshot(
    db, project_id: str
) -> Dict[str, Any]:
    """Calcula y persiste snapshot en battle_card_snapshots."""
    from data_developments import DEVELOPMENTS_BY_ID
    dev = DEVELOPMENTS_BY_ID.get(project_id)
    if not dev:
        return {"ok": False, "reason": "project_not_found"}

    zone_slug = dev.get("colonia_id") or dev.get("colonia") or ""
    dev_org_id = dev.get("developer_id") or ""
    week_iso = _iso_week()

    my_score = await get_my_score(db, project_id)
    ranking = await compute_ranking(db, project_id, zone_slug)
    competitors = await get_top_competitors(db, project_id, zone_slug, limit=3)
    recommendation = await recommend_next_action(db, project_id)

    # Calcular delta_pp vs semana anterior
    week_prev = _iso_week(_now() - timedelta(weeks=1))
    prev_snap = await db.battle_card_snapshots.find_one(
        {"project_id": project_id, "week_iso": week_prev},
        {"_id": 0, "my_score": 1},
        sort=[("computed_at", -1)],
    )
    prev_score = float(prev_snap.get("my_score") or 0) if prev_snap else 0.0
    delta_pp = round(my_score.get("composite_score", 0) - prev_score, 1)

    doc = {
        "id": f"{project_id}_{week_iso}",
        "project_id": project_id,
        "dev_org_id": dev_org_id,
        "zone_slug": zone_slug,
        "week_iso": week_iso,
        "my_score": my_score.get("composite_score", 0),
        "dim_scores": my_score.get("dim_scores", {}),
        "competitor_scores": competitors,
        "ranking": ranking.get("rank"),
        "delta_position": ranking.get("delta_position", 0),
        "delta_pp": delta_pp,
        "recommended_action": recommendation.get("action"),
        "weakest_dim": recommendation.get("weakest_dim"),
        "computed_at": _now().isoformat(),
        "expire_at": _now() + timedelta(days=90),
    }

    try:
        await db.battle_card_snapshots.replace_one(
            {"project_id": project_id, "week_iso": week_iso},
            doc,
            upsert=True,
        )
    except Exception as exc:
        log.warning(f"[battle_card] snapshot persist failed {project_id}: {exc}")

    return {"ok": True, "snapshot": doc}


async def ensure_battle_card_indexes(db) -> None:
    """Crear indexes para battle_card_snapshots y battle_card_emails_sent."""
    try:
        await db.battle_card_snapshots.create_index(
            [("project_id", 1), ("week_iso", -1)]
        )
        await db.battle_card_snapshots.create_index("dev_org_id")
        await db.battle_card_snapshots.create_index(
            "expire_at", expireAfterSeconds=0
        )
    except Exception as exc:
        log.warning(f"[battle_card] snapshots index failed: {exc}")

    try:
        await db.battle_card_emails_sent.create_index("hash", unique=True)
        await db.battle_card_emails_sent.create_index(
            "expire_at", expireAfterSeconds=0
        )
    except Exception as exc:
        log.warning(f"[battle_card] emails_sent index failed: {exc}")
