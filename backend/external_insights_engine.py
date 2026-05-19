"""W5.20 — External Insights Engine · 12 global sources.

10 API connectors (Sub-A):
  BIS · OECD · IMF · World Bank · FRED · INEGI Vivienda · BMV FIBRAs ·
  HR Ratings · Numbeo · Global Property Guide

2 CSV connectors (Sub-B):
  Zillow Research · Realtor.com Research

Common helper:
  _fetch_cached(db, source_id, url, ttl_days, ...) → cache wrapper FAIL-OPEN

Schema  db.external_insights_cache:
  {source_id, fetched_at, expires_at, payload, status, error?, http_status?}
  unique index source_id

Audit log opcional action="external_insight_fetched" payload={source, status, count}.
"""
from __future__ import annotations

import asyncio
import csv
import io
import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Any, Awaitable, Callable, Dict, List, Optional

import httpx

log = logging.getLogger("dmx.external_insights_engine")

DEFAULT_TIMEOUT_S = 20
USER_AGENT = "DesarrollosMX-Bot/1.0 (+https://desarrollosmx.io)"

# Source IDs (canonical · used as cache keys + endpoint params)
SOURCE_BIS = "bis_property_prices"
SOURCE_OECD = "oecd_housing"
SOURCE_IMF = "imf_global_housing"
SOURCE_WORLDBANK = "worldbank_doing_business"
SOURCE_FRED = "fred_us_housing"
SOURCE_INEGI = "inegi_vivienda"
SOURCE_BMV = "bmv_fibras"
SOURCE_HR_RATINGS = "hr_ratings"
SOURCE_NUMBEO = "numbeo_property_index"
SOURCE_GPG = "global_property_guide"
SOURCE_ZILLOW = "zillow_research"
SOURCE_REALTOR = "realtor_research"

ALL_SOURCES = [
    SOURCE_BIS, SOURCE_OECD, SOURCE_IMF, SOURCE_WORLDBANK, SOURCE_FRED,
    SOURCE_INEGI, SOURCE_BMV, SOURCE_HR_RATINGS, SOURCE_NUMBEO, SOURCE_GPG,
    SOURCE_ZILLOW, SOURCE_REALTOR,
]


# ─── Schema + indexes ────────────────────────────────────────────────────────
async def ensure_external_insights_indexes(db) -> None:
    try:
        await db.external_insights_cache.create_index(
            "source_id", unique=True, name="ext_insights_source_unique"
        )
        await db.external_insights_cache.create_index(
            "expires_at", name="ext_insights_expires"
        )
        log.info("[w5.20] external_insights_cache indexes OK")
    except Exception as exc:
        log.warning(f"[w5.20] indexes setup failed (non-fatal): {exc}")


# ─── Helpers ──────────────────────────────────────────────────────────────────
def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso() -> str:
    return _now().isoformat()


async def _audit_fetch(db, source_id: str, status: str, payload_hint: Dict[str, Any]) -> None:
    """Best-effort audit log · NO-OP on failure."""
    try:
        from audit_immutable_engine import log as audit_log
        await audit_log(
            db,
            actor={"user_id": "system", "role": "system"},
            action="external_insight_fetched",
            entity_type="external_insight",
            entity_id=source_id,
            before=None,
            after={"source": source_id, "status": status, **payload_hint},
        )
    except Exception:
        pass


async def _cache_get(db, source_id: str) -> Optional[Dict[str, Any]]:
    try:
        return await db.external_insights_cache.find_one({"source_id": source_id}, {"_id": 0})
    except Exception as exc:
        log.warning(f"[ext_insights] cache_get failed {source_id}: {exc}")
        return None


async def _cache_set(db, source_id: str, payload: Any, ttl_days: int, status: str = "ok",
                    error: Optional[str] = None, http_status: Optional[int] = None) -> None:
    try:
        now = _now()
        await db.external_insights_cache.update_one(
            {"source_id": source_id},
            {
                "$set": {
                    "source_id": source_id,
                    "fetched_at": now.isoformat(),
                    "expires_at": (now + timedelta(days=ttl_days)).isoformat(),
                    "payload": payload,
                    "status": status,
                    "error": error,
                    "http_status": http_status,
                },
            },
            upsert=True,
        )
    except Exception as exc:
        log.warning(f"[ext_insights] cache_set failed {source_id}: {exc}")


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


async def _fetch_cached(
    db,
    source_id: str,
    url: str,
    ttl_days: int = 7,
    headers: Optional[Dict[str, str]] = None,
    params: Optional[Dict[str, Any]] = None,
    parser: Optional[Callable[[httpx.Response], Any]] = None,
    timeout: int = DEFAULT_TIMEOUT_S,
) -> Dict[str, Any]:
    """Fetch + cache helper · FAIL-OPEN.

    1. If fresh cache exists → return it.
    2. Else fetch URL with httpx · cache result.
    3. On error → return stale cache if any, else {status:'error', payload:None}.
    """
    cached = await _cache_get(db, source_id)
    if _is_fresh(cached):
        return cached

    if db is None:
        # Smoke test path · attempt fetch without persisting · FAIL-OPEN
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
            if cached:
                return cached
            return {"source_id": source_id, "fetched_at": _iso(), "payload": None,
                    "status": "error", "error": f"HTTP {http_status}"}

        try:
            payload = parser(r) if parser else r.json()
        except Exception as exc:
            log.warning(f"[ext_insights] parser failed {source_id}: {exc}")
            await _cache_set(
                db, source_id, payload=(cached or {}).get("payload"),
                ttl_days=ttl_days, status="error",
                error=f"parser: {exc}", http_status=http_status,
            )
            return cached or {"source_id": source_id, "fetched_at": _iso(),
                              "payload": None, "status": "error", "error": str(exc)}

        await _cache_set(db, source_id, payload, ttl_days=ttl_days, status="ok",
                         http_status=http_status)
        fresh = await _cache_get(db, source_id)
        return fresh or {"source_id": source_id, "fetched_at": _iso(),
                         "payload": payload, "status": "ok"}
    except Exception as exc:
        log.warning(f"[ext_insights] fetch failed {source_id}: {exc}")
        if cached:
            return cached
        return {"source_id": source_id, "fetched_at": _iso(), "payload": None,
                "status": "error", "error": str(exc)}


# ─── Connector 1 · BIS Property Prices ────────────────────────────────────────
async def fetch_bis_property_prices(db) -> Dict[str, Any]:
    """BIS Long Series on Residential Property Prices · México quarterly."""
    url = "https://stats.bis.org/api/v1/data/BIS,WS_LONG_PP,1.0/M.MX...."
    headers = {"Accept": "application/json"}
    res = await _fetch_cached(db, SOURCE_BIS, url, ttl_days=30, headers=headers)
    await _audit_fetch(db, SOURCE_BIS, res.get("status", "error"), {"http": res.get("http_status")})
    return res


# ─── Connector 2 · OECD Housing Prices ────────────────────────────────────────
async def fetch_oecd_housing(db) -> Dict[str, Any]:
    """OECD SDMX housing prices · México."""
    url = "https://sdmx.oecd.org/public/rest/data/OECD.SDD.NAD,DSD_NAD@DF_HOUSING_PRICES/MEX...."
    headers = {"Accept": "application/json"}
    res = await _fetch_cached(db, SOURCE_OECD, url, ttl_days=30, headers=headers)
    await _audit_fetch(db, SOURCE_OECD, res.get("status", "error"), {"http": res.get("http_status")})
    return res


# ─── Connector 3 · IMF Global Housing Watch (free press) ──────────────────────
def _parse_html_text(r: httpx.Response) -> Dict[str, Any]:
    """Minimal HTML parser fallback · returns first 2KB of text + length."""
    try:
        text = r.text or ""
        return {"length": len(text), "snippet": text[:2048]}
    except Exception:
        return {"length": 0, "snippet": ""}


async def fetch_imf_global_housing(db) -> Dict[str, Any]:
    """IMF Global Housing Watch landing page · minimal scrape for press tracking."""
    url = "https://www.imf.org/external/research/housing/"
    res = await _fetch_cached(db, SOURCE_IMF, url, ttl_days=90, parser=_parse_html_text)
    await _audit_fetch(db, SOURCE_IMF, res.get("status", "error"), {"http": res.get("http_status")})
    return res


# ─── Connector 4 · World Bank Doing Business · Registering Property MX ────────
async def fetch_worldbank_doing_business(db) -> Dict[str, Any]:
    """World Bank · México · registering property procedures indicator."""
    url = "https://api.worldbank.org/v2/country/MEX/indicator/IC.PRP.PROC"
    params = {"format": "json", "per_page": "20"}
    res = await _fetch_cached(db, SOURCE_WORLDBANK, url, ttl_days=90, params=params)
    await _audit_fetch(db, SOURCE_WORLDBANK, res.get("status", "error"), {"http": res.get("http_status")})
    return res


# ─── Connector 5 · FRED US Housing (Case-Shiller) ────────────────────────────
async def fetch_fred_us_housing(db) -> Dict[str, Any]:
    """FRED · Case-Shiller national index. Requires IE_FRED_API_KEY env."""
    api_key = os.environ.get("IE_FRED_API_KEY", "").strip()
    if not api_key:
        log.info("[ext_insights] FRED skipped · IE_FRED_API_KEY not set")
        out = {"source_id": SOURCE_FRED, "fetched_at": _iso(), "payload": None,
               "status": "skipped", "error": "IE_FRED_API_KEY missing"}
        if db is not None:
            await _cache_set(db, SOURCE_FRED, None, ttl_days=7, status="skipped",
                             error="IE_FRED_API_KEY missing")
        return out
    url = "https://api.stlouisfed.org/fred/series/observations"
    params = {
        "series_id": "CSUSHPINSA",
        "api_key": api_key,
        "file_type": "json",
        "sort_order": "desc",
        "limit": "24",
    }
    res = await _fetch_cached(db, SOURCE_FRED, url, ttl_days=7, params=params)
    await _audit_fetch(db, SOURCE_FRED, res.get("status", "error"), {"http": res.get("http_status")})
    return res


# ─── Connector 6 · INEGI Vivienda ────────────────────────────────────────────
async def fetch_inegi_vivienda(db) -> Dict[str, Any]:
    """INEGI BIE · Vivienda · uses IE_INEGI_TOKEN env (already configured)."""
    token = os.environ.get("IE_INEGI_TOKEN", "").strip()
    if not token:
        log.info("[ext_insights] INEGI skipped · IE_INEGI_TOKEN missing")
        out = {"source_id": SOURCE_INEGI, "fetched_at": _iso(), "payload": None,
               "status": "skipped", "error": "IE_INEGI_TOKEN missing"}
        if db is not None:
            await _cache_set(db, SOURCE_INEGI, None, ttl_days=90, status="skipped",
                             error="IE_INEGI_TOKEN missing")
        return out
    # BIE · serie 736183 (Índice de precios SHF vivienda) · oficial INEGI
    indicator = "736183"
    url = f"https://www.inegi.org.mx/app/api/indicadores/desarrolladores/jsonxml/INDICATOR/{indicator}/es/0700/false/BIE/2.0/{token}?type=json"
    res = await _fetch_cached(db, SOURCE_INEGI, url, ttl_days=90)
    await _audit_fetch(db, SOURCE_INEGI, res.get("status", "error"), {"http": res.get("http_status")})
    return res


# ─── Connector 7 · BMV FIBRAs cotizaciones ────────────────────────────────────
async def fetch_bmv_fibras(db) -> Dict[str, Any]:
    """BMV · cotizaciones FIBRAs (UNO, Macquarie, Inn). HTML scrape fallback."""
    url = "https://www.bmv.com.mx/es/Grupo_BMV/Emisora_BMV"
    res = await _fetch_cached(db, SOURCE_BMV, url, ttl_days=1, parser=_parse_html_text)
    await _audit_fetch(db, SOURCE_BMV, res.get("status", "error"), {"http": res.get("http_status")})
    return res


# ─── Connector 8 · HR Ratings (free press snapshot) ──────────────────────────
async def fetch_hr_ratings(db) -> Dict[str, Any]:
    """HR Ratings MX · landing snapshot for press tracking · cache 30d."""
    url = "https://www.hrratings.com/"
    res = await _fetch_cached(db, SOURCE_HR_RATINGS, url, ttl_days=30, parser=_parse_html_text)
    await _audit_fetch(db, SOURCE_HR_RATINGS, res.get("status", "error"), {"http": res.get("http_status")})
    return res


# ─── Connector 9 · Numbeo Property Prices Index ───────────────────────────────
async def fetch_numbeo_property_index(db) -> Dict[str, Any]:
    """Numbeo · Mexico cities property prices. Requires IE_NUMBEO_API_KEY."""
    api_key = os.environ.get("IE_NUMBEO_API_KEY", "").strip()
    if not api_key:
        log.info("[ext_insights] Numbeo skipped · IE_NUMBEO_API_KEY missing")
        out = {"source_id": SOURCE_NUMBEO, "fetched_at": _iso(), "payload": None,
               "status": "skipped", "error": "IE_NUMBEO_API_KEY missing"}
        if db is not None:
            await _cache_set(db, SOURCE_NUMBEO, None, ttl_days=30, status="skipped",
                             error="IE_NUMBEO_API_KEY missing")
        return out
    url = "https://www.numbeo.com/api/cities_in_country"
    params = {"country": "Mexico", "api_key": api_key}
    res = await _fetch_cached(db, SOURCE_NUMBEO, url, ttl_days=30, params=params)
    await _audit_fetch(db, SOURCE_NUMBEO, res.get("status", "error"), {"http": res.get("http_status")})
    return res


# ─── Connector 10 · Global Property Guide ─────────────────────────────────────
async def fetch_global_property_guide(db) -> Dict[str, Any]:
    """Global Property Guide · Mexico yields snapshot · cache 90d."""
    url = "https://www.globalpropertyguide.com/latin-america/mexico"
    res = await _fetch_cached(db, SOURCE_GPG, url, ttl_days=90, parser=_parse_html_text)
    await _audit_fetch(db, SOURCE_GPG, res.get("status", "error"), {"http": res.get("http_status")})
    return res


# ═══════════════════════════════════════════════════════════════════════════════
# Sub-B · 2 CSV connectors (Zillow · Realtor)
# ═══════════════════════════════════════════════════════════════════════════════
def _parse_csv_metro_filter(text: str, country_value: str = "United States",
                            max_rows: int = 50) -> Dict[str, Any]:
    """Parse CSV · keep top N rows filtered by Country (when present) or any."""
    reader = csv.DictReader(io.StringIO(text))
    headers = list(reader.fieldnames or [])
    out_rows: List[Dict[str, Any]] = []
    for row in reader:
        # Some CSVs have RegionType/StateName/CountryName fields · filter if present
        country = row.get("Country") or row.get("CountryName") or ""
        if country and country.strip() != country_value:
            continue
        out_rows.append(dict(row))
        if len(out_rows) >= max_rows:
            break
    return {"headers": headers, "row_count": len(out_rows), "rows": out_rows}


async def fetch_zillow_research_csv(db) -> Dict[str, Any]:
    """Zillow Home Value Index · top metros US · narrative MX vs USA."""
    url = ("https://files.zillowstatic.com/research/public_csvs/zhvi/"
           "Metro_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv")

    def _parse(r: httpx.Response) -> Dict[str, Any]:
        return _parse_csv_metro_filter(r.text, country_value="United States", max_rows=50)

    res = await _fetch_cached(db, SOURCE_ZILLOW, url, ttl_days=7, parser=_parse, timeout=30)
    await _audit_fetch(db, SOURCE_ZILLOW, res.get("status", "error"), {"http": res.get("http_status")})
    return res


async def fetch_realtor_research_csv(db) -> Dict[str, Any]:
    """Realtor.com Monthly Inventory · national + top metros."""
    url = ("https://econdata.s3-us-west-2.amazonaws.com/Reports/Core/"
           "RDC_Inventory_Core_Metrics_Country_History.csv")

    def _parse(r: httpx.Response) -> Dict[str, Any]:
        return _parse_csv_metro_filter(r.text, country_value="", max_rows=50)

    res = await _fetch_cached(db, SOURCE_REALTOR, url, ttl_days=7, parser=_parse, timeout=30)
    await _audit_fetch(db, SOURCE_REALTOR, res.get("status", "error"), {"http": res.get("http_status")})
    return res


# ═══════════════════════════════════════════════════════════════════════════════
# Dispatch helpers
# ═══════════════════════════════════════════════════════════════════════════════
SOURCE_DISPATCH: Dict[str, Callable[[Any], Awaitable[Dict[str, Any]]]] = {
    SOURCE_BIS: fetch_bis_property_prices,
    SOURCE_OECD: fetch_oecd_housing,
    SOURCE_IMF: fetch_imf_global_housing,
    SOURCE_WORLDBANK: fetch_worldbank_doing_business,
    SOURCE_FRED: fetch_fred_us_housing,
    SOURCE_INEGI: fetch_inegi_vivienda,
    SOURCE_BMV: fetch_bmv_fibras,
    SOURCE_HR_RATINGS: fetch_hr_ratings,
    SOURCE_NUMBEO: fetch_numbeo_property_index,
    SOURCE_GPG: fetch_global_property_guide,
    SOURCE_ZILLOW: fetch_zillow_research_csv,
    SOURCE_REALTOR: fetch_realtor_research_csv,
}


async def fetch_source(db, source_id: str) -> Dict[str, Any]:
    """Fetch single source by ID. Returns cached payload (FAIL-OPEN)."""
    fn = SOURCE_DISPATCH.get(source_id)
    if fn is None:
        return {"source_id": source_id, "status": "error", "error": "unknown_source"}
    return await fn(db)


async def fetch_all_sources(db) -> Dict[str, Any]:
    """Parallel fetch · returns dict {source_id: result}."""
    tasks = [fn(db) for fn in SOURCE_DISPATCH.values()]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    out: Dict[str, Any] = {}
    for source_id, res in zip(SOURCE_DISPATCH.keys(), results):
        if isinstance(res, Exception):
            out[source_id] = {"source_id": source_id, "status": "error", "error": str(res)}
        else:
            out[source_id] = res
    return out


async def list_sources_status(db) -> List[Dict[str, Any]]:
    """Lightweight status overview for /all-sources endpoint."""
    out: List[Dict[str, Any]] = []
    for source_id in ALL_SOURCES:
        doc = await _cache_get(db, source_id)
        out.append({
            "source_id": source_id,
            "status": (doc or {}).get("status", "never_fetched"),
            "fetched_at": (doc or {}).get("fetched_at"),
            "expires_at": (doc or {}).get("expires_at"),
            "http_status": (doc or {}).get("http_status"),
            "error": (doc or {}).get("error"),
        })
    return out


# ─── Methodology metadata (for /methodology/sources endpoint) ────────────────
SOURCE_METADATA: List[Dict[str, str]] = [
    {"source_id": SOURCE_BIS, "name": "BIS Property Price Statistics",
     "url": "https://www.bis.org/statistics/pp.htm", "frequency": "Quarterly", "tier": "global_macro"},
    {"source_id": SOURCE_OECD, "name": "OECD Housing Prices Database",
     "url": "https://www.oecd.org/housing/", "frequency": "Quarterly", "tier": "global_macro"},
    {"source_id": SOURCE_IMF, "name": "IMF Global Housing Watch",
     "url": "https://www.imf.org/external/research/housing/", "frequency": "Quarterly", "tier": "global_macro"},
    {"source_id": SOURCE_WORLDBANK, "name": "World Bank Doing Business · Registering Property",
     "url": "https://api.worldbank.org/", "frequency": "Annual", "tier": "global_macro"},
    {"source_id": SOURCE_FRED, "name": "FRED St. Louis Fed · Case-Shiller",
     "url": "https://fred.stlouisfed.org/series/CSUSHPINSA", "frequency": "Monthly", "tier": "us_macro"},
    {"source_id": SOURCE_INEGI, "name": "INEGI · Vivienda (SHF index)",
     "url": "https://www.inegi.org.mx/", "frequency": "Quarterly", "tier": "mx_macro"},
    {"source_id": SOURCE_BMV, "name": "BMV · FIBRAs cotizaciones",
     "url": "https://www.bmv.com.mx/", "frequency": "Daily", "tier": "mx_macro"},
    {"source_id": SOURCE_HR_RATINGS, "name": "HR Ratings",
     "url": "https://www.hrratings.com/", "frequency": "Monthly", "tier": "mx_press"},
    {"source_id": SOURCE_NUMBEO, "name": "Numbeo Property Index",
     "url": "https://www.numbeo.com/property-investment/", "frequency": "Monthly", "tier": "global_aggregator"},
    {"source_id": SOURCE_GPG, "name": "Global Property Guide",
     "url": "https://www.globalpropertyguide.com/", "frequency": "Quarterly", "tier": "global_aggregator"},
    {"source_id": SOURCE_ZILLOW, "name": "Zillow Research (ZHVI)",
     "url": "https://www.zillow.com/research/data/", "frequency": "Monthly", "tier": "us_aggregator"},
    {"source_id": SOURCE_REALTOR, "name": "Realtor.com Research",
     "url": "https://www.realtor.com/research/data/", "frequency": "Monthly", "tier": "us_aggregator"},
]
