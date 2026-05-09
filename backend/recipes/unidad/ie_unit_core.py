"""IE_UNIT_* — 4 unit-level recipes (W3.1B-3).

Scope:
  - zone_id = unit.id (ej. 'altavista-polanco-02A')
  - Datos: DMX-internal (unit + dev + peers same prototype + peers dev).
  - Pure: si faltan inputs → is_stub=True. NUNCA inventa números.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from score_engine import register
from recipes.unidad._helpers import UnitRecipe


@register
class IEUnitPrecioVsPrototype(UnitRecipe):
    code = "IE_UNIT_PRECIO_VS_PROTOTYPE"
    version = "1.0"
    tier_logic = "lower_better"
    description = "Precio del unit vs avg same-prototype peers. Lower = más accesible."

    def apply_unit(self, unit, ctx):
        precio = unit.get("price")
        if precio is None:
            return None
        peers_prices = [p.get("price") for p in ctx["same_proto"] if p.get("price")]
        if len(peers_prices) < 2:
            return None
        avg = sum(peers_prices) / len(peers_prices)
        if avg <= 0:
            return None
        ratio = precio / avg
        return max(0.0, min(100.0, 100.0 - (ratio - 1.0) * 100.0))

    def explanation_unit(self, unit, ctx, value):
        peers_prices = [p.get("price") for p in ctx["same_proto"] if p.get("price")]
        avg = (sum(peers_prices) / len(peers_prices)) if peers_prices else 0.0
        precio = unit.get("price") or 0
        ratio = (precio / avg) if avg > 0 else 0.0
        return [
            f"Prototype: {unit.get('prototype')}",
            f"Precio unit: {precio:,.0f} MXN",
            f"Avg same-proto peers ({len(peers_prices)}): {avg:,.0f} MXN",
            f"Ratio: {ratio:.2f}x",
            f"Score: {value:.0f}" if value is not None else "Score: n/a",
        ]


@register
class IEUnitNivelPremium(UnitRecipe):
    code = "IE_UNIT_NIVEL_PREMIUM"
    version = "1.0"
    tier_logic = "higher_better"
    description = "Nivel del unit en banda óptima (CDMX: alto = vista + premium)."

    def apply_unit(self, unit, ctx):
        level = unit.get("level")
        if not isinstance(level, int):
            return None
        peers_levels = [p.get("level") for p in ctx["dev_peers"] if isinstance(p.get("level"), int)]
        if len(peers_levels) < 2:
            return None
        max_level = max(peers_levels + [level])
        if max_level <= 0:
            return None
        return (level / max_level) * 100.0

    def explanation_unit(self, unit, ctx, value):
        level = unit.get("level")
        peers_levels = [p.get("level") for p in ctx["dev_peers"] if isinstance(p.get("level"), int)]
        max_level = max(peers_levels + ([level] if isinstance(level, int) else [])) if peers_levels else 0
        return [
            f"Nivel del unit: {level}",
            f"Nivel máximo en el dev: {max_level}",
            f"Score (% del máximo): {value:.0f}" if value is not None else "Score: n/a",
        ]


@register
class IEUnitParkingFit(UnitRecipe):
    code = "IE_UNIT_PARKING_FIT"
    version = "1.0"
    tier_logic = "higher_better"
    description = "Parking spots vs avg dev (CDMX: más parking = mayor demanda)."

    def apply_unit(self, unit, ctx):
        parking = unit.get("parking_spots")
        if parking is None:
            return None
        peers = [p.get("parking_spots") for p in ctx["dev_peers"] if isinstance(p.get("parking_spots"), int)]
        if len(peers) < 2:
            return None
        avg = sum(peers) / len(peers)
        if avg <= 0:
            return None
        ratio = parking / avg
        return max(0.0, min(100.0, 50.0 + (ratio - 1.0) * 50.0))

    def explanation_unit(self, unit, ctx, value):
        parking = unit.get("parking_spots")
        peers = [p.get("parking_spots") for p in ctx["dev_peers"] if isinstance(p.get("parking_spots"), int)]
        avg = (sum(peers) / len(peers)) if peers else 0.0
        ratio = (parking / avg) if avg > 0 and parking is not None else 0.0
        return [
            f"Parking spots: {parking}",
            f"Avg dev ({len(peers)} peers): {avg:.2f}",
            f"Ratio: {ratio:.2f}x",
            f"Score: {value:.0f}" if value is not None else "Score: n/a",
        ]


_ORIENTACION_SCORE = {
    "Norte": 100.0,
    "Sur": 85.0,
    "Oriente": 70.0,
    "Poniente": 55.0,
}


@register
class IEUnitOrientacionPremium(UnitRecipe):
    code = "IE_UNIT_ORIENTACION_PREMIUM"
    version = "1.0"
    tier_logic = "band"
    description = "Orientación CDMX: Norte=100 (premium), Sur=85, Oriente=70, Poniente=55, otro=50."

    def apply_unit(self, unit, ctx):
        ori = (unit.get("orientation") or "").strip()
        if not ori:
            return None
        return _ORIENTACION_SCORE.get(ori, 50.0)

    def explanation_unit(self, unit, ctx, value):
        ori = (unit.get("orientation") or "").strip() or "n/a"
        v = value if value is not None else 0.0
        return [
            f"Orientación: {ori}",
            f"Score: {v:.0f} (Norte máximo, Poniente mínimo)",
        ]


@register
class IEUnitM2Value(UnitRecipe):
    code = "IE_UNIT_M2_VALUE"
    version = "1.0"
    tier_logic = "lower_better"
    description = "Precio/m² del unit vs avg dev. Lower = mejor valor."

    def apply_unit(self, unit, ctx):
        precio = unit.get("price")
        m2 = unit.get("m2_privative")
        if not precio or not m2 or m2 <= 0:
            return None
        unit_pm2 = precio / m2
        peers_pm2 = []
        for p in ctx["dev_peers"]:
            pp = p.get("price")
            pm = p.get("m2_privative")
            if pp and pm and pm > 0:
                peers_pm2.append(pp / pm)
        if len(peers_pm2) < 2:
            return None
        avg_pm2 = sum(peers_pm2) / len(peers_pm2)
        if avg_pm2 <= 0:
            return None
        ratio = unit_pm2 / avg_pm2
        return max(0.0, min(100.0, 100.0 - (ratio - 1.0) * 100.0))

    def explanation_unit(self, unit, ctx, value):
        precio = unit.get("price") or 0
        m2 = unit.get("m2_privative") or 0
        unit_pm2 = (precio / m2) if m2 > 0 else 0
        return [
            f"Precio/m² unit: {unit_pm2:,.0f} MXN",
            "Score 0-100 (más alto = más accesible vs edificio)",
        ]
