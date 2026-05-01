"""
IE Engine — Phase B1 score routes.

Endpoints:
- POST /api/superadmin/scores/recompute           → superadmin: run engine for zone + codes
- GET  /api/zones/:id/scores                      → public: list scores for a zone
- POST /api/superadmin/seed-historic-from-upload  → superadmin: replay NOAA dump into raw_observations
"""
from __future__ import annotations

import csv
import io
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
    limit: int = Query(100, ge=1, le=500),
):
    await _require_superadmin(request)
    db = request.app.state.db
    q: Dict[str, Any] = {}
    if zone_id: q["zone_id"] = zone_id
    if code: q["code"] = code
    if tier: q["tier"] = tier
    docs = await db.ie_scores.find(q, {"_id": 0}).sort("computed_at", -1).limit(limit).to_list(length=limit)
    return [ScoreOut(**d) for d in docs]


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
