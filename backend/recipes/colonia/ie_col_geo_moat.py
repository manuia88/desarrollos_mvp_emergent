"""
IE_COL_N01/N02/N04/N05/N06/N07/N08/N09/N10 — el "moat" geoespacial por colonia.
═══════════════════════════════════════════════════════════════════════════════
Marco de scores N0x: índices compuestos sobre la densidad de giros por colonia
(OSM · colección `denue_zone_density.by_category`), normalizados por PERCENTIL de
ciudad. NUNCA inventa: si la colonia no tiene densidad sincronizada → stub honesto.

CONSTRUIBLES YA (OSM real, mismo dato que alimenta lifestyle/transporte/amenidades):
  · N01 Ecosystem Diversity   — diversidad de giros (índice de Shannon).
  · N06 School Premium        — proximidad escolar (densidad de escuelas a pie).
  · N08 Walkability MX        — caminabilidad ponderada (transporte+servicios+ocio).
  · N09 Nightlife Economy     — economía nocturna (densidad potencial; OSM sin horario).
  · N10 Senior Livability     — habitabilidad para adultos mayores (salud a pie).

ESPERANDO FUENTE (DataPendingRecipe · reason honesto):
  · N02 Employment Accessibility — INEGI empleo, no ingerido.
  · N04 Crime Trajectory         — FGJ serie temporal, solo hay snapshot.
  · N05 Infrastructure Resilience— Atlas/CENAPRED WFS, no ingerido.
  · N07 Water Security           — SACMEX, resource_id vacío.

N03 Gentrification Velocity: NO se crea receta nueva — ya vive en IPV/zone_cycle.
Ver nota al pie de este módulo.

CÓMO LLEGA EL DATO (sin tocar ie_raw_observations):
  ScoreEngine._build_denue_context inyecta dos pseudo-fuentes cuando la receta
  declara `needs_denue = True` (mismo patrón que _dmx_dev en recipes de proyecto):
    · "_dmx_denue_zone" → [{payload: doc denue de ESTA colonia}]
    · "_dmx_denue_city" → [{payload: doc denue}, ...]  (universo, para el percentil)
"""
from __future__ import annotations

import math
from bisect import bisect_left
from typing import Any, Dict, List, Optional

from score_engine import Recipe, ScoreResult, register
from recipes.colonia._helpers import DataPendingRecipe


# Categorías que escribe osm_engine._classify (claves en español, a propósito).
_TRANSPORTE = ["transporte"]
_SERVICIOS_BASICOS = ["mercado", "farmacia", "escuela", "hospital"]
_VIDA = ["restaurante", "cafe", "recreacion"]


def _by_cat(doc: Optional[Dict[str, Any]]) -> Dict[str, float]:
    """Lee by_category de un doc de denue_zone_density como floats (defensivo)."""
    out: Dict[str, float] = {}
    for k, v in ((doc or {}).get("by_category") or {}).items():
        try:
            out[str(k)] = float(v)
        except (TypeError, ValueError):
            continue
    return out


def _sum_cats(by_cat: Dict[str, float], cats: List[str], weights: Optional[Dict[str, float]] = None) -> float:
    """Suma (opcionalmente ponderada) de un conjunto de categorías."""
    total = 0.0
    for c in cats:
        w = (weights or {}).get(c, 1.0)
        total += by_cat.get(c, 0.0) * w
    return total


def _percentile_of(value: float, population: List[float]) -> float:
    """Percentil (0-100) de `value` dentro de `population` (incluye value).

    Devuelve 50.0 si la población es trivial (≤1) — sin distribución no hay percentil
    significativo, pero el dato sí existe (señal débil, confianza baja).
    """
    pop = sorted(p for p in population if p is not None)
    n = len(pop)
    if n <= 1:
        return 50.0
    # fracción de la población estrictamente por debajo + mitad de los empates
    below = bisect_left(pop, value)
    equal = sum(1 for p in pop if p == value)
    rank = below + equal / 2.0
    return max(0.0, min(100.0, (rank / n) * 100.0))


class DenueDensityRecipe(Recipe):
    """Base para los N0x construibles: leen densidad OSM por colonia + universo ciudad
    (inyectados como pseudo-fuentes) y normalizan por percentil de ciudad.

    Subclases implementan:
      · metric(by_cat) -> float          (la métrica cruda de ESTA colonia)
      · city_metric(by_cat) -> float     (la misma métrica para cada colonia ciudad)
                                          (default: usa metric())
      · explanation(by_cat, raw, value) -> List[str]  (opcional)
    es_estimado / nota_estimacion: notas honestas sobre el límite del dato.
    """
    scope = "colonia"
    dependencies: List[str] = ["osm_overpass"]   # source_id real de OSM (parques/museos usan el mismo)
    needs_denue = True
    tier_logic = "higher_better"
    es_estimado: bool = False
    nota_estimacion: str = ""

    # ─── overrides ─────────────────────────────────────────────────────────────
    def metric(self, by_cat: Dict[str, float]) -> Optional[float]:
        raise NotImplementedError

    def city_metric(self, by_cat: Dict[str, float]) -> Optional[float]:
        return self.metric(by_cat)

    def explanation(self, by_cat: Dict[str, float], raw: Optional[float], value: Optional[float]) -> List[str]:
        return [f"Receta {self.code} v{self.version}: métrica cruda {raw} → percentil ciudad {value}"]

    # ─── engine contract ─────────────────────────────────────────────────────
    def _zone_doc(self, obs: Dict[str, List[Dict[str, Any]]]) -> Optional[Dict[str, Any]]:
        lst = obs.get("_dmx_denue_zone") or []
        return lst[0].get("payload") if lst else None

    def _city_docs(self, obs: Dict[str, List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
        return [o.get("payload") for o in obs.get("_dmx_denue_city") or [] if o.get("payload")]

    def compute(self, zone_id: str, obs_by_source: Dict[str, List[Dict[str, Any]]]) -> ScoreResult:
        zone_doc = self._zone_doc(obs_by_source)
        if not zone_doc:
            return self._stub_result(zone_id, reason="densidad OSM no sincronizada para esta colonia")
        by_cat = _by_cat(zone_doc)
        if not by_cat:
            return self._stub_result(zone_id, reason="densidad OSM vacía (sin POIs)")

        raw = self.metric(by_cat)
        if raw is None:
            return self._stub_result(zone_id, reason="señal insuficiente")

        # Distribución ciudad para el percentil.
        city_vals: List[float] = []
        for d in self._city_docs(obs_by_source):
            cm = self.city_metric(_by_cat(d))
            if cm is not None:
                city_vals.append(cm)
        value = _percentile_of(float(raw), city_vals)
        value = max(0.0, min(100.0, round(float(value), 2)))

        n_city = len(city_vals)
        conf = "high" if n_city >= 20 else ("med" if n_city >= 5 else "low")
        return ScoreResult(
            code=self.code, zone_id=zone_id, value=value,
            tier=self._tier_for(value), confidence=conf, is_stub=False,
            inputs_used={"denue_zone": 1, "denue_city": n_city},
            formula_version=self.version,
        )

    # /explain endpoint compat (mismo shape que SimpleHeuristicRecipe).
    def _real_values(self, obs_by_source):
        return obs_by_source


# ═══ CONSTRUIBLES YA ═══════════════════════════════════════════════════════════

@register
class IEColN01EcosystemDiversity(DenueDensityRecipe):
    """N01 — Diversidad del ecosistema de giros (índice de Shannon)."""
    code = "IE_COL_N01_ECOSYSTEM_DIVERSITY"
    version = "1.0"
    description = "Diversidad de giros de la colonia (índice de Shannon sobre densidad OSM), por percentil de ciudad."

    def metric(self, by_cat: Dict[str, float]) -> Optional[float]:
        counts = [v for v in by_cat.values() if v > 0]
        total = sum(counts)
        if total <= 0:
            return None
        # Shannon H = -Σ p·ln(p). Más alto = mezcla más rica de giros.
        h = 0.0
        for c in counts:
            p = c / total
            h -= p * math.log(p)
        return h

    def explanation(self, by_cat, raw, value):
        return [
            f"Giros con presencia: {sum(1 for v in by_cat.values() if v > 0)}",
            f"Índice de Shannon H = {raw:.3f}" if raw is not None else "Sin giros",
            f"Percentil de diversidad vs ciudad = {value}",
        ]


@register
class IEColN08WalkabilityMX(DenueDensityRecipe):
    """N08 — Caminabilidad estilo MX: ¿qué resuelves a pie en la colonia?"""
    code = "IE_COL_N08_WALKABILITY_MX"
    version = "1.0"
    description = ("Caminabilidad: 0.45 transporte + 0.30 servicios básicos (mercado/farmacia/"
                   "escuela/hospital) + 0.25 vida (restaurante/café/recreación), por percentil de ciudad.")

    def metric(self, by_cat: Dict[str, float]) -> Optional[float]:
        transporte = _sum_cats(by_cat, _TRANSPORTE)
        servicios = _sum_cats(by_cat, _SERVICIOS_BASICOS)
        vida = _sum_cats(by_cat, _VIDA)
        if (transporte + servicios + vida) <= 0:
            return None
        # Métrica cruda ponderada; el percentil de ciudad la lleva a 0-100.
        return 0.45 * transporte + 0.30 * servicios + 0.25 * vida

    def explanation(self, by_cat, raw, value):
        return [
            f"Transporte={_sum_cats(by_cat, _TRANSPORTE):.0f} · "
            f"Servicios={_sum_cats(by_cat, _SERVICIOS_BASICOS):.0f} · "
            f"Vida={_sum_cats(by_cat, _VIDA):.0f}",
            f"Caminabilidad cruda = 0.45·T + 0.30·S + 0.25·V = {raw:.1f}" if raw is not None else "Sin POIs",
            f"Percentil de caminabilidad vs ciudad = {value}",
        ]


@register
class IEColN09NightlifeEconomy(DenueDensityRecipe):
    """N09 — Economía nocturna (densidad potencial; OSM no tiene horario)."""
    code = "IE_COL_N09_NIGHTLIFE_ECONOMY"
    version = "1.0"
    description = ("Economía nocturna potencial: bares + ocio + 0.5·café + 0.3·restaurante, "
                   "por percentil de ciudad. Estimado: OSM no expone horario de cierre.")
    es_estimado = True
    nota_estimacion = "Densidad POTENCIAL de vida nocturna. OSM no tiene horario de cierre; refinar con SEDECO/horarios."

    _W = {"cafe": 0.5, "restaurante": 0.3}

    def metric(self, by_cat: Dict[str, float]) -> Optional[float]:
        v = (by_cat.get("bar", 0.0)
             + by_cat.get("ocio", 0.0)
             + by_cat.get("cafe", 0.0) * self._W["cafe"]
             + by_cat.get("restaurante", 0.0) * self._W["restaurante"])
        if v <= 0:
            return None
        return v

    def explanation(self, by_cat, raw, value):
        return [
            f"Bares={by_cat.get('bar', 0):.0f} · Ocio={by_cat.get('ocio', 0):.0f} · "
            f"Café×0.5={by_cat.get('cafe', 0) * 0.5:.1f} · Rest×0.3={by_cat.get('restaurante', 0) * 0.3:.1f}",
            f"Densidad nocturna cruda = {raw:.1f}" if raw is not None else "Sin POIs nocturnos",
            f"Percentil vs ciudad = {value}",
            "Estimado: densidad potencial — OSM no tiene horario de cierre.",
        ]


@register
class IEColN06SchoolPremium(DenueDensityRecipe):
    """N06 — Prima escolar por PROXIMIDAD: ¿cuántas escuelas resuelves a pie?"""
    code = "IE_COL_N06_SCHOOL_PREMIUM"
    version = "1.0"
    description = ("Prima escolar por proximidad: densidad de escuelas a pie (OSM), por percentil "
                   "de ciudad. La CALIDAD/prestigio (SIGED-SEP/PLANEA) se suma cuando se ingiera.")
    es_estimado = True
    nota_estimacion = ("Cubre PROXIMIDAD escolar (densidad de escuelas cercanas). La calidad/"
                       "prestigio (SIGED-SEP, PLANEA) no es dato abierto georreferenciado vigente; "
                       "el API federal migró — se incorpora cuando estabilice.")

    def metric(self, by_cat: Dict[str, float]) -> Optional[float]:
        escuelas = by_cat.get("escuela", 0.0)
        if escuelas <= 0:
            return None
        return escuelas

    def explanation(self, by_cat, raw, value):
        return [
            f"Escuelas a pie = {raw:.0f}" if raw is not None else "Sin escuelas cercanas",
            f"Percentil de proximidad escolar vs ciudad = {value}",
            "Estimado: proximidad — la calidad (SIGED-SEP/PLANEA) se sumará cuando se ingiera.",
        ]


@register
class IEColN10SeniorLivability(DenueDensityRecipe):
    """N10 — Habitabilidad para adultos mayores (salud a pie + tranquilidad)."""
    code = "IE_COL_N10_SENIOR_LIVABILITY"
    version = "1.0"
    description = ("Habitabilidad senior: salud a pie (hospital + farmacia), por percentil de ciudad. "
                   "La CALIDAD hospitalaria (DGIS) se incorpora cuando se ingiera.")
    es_estimado = True
    nota_estimacion = ("Cubre salud a pie (densidad hospital+farmacia) y, si está disponible, "
                       "seguridad de la zona. La calidad hospitalaria (DGIS) llega después.")

    def metric(self, by_cat: Dict[str, float]) -> Optional[float]:
        salud = by_cat.get("hospital", 0.0) + by_cat.get("farmacia", 0.0)
        if salud <= 0:
            return None
        return salud

    def compute(self, zone_id: str, obs_by_source: Dict[str, List[Dict[str, Any]]]) -> ScoreResult:
        # Base: percentil de salud a pie (vía DenueDensityRecipe).
        base = super().compute(zone_id, obs_by_source)
        if base.is_stub or base.value is None:
            return base
        # Combina con seguridad de la zona SI ya existe score real (no inventa).
        seg = obs_by_source.get("_dmx_seguridad")
        seg_val = None
        if seg:
            try:
                seg_val = float(seg[0].get("payload", {}).get("value"))
            except (TypeError, ValueError, AttributeError):
                seg_val = None
        if seg_val is not None:
            combined = 0.6 * base.value + 0.4 * seg_val
            base.value = round(max(0.0, min(100.0, combined)), 2)
            base.tier = self._tier_for(base.value)
            base.inputs_used = {**base.inputs_used, "seguridad": 1}
        return base

    def explanation(self, by_cat, raw, value):
        return [
            f"Salud a pie (hospital+farmacia) = {raw:.0f}" if raw is not None else "Sin salud cercana",
            f"Percentil vs ciudad = {value}",
            "Calidad hospitalaria (DGIS) se sumará cuando se ingiera.",
        ]


# ═══ ESPERANDO FUENTE ═══════════════════════════════════════════════════════════

@register
class IEColN02EmploymentAccessibility(DataPendingRecipe):
    code = "IE_COL_N02_EMPLOYMENT_ACCESSIBILITY"
    version = "0.1"
    dependencies = ["inegi"]
    tier_logic = "higher_better"
    description = "Acceso al empleo: empleos alcanzables en tiempo razonable desde la colonia."
    reason = "Esperando fuente: empleo INEGI (DENUE empleo / Censos Económicos) aún no ingerido."


@register
class IEColN04CrimeTrajectory(Recipe):
    """N04 — Trayectoria del delito: ¿la seguridad MEJORA o EMPEORA? (tendencia FGJ real, no foto).
    Lee la tendencia de delitos de la colonia (`fgj_trajectory_zone`, ratio año-reciente/año-base sobre
    2.1M carpetas FGJ) inyectada como pseudo-fuente. Crimen cayendo (ratio<1) = seguridad mejorando =
    score alto → 100 − percentil del ratio de ciudad. NUNCA inventa: sin ≥2 años FGJ → stub honesto."""
    code = "IE_COL_N04_CRIME_TRAJECTORY"
    version = "1.0"
    scope = "colonia"
    dependencies: List[str] = []
    needs_crime_trajectory = True
    tier_logic = "higher_better"
    description = ("Trayectoria del delito (FGJ, ratio año-reciente/año-base): ¿la seguridad mejora o empeora? "
                   "100 = la que más mejora (delito cayendo).")

    def compute(self, zone_id: str, obs_by_source: Dict[str, List[Dict[str, Any]]]) -> ScoreResult:
        zlst = obs_by_source.get("_dmx_crimetraj_zone") or []
        zdoc = zlst[0].get("payload") if zlst else None
        if not zdoc or zdoc.get("trend_ratio") is None:
            return self._stub_result(zone_id, reason="sin tendencia FGJ (≥2 años) para esta colonia")
        try:
            ratio = float(zdoc.get("trend_ratio"))
        except (TypeError, ValueError):
            return self._stub_result(zone_id, reason="ratio no numérico")
        city_vals: List[float] = []
        for o in obs_by_source.get("_dmx_crimetraj_city") or []:
            p = o.get("payload") or {}
            try:
                city_vals.append(float(p.get("trend_ratio")))
            except (TypeError, ValueError):
                continue
        pct = _percentile_of(ratio, city_vals)               # alto = delito subiendo (peor)
        value = max(0.0, min(100.0, round(100.0 - pct, 2)))   # invertir: ratio bajo (mejora) = score alto
        n_city = len(city_vals)
        conf = "high" if n_city >= 20 else ("med" if n_city >= 5 else "low")
        return ScoreResult(
            code=self.code, zone_id=zone_id, value=value,
            tier=self._tier_for(value), confidence=conf, is_stub=False,
            inputs_used={"fgj_traj_zone": 1, "fgj_traj_city": n_city},
            formula_version=self.version,
        )


@register
class IEColN05InfrastructureResilience(Recipe):
    """N05 — Resiliencia ante sismo/inundación/hundimiento (Atlas de Riesgos CDMX).
    Lee el riesgo natural REAL de la colonia (`risk_scores_zone`, fuente atlas_cdmx) inyectado
    como pseudo-fuente (needs_natural_risk). 100 = más resiliente (menor riesgo natural).
    NUNCA inventa: si la capa natural está en placeholder o la colonia no tiene doc → stub honesto."""
    code = "IE_COL_N05_INFRASTRUCTURE_RESILIENCE"
    version = "1.0"
    scope = "colonia"
    dependencies: List[str] = []
    needs_natural_risk = True
    tier_logic = "higher_better"
    description = ("Resiliencia ante sismo/inundación/hundimiento (Atlas de Riesgos CDMX). "
                   "100 = más resiliente (menor riesgo natural compuesto).")

    def compute(self, zone_id: str, obs_by_source: Dict[str, List[Dict[str, Any]]]) -> ScoreResult:
        lst = obs_by_source.get("_dmx_natural_risk") or []
        doc = lst[0].get("payload") if lst else None
        if not doc:
            return self._stub_result(zone_id, reason="riesgo natural (Atlas) no sincronizado para esta colonia")
        flags = doc.get("placeholder_flags") or {}
        comp = doc.get("components") or {}
        nat = comp.get("natural_score")
        if flags.get("natural") is True or nat is None:
            return self._stub_result(zone_id, reason="capa de riesgo natural en placeholder (Atlas no resuelto)")
        try:
            value = max(0.0, min(100.0, round(float(nat), 2)))
        except (TypeError, ValueError):
            return self._stub_result(zone_id, reason="natural_score no numérico")
        return ScoreResult(
            code=self.code, zone_id=zone_id, value=value,
            tier=self._tier_for(value), confidence="high", is_stub=False,
            inputs_used={"atlas_natural": 1},
            formula_version=self.version,
        )


@register
class IEColN07WaterSecurity(Recipe):
    """N07 — Seguridad hídrica: confiabilidad del suministro (incidentes SACMEX REALES).
    Lee el conteo de reportes de agua (fuga/falta de agua) de la colonia (`sacmex_zone_colonia`,
    313k+ reportes CKAN datos.cdmx) inyectado como pseudo-fuente. Más incidentes = menor seguridad →
    score = 100 − percentil de incidentes de ciudad. NUNCA inventa: sin reportes → stub honesto."""
    code = "IE_COL_N07_WATER_SECURITY"
    version = "1.0"
    scope = "colonia"
    dependencies: List[str] = []
    needs_water = True
    tier_logic = "higher_better"
    es_estimado = True
    nota_estimacion = ("Proxy por densidad de reportes de incidentes de agua (SACMEX). Confunde el tamaño / "
                       "la reportabilidad de la colonia; se refina con normalización por tomas o habitantes.")
    description = ("Seguridad hídrica: confiabilidad del suministro (incidentes SACMEX: fuga/falta de agua), "
                   "por percentil de ciudad invertido. 100 = menos incidentes (suministro más confiable).")

    def compute(self, zone_id: str, obs_by_source: Dict[str, List[Dict[str, Any]]]) -> ScoreResult:
        zlst = obs_by_source.get("_dmx_water_zone") or []
        zdoc = zlst[0].get("payload") if zlst else None
        if not zdoc or zdoc.get("incidents") is None:
            return self._stub_result(zone_id, reason="sin reportes SACMEX para esta colonia")
        try:
            inc = float(zdoc.get("incidents"))
        except (TypeError, ValueError):
            return self._stub_result(zone_id, reason="incidentes no numéricos")
        city_vals: List[float] = []
        for o in obs_by_source.get("_dmx_water_city") or []:
            p = o.get("payload") or {}
            try:
                city_vals.append(float(p.get("incidents")))
            except (TypeError, ValueError):
                continue
        pct = _percentile_of(inc, city_vals)               # alto = muchos incidentes
        value = max(0.0, min(100.0, round(100.0 - pct, 2)))  # invertir: pocos incidentes = score alto
        n_city = len(city_vals)
        conf = "high" if n_city >= 20 else ("med" if n_city >= 5 else "low")
        return ScoreResult(
            code=self.code, zone_id=zone_id, value=value,
            tier=self._tier_for(value), confidence=conf, is_stub=False,
            inputs_used={"sacmex_zone": 1, "sacmex_city": n_city},
            formula_version=self.version,
        )


# ─────────────────────────────────────────────────────────────────────────────
# N03 Gentrification Velocity — SIN receta nueva.
#   La velocidad de gentrificación ya se modela vía IPV / zone_cycle (ciclo de zona).
#   Crear una receta IE_COL_N03_* duplicaría ese motor (regla: grep-antes-de-construir).
#   Se documenta aquí como alias conceptual; el dato vive en zone_cycle/IPV, no en N0x.
# ─────────────────────────────────────────────────────────────────────────────
