"""MAPA PREDIOS — AVM de MERCADO $/m² a nivel PREDIO para pintar el mapa fino (manzana/predio).

Lee la colección materializada db.avm_predios (la siembra scripts/seed_avm_predios.py reusando
avm_predios_engine.avm_predio, que a su vez reusa market_estimate_engine). Este router SOLO sirve;
no calcula AVM en caliente (eso lo hace el seed, costoso).

Endpoint:
  GET /api/mapa/colonia/{colonia_id}/predios-avm
      Devuelve los predios de una colonia (id/slug IECM) con su avm_m2 + sello (fuente/confianza).
      Opcional bbox (?bbox=minLng,minLat,maxLng,maxLat) para recortar al viewport del mapa.

Portales: comprador (mapa "¿dónde vivirías?" a nivel predio/manzana) + superadmin (auditar cobertura).

NO registrado en server.py a propósito — exporta `router`; el registro lo hace el owner de server.py.
"""
from typing import Optional, List

from fastapi import APIRouter, Request, Query, HTTPException

router = APIRouter(tags=["mapa-predios"])

_MAX = 6000   # techo de predios por respuesta (una colonia densa ronda 1-2k; el bbox recorta el resto)


def _parse_bbox(bbox: Optional[str]) -> Optional[List[float]]:
    if not bbox:
        return None
    try:
        parts = [float(x) for x in bbox.split(",")]
        if len(parts) != 4:
            return None
        min_lng, min_lat, max_lng, max_lat = parts
        if min_lng > max_lng or min_lat > max_lat:
            return None
        return [min_lng, min_lat, max_lng, max_lat]
    except (ValueError, AttributeError):
        return None


@router.get("/api/mapa/colonia/{colonia_id}/predios-avm")
async def predios_avm(colonia_id: str, request: Request,
                      bbox: Optional[str] = Query(None, description="minLng,minLat,maxLng,maxLat (viewport)"),
                      limit: int = Query(_MAX, ge=1, le=_MAX)):
    """Predios de la colonia con avm_m2 de mercado (materializado en db.avm_predios) → GeoJSON FeatureCollection.

    - Cada feature: {geometry:Point, properties:{predio_id, avm_m2, fuente, confianza, es_estimado, ...}}.
    - `bbox` recorta al viewport (usa el índice 2dsphere de db.avm_predios).
    - Si la colonia aún no está sembrada, devuelve features=[] + hint para correr el seed (no 500).
    """
    db = request.app.state.db

    query: dict = {"colonia_id": colonia_id}
    box = _parse_bbox(bbox)
    if bbox and box is None:
        raise HTTPException(status_code=400, detail="bbox inválido: usa minLng,minLat,maxLng,maxLat")
    if box:
        min_lng, min_lat, max_lng, max_lat = box
        query["geo"] = {"$geoWithin": {"$box": [[min_lng, min_lat], [max_lng, max_lat]]}}

    total = await db.avm_predios.count_documents({"colonia_id": colonia_id})

    proj = {
        "_id": 0, "predio_id": 1, "geo": 1, "avm_m2": 1, "fuente": 1, "confianza": 1,
        "es_estimado": 1, "factor_predio": 1, "avm_m2_colonia": 1,
        "sup_construccion": 1, "sup_terreno": 1, "alcaldia": 1,
    }
    feats = []
    valores = []
    con_avm = 0
    async for d in db.avm_predios.find(query, proj).limit(limit):
        geo = d.get("geo")
        if not geo:
            continue
        avm = d.get("avm_m2")
        if avm:
            con_avm += 1
            valores.append(avm)
        feats.append({
            "type": "Feature",
            "geometry": geo,
            "properties": {
                "predio_id": d.get("predio_id"),
                "avm_m2": avm,
                "fuente": d.get("fuente"),
                "confianza": d.get("confianza"),
                "es_estimado": d.get("es_estimado"),
                "factor_predio": d.get("factor_predio"),
                "avm_m2_colonia": d.get("avm_m2_colonia"),
                "sup_construccion": d.get("sup_construccion"),
                "sup_terreno": d.get("sup_terreno"),
            },
        })

    resumen = {
        "colonia_id": colonia_id,
        "predios_en_colonia": total,
        "devueltos": len(feats),
        "con_avm": con_avm,
        "min_m2": min(valores) if valores else None,
        "max_m2": max(valores) if valores else None,
    }
    if total == 0:
        resumen["hint"] = (
            f"colonia sin materializar — corre: "
            f"scripts/.venv/bin/python3 scripts/seed_avm_predios.py --colonia {colonia_id}"
        )

    return {"type": "FeatureCollection", "resumen": resumen, "features": feats}
