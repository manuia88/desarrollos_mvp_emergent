"""CUBO TOTAL F3 — Atlax compilador de preguntas: español → corte del cubo.

'¿cuántos depas con balcón bajo $30k de mensualidad hay en Benito Juárez?' → {universo, filtros, agrupar_por}.
REUSA el patrón canónico de reverse_search_engine (system prompt JSON-only + sanitize + json.loads con
regex fallback + whitelist) y el registro CAMPOS de cube_query_libre como única fuente de verdad.

Honestidad estructural: TODO lo que el LLM proponga pasa por cube_query_libre.validar(); un filtro
inválido se DESCARTA y se declara en `descartados` (nunca se inventa un corte que el motor no soporta).
Fail-soft: sin ANTHROPIC_API_KEY o con error del LLM cae al parser heurístico determinista (gratis).
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import logging
import re
from typing import Any, Dict, List, Optional

import cube_query_libre as ql

log = logging.getLogger("dmx.cube_query_nl")

_CACHE_TTL_MIN = 60 * 24          # una pregunta repetida no vuelve a pagar LLM en 24h
_MODELO = "claude-sonnet-4-5"     # alias normalizado por llm_client._MODEL_ALIASES

# ─── prompt: el registro de campos ES el contrato ─────────────────────────────

def _catalogo_para_prompt() -> str:
    d = ql.campos_disponibles()
    lineas = []
    for c in d["campos"]:
        ambito = "zona" if c.get("zona") else "unidad"
        lineas.append(f"- {c['key']} ({c['tipo']}, {ambito}{', agrupable' if c.get('agrupable') else ''}): {c['label']}")
    return "\n".join(lineas)


def _system_prompt() -> str:
    return f"""Eres el compilador de preguntas del cubo inmobiliario de CDMX. Convierte la pregunta del analista
(español) en un corte estructurado. Responde SOLO un objeto JSON válido, sin markdown ni texto extra:

{{"universo": "unidades"|"zonas", "filtros": [{{"campo": str, "op": str, "valor": any}}], "agrupar_por": [str], "interpretacion": str}}

REGLAS:
- universo "unidades" = preguntas sobre inventario/depas/precios/mensualidades/absorción (la oferta real).
- universo "zonas" = preguntas sobre colonias/zonas por sus índices (caminabilidad, seguridad, escuelas,
  gentrificación) SIN pedir unidades. En "zonas" solo usa campos de ámbito zona (+ colonia/alcaldia).
- Operadores válidos: eq, ne, lt, lte, gt, gte, in, between, exists. Para between el valor es [min, max]. Para in es lista.
- Dinero SIEMPRE en pesos MXN absolutos (ej. "30 mil"→30000, "8M"/"8 millones"→8000000).
- "mensualidad" → campo mens_80_20 (hipoteca 80% aforo 20 años, el escenario base).
- Colonias y alcaldías en slug minúsculas con guiones (ej. "Benito Juárez"→"benito-juarez", "Roma Norte"→"roma-norte").
- Índices de zona son 0-100: "caminable"→walkability gt 70 · "segura"→seguridad_zona gt 60 ·
  "buenas escuelas"→escuelas_zona gt 60 · "gentrificación baja/temprana"→gentrificacion_zona lt 30.
- Amenidades del edificio usan estos tokens exactos: alberca, gym, spa, roof, jardines, asadores,
  cancha_padel, pet, concierge, coworking ("con alberca y gym" → 2 filtros amenidades_edificio eq).
- agrupar_por solo con campos agrupables. "por colonia"→["colonia"], "por alcaldía"→["alcaldia"].
- interpretacion: UNA frase en español natural de lo que entendiste.
- NO inventes campos fuera del catálogo. Si algo no se puede filtrar, omítelo y menciónalo en interpretacion.

CATÁLOGO DE CAMPOS (única fuente válida):
{_catalogo_para_prompt()}"""


# ─── parser heurístico determinista (fallback gratis, sin LLM) ────────────────

_ALCALDIAS = ["alvaro-obregon", "azcapotzalco", "benito-juarez", "coyoacan", "cuajimalpa", "cuauhtemoc",
              "gustavo-a-madero", "iztacalco", "iztapalapa", "magdalena-contreras", "miguel-hidalgo",
              "milpa-alta", "tlahuac", "tlalpan", "venustiano-carranza", "xochimilco"]

_FEATURES = {"balcon": "has_balcon", "balcón": "has_balcon", "terraza": "has_terraza",
             "roof": "has_roof", "bodega": "has_bodega"}

# amenidades del edificio: MISMO vocabulario que developments.amenities / amenidades_pedidas
_AMENIDADES = {"alberca": "alberca", "gimnasio": "gym", "gym": "gym", "spa": "spa",
               "asadores": "asadores", "padel": "cancha_padel", "pádel": "cancha_padel",
               "jardines": "jardines", "coworking": "coworking", "pet friendly": "pet",
               "concierge": "concierge"}

# cache módulo del catálogo de colonias (2,788 ids) — se lee de la db 1 vez por hora
_COLONIAS_CACHE: Dict[str, Any] = {"at": None, "ids": []}


async def _colonias_conocidas(db) -> List[str]:
    now = dt.datetime.utcnow()
    if _COLONIAS_CACHE["at"] and (now - _COLONIAS_CACHE["at"]).total_seconds() < 3600:
        return _COLONIAS_CACHE["ids"]
    ids: List[str] = []
    try:
        async for c in db.colonias.find({}, {"_id": 0, "id": 1}):
            if c.get("id"):
                ids.append(c["id"])
        ids.sort(key=len, reverse=True)   # match más largo primero ('roma-norte' antes que 'roma')
        _COLONIAS_CACHE.update(at=now, ids=ids)
    except Exception:  # noqa: BLE001
        pass
    return _COLONIAS_CACHE["ids"] or ids

_INDICES_ZONA = [
    (re.compile(r"caminabl|walkab|a pie", re.I), ("walkability", "gt", 70)),
    (re.compile(r"segur", re.I), ("seguridad_zona", "gt", 60)),
    (re.compile(r"escuela|colegio", re.I), ("escuelas_zona", "gt", 60)),
    (re.compile(r"gentrif", re.I), ("gentrificacion_zona", "lt", 30)),
    (re.compile(r"vida nocturna|nocturn", re.I), ("vida_nocturna_zona", "gt", 60)),
]


def _slug(s: str) -> str:
    import unicodedata
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower().strip()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def _dinero(txt: str) -> Optional[float]:
    """'30 mil'→30000 · '$8,500,000'→8500000 · '8M'/'8 millones'→8000000 · 'medio millón'→500000."""
    t = txt.lower().replace(",", "")
    if re.search(r"medio\s+mill[oó]n", t):
        return 500_000.0
    # millones: la palabra completa, 'mdp', o '$8m' — NUNCA 'm' suelta ('65 m²' no son 65 millones)
    m = re.search(r"(\d+(?:\.\d+)?)\s*(?:mill[oó]n(?:es)?|mdp)\b", t) or re.search(r"\$(\d+(?:\.\d+)?)m\b", t)
    if m:
        return float(m.group(1)) * 1_000_000
    m = re.search(r"\$?\s*(\d+(?:\.\d+)?)\s*(mil|k)\b", t)
    if m:
        return float(m.group(1)) * 1_000
    m = re.search(r"\$\s*(\d{4,})", t)
    if m:
        return float(m.group(1))
    return None


def _heuristico(texto: str, colonias_catalogo: Optional[List[str]] = None) -> Dict[str, Any]:
    """Parser determinista: cubre los patrones más comunes en español sin LLM. Nunca lanza.
    Con colonias_catalogo (las 2,788 reales, orden largo→corto) también reconoce colonias."""
    t = texto.lower()
    filtros: List[Dict[str, Any]] = []
    partes: List[str] = []

    # universo: pregunta de zona pura (colonias + índices, sin pedir unidades/depas/precios)
    habla_zonas = bool(re.search(r"\bcolonias?\b|\bzonas?\b", t))
    habla_unidades = bool(re.search(r"depa|departamento|unidad|precio|mensualidad|venta|inventario|m2|m²|recamara|recámara", t))
    indices_hits = [(rx, spec) for rx, spec in _INDICES_ZONA if rx.search(t)]
    universo = "zonas" if (habla_zonas and indices_hits and not habla_unidades) else "unidades"

    t_slug_esp = " " + _slug(t).replace("-", " ") + " "

    # alcaldías por nombre
    for a in _ALCALDIAS:
        nombre = a.replace("-", " ")
        if f" {nombre} " in t_slug_esp or t_slug_esp.strip().endswith(nombre):
            filtros.append({"campo": "alcaldia", "op": "eq", "valor": a})
            partes.append(f"alcaldía {nombre}")
            break

    # colonias REALES del catálogo (match más largo primero; ≥5 chars para evitar ruido)
    for cid in (colonias_catalogo or []):
        if len(cid) < 5:
            continue
        nombre = cid.replace("-", " ")
        if f" {nombre} " in t_slug_esp or t_slug_esp.strip().endswith(nombre):
            filtros.append({"campo": "colonia", "op": "eq", "valor": cid})
            partes.append(f"colonia {nombre}")
            break

    if universo == "zonas":
        for _, (campo, op, valor) in indices_hits:
            filtros.append({"campo": campo, "op": op, "valor": valor})
            partes.append(f"{campo} {op} {valor}")
    else:
        # los índices de zona TAMBIÉN aplican en unidades (join _z del motor):
        # 'depas en colonias caminables' no debe perder 'caminables' en silencio
        for _, (campo, op, valor) in indices_hits:
            filtros.append({"campo": campo, "op": op, "valor": valor})
            partes.append(f"{campo} {op} {valor}")
        vistos: set = set()
        for kw, campo in _FEATURES.items():
            if kw in t and campo not in vistos:   # sin break: 'balcón y terraza' = 2 filtros; vistos dedupe alias
                vistos.add(campo)
                filtros.append({"campo": campo, "op": "eq", "valor": True})
                partes.append(f"con {kw}")
        # amenidades del edificio (alberca/gym/spa… mismo vocabulario que la oferta)
        am_vistas: set = set()
        for kw, token in _AMENIDADES.items():
            if kw in t and token not in am_vistas:
                am_vistas.add(token)
                filtros.append({"campo": "amenidades_edificio", "op": "eq", "valor": token})
                partes.append(f"con {kw}")
        # etapa y estado
        if "preventa" in t:
            filtros.append({"campo": "etapa", "op": "eq", "valor": "preventa"})
            partes.append("en preventa")
        if re.search(r"\bdisponibles?\b", t):
            filtros.append({"campo": "status", "op": "eq", "valor": "disponible"})
            partes.append("disponibles")
        elif re.search(r"\bvendid[ao]s?\b", t):
            filtros.append({"campo": "status", "op": "eq", "valor": "vendido"})
            partes.append("vendidas")
        # rango 'entre X y Y' (precio o mensualidad según contexto); grupo 2 greedy para
        # que '5 millones' no se corte en '5'
        m = re.search(r"entre\s+(.{1,30}?)\s+y\s+(.{1,30})", t)
        rango = None
        if m:
            lo, hi = _dinero(m.group(1)), _dinero(m.group(2))
            if lo and hi and lo < hi:
                campo = "mens_80_20" if "mensualidad" in t else "precio"
                filtros.append({"campo": campo, "op": "between", "valor": [lo, hi]})
                partes.append(f"{campo} entre ${lo:,.0f} y ${hi:,.0f}")
                rango = campo
        # mensualidad tope (si no se capturó ya como rango)
        if "mensualidad" in t and rango != "mens_80_20":
            v = _dinero(t)
            if v:
                filtros.append({"campo": "mens_80_20", "op": "lt", "valor": v})
                partes.append(f"mensualidad < ${v:,.0f}")
        elif rango is None and re.search(r"menos de|bajo|hasta|m[aá]ximo", t):
            v = _dinero(t)
            if v:
                campo = "precio" if v >= 300_000 else "mens_80_20"
                filtros.append({"campo": campo, "op": "lt", "valor": v})
                partes.append(f"{campo} < ${v:,.0f}")
        m = re.search(r"(\d+)\s*(?:m2|m²|metros)", t)
        if m and "mensualidad" not in (m.group(0) or ""):
            filtros.append({"campo": "m2", "op": "lt", "valor": float(m.group(1))})
            partes.append(f"< {m.group(1)}m²")
        m = re.search(r"(\d+)\s*rec[aá]maras?", t)
        if m:
            filtros.append({"campo": "recamaras", "op": "gte", "valor": int(m.group(1))})
            partes.append(f"{m.group(1)}+ recámaras")
        m = re.search(r"(\d+)\s*baños?", t)
        if m:
            filtros.append({"campo": "banos", "op": "gte", "valor": int(m.group(1))})
            partes.append(f"{m.group(1)}+ baños")

    agrupar: List[str] = []
    m = re.search(r"por\s+(colonia|alcald[ií]a|desarrollo|tipolog[ií]a)", t)
    if m:
        agrupar = [{"alcaldia": "alcaldia", "alcaldía": "alcaldia", "colonia": "colonia",
                    "desarrollo": "development_id", "tipologia": "tipologia", "tipología": "tipologia"}[m.group(1)]]

    return {"universo": universo, "filtros": filtros, "agrupar_por": agrupar,
            "interpretacion": ("Corte: " + " · ".join(partes)) if partes else "Sin filtros reconocidos — todo el mercado.",
            "fuente": "heuristico"}


# ─── LLM (patrón reverse_search: JSON-only + fallback) ────────────────────────

async def _llm(texto: str) -> Optional[Dict[str, Any]]:
    from llm_client import LlmChat, UserMessage, llm_available
    if not llm_available("anthropic"):
        return None
    try:
        from llm_safety import sanitize_user_input
        texto = sanitize_user_input(texto, max_len=300)
    except Exception:  # noqa: BLE001
        texto = (texto or "")[:300]
    try:
        chat = LlmChat(api_key=None, session_id="cube-nl", system_message=_system_prompt()) \
            .with_model("anthropic", _MODELO).with_max_tokens(700)
        raw = await chat.send_message(UserMessage(text=texto))
        try:
            parsed = json.loads(raw)
        except Exception:  # noqa: BLE001
            m = re.search(r"\{.*\}", raw, re.DOTALL)
            parsed = json.loads(m.group(0)) if m else None
        if not isinstance(parsed, dict):
            return None
        parsed["fuente"] = "llm"
        return parsed
    except Exception as e:  # noqa: BLE001
        log.warning(f"[cube_nl] LLM parse falló, cayendo a heurístico: {e}")
        return None


# ─── validación contra el motor (nada inválido pasa) ──────────────────────────

def _validar_propuesta(p: Dict[str, Any]) -> Dict[str, Any]:
    """Filtra la propuesta (LLM o heurística) por el validador REAL del motor: filtro a filtro,
    lo inválido se descarta y se DECLARA. El corte resultante siempre es ejecutable."""
    universo = p.get("universo") if p.get("universo") in ("unidades", "zonas") else "unidades"
    filtros_ok: List[Dict[str, Any]] = []
    descartados: List[str] = []
    for f in (p.get("filtros") or [])[:ql.MAX_FILTROS]:
        if not isinstance(f, dict):
            continue
        errs = ql.validar([f], [], universo)
        if errs:
            descartados.append(f"{f.get('campo')}: {errs[0]}")
            continue
        # validar() solo revisa campo+op; el VALOR lo revisamos aquí (un filtro con valor None
        # nunca matchearía → el corte prometería filtrar y devolvería 0 en silencio)
        op, valor = f["op"], f.get("valor")
        if op != "exists" and valor is None:
            descartados.append(f"{f.get('campo')}: sin valor")
            continue
        if op == "between" and not (isinstance(valor, (list, tuple)) and len(valor) == 2):
            descartados.append(f"{f.get('campo')}: between necesita [min, max]")
            continue
        if op == "in" and not isinstance(valor, (list, tuple)):
            valor = [valor]
        filtros_ok.append({"campo": f["campo"], "op": op, "valor": valor})
    agrupar_ok: List[str] = []
    for g in (p.get("agrupar_por") or [])[:ql.MAX_GRUPOS]:
        if not ql.validar([], [g], universo):
            agrupar_ok.append(g)
        else:
            descartados.append(f"agrupar {g}: no agrupable")
    return {"ok": True, "universo": universo, "filtros": filtros_ok, "agrupar_por": agrupar_ok,
            "interpretacion": str(p.get("interpretacion") or "")[:300], "fuente": p.get("fuente", "heuristico"),
            "descartados": descartados}


# ─── entrada pública ──────────────────────────────────────────────────────────

async def parsear_pregunta(db, texto: str) -> Dict[str, Any]:
    """Pregunta en español → corte validado. Cache 24h · LLM con fallback heurístico · nunca lanza."""
    texto = (texto or "").strip()
    if not texto:
        return {"ok": False, "errores": ["pregunta vacía"]}
    key = hashlib.sha256(texto.lower().encode()).hexdigest()[:24]
    try:
        hit = await db.cube_nl_cache.find_one({"key": key}, {"_id": 0})
        if hit and (dt.datetime.utcnow() - hit.get("at", dt.datetime.min)).total_seconds() < _CACHE_TTL_MIN * 60:
            return {**hit["res"], "cached": True}
    except Exception:  # noqa: BLE001
        pass
    propuesta = await _llm(texto) or _heuristico(texto, await _colonias_conocidas(db))
    res = _validar_propuesta(propuesta)
    try:
        await db.cube_nl_cache.update_one({"key": key}, {"$set": {"key": key, "res": res, "at": dt.datetime.utcnow()}},
                                          upsert=True)
    except Exception:  # noqa: BLE001
        pass
    return res
