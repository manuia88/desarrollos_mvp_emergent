"""EL COTEJO — detector de contradicciones entre fuentes (lista vs plano vs brochure).

Regla founder (07-15): cada dato importante se coteja entre las fuentes que lo mencionan.
  · Coinciden 2+ fuentes → dato VERIFICADO (sello verde — nadie más en el mercado lo tiene).
  · Se contradicen → CONTRADICCIÓN en ámbar, con ambos valores y de dónde salió cada uno,
    para que el founder decida (caso real que lo parió: la lista de Almina decía 2 recámaras
    y el plano decía 3 con flex — lo cazamos a mano; esto lo sistematiza).
  · Solo una fuente → sin sello (dato normal).

Lógica pura en cotejar_* (testeable sin Mongo); persistencia en cotejar_desarrollo().
Colección: cotejo_datos (un doc por desarrollo, se regenera al conciliar). $0, sin IA.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

TOL_M2_PCT = 0.05          # ±5%: los planos dicen "superficies aproximadas"
COINCIDE, CONTRADICE, UNA_FUENTE = "coincide", "contradice", "solo_una_fuente"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ─── veredictos puros ─────────────────────────────────────────────────────────
def cotejar_numero(campo: str, fuentes: Dict[str, Optional[float]],
                   tol_pct: float = TOL_M2_PCT) -> Dict[str, Any]:
    """Compara un número entre fuentes. Tolerancia % para m² (planos = 'aprox')."""
    con_dato = {f: v for f, v in fuentes.items() if v is not None}
    if len(con_dato) < 2:
        return {"campo": campo, "fuentes": con_dato, "veredicto": UNA_FUENTE}
    vals = list(con_dato.values())
    ref = max(abs(v) for v in vals) or 1
    ok = (max(vals) - min(vals)) <= ref * tol_pct
    return {"campo": campo, "fuentes": con_dato,
            "veredicto": COINCIDE if ok else CONTRADICE,
            "delta": round(max(vals) - min(vals), 2)}


def cotejar_exacto(campo: str, fuentes: Dict[str, Any],
                   nota_si_contradice: str = "") -> Dict[str, Any]:
    """Compara valores exactos (recámaras, torre). La nota explica el caso FLEX."""
    con_dato = {f: v for f, v in fuentes.items() if v is not None and v != ""}
    if len(con_dato) < 2:
        return {"campo": campo, "fuentes": con_dato, "veredicto": UNA_FUENTE}
    ok = len(set(str(v) for v in con_dato.values())) == 1
    out = {"campo": campo, "fuentes": con_dato,
           "veredicto": COINCIDE if ok else CONTRADICE}
    if not ok and nota_si_contradice:
        out["nota"] = nota_si_contradice
    return out


def resumen_cotejo(checks: List[Dict[str, Any]]) -> Dict[str, int]:
    r = {COINCIDE: 0, CONTRADICE: 0, UNA_FUENTE: 0}
    for c in checks:
        r[c["veredicto"]] = r.get(c["veredicto"], 0) + 1
    return r


# ─── el cotejo de un desarrollo (lista ⨯ plano ⨯ brochure) ────────────────────
async def cotejar_desarrollo(db, development_id: str) -> Dict[str, Any]:
    moldes = await db.dmx_prototypes.find({"development_id": development_id},
                                          {"_id": 0}).to_list(200)
    programas = {p["prototype_id"]: p for p in await db.molde_programa.find(
        {"development_id": development_id}, {"_id": 0}).to_list(200)}
    units = await db.units.find({"development_id": development_id}, {"_id": 0}).to_list(2000)

    checks: List[Dict[str, Any]] = []
    for m in moldes:
        pid = m.get("prototype_id")
        prog = programas.get(pid) or {}
        us = [u for u in units if u.get("prototype_id") == pid]
        etiqueta = m.get("nombre") or pid

        # m² totales: lista (promedio del molde) vs plano (Área impresa)
        c = cotejar_numero("m2", {"lista": m.get("m2_construido"),
                                  "plano": prog.get("area_plano_m2")})
        checks.append({**c, "ambito": "molde", "ref": pid, "etiqueta": etiqueta})

        # recámaras: lista vs plano (el caso FLEX de Almina vive aquí)
        c = cotejar_exacto("recamaras", {"lista": m.get("recamaras"),
                                         "plano": prog.get("recamaras_plano")},
                           nota_si_contradice="posible recámara FLEX: el plano ofrece la "
                                              "conversión y la lista vende ambas versiones")
        checks.append({**c, "ambito": "molde", "ref": pid, "etiqueta": etiqueta})

        # terraza: lista (m2_terrace de sus unidades) vs plano ("Terraza:")
        terrazas = [u.get("m2_terrace") for u in us if u.get("m2_terrace")]
        t_lista = round(sum(terrazas) / len(terrazas), 1) if terrazas else None
        c = cotejar_numero("terraza_m2", {"lista": t_lista,
                                          "plano": prog.get("terraza_plano_m2")},
                           tol_pct=0.10)
        checks.append({**c, "ambito": "molde", "ref": pid, "etiqueta": etiqueta})

    # amenidades: brochure (promesa) vs renders etiquetados (evidencia visual)
    d = await db.developments.find_one({"id": development_id}, {"_id": 0, "amenities": 1})
    amen_doc = await db.project_amenities.find_one({"project_id": development_id}, {"_id": 0})
    prometidas = [str(a).strip().lower() for a in
                  ((amen_doc or {}).get("amenities") or (d or {}).get("amenities") or [])]
    conceptos = set()
    async for a in db.dev_assets.find({"development_id": development_id,
                                       "concepto": {"$nin": [None, ""]}},
                                      {"_id": 0, "concepto": 1}):
        conceptos.add(a["concepto"])
    for am in prometidas:
        con_render = any(am in c or c in am for c in conceptos)
        checks.append({"campo": "amenidad", "ambito": "desarrollo", "ref": am,
                       "etiqueta": am,
                       "fuentes": {"brochure": am,
                                   "render": "con evidencia visual" if con_render else None},
                       "veredicto": COINCIDE if con_render else UNA_FUENTE})

    doc = {"development_id": development_id, "checks": checks,
           "resumen": resumen_cotejo(checks), "cotejado_at": _now_iso()}
    await db.cotejo_datos.update_one({"development_id": development_id},
                                     {"$set": doc}, upsert=True)
    return doc
