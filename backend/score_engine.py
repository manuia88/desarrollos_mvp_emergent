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
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple


TIER_THRESHOLDS = {"green": 70, "amber": 40}  # green >=70, amber 40-69, red <40


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
        # all devs in the same colonia (competition / market comparables)
        same_colonia = [d for d in DEVELOPMENTS_BY_ID.values() if d.get("colonia_id") == dev.get("colonia_id") and d["id"] != dev["id"]]
        return {
            "_dmx_dev": [{"payload": dev, "is_stub": False}],
            "_dmx_colonia_scores": [{"payload": d, "is_stub": False} for d in colonia_docs],
            "_dmx_same_colonia_devs": [{"payload": d, "is_stub": False} for d in same_colonia],
            "_dmx_all_devs": [{"payload": d, "is_stub": False} for d in DEVELOPMENTS_BY_ID.values()],
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
