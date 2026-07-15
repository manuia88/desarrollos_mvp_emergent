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
