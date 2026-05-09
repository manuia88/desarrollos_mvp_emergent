"""W4.2D1 — SEO filter combos seed.

Seeds db.seo_filter_combos with 50 top-searched filter combinations for CDMX real estate.
Each doc: {filters, canonical_url, last_seen_at}.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List

log = logging.getLogger("dmx.seo_combos_seed")

_BASE_URL = "https://desarrollosmx.io"

TOP_COMBOS: List[Dict[str, Any]] = [
    # ── Polanco ──────────────────────────────────────────────────────────────
    {"colonia": "polanco", "recamaras_min": 2, "precio_max": 15000000},
    {"colonia": "polanco", "recamaras_min": 3, "precio_max": 25000000},
    {"colonia": "polanco", "recamaras_min": 2},
    {"colonia": "polanco", "stage": "preventa"},
    {"colonia": "polanco"},
    # ── Condesa ──────────────────────────────────────────────────────────────
    {"colonia": "condesa", "tipo": "depto", "precio_max": 10000000},
    {"colonia": "condesa", "recamaras_min": 1, "precio_max": 8000000},
    {"colonia": "condesa", "recamaras_min": 2},
    {"colonia": "condesa", "stage": "preventa"},
    {"colonia": "condesa"},
    # ── Roma Norte ───────────────────────────────────────────────────────────
    {"colonia": "roma-norte", "recamaras_min": 1, "precio_max": 8000000},
    {"colonia": "roma-norte", "recamaras_min": 2, "precio_max": 12000000},
    {"colonia": "roma-norte", "tipo": "depto"},
    {"colonia": "roma-norte", "stage": "preventa"},
    {"colonia": "roma-norte"},
    # ── Santa Fe ─────────────────────────────────────────────────────────────
    {"colonia": "santa-fe", "recamaras_min": 2, "precio_max": 15000000},
    {"colonia": "santa-fe", "recamaras_min": 3},
    {"colonia": "santa-fe", "stage": "entrega_inmediata"},
    {"colonia": "santa-fe"},
    # ── Del Valle ────────────────────────────────────────────────────────────
    {"colonia": "del-valle", "stage": "preventa"},
    {"colonia": "del-valle", "precio_max": 10000000},
    {"colonia": "del-valle", "recamaras_min": 2},
    {"colonia": "del-valle"},
    # ── Nápoles ──────────────────────────────────────────────────────────────
    {"colonia": "napoles", "precio_max": 8000000},
    {"colonia": "napoles", "recamaras_min": 2},
    {"colonia": "napoles", "stage": "preventa"},
    # ── Narvarte ─────────────────────────────────────────────────────────────
    {"colonia": "narvarte", "precio_max": 7000000},
    {"colonia": "narvarte", "recamaras_min": 1},
    {"colonia": "narvarte"},
    # ── Coyoacán ─────────────────────────────────────────────────────────────
    {"colonia": "coyoacan", "tipo": "casa", "precio_max": 12000000},
    {"colonia": "coyoacan", "recamaras_min": 3},
    {"colonia": "coyoacan"},
    # ── Doctores / Centro ────────────────────────────────────────────────────
    {"colonia": "doctores", "precio_max": 5000000},
    {"colonia": "doctores", "stage": "preventa"},
    # ── Anzures ──────────────────────────────────────────────────────────────
    {"colonia": "anzures", "recamaras_min": 2},
    {"colonia": "anzures", "precio_max": 12000000},
    # ── Escandón ─────────────────────────────────────────────────────────────
    {"colonia": "escandon", "precio_max": 8000000},
    {"colonia": "escandon", "recamaras_min": 2},
    # ── Hipódromo / Hipódromo Condesa ────────────────────────────────────────
    {"colonia": "hipodromo", "recamaras_min": 2, "precio_max": 10000000},
    {"colonia": "hipodromo-condesa", "tipo": "depto"},
    # ── Sin colonia, por tipo/etapa/precio ───────────────────────────────────
    {"tipo": "depto", "precio_max": 5000000},
    {"tipo": "depto", "precio_max": 8000000},
    {"tipo": "depto", "precio_max": 12000000},
    {"tipo": "casa", "precio_max": 15000000},
    {"stage": "preventa"},
    {"stage": "entrega_inmediata"},
    {"recamaras_min": 1, "precio_max": 6000000},
    {"recamaras_min": 2, "precio_max": 10000000},
    {"recamaras_min": 3, "precio_max": 20000000},
    {"tipo": "depto", "stage": "preventa"},
]


def _combo_to_qs(combo: Dict[str, Any]) -> str:
    """Build canonical query string (alphabetical keys, no nulls)."""
    from urllib.parse import urlencode
    return urlencode(sorted(
        {k: v for k, v in combo.items() if v is not None}.items()
    ))


async def seed_seo_combos(db) -> None:
    """Upsert 50 SEO filter combos into db.seo_filter_combos."""
    now = datetime.now(timezone.utc).isoformat()
    inserted = 0
    for combo in TOP_COMBOS:
        qs = _combo_to_qs(combo)
        canonical_url = f"{_BASE_URL}/marketplace{'?' + qs if qs else ''}"
        # Use canonical_url as unique key
        result = await db.seo_filter_combos.update_one(
            {"canonical_url": canonical_url},
            {"$set": {
                "filters": combo,
                "canonical_url": canonical_url,
                "query_string": qs,
                "last_seen_at": now,
            }},
            upsert=True,
        )
        if result.upserted_id:
            inserted += 1

    count = await db.seo_filter_combos.count_documents({})
    log.info(f"[seo_combos_seed] upserted {inserted} new combos, total={count}")

    # Ensure indexes
    await db.seo_filter_combos.create_index("canonical_url", unique=True, background=True)
    await db.seo_filter_combos.create_index("last_seen_at", background=True)


async def seed_zone_pages_in_sitemap(db) -> None:
    """W4.2D2 — Upsert one entry per CDMX colonia for /zona/{slug} programmatic SEO."""
    try:
        from data_seed import COLONIAS
    except ImportError:
        log.warning("[seo_combos_seed] data_seed.COLONIAS not available, skipping zone pages")
        return

    now = datetime.now(timezone.utc).isoformat()
    inserted = 0
    for c in COLONIAS:
        slug = c["id"]
        canonical_url = f"{_BASE_URL}/zona/{slug}"
        result = await db.seo_filter_combos.update_one(
            {"canonical_url": canonical_url},
            {"$set": {
                "type": "zone_page",
                "slug": slug,
                "filters": {},
                "canonical_url": canonical_url,
                "query_string": "",
                "last_seen_at": now,
            }},
            upsert=True,
        )
        if result.upserted_id:
            inserted += 1

    total_zone = await db.seo_filter_combos.count_documents({"type": "zone_page"})
    log.info(f"[seo_combos_seed] zone_pages upserted={inserted} total={total_zone}")


async def seed_landings_in_sitemap(db) -> None:
    """W4.2D3 — Upsert all programmatic SEO landings (40 colonia + 16 alcaldía + 5 intent)."""
    try:
        from seo_landings_config import COLONIAS_TARGET, ALCALDIAS_CDMX, INTENT_LANDINGS
    except ImportError:
        log.warning("[seo_combos_seed] seo_landings_config not available, skipping landings")
        return

    now = datetime.now(timezone.utc).isoformat()
    inserted_col = inserted_alc = inserted_int = 0

    # 40 colonias_target → /zona/{slug} (reusa la ruta W4.2D2)
    for slug, info in COLONIAS_TARGET.items():
        canonical_url = f"{_BASE_URL}/zona/{slug}"
        ttype = "colonia_landing_tier1" if info.get("has_ie_data") else "colonia_landing_tier2"
        result = await db.seo_filter_combos.update_one(
            {"canonical_url": canonical_url},
            {"$set": {
                "type": ttype,
                "slug": slug,
                "filters": {},
                "canonical_url": canonical_url,
                "query_string": "",
                "last_seen_at": now,
                "alcaldia_slug": info.get("alcaldia_slug"),
            }},
            upsert=True,
        )
        if result.upserted_id:
            inserted_col += 1

    # 16 alcaldías → /alcaldia/{slug}
    for slug in ALCALDIAS_CDMX:
        canonical_url = f"{_BASE_URL}/alcaldia/{slug}"
        result = await db.seo_filter_combos.update_one(
            {"canonical_url": canonical_url},
            {"$set": {
                "type": "alcaldia_landing",
                "slug": slug,
                "filters": {},
                "canonical_url": canonical_url,
                "query_string": "",
                "last_seen_at": now,
            }},
            upsert=True,
        )
        if result.upserted_id:
            inserted_alc += 1

    # 5 intents → /cdmx/{intent}
    for intent in INTENT_LANDINGS:
        canonical_url = f"{_BASE_URL}/cdmx/{intent}"
        result = await db.seo_filter_combos.update_one(
            {"canonical_url": canonical_url},
            {"$set": {
                "type": "intent_landing",
                "slug": intent,
                "filters": {},
                "canonical_url": canonical_url,
                "query_string": "",
                "last_seen_at": now,
            }},
            upsert=True,
        )
        if result.upserted_id:
            inserted_int += 1

    total = await db.seo_filter_combos.count_documents({})
    log.info(
        f"[seo_combos_seed] landings upserted: colonia={inserted_col} alcaldia={inserted_alc} "
        f"intent={inserted_int} total_combos={total}"
    )
