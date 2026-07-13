"""
demand_graph_engine.py — LOS GRAFOS del genoma (Ola C: C4+C6+C7).

  · corredores()          — C6: colonias que COMPARTEN buscadores (el mercado relevante se define
                            por comportamiento, no por radio — mata la metodología de círculos).
  · set_competitivo()     — C7: unidades VISTAS por los mismos visitantes = el set competitivo
                            REAL por unidad (alimenta battle cards con dato, no con supuestos).
  · inexistente_a_brief() — C4: la demanda con CERO oferta (lo inexistente del espejo) se convierte
                            en una orden de trabajo y se despacha al buzón del dev (activacion →
                            cube_actions, patrón existente). El ciclo búsqueda→brief sin humanos.

FAIL-OPEN, procedencia, superadmin-only en superficie.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Set, Tuple

log = logging.getLogger("dmx.demand_graph")

_MIN_COMPARTIDOS = 2   # visitantes mínimos compartidos para publicar un corredor (k-anon suave)


# ── C6 · corredores de demanda ────────────────────────────────────────────────
async def corredores(db, top: int = 15) -> Dict[str, Any]:
    """Pares de colonias co-buscadas por los MISMOS visitantes → corredores de deseo."""
    vis_cols: Dict[str, Set[str]] = {}
    try:
        async for a in db.demand_atoms.find({}, {"_id": 0, "visitor_id": 1, "colonia": 1}):
            v = a.get("visitor_id")
            if v and a["colonia"] != "_sin_colonia":
                vis_cols.setdefault(v, set()).add(a["colonia"])
    except Exception as e:
        log.warning("[corredores] fail-open: %s", e)

    pares: Dict[Tuple[str, str], int] = {}
    buscadores_col: Dict[str, int] = {}
    for cols in vis_cols.values():
        for c in cols:
            buscadores_col[c] = buscadores_col.get(c, 0) + 1
        lista = sorted(cols)
        for i in range(len(lista)):
            for j in range(i + 1, len(lista)):
                k = (lista[i], lista[j])
                pares[k] = pares.get(k, 0) + 1

    filas = []
    for (a, b), n in pares.items():
        if n < _MIN_COMPARTIDOS:
            continue
        base = min(buscadores_col.get(a, 1), buscadores_col.get(b, 1))
        filas.append({"colonia_a": a, "colonia_b": b, "buscadores_compartidos": n,
                      "traslape_pct": round(100 * n / base, 1)})
    filas.sort(key=lambda f: -f["buscadores_compartidos"])
    lider = filas[0] if filas else None
    return {"n_corredores": len(filas), "corredores": filas[:top],
            "n_visitantes": len(vis_cols),
            "es_estimado": not bool(filas), "procedencia": "observado",
            "lectura": (f"Corredor #1: {lider['colonia_a']} ↔ {lider['colonia_b']} "
                        f"({lider['buscadores_compartidos']} buscadores compartidos, "
                        f"{lider['traslape_pct']}% de traslape) — compiten entre sí aunque el mapa diga otra cosa.")
                       if lider else "Aún sin visitantes que busquen en más de una colonia."}


# ── C7 · set competitivo real por unidad ─────────────────────────────────────
async def set_competitivo(db, unit_id: Optional[str] = None, top: int = 10) -> Dict[str, Any]:
    """Unidades co-vistas por el mismo visitante = con quién compites DE VERDAD (por unidad)."""
    vis_units: Dict[str, Set[str]] = {}
    try:
        async for s in db.buyer_signals.find({"type": "unit_view"}, {"_id": 0, "visitor_id": 1, "entity_id": 1}):
            v, e = s.get("visitor_id"), s.get("entity_id")
            if v and e:
                vis_units.setdefault(v, set()).add(str(e))
    except Exception as e:
        log.warning("[set_competitivo] fail-open: %s", e)

    pares: Dict[Tuple[str, str], int] = {}
    for units in vis_units.values():
        lista = sorted(units)
        for i in range(len(lista)):
            for j in range(i + 1, len(lista)):
                k = (lista[i], lista[j])
                pares[k] = pares.get(k, 0) + 1

    if unit_id:
        rivales: Dict[str, int] = {}
        for (a, b), n in pares.items():
            if a == unit_id:
                rivales[b] = rivales.get(b, 0) + n
            elif b == unit_id:
                rivales[a] = rivales.get(a, 0) + n
        filas = sorted([{"rival": r, "co_vistas": n} for r, n in rivales.items()],
                       key=lambda f: -f["co_vistas"])[:top]
        return {"unit_id": unit_id, "rivales": filas, "es_estimado": not bool(filas),
                "procedencia": "observado",
                "lectura": (f"El rival real de {unit_id} es {filas[0]['rival']} "
                            f"({filas[0]['co_vistas']} visitantes vieron ambas).") if filas else
                           f"Nadie ha co-visto {unit_id} con otra unidad aún."}

    filas = sorted([{"unidad_a": a, "unidad_b": b, "co_vistas": n} for (a, b), n in pares.items()],
                   key=lambda f: -f["co_vistas"])[:top]
    return {"pares_top": filas, "n_visitantes": len(vis_units),
            "es_estimado": not bool(filas), "procedencia": "observado",
            "lectura": (f"Par más competido: {filas[0]['unidad_a']} vs {filas[0]['unidad_b']} "
                        f"({filas[0]['co_vistas']} co-vistas).") if filas else
                       "Aún sin co-vistas entre unidades."}


# ── C4 · lo inexistente → orden de trabajo al dev ────────────────────────────
async def inexistente_a_brief(db, colonias: Optional[Set[str]] = None,
                              actor: str = "superadmin", top: int = 5) -> Dict[str, Any]:
    """Toma el TOP de demanda con CERO oferta (espejo) y lo despacha como acción al buzón del
    dev (cube_actions). El producto que nadie construye, convertido en instrucción con dato."""
    from demand_mirror import escasez
    esc = await escasez(db, colonias)
    inexistente = esc.get("lo_inexistente") or []
    if not inexistente:
        return {"ok": False, "despachado": False,
                "lectura": "No hay demanda con cero oferta en el territorio — nada que despachar."}

    llaves = inexistente[:top]
    detalle = " · ".join(f"{f['dimension'].split('.')[-1]}={f['valor']} ({f['demanda']} piden)"
                         for f in llaves)
    territorio = ", ".join(sorted(colonias)) if colonias else "toda la ciudad"
    from activacion import activar
    r = await activar(
        db, destino="dev",
        titulo=f"Lo inexistente · demanda sin oferta en {territorio}",
        detalle=f"El marketplace registra demanda SIN una sola unidad que la cumpla: {detalle}. "
                f"Producto sugerido para cubrir el hueco (dato observado, no supuesto).",
        colonia=(sorted(colonias)[0] if colonias else None),
        payload={"tipo": "inexistente_genoma", "llaves": llaves},
        actor=actor,
    )
    return {"ok": r.get("ok", False), "despachado": True, "n_llaves": len(llaves),
            "llaves": llaves, "accion": r.get("accion"),
            "lectura": f"Despachado al dev: {len(llaves)} llaves de demanda sin oferta ({territorio})."}
