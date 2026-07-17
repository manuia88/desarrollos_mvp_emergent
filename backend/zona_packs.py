"""PACKS DE COLONIAS — agrupa las sub-colonias en una ZONA (founder 07-17: entraba a
/zona/juarez y no salían desarrollos porque estaban en 'juarez-cuauhtemoc'; y quiere Roma =
Roma Norte+Sur, Condesa = Condesa+Hipódromo, Del Valle = Norte+Centro+Sur, etc.).

Regla GENERAL (aplica a TODOS los casos que coincidan, no solo los ejemplos): del
`colonia_id` (`<nombre>-<variante?>-<alcaldia>`) se quita la ALCALDÍA y las VARIANTES
(norte/sur/centro/oriente/poniente/i-x/ampl/sección) → queda la ZONA BASE. Todo lo que
comparte zona base se agrupa. Más ALIAS para las que no comparten prefijo (Hipódromo es
Condesa; Verónica Anzures es Anzures).
"""
from __future__ import annotations

# las 16 alcaldías como sufijo de slug (orden por longitud para recortar la correcta primero)
ALCALDIAS = [
    "cuajimalpa-de-morelos", "la-magdalena-contreras", "gustavo-a-madero",
    "venustiano-carranza", "magdalena-contreras", "benito-juarez", "alvaro-obregon",
    "miguel-hidalgo", "azcapotzalco", "cuauhtemoc", "iztapalapa", "iztacalco",
    "xochimilco", "cuajimalpa", "coyoacan", "milpa-alta", "tlahuac", "tlalpan",
]

# tokens que son VARIANTE de una misma colonia, no nombre propio
_VARIANTES = {
    "norte", "nte", "sur", "centro", "oriente", "ote", "poniente", "pte",
    "i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x",
    "ampl", "ampliacion", "seccion", "secc",
}

# colonias que pertenecen a una zona pero NO comparten prefijo → alias explícito
ALIAS = {
    "hipodromo": "condesa",
    "hipodromo-condesa": "condesa",
    "veronica-anzures": "anzures",
}


def zona_base(slug: str) -> str:
    """`colonia_id` o slug → su ZONA BASE canónica (agrupadora).
    'roma-norte-cuauhtemoc'→'roma' · 'del-valle-centro-benito-juarez'→'del-valle' ·
    'hipodromo-cuauhtemoc'→'condesa' · 'juarez-cuauhtemoc'→'juarez'."""
    s = (slug or "").lower().strip()
    for alc in ALCALDIAS:                       # ya viene ordenada por longitud
        if s == alc:
            break
        if s.endswith("-" + alc):
            s = s[: -(len(alc) + 1)]
            break
    toks = s.split("-")
    while len(toks) > 1 and toks[-1] in _VARIANTES:
        toks.pop()
    base = "-".join(toks)
    return ALIAS.get(base, base)


def misma_zona(colonia_id: str, slug_pedido: str) -> bool:
    """¿El desarrollo (por su colonia_id) cae en la zona que pidió el usuario?
    Funciona con slug corto ('juarez'), largo ('roma-norte-cuauhtemoc') o pack ('condesa')."""
    if not colonia_id:
        return False
    return zona_base(colonia_id) == zona_base(slug_pedido)


def colonias_de(slugs) -> "set[str]":
    """Zonas base de un conjunto de slugs pedidos (para expandir el filtro del marketplace)."""
    return {zona_base(s) for s in slugs if s}
