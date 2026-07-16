"""EL MASIVO DE GDC — orquestador LOCAL (lee las carpetas extraídas del ZIP, $0, sin Drive).

Recorre las carpetas de estatus (ENTREGA INMEDIATA / PREVENTA), filtra CDMX-residencial y
carga cada proyecto con TODO lo automatizable. Integra los aprendizajes (07-16):
  · la CARPETA de estatus manda (no la presentación).
  · solo carga proyectos con ≥1 unidad DISPONIBLE (los sold-out no entran) [founder].
  · 'Monterrey'/'Medellín' son calles de la Roma (CDMX) — no excluir por ciudad ambigua.
  · planos por-depto (deptos.pdf) preferidos; si no, por-nivel (plantas.pdf, imagen-only
    → por número de página).
  · bodegas a colección propia; renders desde archivos; estatus por carpeta.

Las amenidades/características (presentación IMAGEN) = pasada visual aparte (sin crédito API).
"""
from __future__ import annotations

import os
import pathlib
from typing import Any, Dict, List, Optional

_IMG = (".jpg", ".jpeg", ".png", ".webp")


def _walk_local(root: str) -> List[Dict[str, Any]]:
    """Aplana el árbol local (archivo con su carpeta contenedora en MAYÚSCULAS y su ruta)."""
    out: List[Dict[str, Any]] = []
    for dirpath, _dirs, files in os.walk(root):
        carpeta = os.path.basename(dirpath).upper()
        for name in files:
            if name.startswith("."):
                continue
            out.append({"name": name, "carpeta": carpeta,
                        "path": os.path.join(dirpath, name)})
    return out


def clasificar_archivos(files: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    """Reparte los archivos del proyecto por rol (heurística por nombre + carpeta)."""
    def es(f, *subs):
        n = f["name"].upper()
        return any(s in n for s in subs)

    pdf = [f for f in files if f["name"].upper().endswith(".PDF")]
    lp = [f for f in pdf if ("_LP" in f["name"].upper() or "LISTA DE PRECIOS" in f["carpeta"])
          and "BODEGA" not in f["name"].upper()]
    bodegas = [f for f in pdf if es(f, "BODEGA")]
    deptos = [f for f in pdf if es(f, "DEPTO")]
    plantas = [f for f in pdf if es(f, "PLANTA") and not es(f, "DEPTO")]
    pres = [f for f in pdf
            if (es(f, "PRESENTAC", "PREVENTA", "ENTREGA INMEDIATA", "LANZAMIENTO", "INVIERTE")
                or "PRESENTAC" in f["carpeta"])
            and "BODEGA" not in f["name"].upper() and "_LP" not in f["name"].upper()
            and not es(f, "PLANTA", "DEPTO")]
    renders = [f for f in files if f["name"].lower().endswith(_IMG)
               and any(k in f["carpeta"] for k in ("RENDER", "VISTA", "FOTO"))
               and not es(f, "CUENTA", "LOGO")]
    return {"lp": lp, "bodegas": bodegas, "deptos": deptos, "plantas": plantas,
            "presentacion": pres, "renders": renders}


def tiene_disponible(unidades: List[Dict[str, Any]]) -> bool:
    """¿El proyecto tiene al menos una unidad disponible? (los sold-out no se cargan)."""
    return any((u.get("status") == "disponible") or (u.get("price_mxn") and
               u.get("status") not in ("vendido", "reservado")) for u in unidades)


async def procesar_proyecto_local(db, root_dir: str, folder_name: str,
                                  status: str) -> Dict[str, Any]:
    """Carga TODO lo automatizable de un proyecto desde su carpeta local."""
    from extractores_layout import extraer_gdc
    from masivo_gdc import (cargar_bodegas_gdc, cargar_proyecto_gdc,
                            es_cdmx_residencial, nombre_y_direccion)
    from presentacion_gdc import (ingerir_deptos, ingerir_plantas,
                                  ingerir_renders_archivos, nivel_de_pagina)

    nombre, direccion = nombre_y_direccion(folder_name)
    if not es_cdmx_residencial(nombre, direccion):
        return {"proyecto": folder_name, "estado": "fuera_cdmx_o_oficina"}
    cats = clasificar_archivos(_walk_local(root_dir))
    if not cats["lp"]:
        return {"proyecto": folder_name, "estado": "sin_lista_precios"}
    r = extraer_gdc(pathlib.Path(cats["lp"][0]["path"]).read_bytes())
    if not r["unidades"]:
        return {"proyecto": folder_name, "estado": "lista_ilegible"}
    if not tiene_disponible(r["unidades"]):
        return {"proyecto": folder_name, "estado": "sold_out",
                "unidades": len(r["unidades"])}
    lp_bytes = pathlib.Path(cats["lp"][0]["path"]).read_bytes()
    res = await cargar_proyecto_gdc(db, {
        "folder_name": folder_name, "carpeta_padre": status,
        "unidades": r["unidades"], "campos_derivados": r["campos_derivados"],
        "columnas_no_mapeadas": r["columnas_no_mapeadas"], "presentacion": {},
        "origen": "masivo_gdc_run", "fuentes_pdf": [lp_bytes],
        "fuentes_meta": [{"archivo": cats["lp"][0]["name"]}]})
    dev_id = res["dev_id"]
    out = {"proyecto": nombre, "dev_id": dev_id, "estatus": status,
           "unidades": res["unidades_despues"], "juez": (res.get("juez") or {}).get("pct")}
    if cats["bodegas"]:
        rb = await cargar_bodegas_gdc(db, dev_id,
                                      pathlib.Path(cats["bodegas"][0]["path"]).read_bytes(),
                                      cats["bodegas"][0]["name"])
        out["bodegas"] = rb.get("bodegas")
    if cats["deptos"]:
        rd = await ingerir_deptos(db, dev_id, cats["deptos"][0]["path"])
        out["planos"] = f"depto:{rd.get('unidades_con_plano')}"
    if cats["plantas"] and "planos" not in out:
        import pdfplumber
        with pdfplumber.open(cats["plantas"][0]["path"]) as pdf:
            hay_texto = any(nivel_de_pagina(p.extract_text() or "") for p in pdf.pages)
        rp = await ingerir_plantas(db, dev_id, cats["plantas"][0]["path"],
                                   nivel_por_pagina=not hay_texto)
        out["planos"] = f"nivel:{rp.get('unidades_con_plano')}"
    if cats["renders"]:
        rutas = [f["path"] for f in cats["renders"][:20]]
        rr = await ingerir_renders_archivos(db, dev_id, rutas, maximo=20)
        out["renders"] = rr.get("renders")
    try:
        from auditoria_drive import auditar_dev
        au = await auditar_dev(db, dev_id)
        out["dims_ok"] = sum(1 for v in au["dimensiones"].values()
                             if v.get("estado") == "correcto")
    except Exception:  # noqa: BLE001
        pass
    return out


async def correr_masivo_local(db, base_dir: str,
                              estatus: Optional[List[str]] = None) -> List[Dict[str, Any]]:
    """Recorre las carpetas de estatus y procesa cada proyecto. base_dir = '.../CLIENTES
    EXTERNOS'. estatus = subcarpetas a cargar (default: entrega inmediata + preventa)."""
    mapa = {"ENTREGA INMEDIATA": "entrega inmediata", "PREVENTA": "preventa"}
    if estatus:
        mapa = {k: v for k, v in mapa.items() if v in estatus}
    resultados: List[Dict[str, Any]] = []
    for carpeta_st, st in mapa.items():
        d = os.path.join(base_dir, carpeta_st)
        if not os.path.isdir(d):
            continue
        for proyecto in sorted(os.listdir(d)):
            pdir = os.path.join(d, proyecto)
            if not os.path.isdir(pdir):
                continue
            try:
                resultados.append(await procesar_proyecto_local(db, pdir, proyecto, st))
            except Exception as e:  # noqa: BLE001
                resultados.append({"proyecto": proyecto, "estado": f"ERROR: {type(e).__name__}: {e}"})
    return resultados
