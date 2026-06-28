"""ENCENDER LA GRANULARIDAD — backfill de las familias de scores que tienen ruta de persistencia pero nadie las dispara.

Cada motor YA sabe persistir (compute_* escribe a su colección); lo que faltaba era CORRERLO para las entidades
existentes. Esto las pasa de 'apagado' → 'vivo' en el mapa de granularidad. Defensivo (por-entidad try/except), acotado
(limit), idempotente (los compute_* hacen upsert). Lo dispara un cron diario + un endpoint de superadmin.

También persiste el score EFÍMERO de mayor valor (dmx_project_score, el "1 número" del dev) a `score_snapshots` para que
tenga histórico/auditoría (Capa 2).
"""
import logging
from typing import Any, Dict, List, Optional

log = logging.getLogger("dmx.granularity_backfill")


async def _distinct_buyer_user_ids(db, limit: int) -> List[str]:
    ids = set()
    try:
        async for u in db.users.find({}, {"_id": 0, "id": 1, "user_id": 1}).limit(limit):
            ids.add(u.get("user_id") or u.get("id"))
    except Exception:
        pass
    for coll, field in (("buyer_score_runs", "user_id"), ("leads", "user_id"), ("leads", "visitor_id")):
        try:
            for v in (await db[coll].distinct(field))[:limit]:
                if v:
                    ids.add(v)
        except Exception:
            pass
    return [i for i in ids if i][:limit]


async def backfill_buyer_scores(db, limit: int = 200) -> Dict[str, Any]:
    # compute_user_score SOLO calcula; upsert_score persiste. Nadie los encadenaba → la familia quedaba huérfana.
    from buyer_score_engine import compute_user_score, upsert_score
    ids = await _distinct_buyer_user_ids(db, limit)
    ok = err = 0
    for uid in ids:
        try:
            score_data = await compute_user_score(db, uid)
            await upsert_score(db, uid, score_data)
            ok += 1
        except Exception:
            err += 1
    return {"family": "buyer_scores", "attempted": len(ids), "persisted": ok, "errors": err}


async def backfill_trust(db, limit: int = 200) -> Dict[str, Any]:
    from services.trust_score import compute_trust_score
    ok = err = att = 0
    async for a in db.asesor_profiles.find({}, {"_id": 0, "user_id": 1, "id": 1}).limit(limit):
        aid = a.get("user_id") or a.get("id")
        if not aid:
            continue
        att += 1
        try:
            await compute_trust_score(db, aid, force_refresh=True)
            ok += 1
        except Exception:
            err += 1
    return {"family": "asesor_trust_scores", "attempted": att, "persisted": ok, "errors": err}


async def backfill_lead_match(db, limit: int = 300) -> Dict[str, Any]:
    from services.lead_to_asesor_match import compute_match
    ok = err = att = 0
    async for ld in db.leads.find({"activo": {"$ne": False}}, {"_id": 0, "id": 1}).limit(limit):
        lid = ld.get("id")
        if not lid:
            continue
        att += 1
        try:
            await compute_match(db, lid, force=True)
            ok += 1
        except Exception:
            err += 1
    return {"family": "lead_match_scores", "attempted": att, "persisted": ok, "errors": err}


async def backfill_avm(db, limit: int = 60) -> Dict[str, Any]:
    """ACOTADO (default 60 unidades) — la valuación es por-propiedad. El cron NO lo corre por costo; sí el endpoint."""
    from fsd_engine import compute_fsd, persist_avm_prediction
    ok = err = att = 0
    async for u in db.dmx_units.find({}, {"_id": 0}).limit(limit):
        pid = u.get("unit_id") or u.get("id")
        _geo = u.get("geo") or {}
        zone = _geo.get("colonia_id") or _geo.get("colonia") or u.get("colonia_id") or u.get("zone_id")
        if not pid or not zone:
            continue
        att += 1
        try:
            fsd = await compute_fsd(db, u, zone)
            # persist_avm_prediction solo escribe si el modelo tiene datos (fsd.available). Sin comparables → None.
            if fsd and await persist_avm_prediction(db, pid, zone, fsd, u):
                ok += 1
        except Exception:
            err += 1
    note = None if ok else "el modelo FSD no tiene comparables/datos suficientes (dependencia de datos, no de wiring)"
    return {"family": "avm_predictions", "attempted": att, "persisted": ok, "errors": err, "note": note}


async def backfill_project_scores(db, limit: int = 200) -> Dict[str, Any]:
    """CAPA 2 · persiste el score EFÍMERO del dev (dmx_project_score, 5 dims) a score_snapshots → histórico/auditoría.
    compute(p) es síncrono y recibe el dict del proyecto. Se enriquece con los datos vivos (absorción/ritmo) si están."""
    from dmx_project_score import compute as compute_project_score
    from datetime import datetime
    from data_developments import DEVELOPMENTS
    ok = err = att = 0
    for d in DEVELOPMENTS[:limit]:
        att += 1
        try:
            res = compute_project_score(d)
            score = (res or {}).get("score") if isinstance(res, dict) else res
            await db.score_snapshots.update_one(
                {"entity_type": "desarrollo", "entity_id": d["id"], "family": "dmx_project_score"},
                {"$set": {"entity_type": "desarrollo", "entity_id": d["id"], "family": "dmx_project_score",
                          "score": score, "grade": (res or {}).get("grade") if isinstance(res, dict) else None,
                          "detalle": res if isinstance(res, dict) else None,
                          "updated_at": datetime.utcnow().isoformat()}}, upsert=True)
            ok += 1
        except Exception:
            err += 1
    return {"family": "score_snapshots:project", "attempted": att, "persisted": ok, "errors": err}


async def backfill_ie_stubs(db, limit: int = 600) -> Dict[str, Any]:
    """DES-STUBEAR recetas IE STALE — muchas quedaron stub porque se computaron ANTES de sincronizar su fuente (p.ej.
    denue_zone_density de OSM ya existe para 3,166 zonas) y el cron solo recomputa zonas con obs nuevas en 24h. El dato
    YA existe → recomputar las flipea stub→real. Cero fuentes externas, cero fake. Las que sí carecen de dato siguen stub."""
    from score_engine import ScoreEngine
    eng = ScoreEngine(db)
    pipe = [{"$match": {"is_stub": True, "zone_id": {"$nin": [None, "None", ""]}}},
            {"$group": {"_id": "$zone_id", "codes": {"$addToSet": "$code"}}}, {"$limit": limit}]
    zonas = recompute = flipped = err = 0
    async for row in db.ie_scores.aggregate(pipe):
        z, codes = row["_id"], row["codes"]
        zonas += 1
        try:
            before = await db.ie_scores.count_documents({"zone_id": z, "code": {"$in": codes}, "is_stub": True})
            res = await eng.compute_many(z, codes, allow_paid=False)
            recompute += len(res)
            after = await db.ie_scores.count_documents({"zone_id": z, "code": {"$in": codes}, "is_stub": True})
            flipped += max(0, before - after)
        except Exception:
            err += 1
    return {"family": "ie_scores_stubs", "zonas": zonas, "recomputadas": recompute, "stub_a_real": flipped, "errors": err}


_FAMILIES = {
    "ie_scores_stubs": backfill_ie_stubs,
    "buyer_scores": backfill_buyer_scores,
    "asesor_trust_scores": backfill_trust,
    "lead_match_scores": backfill_lead_match,
    "avm_predictions": backfill_avm,
    "score_snapshots": backfill_project_scores,
}
# El cron diario corre las baratas (no avm, que es por-propiedad y costoso). Incluye ie_scores_stubs → arregla el bug de
# staleness (el recompute diario base solo toca zonas con obs nuevas en 24h, dejando stubs stale para siempre).
_CRON_FAMILIES = ["ie_scores_stubs", "buyer_scores", "asesor_trust_scores", "lead_match_scores", "score_snapshots"]


async def run_backfill(db, family: Optional[str] = None) -> Dict[str, Any]:
    fams = [family] if family and family in _FAMILIES else (list(_FAMILIES) if family == "all" else _CRON_FAMILIES)
    results = []
    for f in fams:
        try:
            results.append(await _FAMILIES[f](db))
        except Exception as e:  # noqa: BLE001
            results.append({"family": f, "error": str(e)[:120]})
    return {"ran": fams, "results": results}
