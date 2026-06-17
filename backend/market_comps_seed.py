"""
Anclas REALES de mercado (muestra Monopolio · zona central CDMX · 2026-06) → db.market_comps.
Reproducible: `python -c "import asyncio,market_comps_seed as s; asyncio.run(s.seed(db))"`.
Cada ancla = precio_m2_prom observado de anuncios reales de la colonia (capa 0 "mercado" en market_estimate_engine).
Estas anclas además calibran el modelo AVM (venta = 0.900·suelo_cat + 105.5·calidad + 53541 · error ~14%).
Cuando lleguen más comps (o el detalle por anuncio para la prima nueva-vs-usada por zona), ampliar esta lista.
"""
import re

# (nombre, precio_m2_prom MXN, n_anuncios, n_presale)
ANCHORS = [
    ("Roma Norte", 86072, 252, 3), ("Condesa", 78241, 137, 2), ("Roma Sur", 70774, 213, 12),
    ("Juarez", 87500, 252, 13), ("Hipodromo Condesa", 87500, 123, 4), ("Centro", 69000, 217, 16),
    ("Santa Maria La Ribera", 58000, 164, 13), ("San Rafael", 66667, 188, 11), ("Doctores", 51203, 76, 2),
    ("Guerrero", 47894, 67, 0), ("Narvarte Poniente", 56619, 252, 1), ("Del Valle", 56667, 252, 2),
    ("Portales Norte", 55757, 137, 5), ("Mixcoac", 59068, 56, 1), ("Polanco", 88384, 252, 0),
    ("Lomas de Chapultepec", 70886, 252, 4), ("Anzures", 64880, 195, 4), ("Escandon", 67376, 153, 11),
    ("San Miguel Chapultepec", 64580, 53, 0), ("San Angel", 61952, 12, 0), ("Altavista", 58424, 26, 0),
    ("Santa Fe", 48868, 31, 0), ("Del Carmen", 67600, 113, 0), ("Pedregal de Carrasco", 50806, 230, 0),
]


async def seed(db):
    """Mapea cada ancla a su colonia IECM (por nombre + mejor match catastral) → upsert en db.market_comps."""
    from pymongo import UpdateOne
    ops = []
    for name, mm2, n, presale in ANCHORS:
        best_id, best_cat = None, -1.0
        async for col in db.colonias.find(
                {"name": {"$regex": re.escape(name), "$options": "i"}, "geometry": {"$exists": True}},
                {"_id": 0, "id": 1}):
            v = await db.colonia_catastro_byid.find_one({"colonia_id": col["id"]}, {"_id": 0, "valor_suelo_m2": 1})
            cat = (v or {}).get("valor_suelo_m2") or 0
            if cat > best_cat:
                best_cat, best_id = cat, col["id"]
        if best_id:
            ops.append(UpdateOne({"colonia_id": best_id},
                                 {"$set": {"colonia_id": best_id, "market_m2": mm2, "n": n,
                                           "presale_n": presale, "source": "monopolio_sample_2026-06"}},
                                 upsert=True))
    if ops:
        await db.market_comps.bulk_write(ops, ordered=False)
    return {"anclas": len(ops)}
