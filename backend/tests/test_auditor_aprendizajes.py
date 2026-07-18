"""Aprendizajes 07-17 vueltos motor: $/m² outlier (cazó el penthouse Colima 509) y coherencia
de la info general (leer del brochure, no derivar de las disponibles)."""
from auditor_catalogo import r_ppm2_outlier, r_general_coherente, _es_depto_auditor


def test_backstop_local_mal_tipado_no_es_depto():
    # Locales tipados 'depto' pero nombrados LC-/Local: el backstop los saca del $/m² residencial.
    assert _es_depto_auditor({"type": "depto", "unit_number": "LC-01"}) is False
    assert _es_depto_auditor({"type": "depto", "unit_number": "Local 01"}) is False
    # No debe confundir departamentos reales con L/LC en un nombre normal
    assert _es_depto_auditor({"type": "depto", "unit_number": "1508"}) is True
    assert _es_depto_auditor({"type": "depto", "unit_number": "LCASA-2"}) is True


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


def test_ppm2_outlier_no_castiga_mezcla_de_tamanos():
    # Casa Alpes real: chicos ~66-71m² a ~$80k/m² + grandes 155-200m² a ~$46k/m².
    # Es mezcla de producto legítima, NO dato roto → ningún depto se marca (cohortes <4).
    chicos = [_u("201", 71, 5746900, bedrooms=2), _u("203", 66, 5342900, bedrooms=2),
              _u("303", 66, 5363100, bedrooms=2)]
    grandes = [_u("101", 200, 9029400, bedrooms=3), _u("402", 155, 7251800, bedrooms=2),
               _u("403", 159, 7403300, bedrooms=2)]
    ctx = {"units": chicos + grandes}
    for u in ctx["units"]:
        assert r_ppm2_outlier(u, ctx) is None


def test_general_local_comercial_no_infla_el_total():
    # Casa Condesa: 73 deptos + 1 LOCAL comercial. total_units=73 es correcto (residencial);
    # el local es inventario extra y NO debe disparar "74 > 73".
    deptos = [{"unit_number": f"{i}", "type": "depto", "level": 1} for i in range(73)]
    local = {"unit_number": "LOCAL", "type": "local", "level": 0}
    d = {"name": "Casa Condesa", "id": "cc", "max_level": 6, "total_units": 73}
    assert r_general_coherente(d, {"units": deptos + [local]}) is None


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
