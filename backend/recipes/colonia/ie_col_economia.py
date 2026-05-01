"""
IE_COL_* — Economía, ROI, Conectividad, Cultura, Uso de Suelo, Trust.
Bulk registry of the 20 remaining recipes — most DataPending until B2 iteration 2.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from score_engine import register
from recipes.colonia._helpers import SimpleHeuristicRecipe, DataPendingRecipe


# ─── Economía / precios (5) ──────────────────────────────────────────────────
@register
class IEColPrecio(DataPendingRecipe):
    code = "IE_COL_PRECIO"
    version = "0.1"
    dependencies = []
    tier_logic = "custom"
    description = "Precio por m² mediano (venta) por colonia."
    reason = "Phase B2: pendiente ingest Lamudi/Inmuebles24 scraper"


@register
class IEColPlusvaliaHist(SimpleHeuristicRecipe):
    """Heurística temporal sobre series Banxico SF43718/SF43936."""
    code = "IE_COL_PLUSVALIA_HIST"
    version = "1.0"
    dependencies = ["banxico"]
    tier_logic = "higher_better"
    description = "Plusvalía histórica: tendencia precios reales ajustada por inflación + tasa."
    payload_extractors = {"banxico": lambda p: p.get("valor")}
    min_observations = 2

    def apply(self, values_by_source):
        vals = [float(v) for v in (values_by_source.get("banxico") or []) if v is not None]
        if len(vals) < 2:
            return None
        # Proxy: variación % de la serie más reciente → proxy de estabilidad macro
        recent = vals[:3]
        pct = abs(max(recent) - min(recent)) / (sum(recent) / len(recent) + 1e-6) * 100
        return max(0.0, 80.0 - pct * 2)

    def explanation(self, values_by_source, value):
        n = len(values_by_source.get("banxico") or [])
        return [f"Series Banxico observadas: {n}",
                f"Variación % últimas 3 obs como proxy estabilidad",
                f"Score {value}"]


@register
class IEColLiquidez(DataPendingRecipe):
    code = "IE_COL_LIQUIDEZ"
    version = "0.1"
    dependencies = []
    tier_logic = "higher_better"
    description = "Liquidez: tiempo promedio en mercado + volumen de transacciones."
    reason = "Phase B2: requiere ingest MLS/Lamudi listings"


@register
class IEColDemandaNeta(DataPendingRecipe):
    code = "IE_COL_DEMANDA_NETA"
    version = "0.1"
    dependencies = []
    tier_logic = "higher_better"
    description = "Búsquedas/mes ÷ inventario activo (presión de demanda)."
    reason = "Phase B2: pendiente telemetría /marketplace búsquedas"


@register
class IEColDesarrollosActivos(DataPendingRecipe):
    code = "IE_COL_DESARROLLOS_ACTIVOS"
    version = "0.1"
    dependencies = []
    tier_logic = "higher_better"
    description = "Desarrollos nuevos activos en la colonia (permisos SEDUVI)."
    reason = "Phase B2: pendiente ingest SEDUVI via datos.cdmx"


# ─── ROI (3) ─────────────────────────────────────────────────────────────────
@register
class IEColRoiRentaTradicional(DataPendingRecipe):
    code = "IE_COL_ROI_RENTA_TRADICIONAL"
    version = "0.1"
    dependencies = ["airroi"]
    tier_logic = "higher_better"
    description = "ROI renta tradicional: renta mensual / precio m² × 12."
    reason = "Phase B2: pendiente comparables renta"


@register
class IEColRoiAirbnb(SimpleHeuristicRecipe):
    code = "IE_COL_ROI_AIRBNB"
    version = "1.0"
    dependencies = ["airroi"]
    tier_logic = "higher_better"
    description = "ROI Airbnb: revenue anualizado / precio compra (AirROI markets/summary)."
    is_paid = True
    payload_extractors = {"airroi": lambda p: p.get("revenue") or p.get("average_revenue")}
    min_observations = 1

    def apply(self, values_by_source):
        rev = values_by_source.get("airroi") or []
        if not rev:
            return None
        # AirROI revenue viene en USD anual. Proxy ROI vs comprar m² @ $3500 USD/m² (CDMX premium)
        avg_rev = sum(rev) / len(rev)
        roi_pct = (avg_rev / (3500 * 80)) * 100  # 80 m² unidad de referencia
        return min(100.0, roi_pct * 10)

    def explanation(self, values_by_source, value):
        rev = values_by_source.get("airroi") or []
        return [f"AirROI revenue muestras: {len(rev)}",
                f"Revenue anual × 10 vs comp 80m² @ $3500/m² USD",
                f"Score {value}"]


@register
class IEColRoiAirbnbOcupacion(SimpleHeuristicRecipe):
    code = "IE_COL_ROI_AIRBNB_OCUPACION"
    version = "1.0"
    dependencies = ["airroi"]
    tier_logic = "higher_better"
    description = "Ocupación Airbnb: % noches reservadas (12m)."
    is_paid = True
    payload_extractors = {"airroi": lambda p: p.get("occupancy") or p.get("occupancy_rate")}
    min_observations = 1

    def apply(self, values_by_source):
        occ = values_by_source.get("airroi") or []
        if not occ:
            return None
        # AirROI devuelve decimal 0-1
        return (sum(occ) / len(occ)) * 100

    def explanation(self, values_by_source, value):
        occ = values_by_source.get("airroi") or []
        return [f"AirROI occupancy samples: {len(occ)}",
                f"Ocupación media × 100 = {value}"]


# ─── Conectividad (3) ────────────────────────────────────────────────────────
@register
class IEColConectividadTransporte(DataPendingRecipe):
    code = "IE_COL_CONECTIVIDAD_TRANSPORTE"
    version = "0.1"
    dependencies = ["gtfs_cdmx"]
    tier_logic = "higher_better"
    description = "Cobertura Metro/Metrobús/EcoBici a <500m + frecuencia."
    reason = "Phase B2: pendiente GTFS feed URL"


@register
class IEColConectividadFibra(DataPendingRecipe):
    code = "IE_COL_CONECTIVIDAD_FIBRA"
    version = "0.1"
    dependencies = ["datos_cdmx"]
    tier_logic = "higher_better"
    description = "Cobertura fibra óptica residencial (Telmex/Totalplay/Megacable)."
    reason = "Phase B2: pendiente dataset telecom"


@register
class IEColConectividadVialidad(SimpleHeuristicRecipe):
    code = "IE_COL_CONECTIVIDAD_VIALIDAD"
    version = "1.0"
    dependencies = ["osm_overpass"]
    tier_logic = "higher_better"
    description = "Red vial OSM: densidad de vialidades + conexión a circuitos principales."
    payload_extractors = {"osm_overpass": lambda p: 1.0}  # counts features
    min_observations = 1

    def apply(self, values_by_source):
        osm = values_by_source.get("osm_overpass") or []
        n = len(osm)
        if n == 0:
            return None
        # Bbox query retorna 5 por default → normalizar a 100 si ≥20 nodes
        return min(100.0, 40.0 + n * 3)

    def explanation(self, values_by_source, value):
        return [f"OSM nodes observados: {len(values_by_source.get('osm_overpass') or [])}",
                f"Densidad normalizada a 0-100 → {value}"]


# ─── Cultura (3) ─────────────────────────────────────────────────────────────
@register
class IEColCulturalParques(SimpleHeuristicRecipe):
    code = "IE_COL_CULTURAL_PARQUES"
    version = "1.0"
    dependencies = ["osm_overpass"]
    tier_logic = "higher_better"
    description = "Área verde por habitante (OSM parques + leisure=park)."
    payload_extractors = {"osm_overpass": lambda p: 1.0}
    min_observations = 1

    def apply(self, values_by_source):
        n = len(values_by_source.get("osm_overpass") or [])
        if n == 0:
            return None
        return min(100.0, 35.0 + n * 5)

    def explanation(self, values_by_source, value):
        return [f"Nodes OSM (parques): {len(values_by_source.get('osm_overpass') or [])}",
                f"Score: 35 + n×5 → {value}"]


@register
class IEColCulturalVidaNocturna(DataPendingRecipe):
    code = "IE_COL_CULTURAL_VIDA_NOCTURNA"
    version = "0.1"
    dependencies = ["osm_overpass", "datos_cdmx"]
    tier_logic = "higher_better"
    description = "Densidad de bares/restaurantes abiertos >10pm."
    reason = "Phase B2: query OSM específica por horario"


@register
class IEColCulturalMuseos(DataPendingRecipe):
    code = "IE_COL_CULTURAL_MUSEOS"
    version = "0.1"
    dependencies = ["osm_overpass"]
    tier_logic = "higher_better"
    description = "Densidad de museos/galerías + visitantes anuales."
    reason = "Phase B2: query OSM tourism=museum"


# ─── Uso de suelo + Trust (5) ────────────────────────────────────────────────
@register
class IEColUsoSueloHabitacional(DataPendingRecipe):
    code = "IE_COL_USO_SUELO_HABITACIONAL"
    version = "0.1"
    dependencies = ["datos_cdmx"]
    tier_logic = "higher_better"
    description = "% uso de suelo habitacional (SEDUVI)."
    reason = "Phase B2: pendiente dataset SEDUVI uso suelo"


@register
class IEColUsoSueloMixto(DataPendingRecipe):
    code = "IE_COL_USO_SUELO_MIXTO"
    version = "0.1"
    dependencies = ["datos_cdmx"]
    tier_logic = "higher_better"
    description = "% uso de suelo mixto (habitacional + comercial)."
    reason = "Phase B2: pendiente dataset SEDUVI"


@register
class IEColGhostZone(DataPendingRecipe):
    code = "IE_COL_GHOST_ZONE"
    version = "0.1"
    dependencies = ["datos_cdmx", "osm_overpass"]
    tier_logic = "lower_better"
    description = "Ghost zones: colonias con alta densidad construida + baja actividad comercial."
    reason = "Phase B2: requiere cruce construcciones × DENUE activos"


@register
class IEColPMFGap(DataPendingRecipe):
    code = "IE_COL_PMF_GAP"
    version = "0.1"
    dependencies = []
    tier_logic = "lower_better"
    description = "Gap product-market-fit: demanda observada vs. oferta activa."
    reason = "Phase B2: depende de IE_COL_DEMANDA_NETA + IE_COL_PRECIO"


@register
class IEColTrustVecindario(SimpleHeuristicRecipe):
    code = "IE_COL_TRUST_VECINDARIO"
    version = "1.0"
    dependencies = ["locatel", "fgj_cdmx"]
    tier_logic = "higher_better"
    description = "Índice trust: inverso de reportes negativos Locatel + FGJ."
    payload_extractors = {"locatel": lambda p: 1.0, "fgj_cdmx": lambda p: 1.0}
    min_observations = 1

    def apply(self, values_by_source):
        l = len(values_by_source.get("locatel") or [])
        f = len(values_by_source.get("fgj_cdmx") or [])
        total = l + f
        if total == 0:
            return 70.0  # sin incidentes reportados = trust alto
        import math
        return max(0.0, 90.0 - math.log10(total + 1) * 18)

    def explanation(self, values_by_source, value):
        l = len(values_by_source.get("locatel") or [])
        f = len(values_by_source.get("fgj_cdmx") or [])
        return [f"Locatel: {l}, FGJ: {f}",
                f"Trust = 90 − log10(total+1) × 18 = {value}"]
