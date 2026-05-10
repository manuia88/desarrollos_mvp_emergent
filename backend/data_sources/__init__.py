"""W4.18 — Data Sources gov MX bundle. 6 fuentes oficiales:
- BANXICO SIE API · SIGCDMX uso de suelo · Atlas Riesgos CDMX
- Catastro CDMX · GTFS CDMX · OSM Geofabrik MX
"""
from data_sources.banxico_engine import BanxicoEngine, run_banxico_daily_cron
from data_sources.sigcdmx_engine import SIGCDMXEngine, run_sigcdmx_monthly_cron
from data_sources.atlas_riesgos_engine import AtlasRiesgosEngine, run_atlas_yearly_cron
from data_sources.catastro_engine import CatastroEngine, run_catastro_quarterly_cron
from data_sources.gtfs_engine import GTFSEngine, run_gtfs_monthly_cron, run_gtfs_daily_cron
from data_sources.osm_engine import OSMEngine, run_osm_weekly_cron

__all__ = [
    "BanxicoEngine", "SIGCDMXEngine", "AtlasRiesgosEngine",
    "CatastroEngine", "GTFSEngine", "OSMEngine",
    "run_banxico_daily_cron", "run_sigcdmx_monthly_cron",
    "run_atlas_yearly_cron", "run_catastro_quarterly_cron",
    "run_gtfs_monthly_cron", "run_gtfs_daily_cron",
    "run_osm_weekly_cron",
    "ensure_data_sources_indexes",
]


async def ensure_data_sources_indexes(db) -> None:
    """Crea índices para las 6 colecciones."""
    import logging
    log = logging.getLogger("dmx.data_sources")
    try:
        await db.banxico_series.create_index(
            [("series_id", 1), ("date", -1)],
            unique=True, name="idx_banxico_series_date", background=True,
        )
        await db.banxico_series.create_index(
            "expires_at", expireAfterSeconds=0, name="idx_banxico_ttl",
            background=True,
        )

        await db.sigcdmx_uso_suelo.create_index(
            "cuenta_catastral", unique=True, name="idx_sigcdmx_cuenta",
            background=True, sparse=True,
        )
        await db.sigcdmx_uso_suelo.create_index(
            "alcaldia", name="idx_sigcdmx_alcaldia", background=True,
        )

        await db.atlas_riesgos.create_index(
            [("ageb_id", 1), ("layer_type", 1)],
            unique=True, name="idx_atlas_ageb_layer", background=True,
        )

        await db.catastro_cdmx.create_index(
            "cuenta_catastral", unique=True, name="idx_catastro_cuenta",
            background=True, sparse=True,
        )
        await db.catastro_cdmx.create_index(
            "alcaldia", name="idx_catastro_alcaldia", background=True,
        )

        await db.gtfs_cdmx.create_index(
            "stop_id", unique=True, name="idx_gtfs_stop", background=True,
        )
        await db.gtfs_cdmx.create_index(
            [("lat", 1), ("lng", 1)], name="idx_gtfs_geo", background=True,
        )

        await db.osm_pois.create_index(
            "osm_id", unique=True, name="idx_osm_id", background=True,
        )
        await db.osm_pois.create_index(
            [("lat", 1), ("lng", 1)], name="idx_osm_geo", background=True,
        )
        await db.osm_pois.create_index(
            "category", name="idx_osm_category", background=True,
        )

        # Métricas de sync por fuente
        await db.data_sources_sync_log.create_index(
            [("source", 1), ("started_at", -1)],
            name="idx_sync_log", background=True,
        )
        await db.data_sources_sync_log.create_index(
            "started_at", expireAfterSeconds=180 * 86400,
            name="idx_sync_log_ttl_180d", background=True,
        )

        log.info("[data_sources] indexes OK")
    except Exception as exc:
        log.warning(f"[data_sources] ensure_indexes failed: {exc}")
