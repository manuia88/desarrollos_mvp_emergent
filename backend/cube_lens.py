"""CUBO TOTAL F4 — LA CAPA DE LENTES: un cerebro, cuatro políticas.

El motor libre (cube_query_libre) y el espejo (demand_intelligence.espejo_de_corte) son
GOD-VIEW: números exactos, unidades exactas, todo el mercado. Fuera del superadmin ese
poder se sirve a través de una LENTE que aplica la política del rol:

    superadmin → todo exacto, celdas chicas ETIQUETADAS (ya existe, no pasa por aquí)
    dev        → mercado agregado con k≥3 · SUS unidades exactas · sin unidades ajenas
    asesor     → agregados k≥3 · unidades DISPONIBLES exactas (las vende) · sin prob_venta
    comprador  → agregados k≥5 (K_ANON_MIN canónico) · disponibles públicas · BANDAS, no exactos

Doctrina: fuera del superadmin una celda chica NO se etiqueta — SE SUPRIME. El espejo
público habla en bandas ("5-9 personas"), nunca en conteos exactos. Reusa K_ANON_MIN de
anonymization_engine (única fuente de verdad) — PROHIBIDO hardcodear el número.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from anonymization_engine import K_ANON_MIN

log = logging.getLogger("dmx.cube_lens")

K_INTERNA = 3   # lentes internas (dev/asesor): mismo K que el motor etiqueta

# qué ve cada rol (política declarativa — un solo lugar para razonar seguridad)
LENTES: Dict[str, Dict[str, Any]] = {
    "dev": {
        "k": K_INTERNA,
        "unidades": "propias",          # exactas solo las suyas; el resto agregado
        "campos_ocultos": [],           # su negocio: ve todo de lo suyo
        "espejo_exacto": True,          # números exactos (es SU mercado accionable)
    },
    "asesor": {
        "k": K_INTERNA,
        "unidades": "disponibles",      # vende inventario disponible; vendido = solo agregado
        "campos_ocultos": ["prob_venta"],   # score interno, no para pitch sin contexto
        "espejo_exacto": True,
    },
    "comprador": {
        "k": K_ANON_MIN,
        "unidades": "disponibles",
        "campos_ocultos": ["prob_venta", "dias_en_mercado"],
        "espejo_exacto": False,         # bandas, nunca conteos exactos en público
    },
    # F6 · el cliente de DATA (licencia): solo agregados k≥5, CERO unidades, CERO identidad de
    # devs, demanda en bandas, grupos también en banda de n. Nunca: unit_ids, nombres de dev,
    # celdas chicas, absorción de colonias con pocos contribuyentes.
    "partner": {
        "k": K_ANON_MIN,
        "unidades": "ninguna",
        "campos_ocultos": ["prob_venta", "dias_en_mercado", "development_id", "unit_id"],
        "espejo_exacto": False,
        "grupos_en_banda": True,
        "gate_contribuyentes": True,   # <3 devs distintos → suprime ritmo de venta (no re-identificable)
    },
}

MIN_CONTRIBUYENTES = 3   # doctrina licensable: absorción/vendidas de <3 devs = performance de UN competidor
# KPIs que revelan el ritmo de venta de un desarrollador identificable (se suprimen bajo el gate)
_KPIS_RITMO = ("vendidas", "disponibles", "absorcion_pct")

_BANDAS_PERSONAS = [(5, 9, "5-9"), (10, 24, "10-24"), (25, 49, "25-49"), (50, 10**9, "50+")]


def _banda_personas(n: int, k: int) -> Optional[str]:
    """Banda pública de demanda. n < k → None (SUPRIMIDO, no '1-4' que ya revela)."""
    if n < k:
        return None
    for lo, hi, etiqueta in _BANDAS_PERSONAS:
        if lo <= n <= hi:
            return etiqueta
    return None


def _limpia_unidad(u: Dict[str, Any], ocultos: List[str]) -> Dict[str, Any]:
    return {kk: vv for kk, vv in u.items() if kk not in ocultos}


async def consulta_con_lente(db, rol: str, filtros: List[Dict[str, Any]],
                             agrupar_por: Optional[List[str]] = None,
                             universo: str = "unidades",
                             own_development_ids: Optional[List[str]] = None) -> Dict[str, Any]:
    """El corte del cubo VISTO por un rol. Nunca devuelve una celda bajo el K de la lente:
    el total chico se declara suprimido; los grupos chicos se enmascaran (patrón mask_small_cells)."""
    lente = LENTES.get(rol)
    if lente is None:
        return {"ok": False, "errores": [f"rol sin lente: {rol}"]}
    import cube_query_libre as ql
    r = await ql.consulta(db, filtros, agrupar_por or [], universo=universo)
    if not r.get("ok"):
        return r
    k = lente["k"]
    out: Dict[str, Any] = {"ok": True, "universo": r.get("universo", universo), "rol": rol, "k": k}

    # total: bajo K se suprime el detalle (se dice que existe poco, no cuánto ni cuál)
    if r["n"] < k:
        out.update(n=None, suprimido=True,
                   mensaje=f"El corte tiene menos de {k} {'colonias' if universo == 'zonas' else 'unidades'} — "
                           f"no publicable a este nivel de detalle. Amplía el corte.")
        return out
    kpis = dict(r.get("kpis") or {})
    # GATE DE CONTRIBUYENTES (auditoría F6): si el corte tiene <3 desarrolladores distintos, los
    # KPIs de ritmo de venta (vendidas/disponibles/absorción) son la performance de UN competidor
    # identificable — se suprimen. Se cuentan devs sobre la muestra materializada (fail-safe:
    # sub-conteo → más supresión). El precio de LISTA se mantiene (es público en el marketplace).
    pocos_contribuyentes = False
    if lente.get("gate_contribuyentes") and universo == "unidades":
        n_devs = len({u.get("development_id") for u in (r.get("unidades") or []) if u.get("development_id")})
        if n_devs < MIN_CONTRIBUYENTES:
            pocos_contribuyentes = True
            for _kk in _KPIS_RITMO:
                kpis.pop(_kk, None)
    # HONESTIDAD: el headline público es DISPONIBLES (lo que de verdad queda), no el total del
    # corte — contar vendidas+reservadas infla urgencia Y filtra absorción de un dev identificable.
    out.update(n=r["n"], suprimido=False, kpis=kpis,
               n_disponibles=(None if pocos_contribuyentes else kpis.get("disponibles")) if universo == "unidades" else None,
               pocos_contribuyentes=pocos_contribuyentes)

    # grupos: celda chica → enmascarada (cuenta que existe, sin números)
    grupos = []
    for g in r.get("grupos") or []:
        if g["n"] < k:
            grupos.append({"valores": g["valores"], "n": None, "enmascarado": True})
        elif lente.get("grupos_en_banda"):
            # partner: ni el n del grupo viaja exacto — banda + kpis de promedio (no conteos)
            kp = g.get("kpis") or {}
            grupos.append({"valores": g["valores"], "n_banda": _banda_personas(g["n"], k),
                           "enmascarado": False,
                           "kpis": {kk: vv for kk, vv in kp.items()
                                    if kk in ("precio_prom", "precio_m2_prom", "mens_80_20_prom")}})
        else:
            grupos.append({**g, "enmascarado": False})
    if grupos:
        out["grupos"] = grupos

    # unidades exactas según la política del rol
    if universo == "unidades" and lente["unidades"] == "ninguna":
        out["unidades"] = []
        out["unidades_nota"] = "sin unidades individuales (lente de agregados)"
    elif universo == "unidades":
        propias = set(own_development_ids or [])
        unidades = []
        for u in r.get("unidades") or []:
            es_propia = u.get("development_id") in propias
            if lente["unidades"] == "propias" and not es_propia:
                continue
            if lente["unidades"] == "disponibles" and u.get("status") != "disponible":
                continue
            unidades.append(_limpia_unidad(u, lente["campos_ocultos"]))
        out["unidades"] = unidades
        out["unidades_nota"] = ("solo tus unidades" if lente["unidades"] == "propias"
                                else "solo disponibles")
    else:
        out["colonias"] = r.get("colonias") or []
    return out


async def espejo_con_lente(db, rol: str, filtros: List[Dict[str, Any]],
                           universo: str = "unidades",
                           n_oferta: Optional[int] = None) -> Dict[str, Any]:
    """El espejo de demanda VISTO por un rol. Interno (dev/asesor): exacto con K etiquetado.
    Público (comprador): BANDAS — '10-24 personas buscan esto', jamás el conteo exacto."""
    lente = LENTES.get(rol)
    if lente is None:
        return {"ok": False, "errores": [f"rol sin lente: {rol}"]}
    import demand_intelligence as di
    r = await di.espejo_de_corte(db, filtros, universo=universo, n_oferta=n_oferta)
    k = lente["k"]
    # ESPEJO TOTAL: si ningún filtro tiene cara de demanda, el número es TODO el mercado — NO
    # se presenta como demanda del corte en NINGUNA lente (los números viajan nulos + flag).
    if r.get("espejo_total_mercado"):
        return {"ok": True, "rol": rol, "k": k, "espejo_total_mercado": True,
                "personas": None, "busquedas": None, "tension_por_unidad": None,
                "momentum_pct": None, "personas_banda": None, "hay_demanda": False,
                "caliente": False, "momentum": None, "desde_dias": r.get("desde_dias"),
                "espejo_parcial": True, "publicable": False,
                "lectura": "los filtros de este corte no tienen cara de demanda — sin espejo honesto"}
    if lente["espejo_exacto"]:
        return {**r, "ok": True, "rol": rol, "k": k, "publicable": r["personas"] >= k}
    # lente pública: bandas + supresión bajo K
    banda = _banda_personas(r["personas"], k)
    caliente = bool(r.get("tension_por_unidad") and r["tension_por_unidad"] >= 1.0
                    and r["personas"] >= k)
    return {
        "ok": True, "rol": rol, "k": k,
        "personas_banda": banda,                       # None = suprimido (menos de K)
        "hay_demanda": banda is not None,
        "caliente": caliente,                          # ≥1 persona/unidad Y sobre el K
        "momentum": ("subiendo" if (r.get("momentum_pct") or 0) > 0 else
                     "bajando" if (r.get("momentum_pct") or 0) < 0 else None)
                    if banda is not None else None,    # sin banda no se insinúa tendencia
        "desde_dias": r["desde_dias"],
        "espejo_parcial": r.get("espejo_parcial", False),
        "lectura": (f"{banda} personas buscaron algo así en {r['desde_dias']} días"
                    if banda else "demanda aún chica para publicarse — sin número"),
    }
