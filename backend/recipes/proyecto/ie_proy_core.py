"""
IE_PROY_* — 12 project-level recipes (Phase B3).

Scope:
  - zone_id = development.id (ej. 'altavista-polanco')
  - Datos: DMX-internal (developments + colonia ie_scores), sin ie_raw_observations.
  - Pure: si faltan inputs → is_stub=True. NUNCA inventa números.

Los 12 recipes están distribuidos en 4 secciones:
  1. Comparativa colonia / ciudad / mercado   (3)
  2. Producto / listing / amenidades          (3)
  3. Absorción / preventa                     (2)
  4. Developer trust / delivery / competencia (4)
"""
from __future__ import annotations

import math
from typing import Any, Dict, List, Optional

from score_engine import register
from recipes.proyecto._helpers import ProjectRecipe


# ─── 1. Comparativa colonia / ciudad / mercado ───────────────────────────────
@register
class IEProyScoreVsColonia(ProjectRecipe):
    code = "IE_PROY_SCORE_VS_COLONIA"
    version = "1.0"
    tier_logic = "higher_better"
    description = "Promedio de scores IE reales de la colonia donde se ubica el proyecto."

    def apply_proj(self, dev, ctx):
        # tier_logic no está en el doc; fallback: promedio simple de todos los valores
        if not ctx["colonia_scores"]:
            return None
        all_vals = [s.get("value") for s in ctx["colonia_scores"] if s.get("value") is not None]
        if not all_vals:
            return None
        return sum(all_vals) / len(all_vals)

    def explanation_proj(self, dev, ctx, value):
        n = len(ctx["colonia_scores"])
        return [
            f"Colonia base: {dev.get('colonia')} ({dev.get('colonia_id')})",
            f"Scores IE reales computados para la colonia: {n}",
            f"Promedio simple (0-100) = {value}",
        ]


@register
class IEProyScoreVsCiudad(ProjectRecipe):
    code = "IE_PROY_SCORE_VS_CIUDAD"
    version = "1.0"
    tier_logic = "higher_better"
    description = "Score del proyecto (avg colonia scores) vs promedio CDMX."

    def apply_proj(self, dev, ctx):
        colonia_vals = [s.get("value") for s in ctx["colonia_scores"] if s.get("value") is not None]
        if not colonia_vals:
            return None
        local = sum(colonia_vals) / len(colonia_vals)
        # Proxy ciudad: necesitamos scores globales. Al no tener snapshot ciudad aún,
        # la fórmula v1.0 publica directamente `local` como proxy (tier_logic higher_better).
        # v1.1 sustituirá por promedio real de todas las colonias cuando haya cobertura.
        return local

    def explanation_proj(self, dev, ctx, value):
        n = len(ctx["colonia_scores"])
        return [
            f"v1.0 — proxy directo (local {n} scores). Pendiente benchmark ciudad (v1.1).",
            f"Score reportado = {value}",
        ]


@register
class IEProyPrecioVsMercado(ProjectRecipe):
    code = "IE_PROY_PRECIO_VS_MERCADO"
    version = "1.0"
    tier_logic = "custom"  # custom: valor alto=caro, valor bajo=barato; 50 = en mercado
    description = "% por encima (>50) o por debajo (<50) del precio m² mediano de la colonia."

    def apply_proj(self, dev, ctx):
        # Precio m² del dev: mediana de sus unidades
        units = dev.get("units") or []
        if not units:
            return None
        prices_per_m2 = [u["price"] / u["m2_privative"] for u in units
                         if u.get("m2_privative") and u.get("price")]
        if not prices_per_m2:
            return None
        dev_median = sorted(prices_per_m2)[len(prices_per_m2) // 2]

        # Mercado: mediana de los mismos cálculos en devs de la misma colonia
        comp_prices: List[float] = []
        for d in ctx["same_colonia_devs"]:
            for u in (d.get("units") or []):
                if u.get("m2_privative") and u.get("price"):
                    comp_prices.append(u["price"] / u["m2_privative"])
        if not comp_prices:
            return None
        market_median = sorted(comp_prices)[len(comp_prices) // 2]

        # Ratio → centrado en 50. 1.0 (mismo precio) = 50. 1.2 = 60, 0.8 = 40.
        ratio = dev_median / market_median
        score = 50.0 + (ratio - 1.0) * 50.0
        return max(0.0, min(100.0, score))

    def _tier_for(self, value):
        # Custom tier: rango 40-60 = green ("en mercado"), 30-40 o 60-75 = amber, resto = red
        if value is None:
            return "unknown"
        if 40 <= value <= 60:
            return "green"
        if 30 <= value < 40 or 60 < value <= 75:
            return "amber"
        return "red"

    def explanation_proj(self, dev, ctx, value):
        n = len(ctx["same_colonia_devs"])
        return [
            f"Mediana precio/m² del proyecto vs mediana de {n} competidores en {dev.get('colonia')}",
            "Ratio normalizado a 0-100 centrado en 50 (50 = en mercado)",
            f"Score = {value} → {'en mercado' if 40 <= (value or 0) <= 60 else 'fuera de rango'}",
        ]


# ─── 2. Producto / listing / amenidades ──────────────────────────────────────
_AMENITY_WEIGHTS = {
    "alberca": 10, "spa": 12, "cava": 8, "sky_lounge": 10, "roof": 6,
    "gym": 8, "concierge": 9, "seguridad": 6, "salon_eventos": 5,
    "business_center": 4, "coworking": 5, "pet_friendly": 3,
    "bbq": 3, "jardin": 4, "kids_club": 5, "cine": 6, "elevator": 2,
}


@register
class IEProyAmenidades(ProjectRecipe):
    code = "IE_PROY_AMENIDADES"
    version = "1.0"
    tier_logic = "higher_better"
    description = "Suma ponderada de amenidades del proyecto (alberca+spa+concierge = alto)."

    def apply_proj(self, dev, ctx):
        amens = dev.get("amenities") or []
        if not amens:
            return None
        score = sum(_AMENITY_WEIGHTS.get(a, 2) for a in amens)
        # Normalizar: 60 pts de amenidades = 100. Cap 0-100.
        return min(100.0, (score / 60.0) * 100.0)

    def explanation_proj(self, dev, ctx, value):
        amens = dev.get("amenities") or []
        tally = {a: _AMENITY_WEIGHTS.get(a, 2) for a in amens}
        return [
            f"Amenidades ({len(amens)}): " + ", ".join(amens[:8]),
            f"Puntos ponderados: {sum(tally.values())}",
            f"Normalizado vs benchmark 60 pts = {value}",
        ]


@register
class IEProyListingHealth(ProjectRecipe):
    code = "IE_PROY_LISTING_HEALTH"
    version = "1.0"
    tier_logic = "higher_better"
    description = "Calidad del listing: fotos + descripción + tipologías + precio visible."

    def apply_proj(self, dev, ctx):
        photos = len(dev.get("photos") or [])
        desc_len = len(dev.get("description") or "")
        protos = len(dev.get("units") or [])
        has_price = 1 if dev.get("price_from") and dev.get("price_to") else 0
        has_progress = 1 if dev.get("construction_progress") else 0

        photo_pts = min(30, photos * 3)           # 10 fotos = 30
        desc_pts = min(25, desc_len // 20)        # 500 chars = 25
        proto_pts = min(25, protos * 5)           # 5 tipologías = 25
        meta_pts = (has_price + has_progress) * 10  # 20 max
        return photo_pts + desc_pts + proto_pts + meta_pts

    def explanation_proj(self, dev, ctx, value):
        return [
            f"Fotos: {len(dev.get('photos') or [])} × 3 (cap 30)",
            f"Descripción: {len(dev.get('description') or '')} chars ÷ 20 (cap 25)",
            f"Unidades: {len(dev.get('units') or [])} × 5 (cap 25)",
            "Meta: price_from/to + progreso → +20 si ambos",
            f"Total = {value}",
        ]


@register
class IEProyBadgeTop(ProjectRecipe):
    code = "IE_PROY_BADGE_TOP"
    version = "1.0"
    tier_logic = "higher_better"
    description = "Badge 'Top IE Score colonia': proyecto en top 20% de su colonia."

    def apply_proj(self, dev, ctx):
        # Signal: combine amenities weight + listing health + absorption rate for comparability
        peers = ctx["same_colonia_devs"] + [dev]
        if len(peers) < 2:
            return None

        def _signal(d):
            amens = len(d.get("amenities") or [])
            units = d.get("units") or []
            sold = sum(1 for u in units if u.get("status") == "vendido")
            absorb = (sold / len(units) * 100) if units else 0
            return amens * 4 + absorb

        signals = sorted([_signal(d) for d in peers], reverse=True)
        my_signal = _signal(dev)
        rank = signals.index(my_signal) + 1
        pct = (rank / len(signals)) * 100  # lower rank% = mejor
        return max(0.0, 100.0 - pct)       # top 1/10 = 90, top 20% = 80, etc.

    def explanation_proj(self, dev, ctx, value):
        return [
            "Señal combinada: amenidades × 4 + % absorción",
            f"Ranking dentro de {len(ctx['same_colonia_devs']) + 1} peers en la colonia",
            f"Score = 100 − ranking% → {value} (más alto = mejor badge)",
        ]


# ─── 3. Absorción / preventa ─────────────────────────────────────────────────
@register
class IEProyAbsorcionVelocidad(ProjectRecipe):
    code = "IE_PROY_ABSORCION_VELOCIDAD"
    version = "1.0"
    tier_logic = "higher_better"
    description = "% de unidades vendidas + reservadas sobre total del proyecto."

    def apply_proj(self, dev, ctx):
        units = dev.get("units") or []
        if not units:
            return None
        absorbed = sum(1 for u in units if u.get("status") in ("vendido", "reservado"))
        return (absorbed / len(units)) * 100

    def explanation_proj(self, dev, ctx, value):
        units = dev.get("units") or []
        sold = sum(1 for u in units if u.get("status") == "vendido")
        reserved = sum(1 for u in units if u.get("status") == "reservado")
        return [
            f"Unidades: total={len(units)}, vendidas={sold}, reservadas={reserved}",
            "Tasa absorción = (vendidas+reservadas)/total × 100",
            f"Score = {value}%",
        ]


@register
class IEProyPresalesRatio(ProjectRecipe):
    code = "IE_PROY_PRESALES_RATIO"
    version = "1.0"
    tier_logic = "higher_better"
    description = "Preventa: % unidades no-disponibles (reservadas/vendidas) en proyectos en preventa/construcción."

    def apply_proj(self, dev, ctx):
        stage = dev.get("stage")
        if stage not in ("preventa", "en_construccion"):
            # Entrega inmediata y exclusiva no aplican a preventa
            return None
        units = dev.get("units") or []
        if not units:
            return None
        committed = sum(1 for u in units if u.get("status") in ("vendido", "reservado"))
        return (committed / len(units)) * 100

    def explanation_proj(self, dev, ctx, value):
        return [
            f"Stage actual: {dev.get('stage')}",
            "% comprometido (vendido + reservado) del total",
            f"Score = {value}",
        ]


# ─── 4. Developer trust / delivery / competencia ─────────────────────────────
def _developer(dev, ctx_or_none):
    try:
        from data_developments import DEVELOPERS_BY_ID
        return DEVELOPERS_BY_ID.get(dev.get("developer_id"))
    except ImportError:
        return None


@register
class IEProyMarcaTrust(ProjectRecipe):
    code = "IE_PROY_MARCA_TRUST"
    version = "1.0"
    tier_logic = "higher_better"
    description = "Trust de la marca developer: años + proyectos entregados + compliance checks."

    def apply_proj(self, dev, ctx):
        developer = _developer(dev, ctx)
        if not developer:
            return None
        years = developer.get("years_experience", 0)
        delivered = developer.get("projects_delivered", 0)
        compliance = sum([
            10 if developer.get("verified_constitution") else 0,
            8 if developer.get("no_judicial_records") else 0,
            7 if developer.get("no_profeco_complaints") else 0,
        ])
        # años: max 30 pts (@ 20 años)
        years_pts = min(30.0, years * 1.5)
        # proyectos entregados: max 45 pts (@ 15 proyectos)
        delivered_pts = min(45.0, delivered * 3)
        return years_pts + delivered_pts + compliance

    def explanation_proj(self, dev, ctx, value):
        developer = _developer(dev, ctx)
        if not developer:
            return ["Developer no registrado."]
        return [
            f"Developer: {developer.get('name')} ({developer.get('founded_year')})",
            f"Experiencia: {developer.get('years_experience')} años × 1.5 (cap 30)",
            f"Proyectos entregados: {developer.get('projects_delivered')} × 3 (cap 45)",
            "Compliance (constitución/judicial/profeco): +25 max",
            f"Total = {value}",
        ]


@register
class IEProyDeveloperTrust(ProjectRecipe):
    code = "IE_PROY_DEVELOPER_TRUST"
    version = "1.0"
    tier_logic = "higher_better"
    description = "Trust developer por track record (unidades vendidas × proyectos entregados)."

    def apply_proj(self, dev, ctx):
        developer = _developer(dev, ctx)
        if not developer:
            return None
        units_sold = developer.get("units_sold", 0)
        delivered = developer.get("projects_delivered", 0)
        if delivered == 0:
            return None
        avg_per_project = units_sold / delivered
        # 80 unidades/proyecto promedio = 100 pts
        return min(100.0, (avg_per_project / 80.0) * 100.0)

    def explanation_proj(self, dev, ctx, value):
        developer = _developer(dev, ctx)
        if not developer:
            return ["Developer no registrado."]
        delivered = developer.get("projects_delivered", 0)
        units_sold = developer.get("units_sold", 0)
        avg = units_sold / delivered if delivered else 0
        return [
            f"Unidades vendidas totales: {units_sold}",
            f"Proyectos entregados: {delivered}",
            f"Promedio por proyecto: {avg:.1f}",
            f"Normalizado vs 80 unidades/proyecto benchmark → {value}",
        ]


@register
class IEProyDeveloperDeliveryHist(ProjectRecipe):
    code = "IE_PROY_DEVELOPER_DELIVERY_HIST"
    version = "1.0"
    tier_logic = "higher_better"
    description = "Histórico delivery: track record del developer (proyectos entregados)."

    def apply_proj(self, dev, ctx):
        developer = _developer(dev, ctx)
        if not developer:
            return None
        delivered = developer.get("projects_delivered", 0)
        # Logarítmica suave: 1 proy=30, 5 proy=60, 10 proy=75, 20 proy=90
        if delivered == 0:
            return 0.0
        return min(100.0, 30.0 + math.log2(delivered + 1) * 15.0)

    def explanation_proj(self, dev, ctx, value):
        developer = _developer(dev, ctx)
        delivered = (developer or {}).get("projects_delivered", 0)
        return [
            f"Proyectos entregados: {delivered}",
            "Fórmula log: 30 + log2(n+1) × 15",
            f"Score = {value}",
        ]


@register
class IEProyCompetitionPressure(ProjectRecipe):
    code = "IE_PROY_COMPETITION_PRESSURE"
    version = "1.0"
    tier_logic = "lower_better"
    description = "Presión competitiva: # desarrollos nuevos en la misma colonia."

    def apply_proj(self, dev, ctx):
        n_comp = len(ctx["same_colonia_devs"])
        if n_comp == 0:
            return None  # sin peers reales → stub, NO inventamos "sin presión"
        # lower-better: 1 peer=20, 3 peers=60, 5+=100
        return min(100.0, n_comp * 20.0)

    def explanation_proj(self, dev, ctx, value):
        peers = ctx["same_colonia_devs"]
        return [
            f"Competidores activos en {dev.get('colonia')}: {len(peers)}",
            f"Score = min(100, n × 20). Lower-better → {value}",
            "Peers: " + ", ".join(p.get("name", "?") for p in peers[:5]) if peers else "Sin competidores",
        ]
