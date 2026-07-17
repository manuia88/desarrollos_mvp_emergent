"""JUEZ VISUAL de galería a $0 (sin IA) — 07-17. Casos reales del catálogo:
flyers/lonas con texto colados como fotos, duplicados masivos del mismo render,
imágenes minúsculas y galerías sin cocina/baño (recorrido incompleto).

Reglas:
- galeria_flyer                → ALERTA · texto denso (render_quality.densidad_texto)
- galeria_duplicados           → aviso  · pares con dHash a ≤6 bits (hash_perceptual)
- galeria_resolucion           → aviso  · lado mayor < 600 px
- galeria_recorrido_incompleto → aviso  · faltan paradas mínimas del recorrido
                                 (SECUENCIA de orden_galeria) + se PIDE al dev
                                 (upsert en solicitudes_gdc / solicitudes_class)

REGLA DURA (auditoría 07-16): este juez MARCA, jamás borra — la purga de fotos
solo se hace con ojos humanos (los detectores $0 alucinan como señal de purga).
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from orden_galeria import SECUENCIA
from render_quality import ES_FLYER_MIN, densidad_texto, es_duplicado, hash_perceptual

LADO_MIN = 600        # px del lado mayor por debajo de los cuales una foto es minúscula
UMBRAL_DUP_BITS = 6   # distancia Hamming del dHash para considerar duplicado

# Paradas MÍNIMAS del recorrido (founder 07-16) → sinónimos aceptados, todos de la
# SECUENCIA canónica de orden_galeria (portada además se cubre con el asset foto_hero).
MINIMOS: Dict[str, tuple] = {
    "portada": ("portada",),
    "sala": ("sala_comedor", "sala", "comedor"),
    "cocina": ("cocina",),
    "recamara": ("recamara_principal", "recamara"),
    "bano": ("bano",),
    "fachada": ("fachada", "edificio", "aerea"),
}
assert all(c in SECUENCIA for cs in MINIMOS.values() for c in cs), \
    "MINIMOS debe ser subconjunto de la SECUENCIA del recorrido"

_HUMANO = {"portada": "portada", "sala": "sala", "cocina": "cocina",
           "recamara": "recámara", "bano": "baño", "fachada": "fachada"}

# developer_id → colección de pedidos al desarrollador. Otros orgs NO insertan
# (no hay canal de solicitudes con ellos todavía).
ORG_A_SOLICITUDES = {
    "org_gdc": "solicitudes_gdc",                  # masivo_gdc.DEVELOPER_GDC
    "org_user_b2869298f9f2": "solicitudes_class",  # masivo_class.DEVELOPER_CLASS
}

_FOTO_TYPES_RE = {"$regex": "^foto_"}  # foto_hero/render/galeria/unidad_modelo/avance


def _norm_concepto(c: Optional[str]) -> str:
    return (c or "").strip().lower().replace(" ", "_")


def _lado_mayor(path: str) -> Optional[int]:
    try:
        from PIL import Image
        with Image.open(path) as im:
            return max(im.size)
    except Exception:  # noqa: BLE001
        return None


def conceptos_faltantes(assets: List[Dict[str, Any]]) -> List[str]:
    """Qué paradas mínimas del recorrido NO tienen foto (pura, testeable)."""
    presentes = set()
    for a in assets:
        if a.get("asset_type") == "foto_hero":
            presentes.add("portada")
        c = _norm_concepto(a.get("concepto"))
        for paso, sinonimos in MINIMOS.items():
            if c in sinonimos:
                presentes.add(paso)
    return [p for p in MINIMOS if p not in presentes]


async def _upsert_solicitud(db, dev: Dict[str, Any], faltan: List[str]) -> Optional[str]:
    """Pide al desarrollador las fotos que faltan — sin duplicar: upsert por
    proyecto+tipo. Devuelve la colección usada o None (org sin canal)."""
    col = ORG_A_SOLICITUDES.get(dev.get("developer_id") or "")
    if not col or not faltan:
        return None
    nombre = dev.get("name") or dev.get("id") or "?"
    humanos = [_HUMANO.get(f, f) for f in faltan]
    detalle = (f"{nombre}: la galería no tiene foto de {', '.join(humanos)} — "
               "recorrido incompleto.")
    await db[col].update_one(
        {"tipo": "galeria_recorrido", "proyecto": nombre},
        {"$set": {"estado": "pendiente", "detalle": detalle,
                  "conceptos_faltantes": faltan, "development_id": dev.get("id")},
         "$setOnInsert": {"ts": datetime.now(timezone.utc).isoformat()}},
        upsert=True)
    return col


async def juzgar_galeria(db, development_id: str) -> List[Dict[str, Any]]:
    """Juzga la galería de UN desarrollo → hallazgos [{regla, severidad, ref,
    detalle, accion}]. Solo lectura + el upsert de la solicitud al dev."""
    dev = await db.developments.find_one(
        {"id": development_id}, {"_id": 0, "id": 1, "name": 1, "developer_id": 1})
    assets = [a async for a in db.dev_assets.find(
        {"development_id": development_id, "asset_type": _FOTO_TYPES_RE},
        {"_id": 0, "id": 1, "asset_type": 1, "filename": 1, "storage_path": 1,
         "concepto": 1})]

    hallazgos: List[Dict[str, Any]] = []
    hashes: List[tuple] = []
    for a in assets:
        p = a.get("storage_path") or ""
        if not p or not os.path.exists(p):
            continue
        # (c) minúscula — inservible en la ficha
        lado = _lado_mayor(p)
        if lado is not None and lado < LADO_MIN:
            hallazgos.append({
                "regla": "galeria_resolucion", "severidad": "aviso", "ref": a.get("id"),
                "detalle": f"{a.get('filename')}: lado mayor {lado}px (< {LADO_MIN}px)",
                "accion": "pedir al dev la versión en alta resolución"})
        # (a) flyer/lona con texto colado como foto
        dens = densidad_texto(p)
        if dens >= ES_FLYER_MIN:
            hallazgos.append({
                "regla": "galeria_flyer", "severidad": "alerta", "ref": a.get("id"),
                "detalle": (f"{a.get('filename')}: {dens:.1f} palabras/MP "
                            f"(umbral {ES_FLYER_MIN})"),
                "accion": ("revisar con ojos: parece flyer/lona — NUNCA borrar "
                           "en automático")})
        h = hash_perceptual(p)
        if h is not None:
            hashes.append((a, h))

    # (b) duplicados — pares con dHash a ≤6 bits
    for i in range(len(hashes)):
        for j in range(i + 1, len(hashes)):
            a1, h1 = hashes[i]
            a2, h2 = hashes[j]
            if es_duplicado(h1, h2, UMBRAL_DUP_BITS):
                bits = bin(h1 ^ h2).count("1")
                hallazgos.append({
                    "regla": "galeria_duplicados", "severidad": "aviso",
                    "ref": [a1.get("id"), a2.get("id")],
                    "detalle": (f"{a1.get('filename')} ≈ {a2.get('filename')} "
                                f"(dHash a {bits} bits)"),
                    "accion": "revisar con ojos y dejar solo uno"})

    # (d) recorrido incompleto — contra las paradas mínimas de la SECUENCIA
    faltan = conceptos_faltantes(assets)
    if faltan:
        humanos = [_HUMANO.get(f, f) for f in faltan]
        hallazgos.append({
            "regla": "galeria_recorrido_incompleto", "severidad": "aviso",
            "ref": development_id,
            "detalle": "faltan fotos de: " + ", ".join(humanos),
            "accion": "pedir al dev"})
        if dev:
            await _upsert_solicitud(db, dev, faltan)
    return hallazgos


async def juzgar_galerias_todos(db) -> Dict[str, Any]:
    """Recorre los developments CON assets y devuelve el resumen por dev + totales
    por regla. Solo lectura + upserts de solicitudes (jamás borra nada)."""
    dev_ids = await db.dev_assets.distinct("development_id")
    nombres: Dict[str, str] = {}
    async for d in db.developments.find(
            {"id": {"$in": list(dev_ids)}}, {"_id": 0, "id": 1, "name": 1}):
        nombres[d["id"]] = d.get("name") or d["id"]

    devs: List[Dict[str, Any]] = []
    por_regla: Dict[str, int] = {}
    for did in sorted(dev_ids):
        hallazgos = await juzgar_galeria(db, did)
        fila_reglas: Dict[str, int] = {}
        for h in hallazgos:
            fila_reglas[h["regla"]] = fila_reglas.get(h["regla"], 0) + 1
            por_regla[h["regla"]] = por_regla.get(h["regla"], 0) + 1
        devs.append({"development_id": did, "name": nombres.get(did, did),
                     "n": len(hallazgos), "por_regla": fila_reglas,
                     "hallazgos": hallazgos})
    devs.sort(key=lambda f: (-f["n"], f["name"]))
    return {"devs": devs, "n_devs": len(devs),
            "total_hallazgos": sum(f["n"] for f in devs), "por_regla": por_regla}
