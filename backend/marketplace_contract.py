"""EL CONTRATO MARKETPLACE — el mapeo canónico ficha-interna → tarjeta pública.

Orden founder (07-15): "audita si hace match lo que tenemos en la ficha con lo que se
publica en marketplace" + profundidad/universalidad. La respuesta no es auditar una vez:
es que el mapeo viva en UN solo lugar — este registro — y que lo usen A LA VEZ:
  1. el builder real de routes/public.py (la tarjeta que ve el comprador), y
  2. el test congelado (tests/test_contrato_marketplace.py) que truena si alguien
     rompe el vínculo.
Así el match no se audita: se GARANTIZA. Campo nuevo del átomo que deba ser público =
un renglón aquí, y fluye + queda probado, para cualquier dev presente o futuro.

Cada entrada: (campo_publico, extractor(unidad_interna), publico: bool).
`publico=False` documenta EXPLÍCITAMENTE lo que decidimos NO exponer al comprador
(gangas, percentiles, notas internas) — la línea editorial también es contrato.
"""
from __future__ import annotations

from typing import Any, Callable, Dict, List, Tuple

# ─── lo que SÍ viaja a la tarjeta pública de unidad ───────────────────────────
CONTRATO_UNIDAD: List[Tuple[str, Callable[[Dict[str, Any]], Any]]] = [
    ("unit_number", lambda u: u.get("unit_number")),
    ("prototype", lambda u: u.get("prototype")),
    ("prototype_id", lambda u: u.get("prototype_id")),
    ("level", lambda u: u.get("level")),
    ("bedrooms", lambda u: u.get("bedrooms")),
    ("bathrooms", lambda u: u.get("bathrooms")),
    ("parking_spots", lambda u: u.get("parking_spots")),
    ("m2_total", lambda u: u.get("m2_total") or u.get("m2_privative")),
    ("m2_privative", lambda u: u.get("m2_privative") or u.get("size_m2")),
    ("m2_balcony", lambda u: u.get("m2_balcony")),
    ("m2_terrace", lambda u: u.get("m2_terrace")),
    ("m2_roof_garden", lambda u: u.get("m2_roof_garden")),
    ("patio_m2", lambda u: u.get("patio_m2")),
    ("price", lambda u: u.get("price") or u.get("price_mxn")),
    ("price_display", lambda u: u.get("price_display")),
    ("orientation", lambda u: u.get("orientacion") or u.get("orientation")),
    ("vista", lambda u: u.get("vista")),
    ("plano_url", lambda u: u.get("plano_url")),
    ("bodega", lambda u: u.get("bodega") or u.get("storage")),
    ("parking_type", lambda u: u.get("parking_type")),
    ("amueblado", lambda u: u.get("amueblado")),
]

# ─── lo que NUNCA debe viajar al público (decisión editorial explícita) ───────
NUNCA_PUBLICO = {
    "id",                    # id interno de la unidad
    "notas",                 # notas internas de la lista / founder
    "enganche_mxn", "credito_mxn", "reservacion_mxn", "contrato_mxn",
    "a_diferir_mxn",         # el dinero fino va por _unit_finance (esquema), no crudo
    "plano_archivo", "plano_fuente", "plano_mime",  # linaje interno
    "source", "created_at", "developer_id",
    "default_commission_pct", "comision", "commission",   # SENSIBLE entre devs (founder 07-15)
    "_editado_por_dev", "_pago_dev", "_colonia_id", "_primera_foto", "_edad_dias",
}


# ─── LA PUERTA: qué desarrollo alcanza a ver un comprador ─────────────────────
# POR QUÉ (auditoría A–Z 07-26): había DOS interruptores de publicación y solo uno conectado. La
# puerta miraba `marketplace_published` y nadie leía `published`, así que NUA Interlomas y Nupol
# Nuevo Polanco estaban marcados "no publicado" y seguían VIVOS al público captando compradores.
# Creer que bajaste un desarrollo y que siga publicado es de las fallas más caras que puede tener
# esto, porque nadie la nota: la pantalla te dice que está apagado.
#
# Regla, en una línea: **si CUALQUIER interruptor dice que no, no se publica.** Un "no" explícito
# siempre gana; para publicar hacen falta los dos en sí (o en blanco, que es el estado normal de
# casi todo el catálogo y significa "nunca se tocó").
#
# Vive aquí, con el resto del contrato, para que sea UN solo lugar: antes esta condición estaba
# copiada en 7 consultas distintas, y arreglar una dejaba las otras seis mal.
_NO_PUBLICABLE = [False, "pending", "no", "off"]

PUERTA_PUBLICA: Dict[str, Any] = {
    "marketplace_published": {"$nin": _NO_PUBLICABLE},
    "published": {"$nin": _NO_PUBLICABLE},
}


def puerta_publica(**extra: Any) -> Dict[str, Any]:
    """La condición de visibilidad pública, más lo que le quieras sumar.

    Uso:  db.developments.find(puerta_publica(id=dev_id))
    """
    return {**PUERTA_PUBLICA, **extra}


def es_publico(d: Dict[str, Any]) -> bool:
    """Misma regla que `PUERTA_PUBLICA`, para documentos que ya están en memoria."""
    return not any(d.get(k) in _NO_PUBLICABLE for k in PUERTA_PUBLICA)


def tarjeta_publica_unidad(u: Dict[str, Any]) -> Dict[str, Any]:
    """La tarjeta pública, construida SOLO desde el contrato. La usa routes/public.py."""
    return {campo: fn(u) for campo, fn in CONTRATO_UNIDAD}


def violaciones_contrato(u_interna: Dict[str, Any],
                         tarjeta: Dict[str, Any]) -> List[str]:
    """Verificador puro (lo usa el test y la auditoría viva): ¿la tarjeta trae TODO lo
    del contrato con el valor correcto, y NADA de lo prohibido?"""
    out = []
    for campo, fn in CONTRATO_UNIDAD:
        esperado = fn(u_interna)
        if tarjeta.get(campo) != esperado:
            out.append(f"{campo}: la tarjeta dice {tarjeta.get(campo)!r} "
                       f"pero el átomo dice {esperado!r}")
    for campo in tarjeta:
        if campo in NUNCA_PUBLICO:
            out.append(f"{campo}: campo INTERNO expuesto al público")
    return out
