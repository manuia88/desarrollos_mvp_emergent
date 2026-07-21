"""Juez de plausibilidad y cobertura sobre SCORES e ÍNDICES (Palanca 5, auditoría 07-20).

Los índices 'licenciables' corrían sobre relleno sintético sin que nadie lo supiera: DRPI 99.8%
`synthetic`, 27% de ie_scores `is_proxy`, 74% del índice de precios con 0 transacciones. Faltaba
lo que la doctrina exige: un juez que mida cuánto es REAL vs relleno y cace valores fuera de rango.
Este reporta % real/sintético por familia (métrica de salud) + valores implausibles, para el parte
y para que los consumidores públicos filtren el relleno.
"""
from __future__ import annotations

from typing import Any, Dict, List

# familia → (colección, campo de valor, rango sano, condición de 'relleno')
_FAMILIAS: List[Dict[str, Any]] = [
    {"familia": "drpi", "coll": "drpi_snapshots", "valor": "index_value", "rango": (20, 400),
     "relleno": {"synthetic": True}},
    {"familia": "ie_scores", "coll": "ie_scores", "valor": "value", "rango": (0, 100),
     "relleno": {"is_proxy": True}},
    {"familia": "price_index", "coll": "price_index_snapshots", "valor": "median",
     "rango": (1, 10_000_000), "relleno": {"transactions_count": 0}},
    {"familia": "health", "coll": "health_scores", "valor": "score", "rango": (0, 100),
     "relleno": None},
]


async def juez_metricas(db) -> Dict[str, Any]:
    """Audita las familias de scores/índices. Devuelve por familia: total, % real, % relleno,
    fuera-de-rango; y una bandera global 'sano'."""
    fam_out: List[Dict[str, Any]] = []
    for f in _FAMILIAS:
        coll = db[f["coll"]]
        total = await coll.estimated_document_count()
        if not total:
            fam_out.append({"familia": f["familia"], "total": 0, "estado": "vacío"})
            continue
        relleno = await coll.count_documents(f["relleno"]) if f["relleno"] else 0
        lo, hi = f["rango"]
        fuera = await coll.count_documents(
            {f["valor"]: {"$exists": True, "$ne": None, "$not": {"$gte": lo, "$lte": hi}}})
        real = total - relleno
        pct_real = round(real * 100 / total)
        fam_out.append({
            "familia": f["familia"], "total": total, "real": real, "relleno": relleno,
            "pct_real": pct_real, "fuera_de_rango": fuera,
            "estado": ("sano" if pct_real >= 50 and fuera == 0
                       else "relleno" if pct_real < 50 else "fuera_de_rango"),
        })
    sano = all(x.get("estado") in ("sano", "vacío") for x in fam_out)
    return {"familias": fam_out, "sano": sano,
            "resumen": {x["familia"]: f"{x.get('pct_real', 0)}% real" for x in fam_out if x.get("total")}}


async def limpiar_centinelas(db) -> Dict[str, int]:
    """Borra zonas centinela de prueba que contaminan los índices (___NOPE___, TEST, etc.)."""
    import re
    pat = re.compile(r"(?i)^_+nope|^test|^__|sentinel|dummy")
    res: Dict[str, int] = {}
    for coll in ("drpi_snapshots", "ie_scores", "price_index_snapshots"):
        ids = []
        async for d in db[coll].find({}, {"_id": 1, "zone_id": 1, "colonia_id": 1, "tier_id": 1}):
            z = str(d.get("zone_id") or d.get("colonia_id") or d.get("tier_id") or "")
            if pat.search(z):
                ids.append(d["_id"])
        if ids:
            r = await db[coll].delete_many({"_id": {"$in": ids}})
            res[coll] = r.deleted_count
    return res
