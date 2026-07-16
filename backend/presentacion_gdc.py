"""PRESENTACIÓN GDC — cierra las dimensiones que la lista no trae (07-16).

La lista de precios de GDC da la unidad; el resto del expediente vive en la PRESENTACIÓN
(imagen: renders, amenidades, características, entrega, track record de la desarrolladora)
y en las PLANTAS (una lámina por nivel). Este módulo:

  1· guarda datos de desarrollo leídos de la presentación (amenidades, características,
     acabados, entrega, precio-desde, POIs, track record GDC) + DOCUMENTA discrepancias
     contra la lista (doctrina: la lista manda, la pelea se documenta, no es error).
  2· extrae los RENDERS embebidos de la presentación → dev_assets (foto_galeria/hero)
     → prende la dimensión 'renders' de la auditoría (capa 8).
  3· ingiere las PLANTAS por nivel → PNG visible + cada unidad recibe la planta de su
     piso (unit.plano_url) → prende 'planos_visibles'. El recorte por unidad (una lámina
     por depto) queda como refinamiento anotado en plano_recorte_pendiente.

$0 (poppler local: pdfimages + pdftoppm). Los datos visuales se leen EN SESIÓN y se pasan
en `datos` — este módulo NO llama IA. Helpers puros testeables.
"""
from __future__ import annotations

import pathlib
import re
import subprocess
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


# ─── helpers puros (testeables) ───────────────────────────────────────────────
def nivel_de_pagina(texto_pagina: str) -> Optional[int]:
    """'Nivel 4' / 'Nivel 1 - PA' → 4 / 1. Portada u hoja sin nivel → None."""
    m = re.search(r"\bNIVEL\s+(\d{1,2})\b", (texto_pagina or "").upper())
    return int(m.group(1)) if m else None


def nivel_de_unidad(unit_number: str, level: Any = None) -> Optional[int]:
    """Nivel de una unidad: el campo `level` si viene; si no, los dígitos de piso del
    número ('402'→4, '1201'→12, 'PH-2'→None)."""
    if level not in (None, ""):
        try:
            return int(float(level))
        except (TypeError, ValueError):
            pass
    n = re.sub(r"[^\d]", "", str(unit_number or ""))
    if len(n) >= 3:                      # '402'→'4', '1201'→'12'
        return int(n[:-2])
    return None


def discrepancias_presentacion(datos: Dict[str, Any], lista: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Pelea presentación × lista (la lista manda). Devuelve hallazgos DOCUMENTADOS."""
    out: List[Dict[str, Any]] = []
    tp = datos.get("total_units_presentacion")
    tl = lista.get("total_units_lista")
    if tp and tl and abs(tp - tl) > 0:
        out.append({"campo": "total_units", "presentacion": tp, "lista": tl,
                    "resolucion": "lista", "nota": f"la presentación anuncia {tp}; la "
                    f"lista tiene {tl} unidades (la lista es el inventario real)"})
    ep = (datos.get("estatus_presentacion") or "").lower()
    el = (lista.get("estatus_carpeta") or "").lower()
    if ep and el and ep != el:
        out.append({"campo": "estatus", "presentacion": ep, "carpeta": el,
                    "resolucion": "verificar_carpeta",
                    "nota": f"portada dice '{ep}', la carpeta padre dice '{el}'"})
    return out


# ─── 1· datos de desarrollo desde la presentación ─────────────────────────────
async def guardar_datos_desarrollo(db, dev_id: str, datos: Dict[str, Any]) -> Dict[str, Any]:
    """`datos` (leídos EN SESIÓN de la presentación): amenidades[], caracteristicas[],
    acabados, entrega, precio_desde, pois[], total_units_presentacion, estatus_presentacion,
    desarrolladora{años,desarrollos,plusvalia_comparables[]}."""
    from amenidades_canon import canonizar_lista
    set_dev: Dict[str, Any] = {}
    if datos.get("caracteristicas"):
        set_dev["caracteristicas_unidad"] = datos["caracteristicas"]
    if datos.get("acabados"):
        set_dev["acabados_entrega"] = datos["acabados"]
    if datos.get("entrega"):
        set_dev["fecha_entrega"] = datos["entrega"]
    if datos.get("precio_desde"):
        set_dev["precio_desde_mxn"] = datos["precio_desde"]
    if datos.get("pois"):
        set_dev["puntos_de_interes"] = datos["pois"]
    if datos.get("total_units_presentacion"):
        set_dev["total_units_presentacion"] = datos["total_units_presentacion"]
    if datos.get("direccion_completa"):
        set_dev["address_full"] = datos["direccion_completa"]
    if set_dev:
        await db.developments.update_one({"id": dev_id}, {"$set": set_dev})
    # amenidades → colección canónica (la comparte todo el marketplace)
    if datos.get("amenidades"):
        await db.project_amenities.update_one(
            {"project_id": dev_id},
            {"$set": {"project_id": dev_id, "amenities": canonizar_lista(datos["amenidades"]),
                      "fuente": "presentacion_gdc"}}, upsert=True)
    # track record de la desarrolladora → dev_orgs (perfil GDC, no por proyecto)
    dr = datos.get("desarrolladora")
    if dr:
        await db.dev_orgs.update_one(
            {"tenant_id": "org_gdc"},
            {"$set": {"track_record": {k: dr[k] for k in
                      ("anios", "desarrollos_entregados", "plusvalia_comparables", "presencia")
                      if k in dr}, "track_record_fuente": "presentacion_gdc"}}, upsert=True)
    # discrepancias documentadas (no error)
    lista = {"total_units_lista": await db.units.count_documents({"development_id": dev_id}),
             "estatus_carpeta": (await db.developments.find_one(
                 {"id": dev_id}, {"_id": 0, "etapa_comercial": 1}) or {}).get("etapa_comercial")}
    disc = discrepancias_presentacion(datos, lista)
    if disc:
        await db.discrepancias_fuentes.update_one(
            {"development_id": dev_id, "tipo": "presentacion_vs_lista"},
            {"$set": {"development_id": dev_id, "tipo": "presentacion_vs_lista",
                      "hallazgos": disc, "ts": datetime.now(timezone.utc).isoformat()}},
            upsert=True)
    return {"campos_dev": list(set_dev.keys()),
            "amenidades": len(datos.get("amenidades") or []),
            "discrepancias": disc}


# ─── 2· renders embebidos de la presentación → galería ────────────────────────
def _extraer_imagenes(pdf_path: str, dest: pathlib.Path,
                      min_w: int = 700, min_h: int = 450) -> List[pathlib.Path]:
    """pdfimages saca los rasters embebidos; nos quedamos con los GRANDES (renders), no
    logos/iconos. Devuelve rutas PNG deduplicadas por tamaño de archivo."""
    dest.mkdir(parents=True, exist_ok=True)
    pref = dest / "img"
    try:
        subprocess.run(["pdfimages", "-png", pdf_path, str(pref)],
                       capture_output=True, timeout=120, check=True)
    except Exception:  # noqa: BLE001
        return []
    from PIL import Image
    vistas, out = set(), []
    for p in sorted(dest.glob("img-*.png")):
        try:
            with Image.open(p) as im:
                w, h = im.size
            if w < min_w or h < min_h:
                p.unlink(missing_ok=True)
                continue
            k = p.stat().st_size
            if k in vistas:                 # misma imagen repetida entre láminas
                p.unlink(missing_ok=True)
                continue
            vistas.add(k)
            out.append(p)
        except Exception:  # noqa: BLE001
            p.unlink(missing_ok=True)
    return out


async def ingerir_renders(db, dev_id: str, pres_pdf_path: str,
                          maximo: int = 14) -> Dict[str, Any]:
    """Renders grandes de la presentación → dev_assets (1 hero + resto galería)."""
    import secrets

    from dev_assets import ASSET_UPLOAD_DIR
    updir = pathlib.Path(ASSET_UPLOAD_DIR)
    ya = await db.dev_assets.count_documents(
        {"development_id": dev_id, "asset_type": {"$in": ["foto_galeria", "foto_hero"]},
         "source": "presentacion_gdc"})
    if ya:
        return {"renders": ya, "estado": "ya_estaban"}
    tmp = updir / f"_gdc_extract_{secrets.token_urlsafe(4)}"
    imgs = _extraer_imagenes(pres_pdf_path, tmp)
    n = 0
    for i, src in enumerate(imgs[:maximo]):
        aid = f"ast_{secrets.token_urlsafe(8)}"
        destino = updir / f"{aid}.png"
        src.replace(destino)
        await db.dev_assets.insert_one({
            "id": aid, "development_id": dev_id,
            "asset_type": "foto_hero" if i == 0 else "foto_galeria",
            "mime_type": "image/png", "filename": f"render_{i+1}.png",
            "storage_path": str(destino), "order_index": i,
            "source": "presentacion_gdc"})
        n += 1
    try:
        for resto in tmp.glob("*"):
            resto.unlink(missing_ok=True)
        tmp.rmdir()
    except Exception:  # noqa: BLE001
        pass
    return {"renders": n, "estado": "ingeridos"}


# ─── 3· plantas por nivel → visibles + por unidad ─────────────────────────────
async def ingerir_plantas(db, dev_id: str, planta_pdf_path: str,
                          nivel_por_pagina: bool = False) -> Dict[str, Any]:
    """Cada página 'Nivel N' → PNG (plano_nivel) y cada unidad de ese piso recibe la
    lámina como plano_url (VISIBLE). El recorte a un solo depto queda pendiente y anotado.

    `nivel_por_pagina`: para plantas SOLO-IMAGEN (el 'Nivel N' está rasterizado y no se
    extrae como texto, p.ej. Via Insurgentes) el nivel = número de página (pág 2 = Nivel 2,
    confirmado por los números de unidad de cada lámina). La pág 1 (portada) se ignora."""
    import io  # noqa: F401
    import secrets

    import pdfplumber

    from dev_assets import ASSET_UPLOAD_DIR
    updir = pathlib.Path(ASSET_UPLOAD_DIR)
    if not pathlib.Path(planta_pdf_path).exists():
        return {"estado": "sin_archivo"}
    # nivel → PNG (una vez por nivel)
    with pdfplumber.open(planta_pdf_path) as pdf:
        textos = [(i + 1, p.extract_text() or "") for i, p in enumerate(pdf.pages)]
    nivel_png: Dict[int, str] = {}
    for pagina, texto in textos:
        niv = pagina if (nivel_por_pagina and pagina >= 2) else nivel_de_pagina(texto)
        if niv is None or niv in nivel_png:
            continue
        aid = f"ast_{secrets.token_urlsafe(8)}"
        destino = updir / f"{aid}.png"
        try:
            subprocess.run(
                ["pdftoppm", "-png", "-singlefile", "-r", "120",
                 "-f", str(pagina), "-l", str(pagina), planta_pdf_path,
                 str(updir / aid)],
                capture_output=True, timeout=90, check=True)
        except Exception:  # noqa: BLE001
            continue
        if not destino.exists():
            continue
        url = f"/api/assets-static/{destino.name}"
        await db.dev_assets.insert_one({
            "id": aid, "development_id": dev_id, "asset_type": "plano_nivel",
            "mime_type": "image/png", "filename": f"planta_nivel_{niv}.png",
            "storage_path": str(destino), "nivel": niv, "source": "plantas_gdc"})
        nivel_png[niv] = url
    # cada unidad recibe la planta de su nivel
    n_u = sin_nivel = 0
    async for u in db.units.find({"development_id": dev_id},
                                 {"_id": 0, "id": 1, "unit_number": 1, "level": 1}):
        niv = nivel_de_unidad(u.get("unit_number"), u.get("level"))
        url = nivel_png.get(niv) if niv is not None else None
        if url:
            await db.units.update_one(
                {"id": u["id"]},
                {"$set": {"plano_url": url, "plano_nivel": niv,
                          "plano_recorte_pendiente": True}})   # refinamiento: recorte por depto
            n_u += 1
        else:
            sin_nivel += 1
    return {"niveles": len(nivel_png), "unidades_con_plano": n_u,
            "unidades_sin_nivel": sin_nivel, "estado": "ingeridas"}
