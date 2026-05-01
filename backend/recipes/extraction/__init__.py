"""Phase 7.2 — JSON Schema templates per doc_type.

Each template defines:
- ``schema``: dict with field_name -> type description (or sub-schema). Drives prompt + light validation.
- ``description``: brief context for Claude.
- ``hints``: optional extra instructions appended to user prompt.

ALL fields default to ``null`` if not found. Cero invención.
"""

from __future__ import annotations
from typing import Any, Dict


TEMPLATES: Dict[str, Dict[str, Any]] = {
    "lp": {
        "description": "Lista de precios / tabulador de unidades de un desarrollo inmobiliario.",
        "schema": {
            "unidades": "array<{tipo: string|null, m2: number|null, precio: number|null, recamaras: number|null, banos: number|null, planta: string|null, status: string|null}>",
            "esquemas_pago": "array<string>|null",
            "vigencia": "string ISO date|null",
            "fecha": "string ISO date|null",
        },
        "hints": "Devuelve precios en MXN como número limpio (sin símbolos ni comas). Si la lista no incluye unidades concretas, devuelve `unidades: []`.",
    },
    "brochure": {
        "description": "Brochure / material de marketing del desarrollo.",
        "schema": {
            "description": "string|null",
            "amenidades": "array<string>",
            "hero_text": "string|null",
            "palabras_clave": "array<string>",
        },
        "hints": "`description` debe ser un párrafo conciso (≤500 chars). `amenidades` y `palabras_clave` son listas; deja `[]` si no encuentras.",
    },
    "escritura": {
        "description": "Escritura pública notarial de un predio.",
        "schema": {
            "propietario_actual": "string|null",
            "predio_referencia": "string|null",
            "superficie_total": "number m2|null",
            "clausulas_importantes": "array<string>",
            "notario": "string|null",
            "fecha": "string ISO date|null",
            "no_escritura": "string|null",
        },
        "hints": "`clausulas_importantes` resume cláusulas clave (gravámenes, restricciones, servidumbres). Máx 6 items, cada uno ≤200 chars.",
    },
    "permiso_seduvi": {
        "description": "Permiso SEDUVI (CDMX) o equivalente municipal de uso de suelo / densidad autorizada.",
        "schema": {
            "unidades_autorizadas": "number|null",
            "uso_suelo": "string|null",
            "densidad": "string|null",
            "altura_max": "string|null",
            "vigencia": "string ISO date|null",
            "no_oficio": "string|null",
        },
        "hints": "`uso_suelo` típicamente es código tipo HM, H, HC, HO, etc. + descripción.",
    },
    "estudio_suelo": {
        "description": "Estudio de mecánica de suelos.",
        "schema": {
            "tipo_suelo": "string|null",
            "capacidad_carga": "string|null",
            "riesgo_sismo": "string|null",
            "riesgo_inundacion": "string|null",
            "recomendaciones": "array<string>",
            "laboratorio": "string|null",
            "fecha": "string ISO date|null",
        },
        "hints": "`recomendaciones` es lista de cimentación recomendada y mitigaciones. Máx 5 items.",
    },
    "licencia_construccion": {
        "description": "Licencia de construcción / obra emitida por autoridad municipal o alcaldía.",
        "schema": {
            "autoridad": "string|null",
            "no_licencia": "string|null",
            "vigencia": "string ISO date|null",
            "m2_construccion": "number|null",
            "niveles": "number|null",
            "fecha_emision": "string ISO date|null",
            "fecha_vencimiento": "string ISO date|null",
        },
        "hints": "Si solo hay una vigencia única, ponla en `vigencia` y deja `fecha_emision` y `fecha_vencimiento` en null.",
    },
    "predial": {
        "description": "Comprobante / boleta de impuesto predial.",
        "schema": {
            "cuenta_catastral": "string|null",
            "vigencia": "string ISO date|null",
            "monto_pagado": "number MXN|null",
            "estatus_pago": "string|null",
        },
        "hints": "`estatus_pago` es uno de: 'pagado', 'pendiente', 'parcial', null si no detectable.",
    },
    "plano_arquitectonico": {
        "description": "Plano arquitectónico de un tipo de unidad.",
        "schema": {
            "tipo_unidad": "string|null",
            "m2": "number|null",
            "distribucion": "array<string>",
            "orientacion": "string|null",
            "escala": "string|null",
        },
        "hints": "`distribucion` lista los espacios (ej. 'recámara principal', 'baño 1', 'cocina', 'sala'). Máx 12 items.",
    },
    "contrato_cv": {
        "description": "Contrato de compraventa.",
        "schema": {
            "vendedor": "string|null",
            "comprador": "string|null",
            "predio": "string|null",
            "precio": "number MXN|null",
            "anticipo": "number MXN|null",
            "fecha_firma": "string ISO date|null",
        },
        "hints": "Personas físicas o morales completas. Precios en MXN número limpio.",
    },
    "constancia_fiscal": {
        "description": "Constancia de situación fiscal SAT.",
        "schema": {
            "rfc": "string|null",
            "razon_social": "string|null",
            "regimen": "string|null",
            "fecha_emision": "string ISO date|null",
        },
        "hints": "RFC formato 12 o 13 chars alfanumérico. `regimen` es el régimen fiscal (ej. 'Régimen General de Ley Personas Morales').",
    },
    "otro": {
        "description": "Documento no clasificado en los tipos específicos.",
        "schema": {
            "resumen": "string|null",
            "palabras_clave": "array<string>",
            "temas_detectados": "array<string>",
        },
        "hints": "`resumen` ≤400 chars. `palabras_clave` y `temas_detectados` son listas con máx 8 items cada una.",
    },
}


# ─── Schema validators (light) ────────────────────────────────────────────────
EXPECTED_KEYS: Dict[str, set] = {k: set(v["schema"].keys()) for k, v in TEMPLATES.items()}


def get_template(doc_type: str) -> Dict[str, Any]:
    return TEMPLATES.get(doc_type, TEMPLATES["otro"])


def validate_extraction_keys(doc_type: str, data: Dict[str, Any]) -> tuple[bool, list[str]]:
    """Returns (ok, missing_keys). Extra keys are allowed."""
    expected = EXPECTED_KEYS.get(doc_type, EXPECTED_KEYS["otro"])
    missing = [k for k in expected if k not in data]
    return (len(missing) == 0, missing)
