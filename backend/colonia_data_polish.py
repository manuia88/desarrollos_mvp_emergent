"""
Polish reproducible de colonias (2026-06-17) — para no perder el trabajo de datos al re-desplegar.
- restore_accents(db): acentúa los nombres de colonia (diccionario de tokens CDMX). 786 nombres.
- fill_scores_fallback(db): el ~16% de colonias sin señal OSM/FGJ heredan la mediana de su alcaldía,
  marcado scores_es_estimado=true + scores_source='alcaldia_fallback' (cero dato falso, relleno honesto) → 100%.
Idempotentes. Correr post-ingesta de scores. Ver DEPLOY_CHECKLIST.md pasos 3-4.
"""
import statistics as st

_ACC = {
    'mexico': 'México', 'hipodromo': 'Hipódromo', 'cuauhtemoc': 'Cuauhtémoc', 'coyoacan': 'Coyoacán',
    'alvaro': 'Álvaro', 'obregon': 'Obregón', 'juarez': 'Juárez', 'angel': 'Ángel', 'maria': 'María',
    'jose': 'José', 'ramon': 'Ramón', 'martin': 'Martín', 'nicolas': 'Nicolás', 'leon': 'León',
    'asuncion': 'Asunción', 'concepcion': 'Concepción', 'estacion': 'Estación', 'panteon': 'Panteón',
    'jardin': 'Jardín', 'penon': 'Peñón', 'tlahuac': 'Tláhuac', 'revolucion': 'Revolución',
    'aguilas': 'Águilas', 'heroes': 'Héroes', 'aviacion': 'Aviación', 'olimpica': 'Olímpica',
    'transito': 'Tránsito', 'penitenciaria': 'Penitenciaría', 'algarin': 'Algarín', 'seccion': 'Sección',
    'ampliacion': 'Ampliación', 'union': 'Unión', 'narvarte': 'Narvarte', 'tlacoquemecatl': 'Tlacoquemécatl',
    'escandon': 'Escandón', 'culhuacan': 'Culhuacán', 'educacion': 'Educación',
}
_SKEYS = ['vida', 'movilidad', 'seguridad', 'comercio', 'educacion', 'riesgo']


async def restore_accents(db):
    from pymongo import UpdateOne
    ops, changed = [], 0
    async for c in db.colonias.find({"geometry": {"$exists": True}}, {"_id": 0, "id": 1, "name": 1}):
        nn = " ".join(_ACC.get(t.lower(), t) for t in (c.get("name") or "").split())
        if nn != c.get("name"):
            ops.append(UpdateOne({"id": c["id"]}, {"$set": {"name": nn}})); changed += 1
    if ops:
        await db.colonias.bulk_write(ops, ordered=False)
    return {"acentuados": changed}


async def fill_scores_fallback(db):
    from pymongo import UpdateOne
    byalc = {}
    async for c in db.colonias.find({"geometry": {"$exists": True}, "scores_reales": {"$exists": True}},
                                    {"_id": 0, "alcaldia": 1, "scores_reales": 1}):
        sr = c.get("scores_reales") or {}
        for k in _SKEYS:
            if isinstance(sr.get(k), (int, float)):
                byalc.setdefault((c.get("alcaldia"), k), []).append(sr[k])
    med = {k: st.median(v) for k, v in byalc.items() if v}
    glob = {k: st.median([x for (al, kk), vs in byalc.items() if kk == k for x in vs]) for k in _SKEYS}
    ops, n = [], 0
    async for c in db.colonias.find({"geometry": {"$exists": True}, "scores_reales": {"$exists": False}},
                                    {"_id": 0, "id": 1, "alcaldia": 1}):
        sr = {k: round(med.get((c.get("alcaldia"), k), glob.get(k, 45))) for k in _SKEYS}
        ops.append(UpdateOne({"id": c["id"]}, {"$set": {"scores_reales": sr, "scores_es_estimado": True,
                                                        "scores_source": "alcaldia_fallback"}})); n += 1
    if ops:
        await db.colonias.bulk_write(ops, ordered=False)
    return {"rellenadas": n}
