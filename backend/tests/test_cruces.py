"""Los cruces de motores (ficha 720° + mercado + bandeja) — lógica pura, sin Mongo."""
import cruces_atomo as CA
import mercado_cruces as MC
import bandeja_unica as BU


def test_finanzas_atomo_mensualidad_e_ingreso():
    u = {"price_mxn": 8_004_300, "enganche_mxn": 1_604_300, "credito_mxn": 6_400_000}
    f = CA.finanzas_atomo(u, tasa_anual=0.12, plazo_anios=20)
    assert f["enganche"] == 1_604_300 and f["credito"] == 6_400_000
    assert 68_000 < f["mensualidad"] < 73_000          # ~$70.5k @12%/20a
    assert abs(f["ingreso_requerido"] - f["mensualidad"] / 0.33) < 2
    assert CA.finanzas_atomo({}) is None               # sin precio no se inventa


def test_capacidad_genoma_honesta():
    assert CA.capacidad_genoma(50_000, [60_000, 40_000, 55_000]) == \
        {"alcanzan": 2, "de": 3, "pct": 67}
    assert CA.capacidad_genoma(None, [1]) is None
    assert CA.capacidad_genoma(50_000, []) is None


def test_score_dmx_transparente():
    s = CA.score_dmx({"vs_molde_pct": -10.0}, 1.0, 10, "A", verificado=True)
    assert s["letra"] in ("AAA", "AA") and len(s["porque"]) == 5
    malo = CA.score_dmx({"vs_molde_pct": 15.0}, 0.0, 95, "C", verificado=False)
    assert malo["puntos"] < s["puntos"] and malo["letra"] in ("C", "D", "B")


def test_argumento_venta_redacta_con_datos():
    frases = CA.argumento_venta("A-1404", {"vs_molde_ajustado_pct": -16.7,
                                           "percentil_pm2": 12,
                                           "busquedas_compatibles": 3,
                                           "exterior_pct": 8.0},
                                {"enganche": 1_274_600, "mensualidad": 55_000},
                                {"alcanzan": 4, "de": 13})
    txt = " ".join(frases)
    assert "16.7% por DEBAJO" in txt and "3 búsquedas" in txt and "4 de 13" in txt
    assert CA.argumento_venta("X", {}) == []           # sin datos, sin humo


def test_ecuacion_precio_v1():
    u = {"price_mxn": 6_373_000, "size_m2": 113.0}
    e = CA.descomposicion_precio(u, {"vs_molde_pct": -16.7},
                                 {"premium_obra_nueva_pct": 12.8, "avm_m2_colonia": 50_000})
    base = e["factores"][0]["monto"]
    assert abs(base - 6_373_000 / (1 - 0.167)) < 2
    assert e["factores"][1]["monto"] == 6_373_000 - base
    assert e["premium_obra_nueva_pct"] == 12.8


def test_gap_producto_y_demanda_revelada():
    snaps = [{"colonia_geo": "Portales", "units":
              [{"price": 2_800_000, "status": "vendido"}] * 9 +
              [{"price": 2_900_000, "status": "disponible"}]}]
    dr = MC.demanda_revelada(snaps)
    assert dr[0]["colonia"] == "Portales" and dr[0]["colocacion_pct"] == 90.0
    # el catálogo NO ofrece 0–3M en Portales → gap
    gaps = MC.gap_producto(snaps, [{"price_mxn": 8_000_000, "_colonia_geo": "portales"}])
    assert gaps and gaps[0]["banda_precio"] == "0–3M"
    # si el catálogo SÍ lo ofrece → sin gap
    assert MC.gap_producto(snaps, [{"price_mxn": 2_500_000,
                                    "_colonia_geo": "portales"}]) == []


def test_indice_dev_serie():
    evs = [{"ts": "2026-07-14T09:00", "pm2": 60_000}, {"ts": "2026-07-14T10:00", "pm2": 62_000},
           {"ts": "2026-08-14T09:00", "pm2": 64_000}]
    idx = MC.indice_dev(evs)
    assert [p["fecha"] for p in idx] == ["2026-07-14", "2026-08-14"]
    assert idx[0]["pm2_indice"] == 61_000


def test_bandeja_prioriza_y_temperatura():
    items = [{"tipo": "pedido", "prioridad": 60}, {"tipo": "dato_roto", "prioridad": 100},
             {"tipo": "vigia", "prioridad": 80}]
    assert [i["tipo"] for i in BU.priorizar(items)] == ["dato_roto", "vigia", "pedido"]
    assert BU.temperatura_lead({"budget_mxn": 5_000_000, "interactions": 3}, gangas_dev=2) == 100
    assert BU.temperatura_lead({}, 0) == 0


def test_pulse_bitacora_fuente_primaria():
    """La bitácora propia alimenta el Live Pulse: ≥2 días con $/m² → delta real conf 0.9;
    con 1 día → None (cae a DRPI, sin romper el contrato del motor)."""
    import asyncio
    import live_pulse_engine as LP

    class _Cur:
        def __init__(s, rows): s.rows = rows
        def limit(s, n): return s
        def __aiter__(s):
            s._i = iter(s.rows); return s
        async def __anext__(s):
            try: return next(s._i)
            except StopIteration: raise StopAsyncIteration

    class _DB:
        def __init__(s, rows): s.rows = rows
        @property
        def oferta_timeline(s): return s
        def find(s, q, p): return _Cur(s.rows)

    # 5 unidades emparejadas, +5% cada una, ventana 30 días → real, conf 0.9
    rows = []
    for i in range(5):
        rows += [{"unit_id": f"u{i}", "ts": "2026-06-01T09:00", "pm2": 60_000},
                 {"unit_id": f"u{i}", "ts": "2026-07-01T09:00", "pm2": 63_000}]
    r = asyncio.run(LP._price_movement_bitacora(_DB(rows), "tetelpan"))
    assert r["source"] == "real" and r["confidence"] == 0.9 and abs(r["value"] - 5.0) < 0.01
    # 2 unidades editadas el mismo día (ruido de edición) → None (anti sesgo de composición)
    ruido = [{"unit_id": "a", "ts": "2026-07-14T09:00", "pm2": 60_000},
             {"unit_id": "a", "ts": "2026-07-14T18:00", "pm2": 50_000}]
    assert asyncio.run(LP._price_movement_bitacora(_DB(ruido), "x")) is None


def test_kg_molde_noop_sin_neo4j():
    """Sin Neo4j el sync de moldes es no-op limpio (mismo contrato que todo el KG)."""
    import asyncio
    import knowledge_graph_engine as KG
    assert "Molde" in KG.NODE_TYPES and "HAS_MOLDE" in KG.EDGE_TYPES
    prev = KG.KG_AVAILABLE
    KG.KG_AVAILABLE = False
    try:
        assert asyncio.run(KG.kg_sync.upsert_molde_node(None, {"prototype_id": "p1"})) is None
    finally:
        KG.KG_AVAILABLE = prev


# ═══ EL MODELO DE EXTRACCIÓN v2 (los 5 upgrades de la prueba, 07-15) ═══════════
def test_identidad_canonica_de_unidad():
    from identidad_unidad import norm_unidad, son_la_misma
    assert norm_unidad("T2 - 1901") == norm_unidad("T2-1901") == "T2-1901"
    assert norm_unidad("Almina A - Unidad A - 1002") == "A-1002"
    assert norm_unidad("  b 304 ") == "B-304"
    assert son_la_misma("A-107", "107")            # torre implícita
    assert not son_la_misma("A-107", "A-108")


def test_fusion_spec_politicas_y_discrepancias():
    from fusion_fuentes import fusionar_unidad, moda_proyecto
    # granular gana m² (el maestro mide por unidad; la lista repite el tipo)
    r = fusionar_unidad("m2_privative", [
        (101.75, {"fuente": "lista", "valores_del_campo": [101.75, 101.75, 101.75]}),
        (97.849, {"fuente": "maestro", "valores_del_campo": [97.849, 97.179, 100.39]})])
    assert r["valor"] == 97.849 and r["fuente"] == "maestro"
    assert len(r["discrepancia"]) == 2             # la pelea queda documentada
    # fresco gana precio
    r2 = fusionar_unidad("price_mxn", [
        (5_000_000, {"fuente": "lista_junio", "fecha": "2026-06-01"}),
        (5_100_000, {"fuente": "lista_julio", "fecha": "2026-07-13"})])
    assert r2["valor"] == 5_100_000
    # la regla del 516→258: moda, jamás suma
    assert moda_proyecto([258, 258, 258, 258]) == 258


def test_extractor_familia_vp_detecta():
    from extractores_layout import detecta_vp, extraer_deterministico
    assert detecta_vp("VP_Lista_de_Precios NUA T1 SF.pdf")
    assert not detecta_vp("brochure_almina.pdf")
    # familia desconocida → None → el pipeline cae a IA (fail-open)
    assert extraer_deterministico("foto.jpg", b"") is None


def test_muestra_juez_reproducible():
    import auditor_catalogo as AU2
    units = [{"unit_number": f"A-{i}", "price_mxn": 5_000_000 + i, "size_m2": 80 + i,
              "bedrooms": 2, "bathrooms": 2, "m2_total": 86 + i} for i in range(10)]
    m1 = AU2.muestra_juez(units, n=10)
    m2 = AU2.muestra_juez(units, n=10)
    assert m1 == m2 and len(m1) == 10              # misma semilla = mismo juez
    assert all(x["valor"] not in (None, "") for x in m1)


# ═══ CAPA 5: EL JUEZ AUTOMÁTICO ════════════════════════════════════════════════
def test_juez_comparadores_puros():
    from juez_automatico import numeros_de_linea, linea_confirma, lineas_de_unidad
    ln = "T2 - 2501 5.04 2 142.879 147.914 $ 12,125,800.00 $ 7,270,000.00"
    assert 12_125_800.0 in numeros_de_linea(ln)
    assert linea_confirma(ln, 12_125_800, 2)          # dinero exacto
    assert linea_confirma(ln, 147.9, 0.6)             # m² con tolerancia
    assert not linea_confirma(ln, 99_999_999, 2)
    # 'T1 - 2405' de la base encuentra la línea '2405 ...' del PDF sin prefijo
    paginas = ["2405 4.78 2 141.929 146.96 $ 10,881,200.00"]
    assert lineas_de_unidad(paginas, "T1 - 2405")
    assert not lineas_de_unidad(paginas, "T1 - 9999")


def test_juez_veredictos_y_discrepancia_fuentes():
    from juez_automatico import juzgar_campos
    texto = ["701 2.40 0.00 2 102.26 104.66 $ 8,606,100.00 $ 6,020,000.00 $ 2,586,100.00"]
    excel = {"701": {"RECAMARAS": 2, "BAÑOS": 2, "ESTACIONAMIENTOS": 1,
                     "M2 HABITABLE": 102.26}}
    muestra = [
        {"unidad": "701", "campo": "price_mxn", "valor": 8_606_100.0},   # PDF ✓
        {"unidad": "701", "campo": "bedrooms", "valor": 2},              # Excel ✓
        {"unidad": "701", "campo": "parking_spots", "valor": 2},         # PDF ✓, Excel dice 1
        {"unidad": "701", "campo": "price_mxn", "valor": 9_999_999.0},   # NO existe
    ]
    v = juzgar_campos(muestra, texto, excel)
    por = {(d["campo"], d["valor"]): d["veredicto"] for d in v["detalles"]}
    assert por[("price_mxn", 8_606_100.0)] == "confirmado"
    assert por[("bedrooms", 2)] == "confirmado"
    assert por[("parking_spots", 2)] == "discrepancia_fuentes"   # fuentes pelean ≠ error
    assert por[("price_mxn", 9_999_999.0)] == "NO_COINCIDE"
    assert v["confirmados"] == 3 and v["revisables"] == 4 and not v["gate_98"]


def test_familia_maestro_y_drift():
    from extractores_layout import detecta_maestro, drift_de_familia
    assert detecta_maestro("Inventario 13 de julio de 2026.xlsx")
    assert not detecta_maestro("VP_Lista_de_Precios NUA T1 SF.pdf")
    # drift: la familia dejó de ajustar → alerta explícita
    assert drift_de_familia({"familia": "vp_class",
                             "validacion": {"total": 100, "m2": 60, "dinero": 100}})
    assert drift_de_familia({"familia": "vp_class",
                             "validacion": {"total": 100, "m2": 99, "dinero": 100}}) is None


def test_comision_jamas_publica():
    import marketplace_contract as MC2
    assert "default_commission_pct" in MC2.NUNCA_PUBLICO
    fuga = {"unit_number": "A-1", "default_commission_pct": 3.5}
    assert any("INTERNO" in v for v in MC2.violaciones_contrato({"unit_number": "A-1"}, fuga))


def test_pm2_ponderado_en_corte():
    import corte_engine as CO2
    filas = CO2.cortar([{"u": {"unit_number": "PH", "price_mxn": 10_000_000,
                               "m2_privative": 100.0, "size_m2": 100.0, "patio_m2": 100.0,
                               "bedrooms": 3, "status": "disponible"},
                         "d": {"name": "X"}, "m": {}, "p": {}}], ["desarrollo"])
    # crudo: 100k/m² sobre habitables · ponderado: 10M/(100+50)=66.7k — el PH comparable
    assert filas[0]["pm2_ponderado"] == 66_667


# ═══ CERO DEUDA: los últimos del lote de 20 ═══════════════════════════════════
def test_amenidades_canonicas():
    from amenidades_canon import canonizar, canonizar_lista
    assert canonizar("ALBERCA") == canonizar("Pool") == canonizar("alberca de nado") == "alberca"
    assert canonizar("Área para Mascota") == "pet friendly"
    assert canonizar("Observatorio") == "observatorio"        # desconocida no se pierde
    assert canonizar_lista(["Alberca", "POOL", "Gym"]) == ["alberca", "gimnasio"]


def test_regla_piso_vs_plano():
    import auditor_catalogo as AU3
    ctx = {"programas_docs": {"p0": {"niveles_plano": [3, 5, 7, 9, 11, 13]}}}
    u_mal = {"unit_number": "A-405", "level": 4, "prototype_id": "p0"}
    assert AU3.r_piso_vs_plano(u_mal, ctx)["severidad"] == "aviso"
    u_ok = {"unit_number": "A-505", "level": 5, "prototype_id": "p0"}
    assert AU3.r_piso_vs_plano(u_ok, ctx) is None


def test_falta_no_es_cero_en_ficha():
    """Founder 07-15: si habitables ≈ totales, los exteriores son 0 DERIVADO, no FALTA."""
    import ficha_atomo as FA2
    u = {"m2_privative": 124.98, "size_m2": 124.98, "m2_total": 124.98,
         "price_mxn": 10_812_800, "bedrooms": 2, "bathrooms": 2.5}
    secs = FA2.armar_ficha(u, None, None)
    plano = {c["label"]: c for s2 in secs for c in s2["campos"]}
    assert plano["m² balcón"]["valor"].startswith("0 m²")        # derivado, no FALTA
    assert plano["m² terraza"]["quien_llena"] is None
    # pero si el total NO cuadra, sigue siendo FALTA honesto (caso PH 282.75)
    u2 = {"m2_privative": 130.0, "size_m2": 130.0, "m2_total": 282.75, "price_mxn": 1}
    secs2 = FA2.armar_ficha(u2, None, None)
    plano2 = {c["label"]: c for s2 in secs2 for c in s2["campos"]}
    assert plano2["m² roof garden"]["valor"] is None             # FALTA de verdad
    # redondeo: 81.142 → 81.14
    u3 = {"m2_privative": 81.142, "size_m2": 81.142, "m2_total": 81.142, "price_mxn": 1}
    p3 = {c["label"]: c for s2 in FA2.armar_ficha(u3, None, None) for c in s2["campos"]}
    assert p3["m² habitables"]["valor"] == "81.14 m²"
