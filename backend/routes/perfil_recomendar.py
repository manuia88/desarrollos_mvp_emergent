"""
Perfilador → Recomendación (Etapa 1 del Copiloto de Compra · 2026-06-18).

Recibe el perfil ESTRUCTURADO del comprador (presupuesto, crédito, preventa/plazo, must-haves, zona, uso) y
devuelve los desarrollos rankeados con MATCH TRANSPARENTE ("tu presupuesto ✓ · entrega en tu plazo ✓").

Reusa reverse_search_engine.search() (mismo motor que la búsqueda IA) pero alimentado con un dict estructurado en
vez de texto libre → cero dependencia de la API key del LLM (que en local falla y devuelve resultados equivocados).
Agrega el cableado que faltaba: buckets de PLAZO de entrega (de delivery_estimate) + filtro de ETAPA + crédito.

NO toca el shape de leads ni la asignación (eso es Etapa 3). Solo lee DEVELOPMENTS. Público, sin auth.
"""
import logging
from datetime import date
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Request
from pydantic import BaseModel

log = logging.getLogger("dmx.routes_perfil")
router = APIRouter(tags=["perfil"])

# Uso del comprador → buyer_intent del motor (reverse_search ya bonifica por intent).
_USO_INTENT = {"vivir": "family", "primera": "first_home", "invertir": "investor", "vacacional": "luxury"}
# Plazo deseado → rango de meses a entrega [min, max] (None = sin tope).
_PLAZO_RANGE = {"menos_3": (0, 3), "3_6": (0, 6), "6_12": (0, 12), "mas_12": (0, 9999), "cualquiera": (0, 9999)}


def _months_until(ym: Optional[str]) -> Optional[int]:
    """Meses de hoy hasta 'YYYY-MM' (entrega). None si no hay dato. 0 si ya pasó."""
    if not ym or not isinstance(ym, str):
        return None
    try:
        y, m = ym.split("-")[:2]
        today = date.today()
        months = (int(y) - today.year) * 12 + (int(m) - today.month)
        return max(0, months)
    except Exception:
        return None


class PerfilIn(BaseModel):
    presupuesto_max: Optional[float] = None
    enganche: Optional[float] = None
    credito: Optional[str] = None              # infonavit | bancario | fovissste | contado | none
    stages: List[str] = []                     # preventa | en_construccion | entrega_inmediata
    plazo: str = "cualquiera"                  # menos_3 | 3_6 | 6_12 | mas_12 | cualquiera
    recamaras_min: Optional[int] = None
    banos_min: Optional[int] = None
    estacionamientos_min: Optional[int] = None
    m2_min: Optional[float] = None
    m2_max: Optional[float] = None
    colonias: List[str] = []                   # multi-zona (ids/slugs o nombres)
    uso: Optional[str] = None                  # vivir | primera | invertir | vacacional
    must_haves: List[str] = []                 # amenidades/features deseadas (soft)
    limit: int = 12


def _build_parsed(p: PerfilIn) -> Dict[str, Any]:
    """Perfil → dict que entiende reverse_search.search (hard_filters + intent + soft)."""
    hf: Dict[str, Any] = {}
    if p.presupuesto_max:
        hf["precio_max"] = p.presupuesto_max
    if p.recamaras_min:
        hf["recamaras_min"] = p.recamaras_min
    if p.banos_min:
        hf["banos_min"] = p.banos_min
    if p.m2_min:
        hf["m2_min"] = p.m2_min
    if p.m2_max:
        hf["m2_max"] = p.m2_max
    # Zona NO va al motor (la trataría como match parcial → colaría zonas equivocadas). La ubicación es lo más
    # importante → se filtra DURO en _passes_extra (cualquier nº de zonas).
    return {
        "hard_filters": hf,
        "soft_criteria": list(p.must_haves or []),
        "negative_criteria": [],
        "buyer_intent": _USO_INTENT.get(p.uso or "", "neutral"),
    }


def _norm(s: str) -> str:
    return "".join(c for c in (s or "").lower() if c.isalnum())


def _passes_extra(dev: Dict[str, Any], p: PerfilIn, ignore_budget: bool = False, ignore_plazo: bool = False) -> bool:
    """Gate DURO real (search() solo trata estos como match parcial → coalaban $14.5M con $8M de tope).
    La ZONA es sagrada (nunca se relaja). ignore_budget/ignore_plazo permiten ampliar DENTRO de la zona."""
    # Zona — DURA, nunca se relaja (la ubicación es lo más importante).
    if p.colonias:
        zt = {_norm(c) for c in p.colonias}
        if _norm(dev.get("colonia_id") or "") not in zt and _norm(dev.get("colonia") or "") not in zt:
            return False
    # Etapa, recámaras, baños — duras (son necesidades reales del comprador).
    if p.stages and dev.get("stage") not in p.stages:
        return False
    if p.recamaras_min and (lambda r: (r[1] if len(r) == 2 else 0))(dev.get("bedrooms_range") or [0, 0]) < p.recamaras_min:
        return False
    if p.banos_min and (lambda r: (r[1] if len(r) == 2 else 0))(dev.get("bathrooms_range") or [0, 0]) < p.banos_min:
        return False
    if p.estacionamientos_min and (lambda r: (r[1] if len(r) == 2 else 0))(dev.get("parking_range") or [0, 0]) < p.estacionamientos_min:
        return False
    # Presupuesto — duro salvo que lo relajemos explícitamente (dentro de la zona).
    if not ignore_budget and p.presupuesto_max and (dev.get("price_from") or 0) > p.presupuesto_max:
        return False
    # Plazo de entrega — duro salvo relajación explícita.
    if not ignore_plazo and p.plazo and p.plazo != "cualquiera":
        lo, hi = _PLAZO_RANGE.get(p.plazo, (0, 9999))
        months = _months_until(dev.get("delivery_estimate"))
        if dev.get("stage") == "entrega_inmediata":
            months = months if months is not None else 0
        if months is not None and not (lo <= months <= hi):
            return False
    return True


def _reasons(dev: Dict[str, Any], p: PerfilIn) -> List[str]:
    """Match TRANSPARENTE en lenguaje humano: por qué este desarrollo es para ti."""
    out: List[str] = []
    if p.presupuesto_max and (dev.get("price_from") or 0) <= p.presupuesto_max:
        out.append("Entra en tu presupuesto")
    if p.stages and dev.get("stage") in p.stages:
        label = {"preventa": "Es preventa", "en_construccion": "En construcción", "entrega_inmediata": "Listo para entrar"}
        out.append(label.get(dev.get("stage"), "Etapa que buscas"))
    if p.plazo and p.plazo != "cualquiera":
        m = _months_until(dev.get("delivery_estimate"))
        if m is not None:
            out.append(f"Entrega en ~{m} meses" if m > 0 else "Entrega inmediata")
    if p.recamaras_min:
        rng = dev.get("bedrooms_range") or [0, 0]
        if (rng[1] if len(rng) == 2 else 0) >= p.recamaras_min:
            out.append(f"Tiene {p.recamaras_min}+ recámaras")
    if p.banos_min:
        rng = dev.get("bathrooms_range") or [0, 0]
        if (rng[1] if len(rng) == 2 else 0) >= p.banos_min:
            out.append(f"{p.banos_min}+ baños")
    if p.estacionamientos_min:
        out.append(f"{p.estacionamientos_min}+ estacionamientos")
    if dev.get("plusvalia_zona"):
        out.append(f"Plusvalía {dev['plusvalia_zona']} en la zona")
    return out[:4]


async def _run_search(rs_search, db, by_id, prof: PerfilIn, ignore_budget: bool = False, ignore_plazo: bool = False) -> List[Dict[str, Any]]:
    """Una pasada: perfil → search() → rehidrata dev + gate DURO (_passes_extra) + razones.
    ignore_budget/ignore_plazo permiten ampliar DENTRO de la zona (la zona NUNCA se relaja)."""
    parsed = _build_parsed(prof)
    scored = await rs_search(db, parsed, limit=max(prof.limit * 3, 30))
    out, seen = [], set()
    for item in scored:
        dev = by_id.get(item.get("entity_id"))
        if not dev or dev.get("id") in seen:
            continue
        if not _passes_extra(dev, prof, ignore_budget=ignore_budget, ignore_plazo=ignore_plazo):
            continue
        seen.add(dev.get("id"))
        over = bool(prof.presupuesto_max and (dev.get("price_from") or 0) > prof.presupuesto_max)
        out.append({
            "id": dev.get("id"), "name": dev.get("name"), "colonia": dev.get("colonia"),
            "price_from": dev.get("price_from"), "price_from_display": dev.get("price_from_display"),
            "price_m2_dev": dev.get("price_m2_dev"), "stage": dev.get("stage"),
            "match_score": round(item.get("match_score", 0)), "match_reasons": _reasons(dev, prof),
            "sobre_presupuesto": over,
        })
    return out


@router.post("/api/perfil/recomendar")
async def recomendar(p: PerfilIn, request: Request):
    """Perfil → desarrollos con match transparente. La ZONA es sagrada (nunca se relaja); si hay pocas en tu zona
    se relaja PLAZO y luego PRESUPUESTO dentro de la zona, honesto. Nunca salta a otras zonas."""
    try:
        from reverse_search_engine import search as rs_search
        from data_developments import DEVELOPMENTS
        by_id = {d.get("id"): d for d in DEVELOPMENTS}
        db = request.app.state.db
    except Exception as e:  # noqa: BLE001
        log.warning(f"[perfil/recomendar] init falló: {e}")
        return {"ok": True, "total": 0, "nota": None, "perfil": p.model_dump(), "resultados": []}

    MIN = 3
    results = await _run_search(rs_search, db, by_id, p)  # estricto (todo duro)
    seen = {r["id"] for r in results}
    relax_plazo = relax_budget = False

    if len(results) < MIN:
        # 1) Relaja el PLAZO de entrega · DENTRO de la zona (presupuesto/recámaras se conservan).
        for r in await _run_search(rs_search, db, by_id, p, ignore_plazo=True):
            if r["id"] not in seen:
                r["ampliado"] = True; results.append(r); seen.add(r["id"]); relax_plazo = True
        # 2) Relaja el PRESUPUESTO · DENTRO de la zona (marcadas "sobre presupuesto"). La zona NUNCA se toca.
        if len(results) < MIN:
            for r in await _run_search(rs_search, db, by_id, p, ignore_budget=True, ignore_plazo=True):
                if r["id"] not in seen:
                    r["ampliado"] = True; results.append(r); seen.add(r["id"]); relax_budget = True

    # Orden: match exacto primero, los sobre-presupuesto al final, luego por score.
    results.sort(key=lambda r: (r.get("ampliado", False), r.get("sobre_presupuesto", False), -r.get("match_score", 0)))
    results = results[: max(p.limit, 8)]

    # Nota honesta y SIEMPRE referida a la zona elegida (nunca "otras zonas").
    zona_txt = p.colonias[0] if len(p.colonias) == 1 else "tu zona"
    nota = None
    if len(results) == 0:
        nota = f"Todavía no hay desarrollos en {zona_txt} con esos filtros. Prueba otra zona o ajusta tu perfil."
    elif relax_budget:
        nota = f"Hay pocas opciones en {zona_txt} con tu presupuesto — algunas de estas están un poco arriba."
    elif relax_plazo:
        nota = f"Para darte más opciones en {zona_txt}, ampliamos el plazo de entrega."
    return {"ok": True, "total": len(results), "nota": nota, "perfil": p.model_dump(), "resultados": results}
