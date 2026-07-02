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

    # Zonas cercanas con inventario que SÍ encaja (para no dejar al cliente pasmado · él decide, no en silencio).
    exact = [r for r in results if not r.get("ampliado") and not r.get("sobre_presupuesto")]
    zonas_cercanas = _zonas_cercanas(by_id, p) if len(exact) < 2 else []

    return {"ok": True, "total": len(results), "nota": nota, "zonas_cercanas": zonas_cercanas,
            "perfil": p.model_dump(), "resultados": results}


def _zonas_cercanas(by_id: Dict[str, Any], p: PerfilIn, k: int = 3) -> List[Dict[str, Any]]:
    """Zonas ALEDAÑAS (por cercanía geográfica) que SÍ tienen inventario en tu presupuesto — el cliente elige,
    nunca se le imponen. Si su zona no alcanza, le mostramos a dónde sí, cerca."""
    try:
        from data_seed import COLONIAS_BY_ID
    except Exception:
        COLONIAS_BY_ID = {}
    chosen = [_norm(c) for c in (p.colonias or [])]
    if not chosen:
        return []
    # Centro de la(s) zona(s) elegida(s).
    centers = []
    for c in COLONIAS_BY_ID.values():
        if _norm(c.get("name") or "") in chosen or _norm(c.get("id") or "") in chosen:
            ce = c.get("center")
            if ce:
                centers.append(ce)
    if not centers:
        return []
    cx = sum(c[0] for c in centers) / len(centers)
    cy = sum(c[1] for c in centers) / len(centers)
    # Colonias con AL MENOS un dev que encaja en presupuesto+recámaras (sin el filtro de zona).
    pz = p.model_copy(update={"colonias": []})
    by_col: Dict[str, Dict[str, Any]] = {}
    for dev in by_id.values():
        if _norm(dev.get("colonia") or "") in chosen:
            continue  # su zona ya la vio
        if not _passes_extra(dev, pz):
            continue
        col = dev.get("colonia") or dev.get("colonia_id")
        cc = COLONIAS_BY_ID.get(_norm(dev.get("colonia_id") or ""))
        ce = (cc or {}).get("center")
        if not ce or not col:
            continue
        dist = ((ce[0] - cx) ** 2 + (ce[1] - cy) ** 2) ** 0.5
        cur = by_col.get(col)
        if not cur or dist < cur["dist"]:
            by_col[col] = {"colonia": col, "dist": dist, "n": 1}
        else:
            cur["n"] += 1
    out = sorted(by_col.values(), key=lambda x: x["dist"])[:k]
    return [{"colonia": o["colonia"], "n": o["n"]} for o in out]


class GuardarBusquedaIn(PerfilIn):
    visitor_id: Optional[str] = None
    found_count: int = 0
    alert: bool = False   # el cliente quiere que le avisemos cuando entre inventario (E4 casamentera)


@router.post("/api/perfil/registrar-busqueda")
async def registrar_busqueda(b: GuardarBusquedaIn, request: Request):
    """Registra la búsqueda del comprador como DEMANDA anónima en marketplace_searches → el Grafo del Comprador la
    agrega (k-anon ≥3) para DEV (/api/dev/grafo-comprador) y SUPERADMIN (/api/superadmin/grafo-comprador) +
    demand-gap. Cierra el ciclo (no standalone). Las búsquedas SIN resultado (unmet) son el dato de hueco de
    mercado más valioso. Anónimo (ip_hash, sin PII); se vuelve lead solo cuando el cliente contacta (E3)."""
    import hashlib as _h
    import uuid as _u
    from datetime import datetime as _dt
    try:
        db = request.app.state.db
        from ratelimit import client_ip as _c  # SEGURIDAD anti-spoofing (pentest 2026-06-27)
        ip = _c(request)
        now = _dt.utcnow()
        from data_developments import colonia_slug as _cslug  # MOAT: id canónico (linaje cross-engine)
        cols = [s for s in (_cslug(c) for c in (b.colonias or []) if c) if s]   # canonicaliza ANTES de persistir
        doc = {
            "id": f"mks_{_u.uuid4().hex[:12]}", "source": "perfilador",
            "colonias": cols, "colonia_id": (cols[0] if cols else None),
            "recamaras_min": b.recamaras_min, "banos_min": b.banos_min,
            "estacionamientos_min": b.estacionamientos_min, "precio_max": b.presupuesto_max,
            "m2_min": b.m2_min, "uso": b.uso, "stages": b.stages, "plazo": b.plazo,
            "results_count": b.found_count, "unmet": (b.found_count == 0), "alert": bool(b.alert),
            "visitor_id": (b.visitor_id or None),   # espinazo: para enganchar el perfil al lead al registrarse (E3)
            "ip_hash": _h.sha256(f"{ip}:dmx_mks".encode()).hexdigest()[:16] if ip else None,
            "created_at": now.isoformat(), "created_at_dt": now,
        }
        # Dedup: 1 búsqueda viva por visitor + perfil (upsert) → no inflar la demanda con recálculos.
        key = _h.sha256(f"{b.visitor_id}|{cols}|{b.presupuesto_max}|{b.recamaras_min}|{b.stages}".encode()).hexdigest()[:20]
        await db.marketplace_searches.update_one({"dedup_key": key}, {"$set": {**doc, "dedup_key": key}}, upsert=True)
        return {"ok": True, "registrada": True}
    except Exception as e:  # noqa: BLE001
        log.warning(f"[perfil/registrar] fail-open: {e}")
        return {"ok": False}
