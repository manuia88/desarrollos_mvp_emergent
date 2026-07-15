"""EXTRACTORES POR FAMILIA DE LAYOUT — código puro donde antes iba IA.

El upgrade que cambia la economía de la ingesta (probado 07-15 con NUA/Nupol: 160/160
unidades, $0, instantáneo): cuando una lista pertenece a una FAMILIA conocida, se extrae
con parser determinista guiado por encabezados; la IA queda solo para layouts nunca
vistos — y cada layout nuevo se registra UNA vez. Familia #1: "vp_class" (las VP_Lista
de CLASS). Familia nueva = una entrada en FAMILIAS.

Doble validación integrada por familia (sus invariantes): habitables+exteriores=totales ·
crédito+enganche=precio. Lo que no valida NO pasa callado: sale en la pre-auditoría.
"""
from __future__ import annotations

import io
import re
import unicodedata
from typing import Any, Dict, List, Optional

from identidad_unidad import norm_unidad


def _num(s) -> Optional[float]:
    if s is None:
        return None
    t = re.sub(r"[^\d.]", "", str(s))
    try:
        return float(t) if t else None
    except ValueError:
        return None


def _norm_h(s) -> str:
    s = "".join(c for c in unicodedata.normalize("NFD", str(s or ""))
                if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", s).strip().upper()


_CAMPOS_VP = {"DEPTO": "unidad", "BALCON": "m2_balcon", "TERRAZA": "m2_balcon",
              "PATIO": "m2_patio", "ROOF": "m2_roof", "BOD": "bodegas",
              "EST": "estacionamientos", "HABITABLE": "m2_habitable", "TOTAL": "m2_total",
              "PRECIO": "precio", "CREDITO": "credito", "ENGANCHE": "enganche",
              "RESERVACION": "reservacion", "CONTRATO": "contrato", "DIFERIR": "a_diferir"}
_POSICIONAL_VP = {0: "unidad", 1: "m2_balcon", 3: "m2_patio", 4: "bodegas",
                  5: "estacionamientos", 6: "m2_habitable", 7: "m2_total", 8: "precio",
                  9: "credito", 10: "enganche", 11: "reservacion"}


def _mapa_header(row) -> Optional[Dict[int, str]]:
    m: Dict[int, str] = {}
    for i, cell in enumerate(row):
        c = _norm_h(cell)
        for k, campo in _CAMPOS_VP.items():
            if k in c and campo not in m.values():
                m[i] = campo
                break
    return m if "unidad" in m.values() and "precio" in m.values() else None


def _resolver_m2(u: Dict[str, Any], celdas: List[str]) -> bool:
    """Par contiguo hab/tot + exterior CONFIRMADO por celda independiente (jamás derivado)."""
    nums = [_num(x) for x in celdas]
    for j in range(1, len(nums) - 1):
        a, b = nums[j], nums[j + 1]
        if not (a and b and 30 < a < 400 and a <= b < a + 90):
            continue
        ext = b - a
        if ext < 0.6:
            u["m2_habitable"], u["m2_total"] = a, b
            return True
        for k in range(1, j):
            if nums[k] is not None and abs(nums[k] - ext) < 0.06:
                u["m2_habitable"], u["m2_total"] = a, b
                u["m2_balcon"] = nums[k]
                if u.get("m2_patio") == nums[k]:
                    u["m2_patio"] = None
                return True
    return False


def extraer_vp(pdf_bytes: bytes) -> Dict[str, Any]:
    """La familia VP de CLASS: header-driven + fallback posicional + resolvedor por fila."""
    import pdfplumber
    unidades: Dict[str, Dict[str, Any]] = {}
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            t = page.extract_table() or []
            mapa = None
            for row in t:
                mh = _mapa_header(row)
                if mh:
                    mapa = mh
                    break
            for row in t:
                c = [str(x).strip() if x else "" for x in row]
                unidad = None
                for x in c[:3]:
                    x2 = x.replace("\n", "").replace(" ", "")
                    if re.match(r"^(T\d-?)?\d{3,4}$", x2):
                        unidad = x.replace("\n", " ").strip()
                        break
                if not unidad:
                    continue
                usar = mapa or _POSICIONAL_VP
                u: Dict[str, Any] = {"unidad": unidad}
                for i, campo in usar.items():
                    if campo != "unidad" and i < len(c):
                        u[campo] = _num(c[i])
                hab, tot = u.get("m2_habitable"), u.get("m2_total")
                ext = (u.get("m2_balcon") or 0) + (u.get("m2_patio") or 0) + (u.get("m2_roof") or 0)
                ok_m2 = hab is not None and tot is not None and abs(hab + ext - tot) < 0.6
                if not ok_m2:
                    ok_m2 = _resolver_m2(u, c)
                pr, cr, en = u.get("precio"), u.get("credito"), u.get("enganche")
                u["_valida_m2"] = bool(ok_m2)
                u["_valida_dinero"] = bool(pr and cr and en and abs((cr + en) - pr) < 2)
                unidades[norm_unidad(unidad)] = u
    us = list(unidades.values())
    return {"familia": "vp_class", "unidades": us,
            "validacion": {"m2": sum(1 for u in us if u["_valida_m2"]),
                           "dinero": sum(1 for u in us if u["_valida_dinero"]),
                           "total": len(us)}}


def detecta_vp(nombre_archivo: str, primer_texto: str = "") -> bool:
    n = (nombre_archivo or "").lower()
    return "vp_lista" in n.replace(" ", "_") or "lista de precios" in (primer_texto or "").lower()[:200]


def extraer_maestro_class(xlsx_bytes: bytes) -> Dict[str, Any]:
    """Familia #2: el Inventario maestro de CLASS (Excel multi-dev, hoja CDMX).
    Devuelve unidades AGRUPADAS por DESARROLLO — el masivo toma su proyecto."""
    import openpyxl
    wb = openpyxl.load_workbook(io.BytesIO(xlsx_bytes), data_only=True)
    ws = wb[wb.sheetnames[0]]
    headers = [str(c.value).strip() if c.value else "" for c in ws[1]]
    unidades: List[Dict[str, Any]] = []
    for r in ws.iter_rows(min_row=2, values_only=True):
        d = dict(zip(headers, r))
        if not d.get("PRODUCTO") or not d.get("DESARROLLO"):
            continue
        unidades.append({"desarrollo": str(d["DESARROLLO"]).strip(),
                         "unidad": norm_unidad(d["PRODUCTO"]),
                         "bedrooms": _num(d.get("RECAMARAS")),
                         "recamaras_opcion": _num(d.get("RECAMARAS OPCIONALES")),
                         "bathrooms": _num(d.get("BAÑOS")),
                         "estacionamientos": _num(d.get("ESTACIONAMIENTOS")),
                         "parking_type": str(d.get("TIPO DE ESTACIONAMIENTO") or "").strip().lower() or None,
                         "m2_habitable": _num(d.get("M2 HABITABLE")),
                         "m2_total": _num(d.get("M2 TOTAL")),
                         "precio": _num(d.get("PRECIO ACTUAL")),
                         "cuarto_servicio": str(d.get("CUARTO DE SERVICIO") or "").strip().lower() or None,
                         "amueblado": str(d.get("AMUEBLADO") or "").strip().lower() or None})
    return {"familia": "maestro_class", "unidades": unidades,
            "validacion": {"total": len(unidades)}}


def detecta_maestro(nombre_archivo: str, primer_texto: str = "") -> bool:
    n = (nombre_archivo or "").lower()
    return "inventario" in n and n.endswith((".xlsx", ".xls"))


UMBRAL_DRIFT = 0.90   # si una familia conocida valida <90%, el layout CAMBIÓ — alerta


def drift_de_familia(resultado: Dict[str, Any]) -> Optional[str]:
    """El detector de drift: la familia dejó de ajustar → alerta explícita, no fallo callado."""
    v = resultado.get("validacion") or {}
    total = v.get("total") or 0
    if not total or "m2" not in v:
        return None
    peor = min(v.get("m2", total), v.get("dinero", total)) / total
    if peor < UMBRAL_DRIFT:
        return (f"⚠ DRIFT de layout en familia '{resultado.get('familia')}': solo "
                f"{peor * 100:.0f}% valida — el dev cambió el formato; revisar antes de cargar")
    return None


# ─── EL REGISTRO (familia nueva = una entrada; la IA solo toca lo desconocido) ─
FAMILIAS: List[Dict[str, Any]] = [
    {"key": "vp_class", "detecta": detecta_vp, "extraer": extraer_vp,
     "nota": "VP_Lista de CLASS · probada 160/160 con doble validación (07-15)"},
    {"key": "maestro_class", "detecta": detecta_maestro, "extraer": extraer_maestro_class,
     "nota": "Inventario maestro multi-dev de CLASS (Excel, hoja CDMX) · 582 renglones"},
]


def extraer_deterministico(nombre_archivo: str, pdf_bytes: bytes) -> Optional[Dict[str, Any]]:
    """Si la lista es de familia conocida → extracción con código puro ($0). None = IA."""
    for fam in FAMILIAS:
        try:
            if fam["detecta"](nombre_archivo):
                return fam["extraer"](pdf_bytes)
        except Exception:  # noqa: BLE001 — una familia rota no bloquea el fallback a IA
            continue
    return None
