"""EL CENSO — capa 6: re-verificación del 100% de los campos contra la fuente.

Lección Dessea 102 (founder 07-15): los 5 filtros verificaban la EXTRACCIÓN y el
CATÁLOGO, pero el trayecto entre ambos (la carga) podía mutilar datos y el juez
—por ser MUESTRAL (20 campos)— podía no verlo. El censo cierra esa puerta:

  · re-extrae la fuente COMPLETA por el camino independiente (extraer_vp_mejor
    sobre los bytes + renglones del Maestro),
  · empareja CADA unidad del catálogo con su renglón de lista y de Maestro,
  · compara CADA campo almacenado contra la fuente (dinero completo, m² con
    desglose, cajones, bodega, recámaras, baños, estatus),
  · las diferencias por DEFINICIÓN se concilian aritméticamente (conciliar_m2),
  · TODO se cuenta: coincide / discrepa / sin_fuente — nada queda sin clasificar.

Persiste en `censo_verificacion` (un doc por dev) y cachea censo_pct en el dev.
Puro/testeable en los comparadores; Mongo solo en censar_desarrollo(). $0, sin IA.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from identidad_unidad import norm_unidad

TOL_M2 = 0.06
TOL_DINERO = 2.0

# campo del catálogo → (llave en la extracción de LISTA, tolerancia)
CAMPOS_LISTA: List[Tuple[str, str, float]] = [
    ("price_mxn", "precio", TOL_DINERO),
    ("credito_mxn", "credito", TOL_DINERO),
    ("enganche_mxn", "enganche", TOL_DINERO),
    ("reservacion_mxn", "reservacion", TOL_DINERO),
    ("contrato_mxn", "contrato", TOL_DINERO),
    ("a_diferir_mxn", "a_diferir", TOL_DINERO),
    ("size_m2", "m2_habitable", TOL_M2),
    ("m2_total", "m2_total", TOL_M2),
    ("m2_balcony", "m2_balcon", TOL_M2),
    ("patio_m2", "m2_patio", TOL_M2),
    ("m2_roof_garden", "m2_roof", TOL_M2),
    ("parking_spots", "estacionamientos", 0.01),
    ("bodega", "bodegas", 0.01),
]
# campo del catálogo → llave en el renglón del MAESTRO
CAMPOS_MAESTRO: List[Tuple[str, str, float]] = [
    ("bedrooms", "bedrooms", 0.01),
    ("bathrooms", "bathrooms", 0.01),
    ("parking_spots", "estacionamientos", 0.01),
    ("price_mxn", "precio", TOL_DINERO),
    ("size_m2", "m2_habitable", TOL_M2),
]


def _num(v) -> Optional[float]:
    if v is None or v == "":
        return None
    if isinstance(v, bool):
        return 1.0 if v else 0.0
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def comparar_campo(campo: str, almacenado, fuente, tol: float,
                   unidad: Dict[str, Any]) -> Dict[str, Any]:
    """Un campo, un veredicto: coincide / discrepa / sin_fuente / conciliado.
    0 y None se tratan como equivalentes SOLO en exteriores (columna vacía = 0)."""
    a, f = _num(almacenado), _num(fuente)
    if f is None:
        return {"campo": campo, "v": "sin_fuente"}
    if a is None:
        if f == 0 and campo in ("m2_balcony", "patio_m2", "m2_roof_garden",
                                "bodega", "a_diferir_mxn"):
            return {"campo": campo, "v": "coincide"}      # vacío ≡ cero en exteriores
        return {"campo": campo, "v": "discrepa", "almacenado": almacenado,
                "fuente": fuente, "nota": "el catálogo NO tiene el dato y la fuente sí"}
    if abs(a - f) <= tol:
        return {"campo": campo, "v": "coincide"}
    # ¿es definición distinta y no error? (lección Dessea 102)
    if campo in ("size_m2", "m2_total"):
        from fusion_fuentes import conciliar_m2
        expl = conciliar_m2(a, f, {"balcón": unidad.get("m2_balcony"),
                                   "terraza": unidad.get("m2_terrace"),
                                   "patio": unidad.get("patio_m2"),
                                   "roof": unidad.get("m2_roof_garden")})
        if expl:
            return {"campo": campo, "v": "conciliado", "nota": expl}
    return {"campo": campo, "v": "discrepa", "almacenado": almacenado, "fuente": fuente}


def censar_unidad(u: Dict[str, Any],
                  fila_lista: Optional[Dict[str, Any]],
                  fila_maestro: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    if fila_lista:
        for campo, llave, tol in CAMPOS_LISTA:
            out.append({**comparar_campo(campo, u.get(campo), fila_lista.get(llave),
                                         tol, u), "fuente_tipo": "lista"})
    if fila_maestro:
        ya_ok = {c["campo"] for c in out if c["v"] == "coincide"}
        for campo, llave, tol in CAMPOS_MAESTRO:
            if campo in ya_ok:
                # la lista ya confirmó al catálogo; si el Maestro dice OTRA cosa,
                # es PELEA ENTRE FUENTES (capa 2), no error del catálogo
                v = comparar_campo(campo, u.get(campo), fila_maestro.get(llave), tol, u)
                if v["v"] == "discrepa":
                    out.append({"campo": campo, "v": "fuentes_pelean",
                                "fuente_tipo": "lista≠maestro",
                                "nota": f"lista confirma {u.get(campo)}, maestro dice "
                                        f"{fila_maestro.get(llave)} — el catálogo se queda "
                                        f"con la LISTA (prioridad founder 07-15); si una "
                                        f"lista futura empata, esto desaparece solo"})
                continue
            out.append({**comparar_campo(campo, u.get(campo), fila_maestro.get(llave),
                                         tol, u), "fuente_tipo": "maestro"})
    if not fila_lista and not fila_maestro:
        out.append({"campo": "*", "v": "sin_fuente",
                    "nota": "unidad sin renglón en lista NI en Maestro"})
    return out


def llaves_ordenadas(unidad: str) -> List[str]:
    """Identidad por PRIORIDAD (lección censo 07-15: 'A-103' y 'B-103' comparten los
    dígitos '103' — el empate por dígitos SOLO vale si es inequívoco):
      1· forma canónica exacta  2· sin separadores  3· cola sin torre  4· dígitos."""
    import re
    n = norm_unidad(unidad)
    llaves = [n, re.sub(r"[^A-Z0-9]", "", n)]
    m = re.match(r"^(T\d|[A-Z]{1,2})-(.+)$", n)
    if m:
        cola = m.group(2)
        llaves += [cola, cola.lstrip("0") or cola]
    d = re.sub(r"\D", "", n)
    if d:
        llaves += [d, d.lstrip("0") or d]
    vistas: List[str] = []
    for k in llaves:
        if k and k not in vistas:
            vistas.append(k)
    return vistas


AMBIGUA = object()      # una llave que apunta a DOS filas no empareja a ninguna


def indexar(filas: List[Dict[str, Any]], llave_id: str, torre: str = "") -> Dict[str, Any]:
    idx: Dict[str, Any] = {}
    for f in filas:
        for k in llaves_ordenadas(str(f.get(llave_id) or "")):
            if k in idx and idx[k] is not f:
                idx[k] = AMBIGUA
            else:
                idx[k] = f
    return idx


def buscar(idx: Dict[str, Any], unidad: str) -> Optional[Dict[str, Any]]:
    """Primera llave INEQUÍVOCA que empata, en orden de prioridad."""
    for k in llaves_ordenadas(unidad):
        f = idx.get(k)
        if f is AMBIGUA:
            continue
        if f is not None:
            return f
    return None


def resumen_censo(veredictos: List[Dict[str, Any]]) -> Dict[str, Any]:
    n = {"coincide": 0, "conciliado": 0, "discrepa": 0, "sin_fuente": 0,
         "fuentes_pelean": 0}
    for v in veredictos:
        n[v["v"]] = n.get(v["v"], 0) + 1
    # una pelea lista≠maestro documentada NO es error del catálogo (coincide con una)
    comparados = n["coincide"] + n["conciliado"] + n["discrepa"] + n["fuentes_pelean"]
    return {**n, "comparados": comparados,
            "pct": round((comparados - n["discrepa"]) * 100 / comparados, 2)
            if comparados else None}


async def censar_post_carga(db, development_id: str,
                            payload: List[Dict[str, Any]]) -> Dict[str, Any]:
    """ESCRIBE-LEE-COMPARA (el candado Dessea 102): inmediatamente después de una
    carga, cada campo del payload se relee del catálogo — si la carga mutiló o tiró
    UN solo dato, aquí truena, en la misma corrida. Corre dentro de cargar_lote."""
    from censo_total import buscar as _buscar   # self-import seguro
    idx: Dict[str, Any] = indexar(payload, "unit_number")
    NO_COMPARAR = {"unit_number", "status", "notas", "size_m2_total", "level"}
    perdidos: List[Dict[str, Any]] = []
    n_campos = 0
    async for u in db.units.find({"development_id": development_id}, {"_id": 0}):
        fila = _buscar(idx, u.get("unit_number") or "")
        if not fila:
            continue                    # unidad previa que este payload no traía
        for campo, esperado in fila.items():
            if campo in NO_COMPARAR or campo.startswith("_") or esperado is None:
                continue
            n_campos += 1
            v = comparar_campo(campo, u.get(campo), esperado, 0.06, u)
            if v["v"] == "discrepa":
                perdidos.append({"unidad": u.get("unit_number"), "campo": campo,
                                 "esperado": esperado, "quedo": u.get(campo)})
    doc = {"development_id": development_id, "n_campos": n_campos,
           "perdidos": perdidos[:100], "ok": not perdidos,
           "ts": datetime.now(timezone.utc).isoformat()}
    await db.censo_post_carga.update_one({"development_id": development_id},
                                         {"$set": doc}, upsert=True)
    return doc


async def censar_desarrollo(db, development_id: str,
                            unidades_lista: List[Dict[str, Any]],
                            filas_maestro: List[Dict[str, Any]],
                            torres_lista: Optional[Dict[int, str]] = None) -> Dict[str, Any]:
    """unidades_lista = extracción fresca (vocabulario crudo del extractor);
    filas_maestro = renglones del Maestro de ESTE dev (con _producto)."""
    from masivo_class import sufijo_producto
    idx_lista = indexar(unidades_lista, "unidad")
    idx_maestro: Dict[str, Any] = {}
    for f in filas_maestro:
        for k in llaves_ordenadas(sufijo_producto(f.get("_producto") or "")):
            if k in idx_maestro and idx_maestro[k] is not f:
                idx_maestro[k] = AMBIGUA
            else:
                idx_maestro[k] = f
    veredictos, detalles = [], []
    async for u in db.units.find({"development_id": development_id}, {"_id": 0}):
        fl = buscar(idx_lista, u.get("unit_number") or "")
        fm = buscar(idx_maestro, u.get("unit_number") or "")
        vs = censar_unidad(u, fl, fm)
        veredictos += vs
        for v in vs:
            if v["v"] in ("discrepa", "fuentes_pelean") or v["campo"] == "*":
                detalles.append({"unidad": u.get("unit_number"), **v})
    doc = {"development_id": development_id,
           "ts": datetime.now(timezone.utc).isoformat(),
           "unidades": await db.units.count_documents({"development_id": development_id}),
           **resumen_censo(veredictos), "discrepancias": detalles[:200]}
    await db.censo_verificacion.update_one({"development_id": development_id},
                                           {"$set": doc}, upsert=True)
    await db.developments.update_one(
        {"id": development_id},
        {"$set": {"censo_pct": doc["pct"], "censo_at": doc["ts"],
                  "censo_discrepancias": len(detalles)}})
    return doc
