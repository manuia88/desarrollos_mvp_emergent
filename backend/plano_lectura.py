"""LECTURA DEL PLANO — extrae el área impresa del plano para el COTEJO (2ª fuente).

El cotejo mostraba "0 datos verificados por 2+ fuentes" porque tenía el m² de la LISTA
pero nunca leía el del PLANO (founder 07-16). Los planos CLASS imprimen su superficie
("ÁREA HABITABLE 60.22 m²"). Aquí se lee — de forma CONSERVADORA:

  · se extraen todos los números plausibles de m² del texto del plano,
  · SOLO se toma como "área del plano" el que COINCIDE con el m² de la lista (±5%).

Así una lectura sucia (texto revuelto, "RECAMARA×30") jamás inventa una contradicción:
si el plano no contiene un número que confirme la lista, el molde queda 1-fuente
(honesto). Cuando sí lo contiene, es verificación real: dos documentos independientes
(arquitecto vs ventas) dicen el mismo número. Puro/testeable; el I/O vive en el driver.
"""
from __future__ import annotations

import re
from typing import List, Optional

TOL_PCT = 0.05


def numeros_plausibles_m2(texto: str) -> List[float]:
    """Decimales del texto del plano que podrían ser m² de un depto (20–600, 2 dec)."""
    out = []
    for tok in re.findall(r"\d{2,3}\.\d{1,2}", texto or ""):
        try:
            v = float(tok)
            if 20.0 <= v <= 600.0:
                out.append(round(v, 2))
        except ValueError:
            pass
    return out


def area_que_confirma(areas: List[float], m2_lista: Optional[float],
                      tol_pct: float = TOL_PCT) -> Optional[float]:
    """El número del plano MÁS cercano al m² de la lista, si cae dentro de ±tol.
    None = el plano no confirma (queda 1-fuente, sin falsa contradicción)."""
    if not m2_lista or not areas:
        return None
    tol = abs(m2_lista) * tol_pct
    candidatos = [a for a in areas if abs(a - m2_lista) <= tol]
    return min(candidatos, key=lambda a: abs(a - m2_lista)) if candidatos else None


def leer_area_plano(texto_plano: str, m2_lista: Optional[float]) -> Optional[float]:
    """Área del plano que confirma la lista (o None). La función que usa el driver."""
    return area_que_confirma(numeros_plausibles_m2(texto_plano), m2_lista)


async def cotejar_planos_contra_lista(db, development_id: Optional[str] = None) -> dict:
    """Lee el área impresa de cada plano y la guarda en molde_programa.area_plano_m2
    cuando confirma el m² de la lista → el cotejo la cuenta como 2ª fuente. Re-corre
    el cotejo de los devs tocados. Idempotente. development_id acota (para el alta)."""
    import pathlib

    import pdfplumber

    confirmados, revisados, sin_texto = 0, 0, 0
    devs_tocados = set()
    q = {"plano_pdf_url": {"$ne": None}}
    if development_id:
        q["development_id"] = development_id
    async for m in db.dmx_prototypes.find(
            q,
            {"_id": 0, "prototype_id": 1, "development_id": 1, "m2": 1,
             "plano_pdf_url": 1}):
        revisados += 1
        m2_lista = m.get("m2")
        if not m2_lista:
            # el m² del molde vive en sus unidades si no está en el doc
            u = await db.units.find_one({"prototype_id": m["prototype_id"]},
                                        {"_id": 0, "size_m2": 1})
            m2_lista = (u or {}).get("size_m2")
        fn = m["plano_pdf_url"].rsplit("/", 1)[-1]
        a = await db.dev_assets.find_one(
            {"storage_path": {"$regex": re.escape(fn)}}, {"_id": 0, "storage_path": 1})
        if not a or not pathlib.Path(a["storage_path"]).exists():
            continue
        try:
            with pdfplumber.open(a["storage_path"]) as pdf:
                texto = " ".join((pg.extract_text() or "") for pg in pdf.pages[:2])
        except Exception:  # noqa: BLE001
            texto = ""
        if not texto.strip():
            sin_texto += 1
            continue
        area = leer_area_plano(texto, m2_lista)
        if area is not None:
            await db.molde_programa.update_one(
                {"prototype_id": m["prototype_id"]},
                {"$set": {"prototype_id": m["prototype_id"],
                          "development_id": m["development_id"],
                          "area_plano_m2": area,
                          "area_plano_fuente": "texto del plano (confirma lista)"}},
                upsert=True)
            confirmados += 1
            devs_tocados.add(m["development_id"])
    # re-cotejar los devs que ganaron una 2ª fuente
    import cotejo_engine as ce
    for dev in devs_tocados:
        try:
            await ce.cotejar_desarrollo(db, dev)
        except Exception:  # noqa: BLE001
            pass
    return {"moldes_revisados": revisados, "confirmados_por_plano": confirmados,
            "planos_sin_texto": sin_texto, "devs_recotejados": len(devs_tocados)}
