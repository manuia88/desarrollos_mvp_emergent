"""ORDEN DE GALERÍA — el recorrido del departamento (founder 07-16): "los renders deben
estar acomodados con secuencia como si estuvieras recorriendo el departamento".

Secuencia canónica: portada (la mejor) → acceso/lobby (llegada) → sala-comedor → cocina →
recámara principal → recámaras → baños → terraza/balcón privado → amenidades por impacto
(roof/alberca → gym → coworking/cine/ludoteca → otras) → vista → estacionamiento → fachada
(cierre; no se repite si ya es la portada).

Cómo se clasifica cada foto:
- archivo CON nombre (CLASS: 'illinois Sala.jpg', 'Roof Garden 2.jpg') → automático por nombre.
- render de deck SIN nombre (GDC) → clasificación VISUAL en sesión (paso del masivo), $0.
El concepto queda en el asset (`concepto`) y este motor solo ordena: idempotente y testeable.
"""
from __future__ import annotations

from typing import Any, Dict, List

# concepto → posición en el recorrido (menor = primero)
SECUENCIA: Dict[str, int] = {
    "portada": 0,
    "lobby": 10, "acceso": 10,
    "sala_comedor": 20, "sala": 20, "comedor": 21, "interior": 22,
    "cocina": 30,
    "recamara_principal": 40, "recamara": 41,
    "bano": 50, "vestidor": 51,
    "terraza": 60, "balcon": 61, "roof_privado": 62,
    "roof_garden": 70, "alberca": 71, "jacuzzi": 72,
    "gym": 75, "coworking": 76, "cine": 77, "ludoteca": 78, "pet_zone": 79,
    "salon_eventos": 80, "amenidad": 82, "bar": 83, "restaurante": 84,
    "vista": 90,
    "estacionamiento": 95,
    "fachada": 99, "aerea": 98, "edificio": 99,
}

_NOMBRE_A_CONCEPTO = (
    ("roof", "roof_garden"), ("alberca", "alberca"), ("pool", "alberca"),
    ("gym", "gym"), ("gimnasio", "gym"), ("cowork", "coworking"), ("cine", "cine"),
    ("ludoteca", "ludoteca"), ("pet", "pet_zone"), ("lobby", "lobby"), ("acceso", "acceso"),
    ("sala", "sala_comedor"), ("estancia", "sala_comedor"), ("comedor", "comedor"),
    ("cocina", "cocina"), ("recamara principal", "recamara_principal"),
    ("recamara", "recamara"), ("bedroom", "recamara"), ("bano", "bano"), ("baño", "bano"),
    ("vestidor", "vestidor"), ("terraza", "terraza"), ("balcon", "balcon"),
    ("vista", "vista"), ("fachada", "fachada"), ("aerea", "aerea"), ("dron", "aerea"),
    ("estacionamiento", "estacionamiento"), ("edificio", "edificio"), ("torre", "fachada"),
)


def concepto_por_nombre(filename: str) -> str | None:
    """'illinois Sala 1.jpg' → 'sala_comedor'. None si el nombre no dice nada (deck)."""
    import unicodedata
    fn = "".join(c for c in unicodedata.normalize("NFD", str(filename or "").lower())
                 if unicodedata.category(c) != "Mn")
    for clave, concepto in _NOMBRE_A_CONCEPTO:
        if clave in fn:
            return concepto
    return None


def ordenar_galeria(assets: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Devuelve los assets con `order_index` según el recorrido. Los sin concepto van al
    final EN SU ORDEN actual (no se inventa nada); la portada (foto_hero) no se toca."""
    con = [(SECUENCIA.get(a.get("concepto") or "", 900), i, a) for i, a in enumerate(assets)]
    con.sort(key=lambda t: (t[0], t[1]))
    for nuevo, (_, _, a) in enumerate(con):
        a["order_index"] = nuevo
    return [a for _, _, a in con]
