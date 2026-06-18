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


def _passes_extra(dev: Dict[str, Any], p: PerfilIn) -> bool:
    """Filtros que el motor base no cubre: etapa, plazo de entrega, multi-zona, estacionamientos."""
    if p.stages and dev.get("stage") not in p.stages:
        return False
    if p.colonias:  # ubicación = filtro DURO (lo más importante para el comprador)
        zt = {_norm(c) for c in p.colonias}
        if _norm(dev.get("colonia_id") or "") not in zt and _norm(dev.get("colonia") or "") not in zt:
            return False
    if p.estacionamientos_min:
        pr = dev.get("parking_range") or [0, 0]
        if (pr[1] if len(pr) == 2 else 0) < p.estacionamientos_min:
            return False
    if p.plazo and p.plazo != "cualquiera":
        lo, hi = _PLAZO_RANGE.get(p.plazo, (0, 9999))
        months = _months_until(dev.get("delivery_estimate"))
        # entrega_inmediata sin fecha → 0 meses; preventa sin fecha → no la descartamos por plazo.
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


async def _run_search(rs_search, db, by_id, prof: PerfilIn) -> List[Dict[str, Any]]:
    """Una pasada: perfil → search() → rehidrata dev + filtros duros (etapa/plazo/zona/cajones) + razones."""
    parsed = _build_parsed(prof)
    scored = await rs_search(db, parsed, limit=max(prof.limit * 3, 30))
    out, seen = [], set()
    for item in scored:
        dev = by_id.get(item.get("entity_id"))
        if not dev or not _passes_extra(dev, prof) or dev.get("id") in seen:
            continue
        seen.add(dev.get("id"))
        out.append({
            "id": dev.get("id"), "name": dev.get("name"), "colonia": dev.get("colonia"),
            "price_from": dev.get("price_from"), "price_from_display": dev.get("price_from_display"),
            "price_m2_dev": dev.get("price_m2_dev"), "stage": dev.get("stage"),
            "match_score": round(item.get("match_score", 0)), "match_reasons": _reasons(dev, prof),
        })
    return out


@router.post("/api/perfil/recomendar")
async def recomendar(p: PerfilIn, request: Request):
    """Perfil estructurado → desarrollos rankeados con match transparente + FALLBACK HONESTO (nunca vacío)."""
    try:
        from reverse_search_engine import search as rs_search
        from data_developments import DEVELOPMENTS
        by_id = {d.get("id"): d for d in DEVELOPMENTS}
        db = request.app.state.db
    except Exception as e:  # noqa: BLE001
        log.warning(f"[perfil/recomendar] init falló: {e}")
        return {"ok": True, "total": 0, "ampliado": False, "nota": None, "perfil": p.model_dump(), "resultados": []}

    MIN = 3
    results = await _run_search(rs_search, db, by_id, p)
    seen = {r["id"] for r in results}
    ampliado, nota = False, None

    if len(results) < MIN:
        # 1) Relaja lo MENOS importante (plazo + m²) · conserva zona, presupuesto, recámaras, baños.
        p2 = p.model_copy(update={"plazo": "cualquiera", "m2_min": None, "m2_max": None})
        for r in await _run_search(rs_search, db, by_id, p2):
            if r["id"] not in seen:
                r["ampliado"] = True; results.append(r); seen.add(r["id"]); ampliado = True
        # 2) Si sigue corto y había zona fija → amplía a otras zonas (honesto: la ubicación es lo más importante,
        #    pero con poco inventario es mejor mostrar lo cercano que dejarte sin nada).
        if len(results) < MIN and p.colonias:
            p3 = p2.model_copy(update={"colonias": []})
            for r in await _run_search(rs_search, db, by_id, p3):
                if r["id"] not in seen:
                    r["ampliado"] = True; results.append(r); seen.add(r["id"]); ampliado = True
            nota = "Hay pocas opciones en tu zona exacta — te mostramos lo más cercano en otras zonas."
        elif ampliado:
            nota = "Ampliamos un poco tu búsqueda para darte más opciones."

    # Primero las de match EXACTO (no ampliadas), luego por score.
    results.sort(key=lambda r: (r.get("ampliado", False), -r.get("match_score", 0)))
    results = results[: max(p.limit, 8)]
    return {"ok": True, "total": len(results), "ampliado": ampliado, "nota": nota, "perfil": p.model_dump(), "resultados": results}
