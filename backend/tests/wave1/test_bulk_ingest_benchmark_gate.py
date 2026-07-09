"""CANDADO DE REGRESIÓN sobre el examen real (upgrade #4, examen2 07-08).

Congela los 11 proyectos del re-examen como benchmark: para cada uno, reconstruye la entrada mínima
del validador (unidades extraídas, listas que halló el recon, filas vistas) y asegura que el candado
de consistencia produce la MISMA decisión crítica registrada. Si un cambio de código voltea la decisión
de un proyecto real (p.ej. deja pasar un cascarón vacío), este test lo caza — cero API, 100% determinista.
"""
import json
import os

import pytest

import bulk_ingest_engine as bie

_FIXTURE = os.path.join(os.path.dirname(__file__), "..", "fixtures", "benchmark_examen.json")
with open(_FIXTURE) as _f:
    BENCHMARK = json.load(_f)


def _reconstruye(caso):
    """Entrada mínima del validador desde los hechos del benchmark."""
    n = caso["units_extraidas"]
    units = [{"unit_number": str(1000 + i), "price_mxn": 3_000_000, "size_m2_total": 60,
              "prototype": "01"} for i in range(n)]
    extracted = {"units": units}
    if caso.get("total_en_lista"):
        extracted["_total_en_lista"] = caso["total_en_lista"]
    if caso.get("total_independiente"):
        extracted["_total_independiente"] = caso["total_independiente"]
    plan = {"listas_precios": [{"name": f"lista_{i}.pdf"} for i in range(caso["listas_en_recon"])]}
    return extracted, plan


@pytest.mark.parametrize("caso", BENCHMARK, ids=[c["proyecto"][:24] for c in BENCHMARK])
def test_benchmark_decision_del_candado(caso):
    """El candado reproduce la decisión crítica registrada para cada proyecto real del examen."""
    extracted, plan = _reconstruye(caso)
    v = bie.validate_extraction(extracted, plan, {}, caso["proyecto"])
    assert v["critical_fail"] == caso["espera_critico"], (
        f"{caso['proyecto']}: crítico={v['critical_fail']} esperado={caso['espera_critico']} · "
        f"checks fallidos={[c['check'] for c in v['checks'] if not c['ok']]}")


def test_benchmark_cubre_los_modos_de_falla():
    """El benchmark debe seguir cubriendo cascarón-vacío (crítico) Y extracciones sanas (no crítico)."""
    criticos = [c for c in BENCHMARK if c["espera_critico"]]
    sanos = [c for c in BENCHMARK if not c["espera_critico"]]
    assert len(criticos) >= 2, "el benchmark perdió los casos de cascarón vacío"
    assert len(sanos) >= 5, "el benchmark perdió los casos sanos (multi-torre/rango)"
