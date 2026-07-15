"""AMENIDADES CANÓNICAS — texto libre → catálogo con alias (los filtros dejan de mentir)."""
from __future__ import annotations

import re
import unicodedata
from typing import List

CANON = {
    "alberca": ["pool", "piscina", "alberca techada", "swimming"],
    "gimnasio": ["gym", "fitness"],
    "roof garden": ["roof", "rooftop", "terraza comun", "sky garden"],
    "spa": ["sauna", "vapor", "jacuzzi"],
    "ludoteca": ["kids club", "sala infantil"],
    "area infantil": ["juegos infantiles", "playground"],
    "areas verdes": ["jardin", "jardines", "garden"],
    "salon de usos multiples": ["sum", "salon de eventos", "salon multiusos"],
    "coworking": ["business center", "sala de juntas"],
    "pet friendly": ["area para mascota", "area para mascotas", "pet zone", "dog park"],
    "seguridad 24h": ["vigilancia", "caseta", "seguridad"],
    "cine": ["sala de cine", "screening"],
    "lobby": ["vestibulo", "recepcion"],
    "elevador": ["elevadores", "ascensor"],
    "estacionamiento visitas": ["visitas"],
    "motor lobby": [],
    "padel": ["paddle"], "terraza": [], "asadores": ["grill", "bbq"], "bar": [],
}
_ALIAS = {a: canon for canon, alias in CANON.items() for a in alias}


def _norm(s: str) -> str:
    s = "".join(c for c in unicodedata.normalize("NFD", s or "")
                if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", s).strip().lower()


def canonizar(amenidad: str) -> str:
    n = _norm(amenidad)
    if n in CANON:
        return n
    if n in _ALIAS:
        return _ALIAS[n]
    for canon in CANON:                      # contención: "alberca de nado" → alberca
        if canon in n:
            return canon
    return n                                  # desconocida: pasa tal cual (no se pierde)


def canonizar_lista(amenidades: List[str]) -> List[str]:
    vistas, out = set(), []
    for a in amenidades or []:
        c = canonizar(str(a))
        if c and c not in vistas:
            vistas.add(c)
            out.append(c)
    return out
