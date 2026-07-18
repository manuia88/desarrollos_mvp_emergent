"""Aprendizajes 07-17 vueltos motor: $/m² outlier (cazó el penthouse Colima 509) y coherencia
de la info general (leer del brochure, no derivar de las disponibles)."""
from auditor_catalogo import r_ppm2_outlier, r_general_coherente


def _u(n, m2, precio, **k):
    return {"unit_number": n, "type": "depto", "m2_total": m2, "price": precio, **k}


def test_ppm2_outlier_caza_el_509():
    # 4 gemelas sanas ~$96k/m² + una a $145k/m² (509: precio de PH con m² de Interior B)
    gemelas = [_u("309", 120, 11600000), _u("409", 120, 11800000),
               _u("310", 95, 9600000), _u("305", 89, 9100000)]
    mal = _u("509", 120.25, 17500000)   # $145k/m² = +50%
    ctx = {"units": gemelas + [mal]}
    h = r_ppm2_outlier(mal, ctx)
    assert h and h["severidad"] == "alerta" and "m²" in h["detalle"]
    # las gemelas sanas NO se marcan
    assert r_ppm2_outlier(gemelas[0], ctx) is None


def test_ppm2_outlier_sin_gemelas_no_opina():
    ctx = {"units": [_u("1", 100, 5e6), _u("2", 100, 5e6)]}   # <4 gemelas
    assert r_ppm2_outlier(ctx["units"][0], ctx) is None


def test_general_niveles_no_puede_ser_menor_al_piso_real():
    # Chilpancingo: niveles=1 (derivado) pero hay un depto en el piso 5 → ERROR
    d = {"name": "X", "id": "x", "max_level": 1, "total_units": 48}
    ctx = {"units": [{"unit_number": "504", "level": 5, "type": "depto"}]}
    h = r_general_coherente(d, ctx)
    assert h and h["severidad"] == "error" and "piso 5" in h["detalle"]


def test_general_depas_por_piso_derivado_debe_ir_aprox():
    d = {"name": "X", "id": "x", "max_level": 5, "total_units": 48, "depas_por_piso": 10}
    ctx = {"units": [{"unit_number": "504", "level": 5, "type": "depto"}]}   # roster parcial
    h = r_general_coherente(d, ctx)
    assert h and h["severidad"] == "aviso" and "aprox" in h["detalle"]
    # con la marca aprox → ya no reclama
    d["depas_por_piso_aprox"] = True
    assert r_general_coherente(d, ctx) is None
