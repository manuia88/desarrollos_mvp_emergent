"""LISTA FORENSE — los dos fraudes silenciosos de los PDFs de listas, vueltos JUEZ.

Casos reales que motivaron cada candado (07-17):
· Jai 25L: el encabezado repetido de la tabla TAPABA el renglón — dos lecturas distintas
  del mismo PDF y nadie sabía cuál creer. → renglones_fantasma: texto-vs-coordenadas.
· Único Roma: la lista numera hasta 76 pero OMITE 8 renglones (3 con plano en carpeta:
  los deptos existen, los quitaron). → huecos de numeración reportados SIEMPRE.
· Dessea 2-PH03 / Avalia B-204: apartada = celda SOMBREADA, el texto no lo dice — solo
  se cazaba a ojo. → celdas_sombreadas lee los rellenos del PDF.

Todo determinista, $0, sin IA. Se usa en lista_peek (cada lista que cambia pasa por aquí)
y en el juez de ingesta.
"""
from __future__ import annotations

import io
import re
from typing import Any, Dict, List, Optional, Set, Tuple

# un relleno "sombreado" es gris/color visible: ni blanco ni casi-blanco
_BLANCO = 0.92          # luminosidad ≥92% se considera fondo normal
_ALTO_MIN_FILA = 5      # pt: un rect más bajo no es banda de fila
_ANCHO_MIN_FILA = 100   # pt: debe cubrir buena parte de la tabla


def _luminosidad(color) -> Optional[float]:
    """color de pdfplumber: float (gris), tupla RGB/CMYK o None → 0..1 (1=blanco)."""
    if color is None:
        return None
    try:
        if isinstance(color, (int, float)):
            return float(color)
        vals = [float(v) for v in color]
        if len(vals) == 3:
            return sum(vals) / 3.0
        if len(vals) == 4:                      # CMYK: aproximación por negro
            return 1.0 - min(1.0, vals[3] + sum(vals[:3]) / 3.0 * 0.3)
        if len(vals) == 1:
            return vals[0]
    except (TypeError, ValueError):
        return None
    return None


def bandas_sombreadas(page) -> List[Tuple[float, float]]:
    """Franjas verticales (top, bottom) de la página con relleno visible (no blanco)."""
    bandas = []
    for r in page.rects:
        lum = _luminosidad(r.get("non_stroking_color"))
        if lum is None or lum >= _BLANCO:
            continue
        alto = (r.get("bottom") or 0) - (r.get("top") or 0)
        ancho = (r.get("x1") or 0) - (r.get("x0") or 0)
        if alto < _ALTO_MIN_FILA or alto > 40 or ancho < _ANCHO_MIN_FILA:
            continue                            # ni líneas ni bloques de portada
        bandas.append((r["top"], r["bottom"]))
    return bandas


_DPI_SOMBRA = 100
_UMBRAL_SOMBRA = 8      # una fila ≥8/255 más oscura que la mediana está sombreada


def unidades_sombreadas(pdf_bytes: bytes, re_unidad: Optional[re.Pattern] = None) -> Set[str]:
    """Unidades cuyas filas están SOMBREADAS (la marca visual de 'apartado' que el texto
    no dice — Dessea 2-PH03, Avalia B-204). Detección por PÍXELES: se renderiza la página
    y cada fila se compara contra la mediana de todas — funciona sin importar si el Excel
    dibujó el gris como rect, curva o imagen (por vectores NO era detectable)."""
    import pdfplumber
    patron = re_unidad or re.compile(
        r"^\d{1,3}$|^[A-Z]{0,3}[-\s]?\d{2,4}[A-Z]?$|^PH\s?\d*$", re.I)
    out: Set[str] = set()
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            try:
                im = page.to_image(resolution=_DPI_SOMBRA).original.convert("L")
            except Exception:  # noqa: BLE001 — sin raster no hay juicio de sombra
                continue
            escala = _DPI_SOMBRA / 72.0
            palabras = page.extract_words()
            # filas candidatas: banda vertical de cada palabra-unidad al inicio de fila
            filas = []
            for w in palabras:
                fila = sorted((x for x in palabras if abs(x["top"] - w["top"]) < 3),
                              key=lambda x: x["x0"])
                if not fila or len(fila) < 4:
                    continue
                if w is not fila[0] and w is not (fila[1] if len(fila) > 1 else None):
                    continue
                if not patron.match(w["text"].strip()):
                    continue
                x0 = min(x["x0"] for x in fila)
                x1 = max(x["x1"] for x in fila)
                filas.append((w["text"].strip(), w["top"], w["bottom"], x0, x1, fila))
            if len(filas) < 4:
                continue                        # sin suficientes filas no hay mediana fiable
            lums = []
            for uid, top, bottom, x0, x1, fila in filas:
                # el sombreado es un HALO detrás del texto (así lo pinta Excel), no la
                # celda entera: se muestrea el fondo DENTRO de las cajas de las palabras
                fondos = []
                for w in fila[:8]:
                    caja = (max(int(w["x0"] * escala) - 1, 0),
                            max(int(w["top"] * escala) - 1, 0),
                            min(int(w["x1"] * escala) + 1, im.width),
                            min(int(w["bottom"] * escala) + 1, im.height))
                    if caja[2] <= caja[0] or caja[3] <= caja[1]:
                        continue
                    pix = sorted(im.crop(caja).getdata())
                    if pix:                     # p70: los glifos oscuros quedan abajo
                        fondos.append(pix[int(len(pix) * 0.7)])
                if fondos:
                    fondos.sort()
                    lums.append((uid, fondos[len(fondos) // 2]))
            if len(lums) < 4:
                continue
            mediana = sorted(v for _, v in lums)[len(lums) // 2]
            for uid, v in lums:
                if v < mediana - _UMBRAL_SOMBRA:
                    out.add(uid)
    return out


# ─── renglones fantasma ───────────────────────────────────────────────────────
# llave de fila: nº de renglón ('57') o identificador de unidad ('25K', 'A-204', '2-')
_RE_LLAVE = re.compile(r"^\d{1,3}$|^[A-Z]{0,3}[-\s]?\d{1,4}[A-Z]?$|^PH\s?\d*$", re.I)


def _filas_de_texto(texto: str) -> Set[str]:
    """Llaves de fila visibles en la capa de TEXTO (extract_text)."""
    out = set()
    for linea in (texto or "").splitlines():
        toks = linea.strip().split()
        if len(toks) >= 4 and _RE_LLAVE.match(toks[0]):
            out.add(toks[0])
    return out


def _filas_de_palabras(page) -> Dict[str, float]:
    """Llaves de fila según COORDENADAS: la 1ª palabra de cada banda. Inmune a banners
    encimados (el texto se entrelaza, las coordenadas no — caso Jai 25L)."""
    porY: Dict[int, List] = {}
    for w in page.extract_words():
        y = round(w["top"] / 3) * 3
        porY.setdefault(y, []).append((w["x0"], w["text"]))
    out: Dict[str, float] = {}
    for y, ws in porY.items():
        primero = sorted(ws)[0][1].strip()
        if _RE_LLAVE.match(primero) and len(ws) >= 4:
            out[primero] = y
    return out


def _es_entrelazado(token: str) -> bool:
    """¿El token parece DOS textos zipeados? ('D25ELPTO' = DEPTO+25L; '4,7P9R3,E3C00IO.00'
    = PRECIO+4,793,300 — así se ve la fila de Jai tapada por el banner). Se cuentan las
    alternancias letra↔dígito: un token normal ('A-204', 'PH03') alterna 1 vez; uno
    zipeado alterna 3+."""
    runs = re.findall(r"[A-Za-zÁÉÍÓÚÑáéíóúñ]+|\d+", token)
    if len(token) < 6 or len(runs) < 4:
        return False
    cambios = sum(1 for a, b in zip(runs, runs[1:])
                  if a[0].isdigit() != b[0].isdigit())
    return cambios >= 3


def renglones_fantasma(pdf_bytes: bytes) -> Dict[str, Any]:
    """El juez: ¿la lista esconde renglones?
    · 'tapados': están en coordenadas pero NO en la capa de texto (banner encima — Jai 25L).
    · 'omitidos': huecos en la numeración, si la lista numera (la fuente quitó filas — Único
      Roma omite 8; 3 tienen plano: los deptos existen).
    · 'encimados': dos renglones lógicos a <3pt (texto entrelazado)."""
    import pdfplumber
    en_texto: Set[str] = set()
    en_coords: Dict[str, float] = {}
    encimados: List[str] = []
    entrelazados: List[str] = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            en_texto |= _filas_de_texto(page.extract_text() or "")
            coords = _filas_de_palabras(page)
            ys = sorted(coords.items(), key=lambda kv: kv[1])
            for (r1, y1), (r2, y2) in zip(ys, ys[1:]):
                if abs(y2 - y1) < 3 and r1 != r2:
                    encimados += [r1, r2]
            en_coords.update(coords)
            for w in page.extract_words():
                if _es_entrelazado(w["text"]):
                    entrelazados.append(w["text"])
    todos = en_texto | set(en_coords)
    if not todos:
        return {"tapados": [], "omitidos": [], "encimados": [],
                "entrelazados": entrelazados[:6], "n_renglones": 0}
    tapados = sorted(set(en_coords) - en_texto)
    # huecos de numeración: solo aplican si la lista numera (llaves enteras dominan)
    enteros = sorted(int(k) for k in todos if k.isdigit())
    omitidos: List[int] = []
    if len(enteros) >= max(4, len(todos) * 0.6):
        omitidos = sorted(set(range(enteros[0], enteros[-1] + 1)) - set(enteros))
    return {"tapados": tapados, "omitidos": omitidos,
            "encimados": sorted(set(encimados)),
            "entrelazados": entrelazados[:6], "n_renglones": len(todos)}


def alertas_forenses(pdf_bytes: bytes) -> List[str]:
    """Resumen humano para el parte/tarjeta. Vacío = la lista no esconde nada."""
    f = renglones_fantasma(pdf_bytes)
    out = []
    if f["tapados"]:
        out.append(f"⚠️ {len(f['tapados'])} renglón(es) TAPADOS por un elemento encimado "
                   f"(números {f['tapados'][:6]}) — leídos por coordenadas, verificar")
    if f["omitidos"]:
        out.append(f"⚠️ la numeración salta {len(f['omitidos'])} renglón(es) "
                   f"({f['omitidos'][:8]}) — la fuente los quitó, preguntar por qué")
    if f["encimados"]:
        out.append(f"⚠️ renglones encimados: {f['encimados'][:6]} — revisar lectura")
    if f.get("entrelazados"):
        out.append(f"⚠️ texto ENTRELAZADO detectado ({f['entrelazados'][:3]}) — hay un "
                   f"elemento encimado sobre la tabla (caso Jai 25L): leer por coordenadas")
    return out
