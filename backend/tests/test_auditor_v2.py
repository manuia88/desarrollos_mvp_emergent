"""Auditor v2 (07-16, founder: 'ampliar la mirada'): convención de m² por dev, campos por
tipo de unidad, plausibilidad espejo, nivel vs número, gangas sospechosas, moldes ?R."""
from auditor_catalogo import (convencion_m2, r_campos_obligatorios, r_ganga_sospechosa,
                              r_m2_coherencia, r_molde_sin_rec, r_nivel_vs_numero,
                              r_plausibilidad)


def _u(**kw):
    return {"unit_number": "101", "id": "u1", "tipo": "departamento", **kw}


def test_convencion_m2_se_aprende_del_dev():
    # Almina: totales = privativos (exteriores aparte) — la regla vieja marcaba 84 falsas
    almina = [{"m2_privative": 117, "m2_total": 117, "m2_terrace": 15.4},
              {"m2_privative": 112, "m2_total": 112, "m2_balcony": 7.4},
              {"m2_privative": 130, "m2_total": 130, "m2_terrace": 14.25}]
    assert convencion_m2(almina) == "total_igual_privativos"
    # GDC: totales = privativos + exteriores
    gdc = [{"m2_privative": 45, "m2_total": 56, "m2_balcony": 11},
           {"m2_privative": 46, "m2_total": 58.5, "m2_terrace": 12.5},
           {"m2_privative": 53, "m2_total": 59, "m2_balcony": 6}]
    assert convencion_m2(gdc) == "total_suma_exteriores"


def test_m2_coherencia_respeta_la_convencion():
    ctx = {"units": [{"m2_privative": 117, "m2_total": 117, "m2_terrace": 15.4},
                     {"m2_privative": 112, "m2_total": 112, "m2_balcony": 7.4},
                     {"m2_privative": 130, "m2_total": 130, "m2_terrace": 14.25}]}
    # bajo la convención de Almina, A-207 (117+15.4 ext, total 117) NO es alerta
    assert r_m2_coherencia(_u(m2_privative=117, m2_total=117, m2_terrace=15.4), ctx) is None
    # pero si totales ni siquiera cuadra con privativos → sí alerta
    h = r_m2_coherencia(_u(m2_privative=100, m2_total=130), ctx)
    assert h and h["regla"] == "m2_coherencia"


def test_campos_obligatorios_por_tipo():
    # un LOCAL sin precio/recámaras NO es error (aviso a lo mucho)
    h = r_campos_obligatorios(_u(tipo="local", size_m2=27), {})
    assert h is None
    h = r_campos_obligatorios(_u(tipo="local"), {})
    assert h and h["severidad"] == "aviso"
    # un depto sin precio/rec sí es error
    h = r_campos_obligatorios(_u(size_m2=60), {})
    assert h and h["severidad"] == "error" and "precio" in h["detalle"]
    # loft con rec=0 explícito NO reclama recámaras
    h = r_campos_obligatorios(_u(size_m2=40, bedrooms=0, bathrooms=1, price_mxn=3e6), {})
    assert h is None


def test_plausibilidad_espejo_del_juez():
    h = r_plausibilidad(_u(bedrooms=12), {})
    assert h and h["severidad"] == "error" and "imposible" in h["detalle"]
    assert r_plausibilidad(_u(bedrooms=3), {}) is None


def test_nivel_vs_numero():
    h = r_nivel_vs_numero(_u(unit_number="1104", level=3), {})
    assert h and "piso 11" in h["detalle"]
    assert r_nivel_vs_numero(_u(unit_number="1104", level=11), {}) is None
    assert r_nivel_vs_numero(_u(unit_number="PH", level=15), {}) is None   # sin dígitos no opina


def test_ganga_sospechosa_usa_posiciones():
    ctx = {"units": [], "posiciones_molde": {"u1": {"vs_molde_pct": -59.3, "banda": "ganga"}}}
    h = r_ganga_sospechosa(_u(), ctx)
    assert h and h["severidad"] == "error" and "-59.3" in h["detalle"]
    ctx["posiciones_molde"]["u1"]["vs_molde_pct"] = -12.0
    assert r_ganga_sospechosa(_u(), ctx) is None


def test_molde_sin_rec():
    h = r_molde_sin_rec({"nombre": "?R·39m²", "unidades_total": 87}, {})
    assert h and "sin recámaras" in h["detalle"]
    assert r_molde_sin_rec({"nombre": "2R·2B·78m²", "unidades_total": 82}, {}) is None
