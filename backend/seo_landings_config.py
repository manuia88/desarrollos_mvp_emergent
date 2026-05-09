"""W4.2D3 — Programmatic SEO Tier 1+2 config.

Defines:
  - COLONIAS_TARGET (40+): all DMX target colonias incluyendo las 16 con IE data + 24 nuevas sin seed
  - ALCALDIAS_CDMX (16): mapping slug → display name de CDMX
  - INTENT_LANDINGS (5): preventa, entrega-inmediata, estrenar, departamentos, casas

Used by routes_landings.py + sitemap seed.
"""
from __future__ import annotations

from typing import Dict, Any

# Tier 1 — 16 colonias con IE data (seedeadas en data_seed.COLONIAS)
# Tier 2 — 24 colonias sin IE data, anti-doorway con lead capture + comparables.
COLONIAS_TARGET: Dict[str, Dict[str, Any]] = {
    # ── Tier 1 — IE data disponible (16 zonas seedeadas) ──────────────────────
    "polanco":               {"name": "Polanco",                "alcaldia": "Miguel Hidalgo",  "alcaldia_slug": "miguel-hidalgo",  "has_ie_data": True},
    "lomas-chapultepec":     {"name": "Lomas de Chapultepec",   "alcaldia": "Miguel Hidalgo",  "alcaldia_slug": "miguel-hidalgo",  "has_ie_data": True},
    "roma-norte":            {"name": "Roma Norte",             "alcaldia": "Cuauhtémoc",      "alcaldia_slug": "cuauhtemoc",      "has_ie_data": True},
    "roma-sur":              {"name": "Roma Sur",               "alcaldia": "Cuauhtémoc",      "alcaldia_slug": "cuauhtemoc",      "has_ie_data": True},
    "condesa":               {"name": "Condesa",                "alcaldia": "Cuauhtémoc",      "alcaldia_slug": "cuauhtemoc",      "has_ie_data": True},
    "juarez":                {"name": "Juárez",                 "alcaldia": "Cuauhtémoc",      "alcaldia_slug": "cuauhtemoc",      "has_ie_data": True},
    "cuauhtemoc":            {"name": "Cuauhtémoc",             "alcaldia": "Cuauhtémoc",      "alcaldia_slug": "cuauhtemoc",      "has_ie_data": True},
    "del-valle-centro":      {"name": "Del Valle Centro",       "alcaldia": "Benito Juárez",   "alcaldia_slug": "benito-juarez",   "has_ie_data": True},
    "narvarte":              {"name": "Narvarte Poniente",      "alcaldia": "Benito Juárez",   "alcaldia_slug": "benito-juarez",   "has_ie_data": True},
    "napoles":               {"name": "Nápoles",                "alcaldia": "Benito Juárez",   "alcaldia_slug": "benito-juarez",   "has_ie_data": True},
    "escandon":              {"name": "Escandón",               "alcaldia": "Miguel Hidalgo",  "alcaldia_slug": "miguel-hidalgo",  "has_ie_data": True},
    "anzures":               {"name": "Anzures",                "alcaldia": "Miguel Hidalgo",  "alcaldia_slug": "miguel-hidalgo",  "has_ie_data": True},
    "doctores":              {"name": "Doctores",               "alcaldia": "Cuauhtémoc",      "alcaldia_slug": "cuauhtemoc",      "has_ie_data": True},
    "coyoacan-centro":       {"name": "Coyoacán Centro",        "alcaldia": "Coyoacán",        "alcaldia_slug": "coyoacan",        "has_ie_data": True},
    "pedregal":              {"name": "Jardines del Pedregal",  "alcaldia": "Álvaro Obregón",  "alcaldia_slug": "alvaro-obregon",  "has_ie_data": True},
    "santa-fe":              {"name": "Santa Fe",               "alcaldia": "Cuajimalpa",      "alcaldia_slug": "cuajimalpa",      "has_ie_data": True},

    # ── Tier 2 — Sin IE data (anti-doorway con lead capture) ──────────────────
    "ampliacion-napoles":    {"name": "Ampliación Nápoles",     "alcaldia": "Benito Juárez",   "alcaldia_slug": "benito-juarez",   "has_ie_data": False},
    "del-valle-norte":       {"name": "Del Valle Norte",        "alcaldia": "Benito Juárez",   "alcaldia_slug": "benito-juarez",   "has_ie_data": False},
    "del-valle-sur":         {"name": "Del Valle Sur",          "alcaldia": "Benito Juárez",   "alcaldia_slug": "benito-juarez",   "has_ie_data": False},
    "narvarte-oriente":      {"name": "Narvarte Oriente",       "alcaldia": "Benito Juárez",   "alcaldia_slug": "benito-juarez",   "has_ie_data": False},
    "vertiz-narvarte":       {"name": "Vértiz Narvarte",        "alcaldia": "Benito Juárez",   "alcaldia_slug": "benito-juarez",   "has_ie_data": False},
    "tlacoquemecatl":        {"name": "Tlacoquemécatl",         "alcaldia": "Benito Juárez",   "alcaldia_slug": "benito-juarez",   "has_ie_data": False},
    "ciudad-de-los-deportes":{"name": "Ciudad de los Deportes", "alcaldia": "Benito Juárez",   "alcaldia_slug": "benito-juarez",   "has_ie_data": False},
    "nochebuena":            {"name": "Nochebuena",             "alcaldia": "Benito Juárez",   "alcaldia_slug": "benito-juarez",   "has_ie_data": False},
    "extremadura-insurgentes":{"name": "Extremadura Insurgentes","alcaldia": "Benito Juárez",  "alcaldia_slug": "benito-juarez",   "has_ie_data": False},
    "insurgentes-mixcoac":   {"name": "Insurgentes Mixcoac",    "alcaldia": "Benito Juárez",   "alcaldia_slug": "benito-juarez",   "has_ie_data": False},
    "san-jose-insurgentes":  {"name": "San José Insurgentes",   "alcaldia": "Benito Juárez",   "alcaldia_slug": "benito-juarez",   "has_ie_data": False},
    "actipan":               {"name": "Actipan",                "alcaldia": "Benito Juárez",   "alcaldia_slug": "benito-juarez",   "has_ie_data": False},
    "acacias":               {"name": "Acacias",                "alcaldia": "Benito Juárez",   "alcaldia_slug": "benito-juarez",   "has_ie_data": False},
    "xoco":                  {"name": "Xoco",                   "alcaldia": "Benito Juárez",   "alcaldia_slug": "benito-juarez",   "has_ie_data": False},
    "santa-cruz-atoyac":     {"name": "Santa Cruz Atoyac",      "alcaldia": "Benito Juárez",   "alcaldia_slug": "benito-juarez",   "has_ie_data": False},
    "san-pedro-de-los-pinos":{"name": "San Pedro de los Pinos", "alcaldia": "Benito Juárez",   "alcaldia_slug": "benito-juarez",   "has_ie_data": False},
    "letran-valle":          {"name": "Letrán Valle",           "alcaldia": "Benito Juárez",   "alcaldia_slug": "benito-juarez",   "has_ie_data": False},
    "portales-norte":        {"name": "Portales Norte",         "alcaldia": "Benito Juárez",   "alcaldia_slug": "benito-juarez",   "has_ie_data": False},
    "portales-sur":          {"name": "Portales Sur",           "alcaldia": "Benito Juárez",   "alcaldia_slug": "benito-juarez",   "has_ie_data": False},
    "hipodromo":             {"name": "Hipódromo",              "alcaldia": "Cuauhtémoc",      "alcaldia_slug": "cuauhtemoc",      "has_ie_data": False},
    "hipodromo-condesa":     {"name": "Hipódromo Condesa",      "alcaldia": "Cuauhtémoc",      "alcaldia_slug": "cuauhtemoc",      "has_ie_data": False},
    "lomas-vista-hermosa":   {"name": "Lomas de Vista Hermosa", "alcaldia": "Cuajimalpa",      "alcaldia_slug": "cuajimalpa",      "has_ie_data": False},
    "guadalupe-inn":         {"name": "Guadalupe Inn",          "alcaldia": "Álvaro Obregón",  "alcaldia_slug": "alvaro-obregon",  "has_ie_data": False},
    "florida":               {"name": "Florida",                "alcaldia": "Álvaro Obregón",  "alcaldia_slug": "alvaro-obregon",  "has_ie_data": False},
    "del-carmen-coyoacan":   {"name": "Del Carmen",             "alcaldia": "Coyoacán",        "alcaldia_slug": "coyoacan",        "has_ie_data": False},
    "villa-coyoacan":        {"name": "Villa Coyoacán",         "alcaldia": "Coyoacán",        "alcaldia_slug": "coyoacan",        "has_ie_data": False},
    "claveria":              {"name": "Clavería",               "alcaldia": "Azcapotzalco",    "alcaldia_slug": "azcapotzalco",    "has_ie_data": False},
    "nueva-santa-maria":     {"name": "Nueva Santa María",      "alcaldia": "Azcapotzalco",    "alcaldia_slug": "azcapotzalco",    "has_ie_data": False},
    "san-miguel-chapultepec":{"name": "San Miguel Chapultepec", "alcaldia": "Miguel Hidalgo",  "alcaldia_slug": "miguel-hidalgo",  "has_ie_data": False},
    "granada":               {"name": "Granada",                "alcaldia": "Miguel Hidalgo",  "alcaldia_slug": "miguel-hidalgo",  "has_ie_data": False},
    "ampliacion-granada":    {"name": "Ampliación Granada",     "alcaldia": "Miguel Hidalgo",  "alcaldia_slug": "miguel-hidalgo",  "has_ie_data": False},
    "irrigacion":            {"name": "Irrigación",             "alcaldia": "Miguel Hidalgo",  "alcaldia_slug": "miguel-hidalgo",  "has_ie_data": False},
    "bosques-de-las-lomas":  {"name": "Bosques de las Lomas",   "alcaldia": "Miguel Hidalgo",  "alcaldia_slug": "miguel-hidalgo",  "has_ie_data": False},
    "polanco-1-seccion":     {"name": "Polanco 1ª Sección",     "alcaldia": "Miguel Hidalgo",  "alcaldia_slug": "miguel-hidalgo",  "has_ie_data": False},
    "polanco-2-seccion":     {"name": "Polanco 2ª Sección",     "alcaldia": "Miguel Hidalgo",  "alcaldia_slug": "miguel-hidalgo",  "has_ie_data": False},
    "polanco-3-seccion":     {"name": "Polanco 3ª Sección",     "alcaldia": "Miguel Hidalgo",  "alcaldia_slug": "miguel-hidalgo",  "has_ie_data": False},
    "polanco-4-seccion":     {"name": "Polanco 4ª Sección",     "alcaldia": "Miguel Hidalgo",  "alcaldia_slug": "miguel-hidalgo",  "has_ie_data": False},
    "polanco-5-seccion":     {"name": "Polanco 5ª Sección",     "alcaldia": "Miguel Hidalgo",  "alcaldia_slug": "miguel-hidalgo",  "has_ie_data": False},
}


# ── 16 alcaldías CDMX ─────────────────────────────────────────────────────────
ALCALDIAS_CDMX: Dict[str, str] = {
    "alvaro-obregon":      "Álvaro Obregón",
    "azcapotzalco":        "Azcapotzalco",
    "benito-juarez":       "Benito Juárez",
    "coyoacan":            "Coyoacán",
    "cuajimalpa":          "Cuajimalpa de Morelos",
    "cuauhtemoc":          "Cuauhtémoc",
    "gustavo-a-madero":    "Gustavo A. Madero",
    "iztacalco":           "Iztacalco",
    "iztapalapa":          "Iztapalapa",
    "magdalena-contreras": "La Magdalena Contreras",
    "miguel-hidalgo":      "Miguel Hidalgo",
    "milpa-alta":          "Milpa Alta",
    "tlahuac":             "Tláhuac",
    "tlalpan":             "Tlalpan",
    "venustiano-carranza": "Venustiano Carranza",
    "xochimilco":          "Xochimilco",
}


# ── 5 intent landings genéricos CDMX ──────────────────────────────────────────
INTENT_LANDINGS: Dict[str, Dict[str, Any]] = {
    "preventa": {
        "label": "Preventa CDMX",
        "title": "Departamentos en preventa en CDMX | DesarrollosMX",
        "description": "Encuentra departamentos en preventa en Ciudad de México con precios actualizados, plusvalía proyectada y desarrollos auditables por DesarrollosMX.",
        "stage_filter": "preventa",
        "tipo_filter": None,
    },
    "entrega-inmediata": {
        "label": "Entrega inmediata CDMX",
        "title": "Departamentos de entrega inmediata en CDMX | DesarrollosMX",
        "description": "Departamentos listos para mudarte hoy en CDMX. Inventario disponible filtrado, comparables hedónicos y Risk Score por colonia.",
        "stage_filter": "entrega_inmediata",
        "tipo_filter": None,
    },
    "estrenar": {
        "label": "Para estrenar CDMX",
        "title": "Departamentos para estrenar en CDMX | DesarrollosMX",
        "description": "Departamentos nuevos para estrenar en Ciudad de México: preventa + entrega inmediata + obra terminada.",
        "stage_filter": None,
        "tipo_filter": None,
    },
    "departamentos": {
        "label": "Departamentos CDMX",
        "title": "Departamentos en venta en CDMX | DesarrollosMX",
        "description": "Departamentos en venta en CDMX: 1, 2, 3 recámaras con datos auditables, DRPI y comparables verificados.",
        "stage_filter": None,
        "tipo_filter": "depto",
    },
    "casas": {
        "label": "Casas CDMX",
        "title": "Casas en venta en CDMX | DesarrollosMX",
        "description": "Casas en venta en Ciudad de México: residenciales, fraccionamientos y obra nueva con análisis Intelligence Engine.",
        "stage_filter": None,
        "tipo_filter": "casa",
    },
}


def colonias_by_alcaldia(alcaldia_slug: str) -> list:
    """Return list of (slug, info) of colonias inside an alcaldía."""
    return [
        {"slug": k, **v}
        for k, v in COLONIAS_TARGET.items()
        if v.get("alcaldia_slug") == alcaldia_slug
    ]


def top_colonias_with_data(limit: int = 5) -> list:
    """Return top colonias that have IE data, ordered (preset)."""
    preferred_order = [
        "polanco", "condesa", "roma-norte", "del-valle-centro",
        "santa-fe", "lomas-chapultepec", "coyoacan-centro",
        "anzures", "napoles", "narvarte",
    ]
    out = []
    for slug in preferred_order:
        info = COLONIAS_TARGET.get(slug)
        if info and info.get("has_ie_data"):
            out.append({"slug": slug, **info})
            if len(out) >= limit:
                break
    return out


def comparable_colonias(alcaldia_slug: str, exclude_slug: str = "", limit: int = 3) -> list:
    """Top colonias with IE data inside the given alcaldía (fallback to global top if none)."""
    matches = [
        {"slug": k, **v}
        for k, v in COLONIAS_TARGET.items()
        if v.get("alcaldia_slug") == alcaldia_slug
        and v.get("has_ie_data")
        and k != exclude_slug
    ]
    if matches:
        return matches[:limit]
    return [c for c in top_colonias_with_data(limit) if c["slug"] != exclude_slug][:limit]
