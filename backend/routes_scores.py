"""
IE Engine — Phase B1 score routes.

Endpoints:
- POST /api/superadmin/scores/recompute           → superadmin: run engine for zone + codes
- GET  /api/zones/:id/scores                      → public: list scores for a zone
- POST /api/superadmin/seed-historic-from-upload  → superadmin: replay NOAA dump into raw_observations
"""
from __future__ import annotations

import asyncio
import csv
import io
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request, Query
from pydantic import BaseModel, Field

from score_engine import ScoreEngine, all_recipes, get_recipe
from uploads_ie import detect_encoding, detect_csv_separator


sa_router = APIRouter(prefix="/api/superadmin")
pub_router = APIRouter(prefix="/api")


# ─── Helpers ─────────────────────────────────────────────────────────────────
async def _require_superadmin(request: Request):
    from routes_ie_engine import _require_superadmin as _req
    return await _req(request)


class RecomputeRequest(BaseModel):
    zone_id: str
    codes: List[str] = Field(default_factory=list)  # empty = all registered recipes
    allow_paid: bool = False


class ScoreOut(BaseModel):
    zone_id: str
    code: str
    value: Optional[float]
    tier: str
    confidence: str
    is_stub: bool
    inputs_used: Dict[str, int] = Field(default_factory=dict)
    formula_version: str = "1.0"
    computed_at: datetime
    # Phase C / N4 extras
    model_version: Optional[str] = None
    confidence_interval: Optional[Dict[str, float]] = None
    training_window_days: Optional[int] = None
    residual_std: Optional[float] = None


class RecomputeResult(BaseModel):
    zone_id: str
    requested: int
    computed: int
    results: List[ScoreOut]


# ─── Superadmin: recompute ───────────────────────────────────────────────────
@sa_router.post("/scores/recompute", response_model=RecomputeResult)
async def recompute_scores(payload: RecomputeRequest, request: Request):
    user = await _require_superadmin(request)
    db = request.app.state.db
    engine = ScoreEngine(db)

    requested_codes = payload.codes or list(all_recipes().keys())
    unknown = [c for c in requested_codes if not get_recipe(c)]
    if unknown:
        raise HTTPException(400, f"Recipes desconocidos: {unknown}")

    results = await engine.compute_many(payload.zone_id, requested_codes, allow_paid=payload.allow_paid)
    from routes_ie_engine import audit
    await audit(user.user_id, "ie_scores_recompute", payload.zone_id, {
        "codes": requested_codes, "computed": len(results), "allow_paid": payload.allow_paid,
    })
    return RecomputeResult(
        zone_id=payload.zone_id,
        requested=len(requested_codes),
        computed=len(results),
        results=[ScoreOut(**{
            "zone_id": r.zone_id, "code": r.code, "value": r.value,
            "tier": r.tier, "confidence": r.confidence, "is_stub": r.is_stub,
            "inputs_used": r.inputs_used, "formula_version": r.formula_version,
            "computed_at": r.computed_at,
        }) for r in results],
    )


@sa_router.get("/scores", response_model=List[ScoreOut])
async def list_scores(
    request: Request,
    zone_id: Optional[str] = Query(None),
    code: Optional[str] = Query(None),
    tier: Optional[str] = Query(None),
    scope: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
):
    await _require_superadmin(request)
    db = request.app.state.db
    q: Dict[str, Any] = {}
    if zone_id: q["zone_id"] = zone_id
    if code: q["code"] = code
    if tier: q["tier"] = tier
    if scope:
        codes_in_scope = [c for c, r in all_recipes().items() if getattr(r, "scope", "colonia") == scope]
        q["code"] = {"$in": codes_in_scope} if "code" not in q else q["code"]
    docs = await db.ie_scores.find(q, {"_id": 0}).sort("computed_at", -1).limit(limit).to_list(length=limit)
    return [ScoreOut(**d) for d in docs]


@sa_router.get("/scores/recipes")
async def list_recipes_meta(request: Request):
    """Metadata of every registered recipe — used by /superadmin/scores filter dropdowns."""
    await _require_superadmin(request)
    out = []
    for code, r in all_recipes().items():
        out.append({
            "code": code,
            "scope": getattr(r, "scope", "colonia"),
            "version": r.version,
            "tier_logic": r.tier_logic,
            "description": r.description,
            "is_paid": r.is_paid,
            "dependencies": r.dependencies,
        })
    return {"recipes": out, "total": len(out)}


@sa_router.get("/scores/history")
async def score_history(
    request: Request,
    zone_id: str = Query(...),
    code: str = Query(...),
    limit: int = Query(30, ge=1, le=200),
):
    """Timeline (ie_score_history) for a zone/code pair. Most recent first."""
    await _require_superadmin(request)
    db = request.app.state.db
    docs = await db.ie_score_history.find(
        {"zone_id": zone_id, "code": code}, {"_id": 0},
    ).sort("archived_at", -1).limit(limit).to_list(length=limit)
    # Include current
    current = await db.ie_scores.find_one({"zone_id": zone_id, "code": code}, {"_id": 0})
    return {"current": current, "history": docs}


# ─── Public: zone scores ─────────────────────────────────────────────────────
@pub_router.get("/zones/{zone_id}/scores", response_model=List[ScoreOut])
async def public_zone_scores(zone_id: str, request: Request):
    """Public endpoint. Returns only non-stub scores so the UI never shows fake numbers as real."""
    db = request.app.state.db
    docs = await db.ie_scores.find(
        {"zone_id": zone_id, "is_stub": False, "value": {"$ne": None}},
        {"_id": 0},
    ).to_list(length=200)
    return [ScoreOut(**d) for d in docs]


MIN_REAL_SCORES_FOR_UI = 5


class ZoneCoverageOut(BaseModel):
    zone_id: str
    real_count: int
    total_recipes: int
    ui_mode: str  # "real" | "seed"
    scores: List[ScoreOut]


@pub_router.get("/zones/{zone_id}/scores/coverage", response_model=ZoneCoverageOut)
async def zone_coverage(zone_id: str, request: Request):
    """Tells the UI whether to show real scores or fall back to seed with 'estimado' badge.
    Counts only recipes with matching scope (colonia vs proyecto) to avoid diluting coverage."""
    db = request.app.state.db
    # Detect scope: if zone_id matches a development.id → scope=proyecto, else colonia
    try:
        from data_developments import DEVELOPMENTS_BY_ID
        scope = "proyecto" if zone_id in DEVELOPMENTS_BY_ID else "colonia"
    except ImportError:
        scope = "colonia"

    real_docs = await db.ie_scores.find(
        {"zone_id": zone_id, "is_stub": False, "value": {"$ne": None}},
        {"_id": 0},
    ).to_list(length=200)
    total = sum(1 for r in all_recipes().values() if getattr(r, "scope", "colonia") == scope)
    mode = "real" if len(real_docs) >= MIN_REAL_SCORES_FOR_UI else "seed"
    return ZoneCoverageOut(
        zone_id=zone_id, real_count=len(real_docs),
        total_recipes=total, ui_mode=mode,
        scores=[ScoreOut(**d) for d in real_docs],
    )


@pub_router.get("/developments/{dev_id}/scores", response_model=ZoneCoverageOut)
async def public_development_scores(dev_id: str, request: Request):
    """Public endpoint — alimenta el bloque 'Score IE del proyecto' en /desarrollo/:slug."""
    return await zone_coverage(dev_id, request)


class ScoreExplainOut(BaseModel):
    code: str
    zone_id: str
    value: Optional[float]
    tier: str
    confidence: str
    is_stub: bool
    formula_version: str
    description: str
    dependencies: List[str]
    tier_logic: str
    inputs_used: Dict[str, int]
    operations: List[str]
    observation_sample_ids: List[str] = Field(default_factory=list)
    # Phase C / N4 extras
    layer: str = "descriptive"
    model_version: Optional[str] = None
    confidence_interval: Optional[Dict[str, float]] = None
    training_window_days: Optional[int] = None
    residual_std: Optional[float] = None
    prediction_date: Optional[datetime] = None


@pub_router.get("/zones/{zone_id}/scores/explain", response_model=ScoreExplainOut)
async def explain_score(zone_id: str, code: str, request: Request):
    """
    Public breakdown endpoint — alimenta el 'how we know' en la UI y la sección
    '97 indicadores detrás de cada precio' en /inteligencia.
    """
    recipe = get_recipe(code)
    if not recipe:
        raise HTTPException(404, f"Recipe '{code}' no existe")
    db = request.app.state.db
    doc = await db.ie_scores.find_one({"zone_id": zone_id, "code": code}, {"_id": 0})
    if not doc:
        return ScoreExplainOut(
            code=code, zone_id=zone_id, value=None, tier="unknown",
            confidence="low", is_stub=True, formula_version=recipe.version,
            description=recipe.description,
            dependencies=recipe.dependencies, tier_logic=recipe.tier_logic,
            inputs_used={}, operations=["Score aún no calculado para esta zona."],
        )

    # Reconstruct the same observation set the recipe saw, to call .explanation()
    from score_engine import ScoreEngine
    engine = ScoreEngine(db)
    obs_by_source = await engine._fetch_obs(recipe.dependencies, zone_id)
    if getattr(recipe, "scope", "colonia") == "proyecto":
        obs_by_source.update(await engine._build_project_context(zone_id))
    if getattr(recipe, "layer", "descriptive") == "predictive" and getattr(recipe, "scope", "colonia") == "colonia":
        obs_by_source.update(await engine._build_colonia_context(zone_id))
    operations: List[str]
    # Only SimpleHeuristicRecipe instances have explanation(); Recipe base doesn't
    explain_fn = getattr(recipe, "explanation", None)
    if callable(explain_fn) and hasattr(recipe, "_real_values"):
        values = recipe._real_values(obs_by_source)
        try:
            operations = explain_fn(values, doc.get("value"))
        except Exception as e:  # noqa: BLE001
            operations = [f"Explanation failed: {e}"]
    else:
        operations = [f"Recipe {code} no expone explanation() (placeholder DataPending o piloto)."]

    sample_ids = []
    for sid in recipe.dependencies:
        sid_obs = obs_by_source.get(sid, [])
        sample_ids.extend([f"{sid}:{i}" for i, _ in enumerate(sid_obs[:3])])

    return ScoreExplainOut(
        code=code, zone_id=zone_id,
        value=doc.get("value"), tier=doc.get("tier"),
        confidence=doc.get("confidence"), is_stub=doc.get("is_stub"),
        formula_version=doc.get("formula_version", recipe.version),
        description=recipe.description,
        dependencies=recipe.dependencies, tier_logic=recipe.tier_logic,
        inputs_used=doc.get("inputs_used", {}),
        operations=operations, observation_sample_ids=sample_ids,
        layer=getattr(recipe, "layer", "descriptive"),
        model_version=doc.get("model_version"),
        confidence_interval=doc.get("confidence_interval"),
        training_window_days=doc.get("training_window_days"),
        residual_std=doc.get("residual_std"),
        prediction_date=doc.get("computed_at") if getattr(recipe, "layer", "descriptive") == "predictive" else None,
    )


# ─── Superadmin: seed historic NOAA from a prior manual upload ───────────────
class SeedHistoricRequest(BaseModel):
    upload_id: str
    source_id: str = "noaa"


class SeedHistoricResult(BaseModel):
    upload_id: str
    source_id: str
    rows_parsed: int
    observations_inserted: int
    format_detected: Dict[str, Any]


# Column aliases: maps GHCN-Daily official columns to our canonical shape.
NOAA_COLUMN_ALIASES = {
    "station_id": ["station_id", "STATION", "station", "id"],
    "observation_date": ["observation_date", "DATE", "date"],
    "temp_c": ["temp_c", "TAVG"],
    "temp_max_c": ["temp_max_c", "TMAX"],
    "temp_min_c": ["temp_min_c", "TMIN"],
    "precipitation_mm": ["precipitation_mm", "PRCP"],
    "latitude": ["latitude", "LATITUDE", "lat"],
    "longitude": ["longitude", "LONGITUDE", "lon", "lng"],
}


def _pick(row: Dict[str, str], *aliases: str) -> Optional[str]:
    for a in aliases:
        if a in row and row[a] not in (None, ""):
            return row[a]
    return None


@sa_router.post("/seed-historic-from-upload", response_model=SeedHistoricResult)
async def seed_historic_from_upload(payload: SeedHistoricRequest, request: Request):
    """
    Replay a previously uploaded NOAA dump (GHCN-Daily CSV) as ie_raw_observations rows.
    Lets the operator bring in the 76,756 climate snapshot without burning NOAA tokens.

    The parser accepts both our canonical column names and official NOAA GHCN column names
    (TMAX, TMIN, PRCP, DATE, STATION, LATITUDE, LONGITUDE) — auto-aliased.
    """
    user = await _require_superadmin(request)
    db = request.app.state.db

    upl = await db.ie_manual_uploads.find_one({"id": payload.upload_id}, {"_id": 0})
    if not upl:
        raise HTTPException(404, "Upload no encontrado")
    if upl.get("source_id") != payload.source_id:
        raise HTTPException(400, f"Upload pertenece a {upl.get('source_id')}, no a {payload.source_id}.")

    try:
        with open(upl["storage_path"], "rb") as fh:
            data = fh.read()
    except OSError as e:
        raise HTTPException(410, f"Archivo ausente del storage: {e}") from e

    # Detect encoding + separator — same primitives used by manual upload preview
    sample = data[:131072]
    enc = detect_encoding(sample)
    sep = detect_csv_separator(sample.decode(enc, errors="replace"))
    text = data.decode(enc, errors="replace")
    reader = csv.DictReader(io.StringIO(text), delimiter=sep)

    now = datetime.now(timezone.utc)
    observations: List[Dict[str, Any]] = []
    rows_parsed = 0
    for row in reader:
        rows_parsed += 1
        # Normalize to (datatype, value) GHCN-like shape so IE_COL_AIRE recipe picks them up.
        station = _pick(row, *NOAA_COLUMN_ALIASES["station_id"])
        obs_date = _pick(row, *NOAA_COLUMN_ALIASES["observation_date"])
        lat = _pick(row, *NOAA_COLUMN_ALIASES["latitude"])
        lon = _pick(row, *NOAA_COLUMN_ALIASES["longitude"])

        for canonical, dtype in (("temp_c", "TAVG"), ("temp_max_c", "TMAX"),
                                 ("temp_min_c", "TMIN"), ("precipitation_mm", "PRCP")):
            v = _pick(row, *NOAA_COLUMN_ALIASES[canonical])
            if v is None:
                continue
            try:
                # GHCN stores values in tenths of °C (TAVG/TMAX/TMIN) or tenths of mm (PRCP)
                # Our recipe expects tenths-of-°C for temperature datatypes, so persist as-is.
                num = float(v)
            except ValueError:
                continue
            observations.append({
                "source_id": payload.source_id,
                "zone_id": None,  # station-level; zone mapping happens at recipe time via lat/lon → colonia
                "payload": {
                    "station": station, "date": obs_date,
                    "datatype": dtype, "value": num,
                    "latitude": lat, "longitude": lon,
                },
                "fetched_at": now, "is_stub": False,
                "upload_id": payload.upload_id, "job_id": None,
            })

    if observations:
        await db.ie_raw_observations.insert_many(observations)
        await db.ie_data_sources.update_one({"id": payload.source_id}, {
            "$set": {"last_sync": now, "last_status": "ok", "updated_at": now},
            "$inc": {"records_total": len(observations)},
        })

    await db.ie_manual_uploads.update_one({"id": payload.upload_id}, {"$set": {
        "records_extracted": len(observations),
        "status": "ingested" if observations else "failed",
        "processed_at": now,
    }})

    from routes_ie_engine import audit
    await audit(user.user_id, "ie_seed_historic", payload.source_id, {
        "upload_id": payload.upload_id, "rows_parsed": rows_parsed, "obs_inserted": len(observations),
    })
    return SeedHistoricResult(
        upload_id=payload.upload_id, source_id=payload.source_id,
        rows_parsed=rows_parsed, observations_inserted=len(observations),
        format_detected={"encoding": enc, "separator": sep},
    )


# ─── Async batch recompute (Phase B3) ────────────────────────────────────────
class RecomputeAllRequest(BaseModel):
    allow_paid: bool = False            # si true, incluye recipes AirROI (paga)
    include_colonia: bool = True
    include_proyecto: bool = True
    codes: List[str] = Field(default_factory=list)  # opcional: restringir a ciertos codes
    layer: str = "all"                  # "all" | "descriptive" | "predictive"


async def _recompute_batch_runner(db, task_id: str, plan: List[Dict[str, Any]], allow_paid: bool, codes_filter: List[str], layer_filter: str = "all"):
    """Background task — recomputes every (zone, scope) pair in the plan.
    layer_filter: all | descriptive | predictive — restricts to a layer to save cycles.

    IMPORTANT: For layer='all' we run a 2-pass strategy:
      Pass 1 → descriptive (N1-N2) on all zones. Persists to ie_scores.
      Pass 2 → predictive (N4) on all zones, now with N1-N2 stored and available
               as '_dmx_own_colonia_scores' / '_dmx_own_proj_scores' context.
    """
    started = datetime.now(timezone.utc)
    engine = ScoreEngine(db)
    processed = 0
    real_count = 0
    stub_count = 0
    errors: List[str] = []

    if layer_filter == "all":
        layers_to_run = ["descriptive", "predictive"]
    else:
        layers_to_run = [layer_filter]

    for layer in layers_to_run:
        for item in plan:
            zone_id = item["zone_id"]
            scope = item["scope"]
            codes = [c for c, r in all_recipes().items()
                     if getattr(r, "scope", "colonia") == scope
                     and getattr(r, "layer", "descriptive") == layer]
            if codes_filter:
                codes = [c for c in codes if c in codes_filter]
            if not codes:
                continue
            try:
                results = await engine.compute_many(zone_id, codes, allow_paid=allow_paid)
                real_count += sum(1 for r in results if not r.is_stub and r.value is not None)
                stub_count += sum(1 for r in results if r.is_stub)
            except Exception as e:  # noqa: BLE001
                errors.append(f"{zone_id} [{layer}]: {e}")

            processed += 1
            await db.ie_recompute_tasks.update_one({"id": task_id}, {"$set": {
                "processed": processed,
                "real_count": real_count,
                "stub_count": stub_count,
                "last_zone": f"{zone_id} ({layer})",
                "updated_at": datetime.now(timezone.utc),
            }})

    finished = datetime.now(timezone.utc)
    await db.ie_recompute_tasks.update_one({"id": task_id}, {"$set": {
        "status": "done" if not errors else ("done_with_errors" if processed > 0 else "failed"),
        "finished_at": finished,
        "duration_ms": int((finished - started).total_seconds() * 1000),
        "errors": errors[-50:],
        "real_count": real_count,
        "stub_count": stub_count,
        "processed": processed,
    }})


@sa_router.post("/scores/recompute-all")
async def recompute_all(payload: RecomputeAllRequest, request: Request):
    """Kickoff async batch recompute across all 16 colonias + 15 developments.
    Returns a task_id to poll /scores/recompute-all/status."""
    user = await _require_superadmin(request)
    db = request.app.state.db

    # Build zone plan
    plan: List[Dict[str, Any]] = []
    if payload.include_colonia:
        try:
            from data_seed import COLONIAS
            for c in COLONIAS:
                plan.append({"zone_id": c["id"].replace("-", "_"), "scope": "colonia"})
        except ImportError:
            pass
    if payload.include_proyecto:
        try:
            from data_developments import DEVELOPMENTS_BY_ID
            for d in DEVELOPMENTS_BY_ID.values():
                plan.append({"zone_id": d["id"], "scope": "proyecto"})
        except ImportError:
            pass

    task_id = f"task_{uuid.uuid4().hex[:16]}"
    now = datetime.now(timezone.utc)
    await db.ie_recompute_tasks.insert_one({
        "id": task_id,
        "status": "running",
        "scope_filter": {
            "include_colonia": payload.include_colonia,
            "include_proyecto": payload.include_proyecto,
            "allow_paid": payload.allow_paid,
            "codes": payload.codes,
        },
        "total": len(plan),
        "processed": 0,
        "real_count": 0,
        "stub_count": 0,
        "errors": [],
        "started_at": now,
        "finished_at": None,
        "updated_at": now,
        "triggered_by": user.user_id,
    })

    # Fire-and-forget
    asyncio.create_task(_recompute_batch_runner(db, task_id, plan, payload.allow_paid, payload.codes, payload.layer))

    from routes_ie_engine import audit
    await audit(user.user_id, "ie_scores_recompute_all", None, {"task_id": task_id, "total": len(plan)})
    return {"task_id": task_id, "total": len(plan), "status": "running"}


@sa_router.get("/scores/recompute-all/status")
async def recompute_all_status(request: Request, task_id: Optional[str] = Query(None)):
    """If task_id is given → returns that task. Else → returns most recent task."""
    await _require_superadmin(request)
    db = request.app.state.db
    if task_id:
        doc = await db.ie_recompute_tasks.find_one({"id": task_id}, {"_id": 0})
        if not doc:
            raise HTTPException(404, f"Task {task_id} no existe")
        return doc
    doc = await db.ie_recompute_tasks.find_one({}, {"_id": 0}, sort=[("started_at", -1)])
    return doc or {"status": "idle", "message": "No hay tasks previas."}

