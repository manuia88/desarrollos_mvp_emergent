"""Diccionario ÚNICO de amenidades: traduce lo que pide el filtro a lo que guarda el catálogo.

POR QUÉ (auditoría A–Z 2026-07-24): 11 de los 16 botones de amenidades del marketplace devolvían
CERO desarrollos. El botón «Roof garden» manda el código `roof`, pero el catálogo guarda
"Roof Garden", "roof garden", "Roof Garden Común", "Roof Garden comunal", "roof_garden",
"Roof garden privado"… — 207 formas distintas escritas por gente distinta. El filtro comparaba
cadenas exactas, así que quien buscaba roof garden veía 0 de los 71 desarrollos que sí lo tienen.

Aquí vive la única verdad: cada código del filtro con las palabras que lo identifican. Se compara
NORMALIZADO (sin acentos, sin mayúsculas, sin guiones) y por contenido, no por igualdad, para que
una variante nueva escrita mañana ("Roof Garden Panorámico") entre sola sin tocar código.
"""
from __future__ import annotations

import unicodedata
from typing import Iterable

# código del filtro → palabras que lo identifican dentro del texto de la amenidad
SINONIMOS: dict[str, tuple[str, ...]] = {
    "gym": ("gym", "gimnasio", "fitness", "aerobic", "crossfit"),
    "seguridad": ("seguridad", "vigilancia", "cctv", "caseta", "acceso controlado", "24/7"),
    "pet": ("pet", "mascota", "canino", "perro"),
    "area_pets": ("pet garden", "pet zone", "zona pet", "area de mascotas", "area para mascotas",
                  "pet park", "area canina"),
    "roof": ("roof", "azotea", "sky garden", "terraza panoramica"),
    "cowork": ("cowork", "coworking", "business lounge", "sala de juntas", "oficina compartida"),
    "alberca": ("alberca", "piscina", "pool", "nado"),
    "salon_eventos": ("salon", "usos multiples", "eventos", "sum ", "ludoteca", "salon de fiestas"),
    "bicicletas": ("bici", "bicicleta", "ciclo", "bike"),
    "spa": ("spa", "sauna", "vapor", "jacuzzi", "masaje", "hidromasaje"),
    "concierge": ("concierge", "conserje", "lobby", "recepcion", "paqueteria"),
    "business_center": ("business center", "business centre", "centro de negocios", "sala de juntas"),
    "jardines": ("jardin", "jardines", "areas verdes", "area verde", "patio", "huerto"),
    "estacionamiento": ("estacionamiento", "parking", "cajon", "cochera"),
    "sky_lounge": ("sky lounge", "skylounge", "sky bar", "lounge", "mirador", "sun deck",
                   "roof top bar"),
    "cava": ("cava", "wine", "cocktail bar", "speakeasy", "bar "),
    # extras que el catálogo usa mucho y conviene poder filtrar
    "asadores": ("asador", "bbq", "parrilla", "grill", "fire pit", "firepit"),
    "elevador": ("elevador", "ascensor"),
    "juegos_infantiles": ("juegos infantiles", "ludoteca", "kids", "area infantil", "playground"),
    "terraza": ("terraza", "sun deck", "deck"),
}


def normaliza(s) -> str:
    """Texto comparable: sin acentos, minúsculas, sin guiones bajos, espacios colapsados."""
    t = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode()
    t = t.lower().replace("_", " ").replace("-", " ")
    return " ".join(t.split())


def tiene_amenidad(amenidades: Iterable, codigo: str) -> bool:
    """¿El desarrollo tiene esta amenidad, sin importar cómo la haya escrito quien la capturó?"""
    claves = SINONIMOS.get(codigo)
    if not claves:                       # código desconocido → comparación literal, sin inventar
        claves = (normaliza(codigo),)
    textos = [normaliza(a) for a in (amenidades or [])]
    return any(k in t for t in textos for k in claves)


def cumple_todas(amenidades: Iterable, codigos: Iterable[str]) -> bool:
    """El desarrollo debe tener TODAS las amenidades pedidas (el filtro es una Y, no una O)."""
    return all(tiene_amenidad(amenidades, c) for c in (codigos or []))
