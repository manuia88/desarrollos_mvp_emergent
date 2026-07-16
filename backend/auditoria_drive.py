"""AUDITORÍA DEL DRIVE — todo lo del Drive es auditable: COMPLETO **y** CORRECTO.

Orden founder (07-16): "no solo debe estar completo, debe ser correcto". El censo (capa 6)
ya verifica los números por unidad (precio, m², forma de pago) re-leyendo la fuente. La
cobertura (capa 7) mide completitud. Este auditor cierra el círculo a NIVEL DESARROLLO y
por DIMENSIÓN visible: dirección, entrega, cuotas, características, planos-visibles, renders.

Correctitud = el valor en la plataforma COINCIDE con la fuente (fuente_maestro por unidad,
auto-contenido). Cuando dos fuentes del Drive se contradicen (lista≠maestro), NO es error
del catálogo: se registra como discrepancia_fuentes (la lista manda, regla founder) y va
como pregunta a CLASS. Puro salvo la lectura Mongo. $0.
"""
from __future__ import annotations

import re
from typing import Any, Dict, Optional


def _num(v) -> Optional[float]:
    if v in (None, ""):
        return None
    try:
        return float(str(v).replace(",", "").split()[0])
    except (ValueError, IndexError):
        return None


def _tokens_calle(dir_: str) -> set:
    """Palabras significativas de una calle (sin ruido: Av/Calle/Col/No/prefijos)."""
    ruido = {"AV", "AVE", "AVENIDA", "CALLE", "C", "COL", "COLONIA", "NO", "NUM",
             "NUMERO", "EXT", "INT", "DR", "BLVD", "CP", "MZ", "LT", "DE", "LA",
             "LOS", "EL", "Y", "SAN", "STA"}
    t = re.sub(r"[.,]", " ", (dir_ or "").upper())
    return {w for w in t.split() if w and w not in ruido and len(w) > 1}


def direccion_coincide(plataforma: Optional[str], fuente: Optional[str]) -> bool:
    """Misma dirección aunque esté escrita distinto: comparten el número de calle Y
    ≥1 palabra fuerte de la calle. 'C. Dr. Enrique González 159' ≡ 'DR. ENRIQUE
    GÓNZALEZ 159'. Números distintos O cero calle en común = NO coincide (Zereniti)."""
    if not plataforma or not fuente:
        return not fuente          # sin fuente que cotejar = no es error
    n_plat = set(re.findall(r"\b\d{1,4}\b", plataforma))
    n_src = set(re.findall(r"\b\d{1,4}\b", fuente))
    num_ok = bool(n_plat & n_src)
    calle_ok = len(_tokens_calle(plataforma) & _tokens_calle(fuente)) >= 1
    return num_ok and calle_ok


def _moda(vals) -> Optional[Any]:
    from collections import Counter
    c = Counter(v for v in vals if v not in (None, "", 0, "0", "None"))
    return c.most_common(1)[0][0] if c else None


async def auditar_dev(db, development_id: str) -> Dict[str, Any]:
    """Reporte por dimensión: {dimension: {estado, detalle}}. estado ∈
    correcto / incompleto / discrepancia_fuentes."""
    dev = await db.developments.find_one({"id": development_id}, {"_id": 0}) or {}
    units = await db.units.find({"development_id": development_id}, {"_id": 0}).to_list(3000)
    fms = [u["fuente_maestro"] for u in units if u.get("fuente_maestro")]
    dims: Dict[str, Any] = {}

    # DIRECCIÓN
    m_dir = _moda([f.get("DOMICILIO DE UBICACIÓN") for f in fms])
    if not dev.get("address"):
        dims["direccion"] = {"estado": "incompleto"}
    elif m_dir and not direccion_coincide(dev["address"], m_dir):
        dims["direccion"] = {"estado": "discrepancia_fuentes",
                             "plataforma": dev["address"], "maestro": m_dir}
    else:
        dims["direccion"] = {"estado": "correcto"}

    # ENTREGA
    m_ent = _moda([str(f.get("FECHA DE ENTREGA"))[:7] for f in fms])
    if m_ent and m_ent != "None":
        ok = dev.get("delivery_estimate") and str(dev["delivery_estimate"])[:7] == m_ent
        dims["entrega"] = {"estado": "correcto" if ok else "incompleto"}

    # CUOTAS (0 = no aplica, no es hueco)
    for llave, campo_dev, col in (("fondo", "fondo_mantenimiento_mxn", "FONDO DE MANTENIMIENTO ANTICIPADO"),
                                  ("cuota_equipamiento", "cuota_equipamiento_mxn", "CUOTA DE EQUIPAMIENTO AMENIDADES")):
        m = _num(_moda([f.get(col) for f in fms]))
        if m:
            plat = dev.get(campo_dev)
            nota = dev.get(campo_dev.replace("_mxn", "_nota"))
            ok = (plat is not None and abs(plat - m) < 1) or bool(nota)
            dims[llave] = {"estado": "correcto" if ok else "incompleto"}

    # CARACTERÍSTICAS: la unidad se cargó de la LISTA (parking/rec/baños); si el
    # MAESTRO discrepa NO es error del catálogo — la lista manda (regla founder), se
    # documenta como discrepancia_fuentes. Sólo sería 'incorrecto' si contradijera la
    # lista, y eso lo caza el censo (capa 6) que re-lee la lista.
    discrep = []
    for u in units:
        fm = u.get("fuente_maestro") or {}
        for campo_u, col, etq in (("bedrooms", "RECAMARAS", "recámaras"),
                                  ("bathrooms", "BAÑOS", "baños"),
                                  ("parking_spots", "ESTACIONAMIENTOS", "estacionamientos")):
            mv = _num(fm.get(col))
            if mv is not None and u.get(campo_u) is not None and abs(u[campo_u] - mv) > 0.01:
                discrep.append(f"{u.get('unit_number')} {etq}: lista={u[campo_u]} vs maestro={mv}")
    dims["caracteristicas"] = ({"estado": "discrepancia_fuentes",
                                "n": len(discrep), "ejemplos": discrep[:8]}
                               if discrep else {"estado": "correcto"})

    # PLANOS VISIBLES (imagen que carga, no PDF)
    con = [u for u in units if u.get("plano_url")]
    img = [u for u in con if re.search(r"\.(png|jpg|jpeg|webp)$", u["plano_url"])]
    dims["planos_visibles"] = {"estado": "correcto" if con and len(img) == len(con)
                               else ("incompleto" if con else "sin_plano"),
                               "imagen": len(img), "total": len(con)}

    # RENDERS / GALERÍA
    rend = await db.dev_assets.count_documents(
        {"development_id": development_id, "asset_type": {"$in": ["foto_galeria", "foto_hero"]}})
    dims["renders"] = {"estado": "correcto" if rend >= 1 else "sin_renders", "n": rend}

    # PRECIOS y FORMA DE PAGO: los verifica el censo (capa 6) re-leyendo la lista.
    # Devs de FICHA (sin lista VP) no tienen censo pero pasaron por el juez visual.
    cen = await db.censo_verificacion.find_one({"development_id": development_id},
                                               {"_id": 0, "pct": 1, "discrepa": 1})
    if cen:
        dims["precios_y_pago"] = {"estado": "correcto" if cen.get("discrepa", 1) == 0
                                  else "revisar", "censo_pct": cen.get("pct")}
    elif dev.get("juez_gate"):
        dims["precios_y_pago"] = {"estado": "correcto", "via": "juez visual (ficha)"}
    else:
        dims["precios_y_pago"] = {"estado": "sin_verificar"}

    problemas = [k for k, v in dims.items()
                 if v.get("estado") in ("incompleto", "incorrecto", "revisar",
                                        "sin_verificar")]
    discrepancias = [k for k, v in dims.items() if v.get("estado") == "discrepancia_fuentes"]
    from datetime import datetime, timezone
    reporte = {"development_id": development_id, "nombre": dev.get("name"),
               "dimensiones": dims, "problemas": problemas,
               "discrepancias_fuentes": discrepancias,
               "auditable_ok": not problemas,
               "ts": datetime.now(timezone.utc).isoformat()}
    await db.auditoria_drive.update_one({"development_id": development_id},
                                        {"$set": reporte}, upsert=True)
    return reporte


async def auditar_todos(db) -> Dict[str, Any]:
    devs = await db.units.distinct("development_id")
    reportes = [await auditar_dev(db, d) for d in devs]   # auditar_dev ya persiste
    con_problema = [r for r in reportes if r["problemas"]]
    con_discrep = [r for r in reportes if r["discrepancias_fuentes"]]
    return {"devs": len(reportes),
            "todos_ok": sum(1 for r in reportes if r["auditable_ok"]),
            "con_problema": [(r["nombre"], r["problemas"]) for r in con_problema],
            "discrepancias_fuentes": [(r["nombre"], r["discrepancias_fuentes"]) for r in con_discrep]}
