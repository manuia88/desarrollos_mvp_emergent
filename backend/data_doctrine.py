"""
data_doctrine — F1.1 · Doctrina de Datos (fuente ÚNICA de la verdad sobre el origen de cada número).
═══════════════════════════════════════════════════════════════════════════════
EL PROBLEMA QUE EVITA: que un SUPUESTO se muestre como si fuera un DATO. Ya tuvimos
data mal calculada presentada con falsa precisión. La Doctrina formaliza CÓMO etiquetar
cada número para que el usuario (cualquier portal) sepa de dónde sale y cuánto confiar.

Este módulo es el catálogo canónico — lo consumen los 4 portales vía /api/doctrine y lo
usan los motores con `tag()` para emitir orígenes consistentes. Las BANDAS honestas
(percentiles + N) las da `metric_normalizer`; aquí va la TAXONOMÍA de origen + las 7 reglas.

Cero deuda: un solo lugar define los tipos; si cambia, cambia en toda la plataforma.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

# ─── Los 5 tipos de origen (de más a menos confiable) ─────────────────────────
# orden = jerarquía de confianza. color/icono para la UI; definición en lenguaje simple.
ORIGENES: List[Dict[str, Any]] = [
    {"id": "dato", "label": "Dato real", "color": "verde", "icono": "check",
     "confianza": 5,
     "definicion": "Medición real de una fuente oficial o de la operación (ej. valor catastral del "
                   "SIG, una venta cerrada). Es lo más confiable."},
    {"id": "benchmark", "label": "Índice oficial", "color": "verde", "icono": "landmark",
     "confianza": 4,
     "definicion": "Referencia de una fuente reconocida (ej. costo de obra de BANXICO/INEGI). "
                   "Confiable, pero general — no es de tu predio exacto."},
    {"id": "calculo", "label": "Cálculo", "color": "azul", "icono": "calculator",
     "confianza": 4,
     "definicion": "Resultado de una fórmula citada aplicada sobre datos reales (ej. la oferta "
                   "máxima del terreno). Confías en él tanto como en sus insumos."},
    {"id": "estimado", "label": "Estimado", "color": "ambar", "icono": "sparkle",
     "confianza": 2,
     "definicion": "Lo predice un modelo que aprende de datos reales, pero aún con pocos casos. "
                   "Útil como guía; mejora solo conforme llegan más datos."},
    {"id": "supuesto", "label": "Supuesto", "color": "gris", "icono": "info",
     "confianza": 1,
     "definicion": "Una referencia general usada porque aún no hay dato propio de la zona. "
                   "Cámbialo por tu número real para afinar el resultado."},
]
_ORIGEN_BY_ID = {o["id"]: o for o in ORIGENES}

# ─── Las 7 reglas inviolables (lenguaje simple para la UI) ─────────────────────
REGLAS: List[Dict[str, str]] = [
    {"n": "1", "titulo": "Cada número dice de dónde sale",
     "texto": "Separamos dato, índice, cálculo, estimado y supuesto — nunca te mostramos un supuesto disfrazado de dato."},
    {"n": "2", "titulo": "Toda fórmula tiene fuente",
     "texto": "Ningún cálculo es inventado: cada uno usa una fórmula con origen citado."},
    {"n": "3", "titulo": "Comparamos lo predicho con lo que pasó",
     "texto": "Confrontamos nuestras predicciones contra la realidad y medimos el error — así mejoran."},
    {"n": "4", "titulo": "Rangos honestos, no falsa precisión",
     "texto": "Preferimos decir «$21k–$24k (4 proyectos)» que un «$22,347» que aparenta una exactitud que no hay."},
    {"n": "5", "titulo": "«Sin dato aún» de verdad",
     "texto": "Si una zona tiene pocos casos, te damos la referencia de la alcaldía y te lo decimos claro."},
    {"n": "6", "titulo": "Nos calibramos contra casos reales",
     "texto": "Si el motor no reproduce un proyecto real conocido, la fórmula está mal — la corregimos."},
    {"n": "7", "titulo": "Encendemos al final, en silencio",
     "texto": "Un índice mide su error antes de mostrarse o venderse — primero acierta, luego se publica."},
]

# ─── Madurez por motor/índice ─────────────────────────────────────────────────
MADUREZ: List[Dict[str, str]] = [
    {"id": "experimental", "label": "Experimental", "color": "ambar",
     "texto": "En pruebas — úsalo como orientación, no para decidir solo."},
    {"id": "validado", "label": "Validado", "color": "verde",
     "texto": "Ya midió su error contra casos reales y acierta dentro de margen."},
    {"id": "robusto", "label": "Robusto", "color": "verde",
     "texto": "Validado y estable en el tiempo — listo para vender como producto de datos."},
]


def origen(id_: str) -> Dict[str, Any]:
    """Descriptor canónico de un tipo de origen (para la UI)."""
    return _ORIGEN_BY_ID.get(id_) or _ORIGEN_BY_ID["supuesto"]


def tag(origen_id: str, *, fuente: str = "", n: Optional[int] = None,
        leyenda: str = "") -> Dict[str, Any]:
    """Etiqueta de origen normalizada para que CUALQUIER motor la emita igual.
    Úsala en los engines: `**tag("dato", fuente="SIG CDMX")`."""
    o = origen(origen_id)
    out = {"origen": o["id"], "origen_label": o["label"], "origen_color": o["color"],
           "confianza": o["confianza"]}
    if fuente:
        out["fuente"] = fuente
    if n is not None:
        out["n"] = n
    if leyenda:
        out["leyenda"] = leyenda
    return out


def legend() -> Dict[str, Any]:
    """Todo lo que la UI necesita para explicar la Doctrina (consumido por /api/doctrine)."""
    return {
        "titulo": "Cómo leemos los datos",
        "intro": "Cada número en la plataforma trae una etiqueta que dice de dónde sale y cuánto "
                 "puedes confiar en él. Esta es nuestra promesa: nunca te mostramos un supuesto "
                 "como si fuera un hecho.",
        "origenes": ORIGENES,
        "reglas": REGLAS,
        "madurez": MADUREZ,
    }
