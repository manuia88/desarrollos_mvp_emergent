"""EL MASIVO DE CLASS — orquestador determinista de la carga multi-proyecto.

Convierte (lista VP extraída + renglones del Maestro) en un proyecto COMPLETO del
catálogo, por el mismo riel de siempre (cargar_lote → 5 capas → juez). Todo puro y
testeable salvo cargar_proyecto() (Mongo).

Doctrina aplicada:
  · la LISTA es el inventario del día (granularidad de dinero y m²);
  · el MAESTRO complementa (recámaras/baños/estacionamientos que la lista no trae);
  · unidad solo-en-Maestro se CARGA con nota (inventario real) y queda como pregunta;
  · nada se inventa: piso PH sin número = None; discrepancias quedan escritas.
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

from identidad_unidad import norm_unidad

DEVELOPER_CLASS = "org_user_b2869298f9f2"     # la comercializadora (misma que Almina)


# ─── piso desde el número de unidad (sin inventar) ────────────────────────────
def derivar_piso(unit_number: str) -> Optional[int]:
    """'0101'→1 · '1203'→12 · 'A 203'→2 · 'G-001'→0 (PB) · 'PB-107'→0 · 'PH01'→None
    (penthouse: es el último piso pero el número no lo dice — no se inventa)."""
    s = (unit_number or "").upper()
    if "PH" in s:
        return None
    if re.search(r"\bPB\b|^PB", s.replace("-", " ")):
        return 0
    nums = re.findall(r"\d{3,4}", s.replace(" ", ""))
    if not nums:
        return None
    n = nums[-1]
    return int(n[:-2])


# ─── vocabulario: unidad VP extraída → entrada de cargar_lote ─────────────────
_MAPA_VP = {"unidad": "unit_number", "m2_habitable": "size_m2", "m2_total": "m2_total",
            "m2_balcon": "m2_balcony", "m2_patio": "patio_m2",
            "m2_roof": "m2_roof_garden", "bodegas": "bodega",
            "estacionamientos": "parking_spots", "precio": "price_mxn",
            "credito": "credito_mxn", "enganche": "enganche_mxn",
            "reservacion": "reservacion_mxn", "contrato": "contrato_mxn",
            "a_diferir": "a_diferir_mxn"}


def a_vocabulario(u_vp: Dict[str, Any], torre: str = "") -> Dict[str, Any]:
    out: Dict[str, Any] = {"status": "disponible"}
    for k, v in u_vp.items():
        if k in _MAPA_VP and v is not None:
            out[_MAPA_VP[k]] = v
    if out.get("m2_total") is not None:
        out["size_m2_total"] = out["m2_total"]   # alias que el merge también entiende
    num = str(out.get("unit_number") or "").strip()
    # multi-torre sin etiqueta en la lista → se antepone la torre (identidad estable)
    if torre and not norm_unidad(num).upper().startswith(norm_unidad(torre).upper()):
        num = f"{torre}-{num}"
    out["unit_number"] = num
    piso = derivar_piso(num)
    if piso is not None:
        out["level"] = piso
    notas = []
    if not u_vp.get("_valida_m2") or not u_vp.get("_valida_dinero"):
        notas.append("extracción sin validar del todo (m² o dinero) — cotejar con CLASS")
    if u_vp.get("_nota"):
        notas.append(str(u_vp["_nota"]))
    if notas:
        out["notas"] = " · ".join(notas)
    return out


# ─── dirección desde el encabezado de la lista VP ─────────────────────────────
def extraer_direccion(texto_pagina: str) -> Dict[str, Optional[str]]:
    m = re.search(r"DIRECCI[ÓO]N:\s*(.+)", texto_pagina or "", re.IGNORECASE)
    if not m:
        return {"address": None, "colonia": None, "alcaldia": None, "ciudad": None}
    dir_ = m.group(1).strip()
    partes = [p.strip() for p in dir_.split(",")]
    colonia = next((re.sub(r"^COL\.?\s*", "", p, flags=re.IGNORECASE)
                    for p in partes if re.match(r"^COL\.?\s", p, re.IGNORECASE)), None)
    alcaldia = None
    for i, p in enumerate(partes):
        if re.match(r"^COL\.?\s", p, re.IGNORECASE) and i + 1 < len(partes):
            alcaldia = partes[i + 1]
            break
    ciudad = ("Estado de México" if "ESTADO DE MÉXICO" in dir_.upper()
              else "Ciudad de México")
    return {"address": dir_, "colonia": colonia, "alcaldia": alcaldia, "ciudad": ciudad}


# ─── el cruce con el Maestro ──────────────────────────────────────────────────
def _sin_ceros(llave: str) -> str:
    """'0101'→'101' · 'B-0301'→'B-301' (las listas rellenan con ceros, el Maestro no)."""
    return re.sub(r"(^|-)0+(\d)", r"\1\2", llave)


def _nucleos(unidad: str, torre: str = "") -> set:
    """Llaves de identidad para el match lista↔maestro: con/sin etiqueta de torre y
    con/sin ceros a la izquierda."""
    n = norm_unidad(unidad)
    llaves = {n}
    if torre:
        t = norm_unidad(torre)
        if n.startswith(t):
            llaves.add(n[len(t):].lstrip("-"))
        else:
            llaves.add(f"{t}-{n}")
    return {v for k in llaves if k for v in (k, _sin_ceros(k))}


def sufijo_producto(producto: str) -> str:
    """El número de unidad dentro del PRODUCTO del Maestro:
    'Almina B-Unidad B - 1205'→'B - 1205' · 'Cervantes 101 - 1107'→'1107' ·
    'Dessea 1-Dessea 1 PH01'→'PH01' · 'Panorama G - unidad G001'→'G001'."""
    s = str(producto or "").strip()
    m = re.split(r"unidad", s, flags=re.IGNORECASE)
    if len(m) > 1:
        return m[-1].strip(" -–")
    # sin la palabra 'Unidad': el bloque final que parece número de unidad
    m2 = re.search(r"((?:PH|PB)[ -]?\d{0,3}[A-Z]?|[A-Z]?[ -]?\d{2,4}[A-Z]?)\s*$", s)
    return (m2.group(1) if m2 else s).strip(" -–")


def fusionar_con_maestro(unidades: List[Dict[str, Any]],
                         filas: List[Dict[str, Any]],
                         torre: str = "") -> Tuple[List[Dict[str, Any]],
                                                   List[Dict[str, Any]],
                                                   List[str]]:
    """Enriquece las unidades de la LISTA con los campos del Maestro (recámaras,
    baños, estacionamientos, amueblado…), documenta discrepancias y devuelve las
    filas del Maestro que la lista no trae (inventario real → se cargan con nota)."""
    from fusion_fuentes import fusionar_unidad
    # identidad por PRIORIDAD y sin ambigüedad (lección censo 07-15: 'A 103' y
    # 'B 103' comparten dígitos — un empate ambiguo NO empareja)
    from censo_total import AMBIGUA, buscar, llaves_ordenadas
    indice: Dict[str, Any] = {}
    for f in filas:
        base = sufijo_producto(f.get("_producto") or f.get("unidad") or "")
        variantes = list(llaves_ordenadas(base))
        if torre:
            variantes += [k for k in llaves_ordenadas(f"{torre}-{base}")
                          if k not in variantes]
        for k in variantes:
            if k in indice and indice[k] is not f:
                indice[k] = AMBIGUA
            else:
                indice[k] = f
    usadas, discrepancias = set(), []
    for u in unidades:
        fila = buscar(indice, u.get("unit_number") or "")
        if not fila:
            discrepancias.append(f"{u.get('unit_number')}: en la lista pero no en el "
                                 f"Maestro — ¿se vendió después de la foto del Maestro?")
            continue
        usadas.add(id(fila))
        for campo, col in (("bedrooms", "bedrooms"), ("bathrooms", "bathrooms"),
                           ("parking_spots", "estacionamientos"),
                           ("parking_type", "parking_type"),
                           ("cuarto_servicio", "cuarto_servicio"),
                           ("amueblado", "amueblado")):
            r = fusionar_unidad(campo, [(u.get(campo), {"fuente": "lista"}),
                                        (fila.get(col), {"fuente": "maestro"})])
            if r.get("valor") is not None:
                u[campo] = r["valor"]
        # cotejo de m²/precio entre fuentes: primero CONCILIAR definiciones (lección
        # Dessea 102: 'habitable' del Maestro = hab + terraza de la lista), y solo
        # si ninguna identidad cuadra, la pelea se documenta
        for a, b, et, tol in ((u.get("size_m2"), fila.get("m2_habitable"), "m²", 0.6),
                              (u.get("price_mxn"), fila.get("precio"), "precio", 2.0)):
            if a and b and abs(float(a) - float(b)) > tol:
                if et == "m²":
                    from fusion_fuentes import conciliar_m2
                    expl = conciliar_m2(a, b, {"balcón": u.get("m2_balcony"),
                                               "terraza": u.get("m2_terrace") or u.get("patio_m2"),
                                               "roof garden": u.get("m2_roof_garden")})
                    if expl:
                        u.setdefault("notas_fuentes", []).append(expl)
                        continue
                discrepancias.append(f"{u.get('unit_number')}: {et} lista={a} vs "
                                     f"maestro={b}")
    solo_maestro = []
    for f in filas:
        if id(f) in usadas:
            continue
        num = sufijo_producto(f.get("_producto") or f.get("unidad") or "")
        if torre and not norm_unidad(num).upper().startswith(norm_unidad(torre).upper()):
            num = f"{torre}-{num}"
        sm = {"unit_number": num, "status": "disponible",
              "price_mxn": f.get("precio"), "size_m2": f.get("m2_habitable"),
              "m2_balcony": f.get("m2_balcones"), "m2_roof_garden": f.get("m2_roof"),
              "m2_total": f.get("m2_total"), "bedrooms": f.get("bedrooms"),
              "bathrooms": f.get("bathrooms"),
              "parking_spots": f.get("estacionamientos"),
              "parking_type": f.get("parking_type"),
              "cuarto_servicio": f.get("cuarto_servicio"),
              "notas": "solo en el Maestro (sin renglón en la lista VP) — preguntar a CLASS"}
        piso = derivar_piso(num)
        if piso is not None:
            sm["level"] = piso
        solo_maestro.append({k: v for k, v in sm.items() if v is not None})
        discrepancias.append(f"{num}: en el Maestro pero no en la lista VP")
    return unidades, solo_maestro, discrepancias


# ─── NOB San Jerónimo (layout propio: 10%/90%, sin crédito bancario) ──────────
def extraer_nob(pdf_bytes: bytes) -> Dict[str, Any]:
    import io
    import pdfplumber
    unidades = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            for ln in (page.extract_text() or "").split("\n"):
                m = re.match(r"^([A-Z]\d{3})\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+(.*?)\$",
                             ln.strip())
                if not m:
                    continue
                moneys = [float(re.sub(r"[^\d.]", "", x) or 0)
                          for x in re.findall(r"\$[\d\s,\.]+", ln)]
                if len(moneys) < 4:
                    continue
                hab, balcon, total = float(m.group(2)), float(m.group(3)), float(m.group(4))
                cajones = re.findall(r"\d+", m.group(5))
                unidades.append({
                    "unidad": m.group(1), "m2_habitable": hab, "m2_balcon": balcon,
                    "m2_total": total, "estacionamientos": len(cajones) or None,
                    "precio": moneys[0], "reservacion": moneys[1],
                    "contrato": moneys[2],
                    "_valida_m2": abs(hab + balcon - total) < 0.6,
                    "_valida_dinero": abs(moneys[1] + moneys[2] + moneys[3]
                                          - moneys[0]) < 2,
                    "_nota": f"pago a la entrega: ${moneys[3]:,.0f} · "
                             f"cajones {' y '.join(cajones)}"})
    return {"familia": "nob_class", "unidades": unidades,
            "validacion": {"m2": sum(1 for u in unidades if u["_valida_m2"]),
                           "dinero": sum(1 for u in unidades if u["_valida_dinero"]),
                           "total": len(unidades)}}


# ─── la carga de UN proyecto (Mongo solo aquí) ────────────────────────────────
async def cargar_proyecto(db, proyecto: Dict[str, Any]) -> Dict[str, Any]:
    """proyecto = {nombre, dev_slug, unidades (vocabulario), direccion{...},
    alcaldia?, entrega?, fuentes_pdf, fuente_excel, fuentes_meta, preguntas[]}"""
    from datetime import datetime, timezone
    dev = await db.developments.find_one({"name": proyecto["nombre"]}, {"_id": 0, "id": 1})
    dev_id = (dev or {}).get("id") or f"dev_{proyecto['dev_slug']}"
    if not dev:
        d = proyecto.get("direccion") or {}
        await db.developments.insert_one({
            "id": dev_id, "name": proyecto["nombre"],
            "developer_id": DEVELOPER_CLASS, "source": "masivo_class",
            "status": "active", "published": None,
            "address": d.get("address"), "colonia": d.get("colonia"),
            "alcaldia": proyecto.get("alcaldia") or d.get("alcaldia"),
            "city": d.get("ciudad"),
            "fecha_entrega": proyecto.get("entrega"),
            "etapa_comercial": proyecto.get("etapa"),
            "created_at": datetime.now(timezone.utc).isoformat()})
    from ingesta_directa import cargar_lote
    r = await cargar_lote(db, dev_id, proyecto["unidades"],
                          origen=proyecto.get("origen", "masivo_class"),
                          fuentes_pdf=proyecto.get("fuentes_pdf"),
                          fuente_excel=proyecto.get("fuente_excel"),
                          fuentes_meta=proyecto.get("fuentes_meta"))
    if proyecto.get("preguntas"):
        await db.preguntas_fuente.update_one(
            {"development_id": dev_id},
            {"$set": {"development_id": dev_id, "preguntas": proyecto["preguntas"],
                      "origen": proyecto.get("origen", "masivo_class"),
                      "ts": datetime.now(timezone.utc).isoformat()}}, upsert=True)
    return {"dev_id": dev_id, **{k: r[k] for k in ("unidades_antes", "unidades_despues",
                                                   "moldes", "acta_id", "juez")}}
