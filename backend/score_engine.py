"""
IE Engine — Score computation framework (Phase B1).

Architecture:
- Recipe abstract base: each recipe declares code, version, dependencies (source_ids it reads from),
  tier_logic (higher_better/lower_better/custom), description, and implements compute(raw_obs, zone_id).
- ScoreEngine.compute(zone_id, codes) pulls recent raw observations from ie_raw_observations
  for all declared dependencies and dispatches to each recipe. Pure function: same inputs → same outputs.
- Auto-discovery: all `ie_*` recipe classes under recipes/colonia/ and recipes/proyecto/ are loaded at boot.
- Degrade gracefully: if dependencies have no data → ScoreResult(value=None, is_stub=True, confidence="low").
  NEVER invent numbers.
- Every compute writes to ie_scores (idempotent by (zone_id, code)), preserving previous
  computed_at history via ie_score_history.
"""
from __future__ import annotations

import importlib
import inspect
import pkgutil
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple


TIER_THRESHOLDS = {"green": 70, "amber": 40}  # green >=70, amber 40-69, red <40

# City-wide OSM density distribution cache. The geo-moat recipes (N01/N08/N09/N10)
# need the full city distribution to normalize by percentile — identical for every
# zone in a recompute run. Reading the whole collection per recipe is O(zones·recipes);
# caching it briefly turns a city-wide recompute (1,500+ colonias) from minutes to seconds.
_DENUE_CITY_CACHE: Dict[str, Any] = {"ts": 0.0, "docs": None}
_DENUE_CITY_TTL = 180.0  # seconds — long enough to span one full recompute pass

# Same idea for the SACMEX water-incident city distribution (feeds N07).
_WATER_CITY_CACHE: Dict[str, Any] = {"ts": 0.0, "docs": None}
_WATER_CITY_TTL = 180.0

# Same idea for the FGJ crime-trajectory city distribution (feeds N04).
_CRIMETRAJ_CITY_CACHE: Dict[str, Any] = {"ts": 0.0, "docs": None}
_CRIMETRAJ_CITY_TTL = 180.0


@dataclass
class ScoreResult:
    code: str
    zone_id: str
    value: Optional[float]         # 0-100 or None if insufficient data
    tier: str                      # "green" | "amber" | "red" | "unknown"
    confidence: str                # "high" | "med" | "low"
    is_stub: bool                  # True if derived from stub raw_obs or insufficient data
    inputs_used: Dict[str, int] = field(default_factory=dict)  # source_id → obs count
    formula_version: str = "1.0"
    computed_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    # ─── Phase C / N4 Predictive extensions (optional for N1-N2) ───────────
    model_version: Optional[str] = None
    confidence_interval: Optional[Dict[str, float]] = None  # {low, high, percentile}
    training_window_days: Optional[int] = None
    residual_std: Optional[float] = None


class Recipe:
    """Abstract base. Subclass this and fill in metadata + compute()."""
    code: str = ""
    version: str = "1.0"
    dependencies: List[str] = []              # source_ids this recipe reads from
    tier_logic: str = "higher_better"          # higher_better | lower_better | custom
    description: str = ""
    min_observations: int = 1                  # min raw observations required to compute non-stub
    is_paid: bool = False                      # True → requires allow_paid=True (e.g. AirROI)
    scope: str = "colonia"                    # "colonia" | "proyecto"
    layer: str = "descriptive"                # "descriptive" (N1-N2) | "predictive" (N4) | "narrative" (N5)
    needs_denue: bool = False                 # True → engine injects denue_zone_density.by_category pseudo-sources
    needs_natural_risk: bool = False          # True → engine injects risk_scores_zone natural-risk pseudo-source (N05)
    needs_water: bool = False                 # True → engine injects sacmex_zone_colonia incidents pseudo-source (N07)
    needs_crime_trajectory: bool = False      # True → engine injects fgj_trajectory_zone trend pseudo-source (N04)

    def compute(self, zone_id: str, obs_by_source: Dict[str, List[Dict[str, Any]]]) -> ScoreResult:
        raise NotImplementedError

    # ─── Helpers shared by all recipes ───────────────────────────────────
    def _tier_for(self, value: Optional[float]) -> str:
        if value is None:
            return "unknown"
        if self.tier_logic == "higher_better":
            if value >= TIER_THRESHOLDS["green"]:
                return "green"
            if value >= TIER_THRESHOLDS["amber"]:
                return "amber"
            return "red"
        if self.tier_logic == "lower_better":
            # invert thresholds: low value = good
            if value <= (100 - TIER_THRESHOLDS["green"]):
                return "green"
            if value <= (100 - TIER_THRESHOLDS["amber"]):
                return "amber"
            return "red"
        return "unknown"  # custom handlers override manually

    def _stub_result(self, zone_id: str, reason: str = "insufficient data") -> ScoreResult:
        return ScoreResult(
            code=self.code, zone_id=zone_id, value=None,
            tier="unknown", confidence="low", is_stub=True,
            inputs_used={}, formula_version=self.version,
        )


# ─── Recipe registry (auto-discovery at import time) ─────────────────────────
_REGISTRY: Dict[str, Recipe] = {}


def register(recipe_cls):
    """Decorator or explicit call — adds a recipe instance to the registry."""
    if not recipe_cls.code:
        raise ValueError(f"{recipe_cls.__name__} missing .code")
    _REGISTRY[recipe_cls.code] = recipe_cls()
    return recipe_cls


def auto_discover():
    """Import every module under backend/recipes/**/ to trigger @register decorators."""
    try:
        import recipes  # noqa: F401
        pkg = importlib.import_module("recipes")
    except ImportError:
        return
    for _, mod_name, is_pkg in pkgutil.walk_packages(pkg.__path__, prefix="recipes."):
        if is_pkg:
            continue
        try:
            importlib.import_module(mod_name)
        except Exception as e:  # noqa: BLE001
            print(f"[score_engine] auto_discover failed to import {mod_name}: {e}")


def all_recipes() -> Dict[str, Recipe]:
    if not _REGISTRY:
        auto_discover()
    return dict(_REGISTRY)


def get_recipe(code: str) -> Optional[Recipe]:
    return all_recipes().get(code)


# ─── Phase B (W3.1B-2) — derive missing dev fields for proyecto recipes ──────
_STAGE_OFFSET_MONTHS = {
    "preventa": 30,
    "en_construccion": 18,
    "entrega_inmediata": 6,
    "exclusiva": 24,
}
_STAGE_OFFSET_DEFAULT = 24


def _enrich_dev(dev: Dict[str, Any]) -> Dict[str, Any]:
    """Shallow-copy `dev` and derive 3 fields consumed by IE_PROY_* recipes:
    - price_m2_avg (MXN/m², weighted by m2_privative)
    - type ("depto" — constant; CDMX W3 universe is 100% vertical)
    - launch_date (ISO YYYY-MM-DD, derived from delivery_estimate − stage offset)

    If a derivation fails (malformed data) the field is omitted; recipes will
    return None on missing signal and the engine will emit a stub.
    """
    enriched = dict(dev)

    # 1. price_m2_avg — weighted avg over units with valid (price, m2_privative)
    units = dev.get("units") or []
    total_price = 0.0
    total_m2 = 0.0
    for u in units:
        price = u.get("price")
        m2 = u.get("m2_privative")
        if price and m2:
            total_price += float(price)
            total_m2 += float(m2)
    if total_m2 > 0:
        enriched["price_m2_avg"] = total_price / total_m2

    # 2. type — constant for current CDMX W3 universe
    enriched["type"] = "depto"

    # 3. launch_date — delivery_estimate (YYYY-MM) minus stage offset
    delivery = dev.get("delivery_estimate")
    if isinstance(delivery, str) and len(delivery) >= 7:
        try:
            year = int(delivery[0:4])
            month = int(delivery[5:7])
            if 1 <= month <= 12 and 1900 <= year <= 2100:
                stage = dev.get("stage")
                offset = _STAGE_OFFSET_MONTHS.get(stage, _STAGE_OFFSET_DEFAULT)
                # subtract `offset` months from (year, month, day=1)
                total = year * 12 + (month - 1) - offset  # 0-indexed month
                new_year, new_month_idx = divmod(total, 12)
                new_month = new_month_idx + 1
                enriched["launch_date"] = f"{new_year:04d}-{new_month:02d}-01"
        except (ValueError, TypeError):
            pass

    return enriched


# ─── Score engine: orchestrates recipe execution + persistence ───────────────
class ScoreEngine:
    def __init__(self, db):
        self.db = db

    async def _fetch_obs(self, source_ids: List[str], zone_id: Optional[str], lookback_days: int = 365) -> Dict[str, List[Dict[str, Any]]]:
        """Pull recent raw observations grouped by source_id for a zone (or all zones)."""
        if not source_ids:
            return {}
        since = datetime.now(timezone.utc) - timedelta(days=lookback_days)
        q: Dict[str, Any] = {"source_id": {"$in": source_ids}, "fetched_at": {"$gte": since}}
        if zone_id:
            q["$or"] = [{"zone_id": zone_id}, {"zone_id": None}]
        cursor = self.db.ie_raw_observations.find(q, {"_id": 0}).sort("fetched_at", -1).limit(5000)
        docs = await cursor.to_list(length=5000)
        out: Dict[str, List[Dict[str, Any]]] = {sid: [] for sid in source_ids}
        for d in docs:
            out.setdefault(d["source_id"], []).append(d)
        return out

    async def _build_project_context(self, zone_id: str) -> Dict[str, List[Dict[str, Any]]]:
        """For project recipes: inject DMX-internal data (dev doc, colonia scores, all devs)
        under pseudo source_ids so recipes can stay pure and declarative."""
        try:
            from data_developments import DEVELOPMENTS_BY_ID
        except ImportError:
            return {}
        dev = DEVELOPMENTS_BY_ID.get(zone_id)
        if not dev:
            return {}
        colonia_zone = (dev.get("colonia_id") or "").replace("-", "_")
        colonia_docs = await self.db.ie_scores.find(
            {"zone_id": colonia_zone, "is_stub": False, "value": {"$ne": None}},
            {"_id": 0},
        ).to_list(length=100) if colonia_zone else []
        # own project scores (for predictive recipes that depend on own N1-N2)
        own_proj_scores = await self.db.ie_scores.find(
            {"zone_id": zone_id, "is_stub": False, "value": {"$ne": None}},
            {"_id": 0},
        ).to_list(length=100)
        # all devs in the same colonia (competition / market comparables)
        same_colonia = [d for d in DEVELOPMENTS_BY_ID.values() if d.get("colonia_id") == dev.get("colonia_id") and d["id"] != dev["id"]]
        # cross-check results (Phase 7.3)
        cc_docs = await self.db.di_cross_checks.find(
            {"development_id": zone_id},
            {"_id": 0},
        ).to_list(length=50)
        # extracted docs count for QUALITY_DOCS recipe
        extracted_docs = await self.db.di_documents.find(
            {"development_id": zone_id, "status": "extracted"},
            {"_id": 0, "doc_type": 1, "id": 1},
        ).to_list(length=200)
        return {
            "_dmx_dev": [{"payload": _enrich_dev(dev), "is_stub": False}],
            "_dmx_colonia_scores": [{"payload": d, "is_stub": False} for d in colonia_docs],
            "_dmx_own_proj_scores": [{"payload": d, "is_stub": False} for d in own_proj_scores],
            "_dmx_same_colonia_devs": [{"payload": _enrich_dev(d), "is_stub": False} for d in same_colonia],
            "_dmx_all_devs": [{"payload": _enrich_dev(d), "is_stub": False} for d in DEVELOPMENTS_BY_ID.values()],
            "_dmx_cross_checks": [{"payload": d, "is_stub": False} for d in cc_docs],
            "_dmx_extracted_docs": [{"payload": d, "is_stub": False} for d in extracted_docs],
        }

    async def _build_unit_context(self, zone_id: str) -> Dict[str, List[Dict[str, Any]]]:
        """For unit recipes: inject the unit doc, its enriched dev, same-prototype peers,
        and all dev peers under pseudo source_ids."""
        try:
            from data_developments import DEVELOPMENTS_BY_ID
        except ImportError:
            return {}
        # Longest dev_id prefix match (unit_id starts with `{dev_id}-...`)
        candidate = None
        for dev_id in DEVELOPMENTS_BY_ID:
            if zone_id.startswith(dev_id + "-"):
                if candidate is None or len(dev_id) > len(candidate):
                    candidate = dev_id
        if candidate is None:
            return {}
        dev = DEVELOPMENTS_BY_ID[candidate]
        units = dev.get("units") or []
        unit = next((u for u in units if u.get("id") == zone_id), None)
        if unit is None:
            return {}
        same_proto = [u for u in units if u.get("prototype") == unit.get("prototype") and u.get("id") != unit.get("id")]
        dev_peers = [u for u in units if u.get("id") != unit.get("id")]
        return {
            "_dmx_unit": [{"payload": unit, "is_stub": False}],
            "_dmx_unit_dev": [{"payload": _enrich_dev(dev), "is_stub": False}],
            "_dmx_unit_same_proto": [{"payload": u, "is_stub": False} for u in same_proto],
            "_dmx_unit_dev_peers": [{"payload": u, "is_stub": False} for u in dev_peers],
        }

    async def _build_colonia_context(self, zone_id: str) -> Dict[str, List[Dict[str, Any]]]:
        """For predictive colonia recipes: inject the colonia's own IE scores (N1-N2)
        so N4 regressions can consume them as direct features."""
        own_scores = await self.db.ie_scores.find(
            {"zone_id": zone_id, "is_stub": False, "value": {"$ne": None}},
            {"_id": 0},
        ).to_list(length=100)
        return {
            "_dmx_own_colonia_scores": [{"payload": d, "is_stub": False} for d in own_scores],
        }

    async def _build_denue_context(self, zone_id: str) -> Dict[str, List[Dict[str, Any]]]:
        """For geo-moat colonia recipes (N01/N08/N09/N10): inject the OSM business
        density (`denue_zone_density.by_category`) for this colonia plus the city-wide
        distribution, so recipes can normalize by percentile-of-city while staying pure.

        Same mechanism as `_build_project_context` (DMX-internal data under pseudo
        source_ids). NEVER invents: if the colonia has no density doc the recipe stubs.
        """
        zone_doc = await self.db.denue_zone_density.find_one(
            {"zone_id": zone_id}, {"_id": 0, "by_category": 1, "businesses_per_km2": 1, "source": 1},
        )
        # City distribution is identical for every zone — cache it (TTL) so a city-wide
        # recompute doesn't re-read the whole collection once per recipe.
        now = time.monotonic()
        if _DENUE_CITY_CACHE["docs"] is None or (now - _DENUE_CITY_CACHE["ts"]) > _DENUE_CITY_TTL:
            _DENUE_CITY_CACHE["docs"] = await self.db.denue_zone_density.find(
                {}, {"_id": 0, "by_category": 1},
            ).to_list(length=4000)
            _DENUE_CITY_CACHE["ts"] = now
        city_docs = _DENUE_CITY_CACHE["docs"]
        # Seguridad real de la colonia (si ya existe score no-stub) — la usa N10.
        seg = await self.db.ie_scores.find_one(
            {"zone_id": zone_id, "code": "IE_COL_SEGURIDAD", "is_stub": False, "value": {"$ne": None}},
            {"_id": 0, "value": 1},
        )
        return {
            "_dmx_denue_zone": [{"payload": zone_doc, "is_stub": False}] if zone_doc else [],
            "_dmx_denue_city": [{"payload": d, "is_stub": False} for d in city_docs],
            "_dmx_seguridad": [{"payload": seg, "is_stub": False}] if seg else [],
        }

    async def _build_natural_risk_context(self, zone_id: str) -> Dict[str, List[Dict[str, Any]]]:
        """For N05 (Infrastructure Resilience): inject the colonia's REAL natural-risk doc
        (`risk_scores_zone`, source Atlas CDMX) under a pseudo source_id. NEVER invents:
        only docs with `available` and `placeholder_flags.natural == False` carry real Atlas data."""
        doc = await self.db.risk_scores_zone.find_one(
            {"zone_id": zone_id, "available": True},
            {"_id": 0, "components": 1, "placeholder_flags": 1, "sources_active": 1},
        )
        seismic = await self.db.seismic_zone_colonia.find_one(
            {"zone_id": zone_id}, {"_id": 0, "resilience": 1, "seismic_zone": 1},
        )
        return {
            "_dmx_natural_risk": [{"payload": doc, "is_stub": False}] if doc else [],
            "_dmx_seismic": [{"payload": seismic, "is_stub": False}] if seismic else [],
        }

    async def _build_water_context(self, zone_id: str) -> Dict[str, List[Dict[str, Any]]]:
        """For N07 (Water Security): inject the colonia's REAL SACMEX water-incident count
        (`sacmex_zone_colonia`) + the city distribution (cached) for the percentile. NEVER invents:
        if the colonia has no SACMEX doc → the recipe stubs honestly."""
        zone_doc = await self.db.sacmex_zone_colonia.find_one(
            {"zone_id": zone_id}, {"_id": 0, "incidents": 1},
        )
        now = time.monotonic()
        if _WATER_CITY_CACHE["docs"] is None or (now - _WATER_CITY_CACHE["ts"]) > _WATER_CITY_TTL:
            _WATER_CITY_CACHE["docs"] = await self.db.sacmex_zone_colonia.find(
                {}, {"_id": 0, "incidents": 1},
            ).to_list(length=4000)
            _WATER_CITY_CACHE["ts"] = now
        city_docs = _WATER_CITY_CACHE["docs"]
        return {
            "_dmx_water_zone": [{"payload": zone_doc, "is_stub": False}] if zone_doc else [],
            "_dmx_water_city": [{"payload": d, "is_stub": False} for d in city_docs],
        }

    async def _build_crime_trajectory_context(self, zone_id: str) -> Dict[str, List[Dict[str, Any]]]:
        """For N04 (Crime Trajectory): inject the colonia's REAL FGJ crime trend (`fgj_trajectory_zone`,
        ratio año-reciente/año-base) + the city distribution (cached) for the percentile. NEVER invents:
        if the colonia has no ≥2-year FGJ trend → the recipe stubs honestly."""
        zone_doc = await self.db.fgj_trajectory_zone.find_one(
            {"zone_id": zone_id}, {"_id": 0, "trend_ratio": 1, "base_count": 1, "recent_count": 1,
                                   "base_year": 1, "recent_year": 1},
        )
        now = time.monotonic()
        if _CRIMETRAJ_CITY_CACHE["docs"] is None or (now - _CRIMETRAJ_CITY_CACHE["ts"]) > _CRIMETRAJ_CITY_TTL:
            _CRIMETRAJ_CITY_CACHE["docs"] = await self.db.fgj_trajectory_zone.find(
                {}, {"_id": 0, "trend_ratio": 1},
            ).to_list(length=4000)
            _CRIMETRAJ_CITY_CACHE["ts"] = now
        city_docs = _CRIMETRAJ_CITY_CACHE["docs"]
        return {
            "_dmx_crimetraj_zone": [{"payload": zone_doc, "is_stub": False}] if zone_doc else [],
            "_dmx_crimetraj_city": [{"payload": d, "is_stub": False} for d in city_docs],
        }

    async def compute_one(self, zone_id: str, code: str, allow_paid: bool = False) -> ScoreResult:
        recipe = get_recipe(code)
        if not recipe:
            return ScoreResult(code=code, zone_id=zone_id, value=None,
                               tier="unknown", confidence="low", is_stub=True,
                               inputs_used={}, formula_version="0")
        if recipe.is_paid and not allow_paid:
            return recipe._stub_result(zone_id, reason="paid recipe skipped")

        obs = await self._fetch_obs(recipe.dependencies, zone_id)
        if recipe.scope == "proyecto":
            obs.update(await self._build_project_context(zone_id))
        elif recipe.scope == "unit":
            obs.update(await self._build_unit_context(zone_id))
        elif getattr(recipe, "layer", "descriptive") == "predictive":
            # predictive colonia recipes need the colonia's own N1-N2 scores
            obs.update(await self._build_colonia_context(zone_id))
        if getattr(recipe, "needs_denue", False):
            # geo-moat recipes (N01/N08/N09/N10) read OSM by_category density
            obs.update(await self._build_denue_context(zone_id))
        if getattr(recipe, "needs_natural_risk", False):
            # N05 reads the colonia's real Atlas natural-risk score
            obs.update(await self._build_natural_risk_context(zone_id))
        if getattr(recipe, "needs_water", False):
            # N07 reads the colonia's real SACMEX water-incident count
            obs.update(await self._build_water_context(zone_id))
        if getattr(recipe, "needs_crime_trajectory", False):
            # N04 reads the colonia's real FGJ crime trend (year-over-year)
            obs.update(await self._build_crime_trajectory_context(zone_id))
        try:
            result = recipe.compute(zone_id, obs)
        except Exception as e:  # noqa: BLE001 — recipes must be pure; catch defensively
            print(f"[score_engine] recipe {code} failed on {zone_id}: {e}")
            return recipe._stub_result(zone_id, reason=f"error: {e}")

        await self._persist(result)
        return result

    async def compute_many(self, zone_id: str, codes: List[str], allow_paid: bool = False) -> List[ScoreResult]:
        """If codes=[], auto-scope by zone_id:
           - zone_id matches a development.id → only proyecto recipes
           - otherwise → only colonia recipes
        Explicit `codes` override scoping."""
        if not codes:
            try:
                from data_developments import DEVELOPMENTS_BY_ID
                target_scope = "proyecto" if zone_id in DEVELOPMENTS_BY_ID else "colonia"
            except ImportError:
                target_scope = "colonia"
            codes = [c for c, r in all_recipes().items() if getattr(r, "scope", "colonia") == target_scope]
        results: List[ScoreResult] = []
        for code in codes:
            results.append(await self.compute_one(zone_id, code, allow_paid=allow_paid))
        return results

    async def _persist(self, r: ScoreResult) -> None:
        """Upsert to ie_scores, append prior state to ie_score_history for audit."""
        prior = await self.db.ie_scores.find_one({"zone_id": r.zone_id, "code": r.code}, {"_id": 0})
        if prior:
            await self.db.ie_score_history.insert_one({**prior, "archived_at": datetime.now(timezone.utc)})
        doc = {
            "zone_id": r.zone_id, "code": r.code,
            "value": r.value, "tier": r.tier,
            "confidence": r.confidence, "is_stub": r.is_stub,
            "inputs_used": r.inputs_used,
            "formula_version": r.formula_version,
            "computed_at": r.computed_at,
        }
        # Phase C / N4 predictive extras — only persisted if set
        if r.model_version is not None:
            doc["model_version"] = r.model_version
        if r.confidence_interval is not None:
            doc["confidence_interval"] = r.confidence_interval
        if r.training_window_days is not None:
            doc["training_window_days"] = r.training_window_days
        if r.residual_std is not None:
            doc["residual_std"] = r.residual_std
        await self.db.ie_scores.update_one(
            {"zone_id": r.zone_id, "code": r.code},
            {"$set": doc},
            upsert=True,
        )


# ─── DB indexes ──────────────────────────────────────────────────────────────
async def ensure_score_indexes(db) -> None:
    await db.ie_scores.create_index([("zone_id", 1), ("code", 1)], unique=True)
    await db.ie_scores.create_index("code")
    await db.ie_scores.create_index("computed_at")
    await db.ie_score_history.create_index([("zone_id", 1), ("code", 1), ("archived_at", -1)])
