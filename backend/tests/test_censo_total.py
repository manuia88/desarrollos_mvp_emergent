"""EL CENSO (capa 6): comparadores puros + el cable-trampa del contrato de carga."""
import re

from censo_total import (CAMPOS_LISTA, censar_unidad, comparar_campo,
                         indexar, resumen_censo)


def test_comparar_campo_veredictos():
    u = {"m2_balcony": 14.31, "patio_m2": 18.14}
    assert comparar_campo("price_mxn", 10_350_000, 10_350_000, 2, u)["v"] == "coincide"
    assert comparar_campo("price_mxn", 10_350_000, 10_950_000, 2, u)["v"] == "discrepa"
    assert comparar_campo("price_mxn", 10_350_000, None, 2, u)["v"] == "sin_fuente"
    # vacío ≡ cero SOLO en exteriores (columna presente y vacía)
    assert comparar_campo("m2_roof_garden", None, 0, 0.06, u)["v"] == "coincide"
    assert comparar_campo("size_m2", None, 186.95, 0.06, u)["v"] == "discrepa"
    # bool de bodega ≡ conteo 1
    assert comparar_campo("bodega", True, 1, 0.01, u)["v"] == "coincide"


def test_censo_caza_el_bug_dessea_102():
    """El caso exacto que pasó la puerta grande: total pisado + terraza tirada.
    El censo lo marca; y con el dato reparado + Maestro con definición distinta,
    el conciliador lo explica en vez de inventar pelea."""
    fila_lista = {"unidad": "2- 102", "precio": 10_350_000, "credito": 7_250_000,
                  "enganche": 3_100_000, "m2_habitable": 186.95, "m2_total": 219.40,
                  "m2_balcon": 14.31, "m2_patio": 18.14, "m2_roof": 0.0,
                  "bodegas": 1, "estacionamientos": 3}
    mutilada = {"unit_number": "2- 102", "price_mxn": 10_350_000,
                "credito_mxn": 7_250_000, "enganche_mxn": 3_100_000,
                "size_m2": 186.95, "m2_total": 186.95,      # ← pisado
                "m2_balcony": 14.31, "parking_spots": 3, "bodega": True}
    vs = censar_unidad(mutilada, fila_lista, None)
    malos = {v["campo"] for v in vs if v["v"] == "discrepa"}
    assert "m2_total" in malos and "patio_m2" in malos     # CAZADO ✓
    reparada = {**mutilada, "m2_total": 219.40, "patio_m2": 18.14,
                "bedrooms": 3, "bathrooms": 3}
    fila_maestro = {"_producto": "x", "bedrooms": 3, "bathrooms": 3,
                    "m2_habitable": 205.09, "precio": 10_350_000}
    vs2 = censar_unidad(reparada, fila_lista, fila_maestro)
    assert not [v for v in vs2 if v["v"] == "discrepa"]
    r = resumen_censo(vs2)
    assert r["pct"] == 100.0 and r["comparados"] >= 10
    # sin renglón de lista, el 205.09 del Maestro se CONCILIA (no pelea, definición)
    vs3 = censar_unidad(reparada, None, fila_maestro)
    assert any(v["v"] == "conciliado" and "patio" in v["nota"] for v in vs3)
    assert not [v for v in vs3 if v["v"] == "discrepa"]


def test_censo_unidad_sin_fuente_se_declara():
    vs = censar_unidad({"unit_number": "X-1"}, None, None)
    assert vs[0]["v"] == "sin_fuente" and vs[0]["campo"] == "*"


def test_indexar_identidades():
    idx = indexar([{"unidad": "0101"}, {"unidad": "B 102"}], "unidad")
    assert idx["101"]["unidad"] == "0101" and idx["B-102"]["unidad"] == "B 102"


def test_cable_trampa_contrato_de_carga():
    """TRIPWIRE (lección Dessea 102): cada campo que el vocabulario del masivo
    produce DEBE aparecer en la rama de INSERT del merge — si alguien agrega un
    campo y olvida la carga, este test truena ANTES de mutilar datos."""
    from masivo_class import _MAPA_VP
    fuente = open("bulk_ingest_engine.py", encoding="utf-8").read()
    m = re.search(r"await db\.units\.insert_one\(\{(.*?)\}\)", fuente, re.DOTALL)
    assert m, "no encontré la rama de insert del merge"
    insert_src = m.group(1)
    # el dinero fino entra vía _payment_fields(...) — cuenta como cubierto si esa
    # llamada está en el insert Y las llaves viven en _PAY_KEYS
    from bulk_ingest_engine import _PAY_KEYS
    cubiertos_por_pagos = set(_PAY_KEYS) if "_payment_fields" in insert_src else set()
    faltan = [campo for campo in _MAPA_VP.values()
              if campo not in insert_src and campo != "unit_number"
              and campo not in cubiertos_por_pagos]
    assert not faltan, f"campos del vocabulario que el INSERT tiraría: {faltan}"
    # y el censo debe COMPARAR todo campo del vocabulario que venga de la lista
    censados = {c for c, _, _ in CAMPOS_LISTA}
    sin_censo = [c for c in _MAPA_VP.values()
                 if c not in censados and c not in ("unit_number",)]
    assert not sin_censo, f"campos sin censo: {sin_censo}"
