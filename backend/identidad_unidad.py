"""IDENTIDAD CANÓNICA DE UNIDAD — una sola forma de nombrar el átomo en todo el sistema.

'T2 - 1901' ≡ 'T2-1901' ≡ 't2 1901' · 'A-107' ≡ 'A 107' · 'Almina A - Unidad A - 1002' → 'A-1002'.
La identidad es demasiado importante para vivir duplicada en scripts (upgrade #4 del modelo
de extracción, 07-15). La usan: parser, cruce de fuentes, merge de ingesta y conciliador.
"""
from __future__ import annotations

import re
import unicodedata
from typing import Optional


def norm_unidad(s: Optional[str]) -> str:
    """La llave canónica: mayúsculas, sin acentos, tokens unidos por guion.
    Extrae el patrón torre-número del texto que sea."""
    t = "".join(c for c in unicodedata.normalize("NFD", str(s or ""))
                if unicodedata.category(c) != "Mn").upper()
    t = re.sub(r"\s+", " ", t).strip()
    # patrón torre+número pegado o separado: T2-1901 · A-107 · B 304 · 1901
    m = re.search(r"\b(T\d|[A-Z]{1,2})\s*-?\s*(\d{3,4})([A-Z]?)\b(?!.*\d{3,4})", t)
    if m:
        return f"{m.group(1)}-{m.group(2)}{m.group(3)}"
    m2 = re.search(r"(\d{3,4})([A-Z]?)\s*$", t.replace(" ", ""))
    if m2:
        return f"{m2.group(1)}{m2.group(2)}"
    return t.replace(" ", "")


def son_la_misma(a: Optional[str], b: Optional[str]) -> bool:
    na, nb = norm_unidad(a), norm_unidad(b)
    if not na or not nb:
        return False
    if na == nb:
        return True
    # 'A-107' vs '107': mismo número sin torre declarada en una de las dos
    da = re.sub(r"^[A-Z]+\d?-", "", na)
    db_ = re.sub(r"^[A-Z]+\d?-", "", nb)
    return bool(da and da == db_ and (na == da or nb == db_))
