"""W6.MOV.2 — Gov Data MX Engine · 3 tracks consolidados.

Track A · API auto-pull (6 connectors gov MX):
  (negocios por zona: OSM · osm_engine · DENUE eliminado)
  2. BANXICO SIE             · series macro (IE_BANXICO_TOKEN env)
  3. DataMéxico SE           · econ indicators (sin token)
  4. CONAVI vivienda         · HTML scrape fail-soft
  5. SESNSP delitos          · CSV mensual
  6. CENAPRED Atlas Riesgos  · risk zones (sin token)

Track C · Admin Upload helpers (CSV/Excel/PDF · max 10MB):
  upload_file · list_uploads · delete_upload (soft) · stats

Distinto a W5.20 (external_insights_engine.py): aquel es para fuentes
GLOBALES BIS/OECD/IMF. ESTE es para fuentes GOV MX específicas.

Cache 14d en gov_data_mx_cache por (source_id) · FAIL-OPEN graceful.
Audit log en upload + manual refresh (audit_immutable_engine).
"""
from __future__ import annotations

import asyncio
import logging
import os
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Awaitable, Callable, Dict, List, Optional

import httpx

log = logging.getLogger("dmx.gov_data_mx_engine")

DEFAULT_TIMEOUT_S = 25
USER_AGENT = "DesarrollosMX-Bot/1.0 (+https://desarrollosmx.io)"
CACHE_TTL_DAYS = 14
UPLOAD_MAX_BYTES = 10 * 1024 * 1024  # 10 MB
ALLOWED_MIME_PREFIXES = (
    "text/csv", "application/csv",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/pdf",
    "text/plain",  # CSV puede llegar como text/plain
)
ALLOWED_EXTS = (".csv", ".xlsx", ".xls", ".pdf")

# ─── Source IDs (canonical · used as cache keys + endpoint params) ───────────
SOURCE_BANXICO_SIE = "banxico_sie"
SOURCE_DATAMEXICO = "datamexico_se"
SOURCE_CONAVI_VIVIENDA = "conavi_vivienda"
SOURCE_SESNSP_DELITOS = "sesnsp_delitos"
SOURCE_CENAPRED_ATLAS = "cenapred_atlas"

ALL_SOURCES = [
    SOURCE_BANXICO_SIE,
    SOURCE_DATAMEXICO,
    SOURCE_CONAVI_VIVIENDA,
    SOURCE_SESNSP_DELITOS,
    SOURCE_CENAPRED_ATLAS,
]

SOURCE_LABELS = {
    SOURCE_BANXICO_SIE:     "BANXICO SIE · Series macro MX",
    SOURCE_DATAMEXICO:      "INEGI BISE · Indicadores MX",  # repuntado: DataMéxico (host muerto) → INEGI
    SOURCE_CONAVI_VIVIENDA: "CONAVI · Vivienda federal",
    SOURCE_SESNSP_DELITOS:  "SESNSP · Delitos mensuales",
    SOURCE_CENAPRED_ATLAS:  "SGIRPC Atlas Riesgos CDMX · sismo/geológico",  # repuntado: CENAPRED (caído) → SGIRPC
}

# Track C upload source labels (whitelisted dropdown)
UPLOAD_SOURCE_LABELS = [
    "notarias_cnnym",
    "rpp_cdmx",
    "catastro_miguel_hidalgo",
    "catastro_cuauhtemoc",
    "shf_reportes",
    "bmv_fibras_local",
    "cfe_cobertura",
    "conagua",
    "otros",
]


# ─── Schema + indexes ────────────────────────────────────────────────────────
async def ensure_gov_data_mx_indexes(db) -> None:
    try:
        await db.gov_data_mx_cache.create_index(
            "source_id", unique=True, name="gov_data_mx_source_unique"
        )
        await db.gov_data_mx_cache.create_index(
            "expires_at", name="gov_data_mx_expires"
        )
        await db.gov_data_mx_raw.create_index(
            [("parser_id", 1), ("period", 1)], name="gov_data_mx_raw_parser_period"
        )
        await db.gov_data_mx_raw.create_index(
            "ingested_at", name="gov_data_mx_raw_ingested"
        )
        await db.gov_data_mx_uploads.create_index(
            "uploaded_at", name="gov_data_mx_uploads_uploaded"
        )
        await db.gov_data_mx_uploads.create_index(
            "deleted", name="gov_data_mx_uploads_deleted"
        )
        log.info("[w6.mov2] gov_data_mx indexes OK")
    except Exception as exc:
        log.warning(f"[w6.mov2] indexes setup failed (non-fatal): {exc}")


# ─── Helpers ─────────────────────────────────────────────────────────────────
def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso() -> str:
    return _now().isoformat()


async def _audit(db, action: str, entity_id: str, payload: Dict[str, Any]) -> None:
    try:
        from audit_immutable_engine import log as audit_log
        await audit_log(
            db,
            actor={"user_id": "system", "role": "system"},
            action=action,
            entity_type="gov_data_mx",
            entity_id=entity_id,
            before=None,
            after=payload,
        )
    except Exception:
        pass


async def _cache_get(db, source_id: str) -> Optional[Dict[str, Any]]:
    try:
        return await db.gov_data_mx_cache.find_one({"source_id": source_id}, {"_id": 0})
    except Exception as exc:
        log.warning(f"[gov_data_mx] cache_get failed {source_id}: {exc}")
        return None


async def _cache_set(
    db, source_id: str, payload: Any, ttl_days: int = CACHE_TTL_DAYS,
    status: str = "ok", error: Optional[str] = None, http_status: Optional[int] = None,
) -> None:
    try:
        now = _now()
        await db.gov_data_mx_cache.update_one(
            {"source_id": source_id},
            {"$set": {
                "source_id": source_id,
                "fetched_at": now.isoformat(),
                "expires_at": (now + timedelta(days=ttl_days)).isoformat(),
                "payload": payload,
                "status": status,
                "error": error,
                "http_status": http_status,
            }},
            upsert=True,
        )
    except Exception as exc:
        log.warning(f"[gov_data_mx] cache_set failed {source_id}: {exc}")


def _is_fresh(doc: Optional[Dict[str, Any]]) -> bool:
    if not doc:
        return False
    expires_at = doc.get("expires_at")
    if not expires_at:
        return False
    try:
        exp = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        return exp > _now()
    except Exception:
        return False


def _parse_html_snippet(r: httpx.Response) -> Dict[str, Any]:
    try:
        text = r.text or ""
        return {"length": len(text), "snippet": text[:2048]}
    except Exception:
        return {"length": 0, "snippet": ""}


def _parse_arcgis_layers(r: httpx.Response) -> Dict[str, Any]:
    """Resumen liviano de un MapServer ArcGIS (catálogo de capas) · honesto: lanza si no es JSON."""
    d = r.json()  # si es HTML/error → lanza → _fetch_cached marca status=error
    layers = d.get("layers") or []
    return {
        "service": d.get("mapName") or d.get("documentInfo", {}).get("Title", ""),
        "n_capas": len(layers),
        "capas": [{"id": l.get("id"), "name": l.get("name")} for l in layers[:40]],
        "description": (d.get("serviceDescription") or "")[:300],
    }


async def _fetch_cached(
    db,
    source_id: str,
    url: str,
    ttl_days: int = CACHE_TTL_DAYS,
    headers: Optional[Dict[str, str]] = None,
    params: Optional[Dict[str, Any]] = None,
    parser: Optional[Callable[[httpx.Response], Any]] = None,
    timeout: int = DEFAULT_TIMEOUT_S,
) -> Dict[str, Any]:
    """Generic fetch + cache wrapper · FAIL-OPEN.

    1. If fresh cache exists → return it.
    2. Else fetch URL · cache result.
    3. On error → return stale cache if any, else status=error.
    """
    cached = await _cache_get(db, source_id) if db is not None else None
    if _is_fresh(cached):
        return cached

    if db is None:
        # Smoke test path · attempt fetch without persisting
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                r = await client.get(url, headers=headers or {}, params=params)
            if r.status_code != 200:
                return {"source_id": source_id, "fetched_at": _iso(), "payload": None,
                        "status": "error", "error": f"HTTP {r.status_code}"}
            payload = parser(r) if parser else r.json()
            return {"source_id": source_id, "fetched_at": _iso(), "payload": payload, "status": "ok"}
        except Exception as exc:
            return {"source_id": source_id, "fetched_at": _iso(), "payload": None,
                    "status": "error", "error": str(exc)}

    try:
        merged_headers = {"User-Agent": USER_AGENT}
        if headers:
            merged_headers.update(headers)
        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.get(url, headers=merged_headers, params=params)
        http_status = r.status_code
        if http_status != 200:
            await _cache_set(
                db, source_id, payload=(cached or {}).get("payload"),
                ttl_days=ttl_days, status="error",
                error=f"HTTP {http_status}", http_status=http_status,
            )
            return cached or {"source_id": source_id, "fetched_at": _iso(), "payload": None,
                              "status": "error", "error": f"HTTP {http_status}"}

        try:
            payload = parser(r) if parser else r.json()
        except Exception as exc:
            log.warning(f"[gov_data_mx] parser failed {source_id}: {exc}")
            await _cache_set(
                db, source_id, payload=(cached or {}).get("payload"),
                ttl_days=ttl_days, status="error",
                error=f"parser: {exc}", http_status=http_status,
            )
            return cached or {"source_id": source_id, "fetched_at": _iso(), "payload": None,
                              "status": "error", "error": str(exc)}

        await _cache_set(db, source_id, payload, ttl_days=ttl_days, status="ok",
                         http_status=http_status)
        fresh = await _cache_get(db, source_id)
        return fresh or {"source_id": source_id, "fetched_at": _iso(),
                         "payload": payload, "status": "ok"}
    except Exception as exc:
        log.warning(f"[gov_data_mx] fetch failed {source_id}: {exc}")
        return cached or {"source_id": source_id, "fetched_at": _iso(), "payload": None,
                          "status": "error", "error": str(exc)}


# Connector INEGI DENUE ELIMINADO: solo traía un snippet HTML del mapa (cero datos de negocios).
# La densidad de negocios por zona la cubre OSM (osm_engine). DENUE muerto · no reintroducir.

# ─── Connector · BANXICO SIE (token opcional) ────────────────────────────────
async def fetch_banxico_sie(db, series_id: str = "SF43718") -> Dict[str, Any]:
    """BANXICO SIE · serie macro. Requires IE_BANXICO_TOKEN env (token gratis)."""
    token = os.environ.get("IE_BANXICO_TOKEN", "").strip()
    if not token:
        log.info("[gov_data_mx] BANXICO skipped · IE_BANXICO_TOKEN not set")
        out = {"source_id": SOURCE_BANXICO_SIE, "fetched_at": _iso(), "payload": None,
               "status": "skipped", "error": "IE_BANXICO_TOKEN missing"}
        if db is not None:
            await _cache_set(db, SOURCE_BANXICO_SIE, None, ttl_days=7, status="skipped",
                             error="IE_BANXICO_TOKEN missing")
        return out
    url = f"https://www.banxico.org.mx/SieAPIRest/service/v1/series/{series_id}/datos/oportuno"
    headers = {"Bmx-Token": token, "Accept": "application/json"}
    res = await _fetch_cached(db, SOURCE_BANXICO_SIE, url, ttl_days=7, headers=headers)
    await _audit(db, "gov_data_mx_fetched", SOURCE_BANXICO_SIE,
                 {"status": res.get("status"), "series": series_id})
    return res


# ─── Connector 3 · INEGI BISE (token) — antes DataMéxico (host muerto) ───────
async def fetch_datamexico_se(db) -> Dict[str, Any]:
    """INEGI BISE · indicadores MX (demografía/economía). Repuntado desde DataMéxico,
    cuyo host (api.datamexico.org) ya no resuelve. Token: IE_INEGI_TOKEN.
    HONESTO: si INEGI responde HTML (token vencido / indicador inválido), `r.json()`
    truena en _fetch_cached → status=error (no se finge OK). Va a verde cuando el token/indicador sean válidos."""
    token = os.environ.get("IE_INEGI_TOKEN", "")
    indicador = os.environ.get("IE_INEGI_INDICADOR", "1002000001")  # default: población total
    area = os.environ.get("IE_INEGI_AREA", "00")                    # default: nacional
    url = (f"https://www.inegi.org.mx/app/api/indicadores/desarrolladores/jsonxml/"
           f"INDICATOR/{indicador}/es/{area}/false/BISE/2.0/{token}?type=json")
    res = await _fetch_cached(db, SOURCE_DATAMEXICO, url, ttl_days=14)
    await _audit(db, "gov_data_mx_fetched", SOURCE_DATAMEXICO,
                 {"status": res.get("status")})
    return res


# ─── Connector 4 · CONAVI vivienda (HTML scrape fail-soft) ───────────────────
async def fetch_conavi_vivienda(db) -> Dict[str, Any]:
    """CONAVI landing page · vivienda federal · HTML scrape fail-soft."""
    url = "https://www.gob.mx/conavi/acciones-y-programas/sistema-nacional-de-informacion-e-indicadores-de-vivienda-snic"
    res = await _fetch_cached(db, SOURCE_CONAVI_VIVIENDA, url, ttl_days=30, parser=_parse_html_snippet)
    await _audit(db, "gov_data_mx_fetched", SOURCE_CONAVI_VIVIENDA,
                 {"status": res.get("status")})
    return res


# ─── Connector 5 · SESNSP delitos (CSV mensual landing) ──────────────────────
async def fetch_sesnsp_delitos(db) -> Dict[str, Any]:
    """SESNSP delitos · landing page CSV mensual · parser HTML para detectar URL real."""
    url = "https://www.gob.mx/sesnsp/acciones-y-programas/datos-abiertos-de-incidencia-delictiva"
    res = await _fetch_cached(db, SOURCE_SESNSP_DELITOS, url, ttl_days=14, parser=_parse_html_snippet)
    await _audit(db, "gov_data_mx_fetched", SOURCE_SESNSP_DELITOS,
                 {"status": res.get("status")})
    return res


# ─── Connector 6 · SGIRPC Atlas Riesgos CDMX — antes CENAPRED (host caído) ────
async def fetch_cenapred_atlas(db) -> Dict[str, Any]:
    """SGIRPC Atlas de Riesgos CDMX (ArcGIS REST) · catálogo de capas geológicas/sísmicas.
    Repuntado desde CENAPRED nacional (host inalcanzable); para CDMX la fuente autoritativa
    y keyless es SGIRPC (verificada HTTP 200, capas reales). Sismo/hundimiento/inundación."""
    url = ("https://serviciosatlas.sgirpc.cdmx.gob.mx/arcgis/rest/services/"
           "AtlasCapasPublicas/Geologicos/MapServer")
    res = await _fetch_cached(db, SOURCE_CENAPRED_ATLAS, url, ttl_days=30,
                              params={"f": "json"}, parser=_parse_arcgis_layers)
    await _audit(db, "gov_data_mx_fetched", SOURCE_CENAPRED_ATLAS,
                 {"status": res.get("status")})
    return res


# ─── Dispatch ────────────────────────────────────────────────────────────────
SOURCE_DISPATCH: Dict[str, Callable[..., Awaitable[Dict[str, Any]]]] = {
    SOURCE_BANXICO_SIE:     fetch_banxico_sie,
    SOURCE_DATAMEXICO:      fetch_datamexico_se,
    SOURCE_CONAVI_VIVIENDA: fetch_conavi_vivienda,
    SOURCE_SESNSP_DELITOS:  fetch_sesnsp_delitos,
    SOURCE_CENAPRED_ATLAS:  fetch_cenapred_atlas,
}


async def fetch_source(db, source_id: str) -> Dict[str, Any]:
    func = SOURCE_DISPATCH.get(source_id)
    if not func:
        return {"source_id": source_id, "status": "error",
                "error": f"unknown source · usa uno de {list(SOURCE_DISPATCH.keys())}"}
    return await func(db)


async def fetch_all_sources(db) -> Dict[str, Dict[str, Any]]:
    """Run all 6 connectors in parallel · returns map source_id → result."""
    keys = list(SOURCE_DISPATCH.keys())
    coros = [SOURCE_DISPATCH[k](db) for k in keys]
    results = await asyncio.gather(*coros, return_exceptions=True)
    out: Dict[str, Dict[str, Any]] = {}
    for k, r in zip(keys, results):
        if isinstance(r, Exception):
            out[k] = {"source_id": k, "status": "error", "error": str(r)}
        else:
            out[k] = r or {"source_id": k, "status": "error", "error": "no response"}
    return out


async def get_all_sources(db) -> Dict[str, Any]:
    """Read-only summary of cached state · NO trigger fetch."""
    out: Dict[str, Any] = {"sources": [], "total": len(ALL_SOURCES)}
    counts = {"ok": 0, "error": 0, "skipped": 0, "stale": 0, "missing": 0}
    for sid in ALL_SOURCES:
        doc = await _cache_get(db, sid)
        if not doc:
            counts["missing"] += 1
            out["sources"].append({
                "source_id": sid,
                "label": SOURCE_LABELS.get(sid, sid),
                "status": "missing",
                "fetched_at": None,
                "expires_at": None,
            })
            continue
        status = doc.get("status") or "unknown"
        fresh = _is_fresh(doc)
        if status == "ok" and not fresh:
            status_display = "stale"
            counts["stale"] += 1
        else:
            status_display = status
            if status in counts:
                counts[status] += 1
        out["sources"].append({
            "source_id": sid,
            "label": SOURCE_LABELS.get(sid, sid),
            "status": status_display,
            "fetched_at": doc.get("fetched_at"),
            "expires_at": doc.get("expires_at"),
            "http_status": doc.get("http_status"),
            "error": doc.get("error"),
        })
    out["counts"] = counts
    return out


# ─── Track C · Admin Upload helpers ──────────────────────────────────────────
def _validate_upload(filename: str, content_type: Optional[str], size: int) -> Optional[str]:
    if size <= 0:
        return "archivo vacío"
    if size > UPLOAD_MAX_BYTES:
        return f"archivo excede {UPLOAD_MAX_BYTES // (1024*1024)}MB"
    name = (filename or "").lower().strip()
    if not name:
        return "filename requerido"
    if not name.endswith(ALLOWED_EXTS):
        return f"extensión no permitida · usa {ALLOWED_EXTS}"
    if content_type and not any(content_type.lower().startswith(p) for p in ALLOWED_MIME_PREFIXES):
        # Warn but allow · algunos browsers mandan octet-stream
        log.info(f"[gov_data_mx] upload content_type sospechoso (allowed): {content_type}")
    return None


async def upload_file(
    db,
    file_bytes: bytes,
    filename: str,
    content_type: Optional[str],
    source_label: str,
    schema_hint: Optional[str] = None,
    uploaded_by: Optional[str] = None,
) -> Dict[str, Any]:
    """Persist uploaded file metadata + raw bytes in gov_data_mx_uploads.

    Returns: {ok, upload_id, size, source_label}.
    """
    size = len(file_bytes or b"")
    err = _validate_upload(filename, content_type, size)
    if err:
        return {"ok": False, "error": err}

    if source_label not in UPLOAD_SOURCE_LABELS:
        return {"ok": False, "error": f"source_label inválido · usa uno de {UPLOAD_SOURCE_LABELS}"}

    upload_id = uuid.uuid4().hex
    now_iso = _iso()
    doc = {
        "id": upload_id,
        "filename": filename,
        "content_type": content_type or "application/octet-stream",
        "size": size,
        "source_label": source_label,
        "schema_hint": (schema_hint or "")[:500],
        "uploaded_by": uploaded_by or "superadmin",
        "uploaded_at": now_iso,
        "deleted": False,
        # Store raw bytes only if small enough · BinData OK <10MB
        "raw": file_bytes,
    }
    try:
        await db.gov_data_mx_uploads.insert_one(doc)
    except Exception as exc:
        log.warning(f"[gov_data_mx] upload insert failed: {exc}")
        return {"ok": False, "error": str(exc)}

    await _audit(db, "gov_data_mx_upload", upload_id, {
        "filename": filename, "size": size, "source_label": source_label,
        "uploaded_by": uploaded_by or "superadmin",
    })

    return {"ok": True, "upload_id": upload_id, "size": size, "source_label": source_label,
            "uploaded_at": now_iso}


async def list_uploads(db, limit: int = 50, offset: int = 0,
                       include_deleted: bool = False) -> Dict[str, Any]:
    q: Dict[str, Any] = {} if include_deleted else {"deleted": {"$ne": True}}
    limit = max(1, min(int(limit or 50), 200))
    offset = max(0, int(offset or 0))
    items: List[Dict[str, Any]] = []
    try:
        cursor = (
            db.gov_data_mx_uploads
            .find(q, {"_id": 0, "raw": 0})
            .sort("uploaded_at", -1)
            .skip(offset)
            .limit(limit)
        )
        async for d in cursor:
            items.append(d)
        total = await db.gov_data_mx_uploads.count_documents(q)
    except Exception as exc:
        log.warning(f"[gov_data_mx] list_uploads failed: {exc}")
        return {"items": [], "total": 0, "limit": limit, "offset": offset, "error": str(exc)}
    return {"items": items, "total": total, "limit": limit, "offset": offset}


async def delete_upload(db, upload_id: str, reason: Optional[str] = None,
                        actor_id: Optional[str] = None) -> Dict[str, Any]:
    if not upload_id:
        return {"ok": False, "error": "upload_id requerido"}
    try:
        res = await db.gov_data_mx_uploads.update_one(
            {"id": upload_id, "deleted": {"$ne": True}},
            {"$set": {"deleted": True, "deleted_at": _iso(),
                      "delete_reason": (reason or "")[:500],
                      "deleted_by": actor_id or "superadmin"}},
        )
    except Exception as exc:
        log.warning(f"[gov_data_mx] delete_upload failed: {exc}")
        return {"ok": False, "error": str(exc)}
    if res.matched_count == 0:
        return {"ok": False, "error": "upload not found or already deleted"}
    await _audit(db, "gov_data_mx_upload_deleted", upload_id, {
        "reason": reason, "actor": actor_id or "superadmin",
    })
    return {"ok": True, "upload_id": upload_id}


async def get_stats(db) -> Dict[str, Any]:
    """Aggregated stats Track A + Track B (raw) + Track C (uploads)."""
    sources = await get_all_sources(db)
    try:
        raw_total = await db.gov_data_mx_raw.count_documents({})
    except Exception:
        raw_total = 0
    try:
        uploads_total = await db.gov_data_mx_uploads.count_documents({"deleted": {"$ne": True}})
    except Exception:
        uploads_total = 0
    try:
        cache_entries = await db.gov_data_mx_cache.count_documents({})
    except Exception:
        cache_entries = 0
    return {
        "track_a": sources,
        "track_b_raw_total": raw_total,
        "track_c_uploads_active": uploads_total,
        "cache_entries": cache_entries,
        "computed_at": _iso(),
    }


# ─── Public aggregated view (no raw payload) ─────────────────────────────────
async def get_public_source(db, source_id: str) -> Dict[str, Any]:
    """Public endpoint · returns aggregated indicators · no raw payload."""
    if source_id not in ALL_SOURCES:
        return {"source_id": source_id, "status": "unknown",
                "error": f"source desconocido · usa uno de {ALL_SOURCES}"}
    doc = await _cache_get(db, source_id)
    if not doc:
        return {"source_id": source_id, "label": SOURCE_LABELS.get(source_id, source_id),
                "status": "missing", "fetched_at": None}
    payload = doc.get("payload")
    # Generic aggregated summary · NO raw dump
    summary: Dict[str, Any] = {
        "source_id": source_id,
        "label": SOURCE_LABELS.get(source_id, source_id),
        "status": doc.get("status"),
        "fetched_at": doc.get("fetched_at"),
        "expires_at": doc.get("expires_at"),
    }
    if isinstance(payload, dict):
        # Only include length hints, NOT raw
        if "length" in payload:
            summary["payload_length"] = payload.get("length")
        if "data" in payload and isinstance(payload["data"], list):
            summary["records_count"] = len(payload["data"])
        if "bmx" in payload and isinstance(payload["bmx"], dict):
            series = (payload["bmx"].get("series") or [])
            if series and isinstance(series, list):
                summary["series_count"] = len(series)
    return summary
