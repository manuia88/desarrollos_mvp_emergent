"""
IE Engine — seed catalog of the 18 data sources.

Source of truth: 03_INTELLIGENCE.md §4. Mapped to the 6 access modes defined in
the Phase A spec. This list is idempotently inserted on startup; any existing
row keeps its credentials/last_sync — only the descriptive fields are upserted.
"""
from typing import List, Dict, Any

# access_mode values: api_key | ckan_resource | keyless_url | wms_wfs | manual_upload | external_paid
# status values:      active | stub | h2 | blocked | manual_only

IE_DATA_SOURCES_SEED: List[Dict[str, Any]] = [
    # ─── api_key (4) ─────────────────────────────────────────────────────────
    {
        "id": "noaa",
        "name": "NOAA Climate Global",
        "category": "clima",
        "access_mode": "api_key",
        "supports_manual_upload": True,
        "endpoint": "https://www.ncei.noaa.gov/cdo-web/api/v2",
        "credentials_keys": ["api_key"],
        "credentials_env": {"api_key": "IE_NOAA_API_KEY"},
        "description": "Observaciones climáticas globales — base de IE_COL_CLIMA y twin matches.",
    },
    {
        "id": "inegi",
        "name": "INEGI (Censo + AGEB + ENIGH + DENUE + SCIAN)",
        "category": "demografia",
        "access_mode": "api_key",
        "supports_manual_upload": True,
        "endpoint": "https://www.inegi.org.mx/app/api",
        "credentials_keys": ["token"],
        "credentials_env": {"token": "IE_INEGI_TOKEN"},
        "description": "1 token cubre Censo, AGEB, ENIGH, DENUE y SCIAN — alimenta IE_COL_DEMOGRAFIA_*.",
    },
    {
        "id": "banxico",
        "name": "Banxico SIE",
        "category": "economia",
        "access_mode": "api_key",
        "supports_manual_upload": True,
        "endpoint": "https://www.banxico.org.mx/SieAPIRest/service/v1",
        "credentials_keys": ["token"],
        "credentials_env": {"token": "IE_BANXICO_TOKEN"},
        "description": "Indicadores SHF + tasas de interés + USD/MXN — alimenta IE_COL_PLUSVALIA_HIST.",
    },
    {
        "id": "airroi",
        "name": "AirROI Markets",
        "category": "economia",
        "access_mode": "api_key",
        "supports_manual_upload": False,
        "endpoint": "https://api.airroi.com/v1",
        "credentials_keys": ["api_key"],
        "credentials_env": {"api_key": "IE_AIRROI_API_KEY"},
        "description": "Datos Airbnb nativos — alimenta IE_COL_ROI_AIRBNB y AIRBNB_PROFITABILITY.",
    },

    # ─── ckan_resource (4) ───────────────────────────────────────────────────
    {
        "id": "datos_cdmx",
        "name": "datos.cdmx.gob.mx",
        "category": "geo",
        "access_mode": "ckan_resource",
        "supports_manual_upload": True,
        "endpoint": "https://datos.cdmx.gob.mx/api/3/action/datastore_search",
        "credentials_keys": ["resource_id", "base_url"],
        "credentials_env": {"base_url": "IE_DATOS_CDMX_BASE_URL"},
        "description": "Open Data CDMX (CKAN) — uso de suelo SEDUVI + infraestructura + telecom.",
    },
    {
        "id": "fgj_cdmx",
        "name": "FGJ CDMX — Carpetas de investigación",
        "category": "seguridad",
        "access_mode": "ckan_resource",
        "supports_manual_upload": True,
        "endpoint": "https://datos.cdmx.gob.mx/api/3/action/datastore_search",
        "credentials_keys": ["resource_id"],
        "credentials_env": {"resource_id": "IE_FGJ_CDMX_RESOURCE_ID"},
        "description": "Delitos por carpeta de investigación — alimenta IE_COL_SEGURIDAD.",
    },
    {
        "id": "sacmex",
        "name": "SACMEX — Cortes de agua",
        "category": "agua",
        "access_mode": "ckan_resource",
        "supports_manual_upload": True,
        "endpoint": "https://datos.cdmx.gob.mx/api/3/action/datastore_search",
        "credentials_keys": ["resource_id"],
        "credentials_env": {"resource_id": "IE_SACMEX_RESOURCE_ID"},
        "description": "Frecuencia de cortes — alimenta IE_COL_AGUA_CONFIABILIDAD.",
    },
    {
        "id": "locatel",
        "name": "Locatel 0311 — Reportes ciudadanos",
        "category": "seguridad",
        "access_mode": "ckan_resource",
        "supports_manual_upload": True,
        "endpoint": "https://datos.cdmx.gob.mx/api/3/action/datastore_search",
        "credentials_keys": ["resource_id"],
        "credentials_env": {"resource_id": "IE_LOCATEL_RESOURCE_ID"},
        "description": "Urgencias ciudadanas — alimenta IE_COL_LOCATEL y IE_COL_TRUST_VECINDARIO.",
    },

    # ─── keyless_url (3) ─────────────────────────────────────────────────────
    {
        "id": "osm_overpass",
        "name": "OpenStreetMap Overpass",
        "category": "geo",
        "access_mode": "keyless_url",
        "supports_manual_upload": True,
        "endpoint": "https://overpass-api.de/api/interpreter",
        "credentials_keys": [],
        "credentials_env": {"endpoint": "IE_OSM_OVERPASS_URL"},
        "description": "POIs + polígonos — IE_COL_CULTURAL_PARQUES + vialidades.",
    },
    {
        "id": "conagua_smn",
        "name": "CONAGUA — SMN",
        "category": "clima",
        "access_mode": "keyless_url",
        "supports_manual_upload": True,
        "endpoint": "https://smn.conagua.gob.mx/tools/GUI/webservices/",
        "credentials_keys": [],
        "credentials_env": {"endpoint": "IE_CONAGUA_SMN_URL"},
        "description": "Servicio Meteorológico Nacional — IE_COL_CLIMA_ISLA_CALOR + temperatura anómala.",
    },
    {
        "id": "gtfs_cdmx",
        "name": "GTFS CDMX — Transporte",
        "category": "transporte",
        "access_mode": "keyless_url",
        "supports_manual_upload": True,
        "endpoint": None,
        "credentials_keys": [],
        "credentials_env": {"endpoint": "IE_GTFS_CDMX_URL"},
        "description": "Feeds GTFS Metro/Metrobús/EcoBici — IE_COL_CONECTIVIDAD_TRANSPORTE.",
    },

    # ─── wms_wfs (1) ─────────────────────────────────────────────────────────
    {
        "id": "cenapred",
        "name": "CENAPRED — Atlas Nacional de Riesgos",
        "category": "seguridad",
        "access_mode": "wms_wfs",
        "supports_manual_upload": True,
        "endpoint": None,
        "credentials_keys": ["wfs_url"],
        "credentials_env": {"wfs_url": "IE_CENAPRED_WFS_URL"},
        "description": "WFS Atlas Riesgos — IE_COL_CLIMA_INUNDACION + IE_COL_CLIMA_SISMO.",
    },

    # ─── manual_upload (4) ───────────────────────────────────────────────────
    {
        "id": "inegi_shapefiles",
        "name": "INEGI Shapefiles (manzanas / AGEB)",
        "category": "geo",
        "access_mode": "manual_upload",
        "supports_manual_upload": True,
        "endpoint": None,
        "credentials_keys": [],
        "credentials_env": {},
        "description": "Shapefiles de manzana y AGEB — descarga manual; alimenta granularidad geográfica.",
    },
    {
        "id": "catastro_cdmx",
        "name": "Catastro CDMX — Predios",
        "category": "geo",
        "access_mode": "manual_upload",
        "supports_manual_upload": True,
        "endpoint": None,
        "credentials_keys": [],
        "credentials_env": {},
        "description": "Visor catastral sin API REST — descarga manual de shapefiles.",
    },
    {
        "id": "dgis",
        "name": "DGIS — Hospitales y clínicas",
        "category": "salud",
        "access_mode": "manual_upload",
        "supports_manual_upload": True,
        "endpoint": None,
        "credentials_keys": [],
        "credentials_env": {},
        "description": "Dataset salud federal sin API pública — alimenta IE_COL_SALUD.",
    },
    {
        "id": "atlas_riesgos_cdmx",
        "name": "Atlas Riesgos CDMX (visor JS)",
        "category": "seguridad",
        "access_mode": "manual_upload",
        "supports_manual_upload": True,
        "endpoint": "https://geoinformacionpublica.cdmx.gob.mx",
        "credentials_keys": [],
        "credentials_env": {},
        "description": "Visor JS sin API estable — descarga manual de capas geosísmicas.",
    },

    # ─── external_paid (1) ───────────────────────────────────────────────────
    {
        "id": "mapbox",
        "name": "Mapbox",
        "category": "geo",
        "access_mode": "external_paid",
        "supports_manual_upload": False,
        "endpoint": "https://api.mapbox.com",
        "credentials_keys": ["token"],
        "credentials_env": {"token": "MAPBOX_TOKEN"},
        "description": "Tiles + heatmaps + geocoding — token compartido con frontend.",
    },

    # ─── h2 (1) ──────────────────────────────────────────────────────────────
    {
        "id": "reelly",
        "name": "Reelly — Inventario Dubai",
        "category": "geo",
        "access_mode": "api_key",
        "supports_manual_upload": False,
        "endpoint": "https://api.reelly.io/v1",
        "credentials_keys": ["api_key"],
        "credentials_env": {"api_key": "IE_REELLY_API_KEY"},
        "description": "H2 — inventario Dubai. Activado solo cuando se contrate.",
        "force_status": "h2",
    },
]


def initial_status_for(source: Dict[str, Any], env_lookup) -> str:
    """Decide a sensible default status when the source row is first inserted."""
    if source.get("force_status"):
        return source["force_status"]
    mode = source["access_mode"]
    if mode == "manual_upload":
        return "manual_only"
    if mode == "keyless_url":
        return "active"
    if mode == "external_paid":
        env_key = list(source.get("credentials_env", {}).values())[0] if source.get("credentials_env") else None
        return "active" if (env_key and env_lookup(env_key)) else "blocked"
    if mode == "wms_wfs":
        env_key = list(source.get("credentials_env", {}).values())[0] if source.get("credentials_env") else None
        return "active" if (env_key and env_lookup(env_key)) else "stub"
    # api_key / ckan_resource → blocked si falta cualquier env mapeado, sino stub
    env_map = source.get("credentials_env", {})
    if not env_map:
        return "stub"
    have_all = all(env_lookup(v) for v in env_map.values())
    return "active" if have_all else "blocked"
