"""Catálogo de Moldes v3 (07-15): conciliador + biografía + métricas + cotejo + playbook
+ programa. Todo lógica pura o FakeDB — sin Mongo, sin IA, sin red."""
import asyncio

import cotejo_engine as CE
import molde_metrics as MM
import playbook_precios as PB
import programa_engine as PG
import prototype_engine as PE


def _run(coro):
    return asyncio.run(coro)


# ─── FakeDB con update_one (el conciliador ya no borra: actualiza) ────────────
class _Coll:
    def __init__(self, rows=None):
        self.rows = list(rows or [])
        self.inserted, self.updates = [], []

    def find(self, q=None, proj=None):
        class _Cur:
            def __init__(s, rows): s.rows = rows
            async def to_list(s, n): return s.rows[:n]
            def sort(s, *a): return s
        return _Cur(self.rows)

    async def find_one(self, q=None, proj=None):
        return self.rows[0] if self.rows else None

    async def insert_one(self, doc): self.inserted.append(doc)

    async def update_one(self, q, u):
        self.updates.append((q, u))

    async def update_many(self, q, u):
        self.updates.append((q, u))
        class _R: modified_count = len((q.get("id") or {}).get("$in", []))
        return _R()


class _DB:
    def __init__(self, units, protos=None):
        self.units = _Coll(units)
        self.dmx_prototypes = _Coll(protos)
        self.developments = _Coll([{"id": "dev1", "name": "Torre Alba"}])


def _u(uid, m2, num, beds=2, price=5_000_000):
    return {"id": uid, "development_id": "dev1", "unit_number": num, "size_m2": m2,
            "bedrooms": beds, "bathrooms": 2, "parking_spots": 1, "price_mxn": price,
            "status": "disponible"}


# ═══ CONCILIADOR ══════════════════════════════════════════════════════════════
def test_conciliador_molde_conocido_conserva_id_y_planos():
    """El robot ya NO demuele: un molde existente se ACTUALIZA (mismo id, planos intactos)."""
    protos = [{"prototype_id": "dev1__p00", "development_id": "dev1", "recamaras": 2,
               "m2_construido": 84.2, "estado": "activo", "nombre": "El Clásico",
               "floor_plan_url": "/p.pdf", "plano_amueblado_url": "/amueblado.jpg"}]
    db = _DB([_u("u1", 84, "101"), _u("u2", 84.5, "201")], protos)
    r = _run(PE.materializar(db, "dev1"))
    assert r["actualizados"] == 1 and r["nuevos"] == 0
    assert not db.dmx_prototypes.inserted                     # nada insertado: se actualizó
    q, u = next((q, u) for q, u in db.dmx_prototypes.updates
                if q.get("prototype_id") == "dev1__p00")
    assert "floor_plan_url" not in u["$set"]                   # los planos NO se tocan
    assert "nombre" not in u["$set"]                           # el nombre bautizado se respeta
    assert u["$set"]["estado"] == "activo"


def test_conciliador_agotado_y_revivido():
    """Molde sin unidades en la lista → AGOTADO (jamás borrado). Si vuelve → revive."""
    protos = [{"prototype_id": "dev1__p00", "development_id": "dev1", "recamaras": 2,
               "m2_construido": 84.0, "estado": "activo"},
              {"prototype_id": "dev1__p01", "development_id": "dev1", "recamaras": 3,
               "m2_construido": 120.0, "estado": "agotado"}]
    # la lista de hoy solo trae unidades del molde de 120 (3 rec) → p00 se agota, p01 revive
    db = _DB([_u("u1", 120, "301", beds=3), _u("u2", 121, "401", beds=3)], protos)
    r = _run(PE.materializar(db, "dev1"))
    assert r["agotados"] == 1 and r["revividos"] == 1
    cambios = {q.get("prototype_id"): u["$set"] for q, u in db.dmx_prototypes.updates}
    assert cambios["dev1__p00"]["estado"] == "agotado" and cambios["dev1__p00"]["agoto_at"]
    assert cambios["dev1__p01"]["estado"] == "activo" and cambios["dev1__p01"]["revivio_at"]


def test_conciliador_molde_nuevo_nace_con_biografia():
    db = _DB([_u("u1", 84, "101"), _u("u2", 84.5, "201")])
    r = _run(PE.materializar(db, "dev1"))
    assert r["nuevos"] == 1
    doc = db.dmx_prototypes.inserted[0]
    assert doc["estado"] == "nuevo" and doc["nacio_at"] and doc["agoto_at"] is None
    assert doc["huella"] == PE.huella_molde(2, 84.25)


def test_conciliador_sin_unidades_agota_todo():
    protos = [{"prototype_id": "dev1__p00", "development_id": "dev1", "recamaras": 2,
               "m2_construido": 84.0, "estado": "activo"}]
    db = _DB([], protos)
    r = _run(PE.materializar(db, "dev1"))
    assert r["agotados"] == 1 and r["prototipos"] == 0


# ═══ MÉTRICAS POR MOLDE ═══════════════════════════════════════════════════════
def test_colocacion_es_foto_y_absorcion_exige_dos():
    """Regla founder: colocación (stock, 1 foto) ≠ absorción (flujo, ≥2 fotos)."""
    units = [{**_u("u1", 84, "101"), "status": "vendida"}, _u("u2", 84, "201")]
    c = MM.colocacion(units)
    assert c == {"total": 2, "vendidas": 1, "pct": 50.0}
    # 1 sola foto → absorción honesta: None
    evs1 = [{"unit_id": "u1", "ts": "2026-07-01", "disponible": True}]
    assert MM.absorcion(evs1)["unidades_mes"] is None
    # 2 fotos con una venta en 30 días → 1 u/mes
    evs2 = [{"unit_id": "u1", "ts": "2026-06-01", "disponible": True},
            {"unit_id": "u1", "ts": "2026-07-01", "disponible": False},
            {"unit_id": "u2", "ts": "2026-06-01", "disponible": True},
            {"unit_id": "u2", "ts": "2026-07-01", "disponible": True}]
    a = MM.absorcion(evs2)
    assert a["ventas_observadas"] == 1 and a["unidades_mes"] == 1.0


def test_premium_por_piso_aislado_por_molde():
    """Mismo plano, piso distinto → el delta de $/m² es pura altura."""
    units = [{**_u("u1", 100, "101", price=10_000_000), "level": 1},
             {**_u("u2", 100, "501", price=10_600_000), "level": 5}]
    filas = MM.premium_por_piso(units)
    assert filas[0]["premium_pct"] == 0.0 and filas[1]["premium_pct"] == 6.0
    # con un solo piso no hay premium que medir
    assert MM.premium_por_piso([units[0]]) == []


def test_curva_precio_por_dia():
    evs = [{"ts": "2026-06-01T10:00", "pm2": 100_000}, {"ts": "2026-06-01T11:00", "pm2": 102_000},
           {"ts": "2026-07-01T10:00", "pm2": 105_000}]
    curva = MM.curva_precio(evs)
    assert [c["fecha"] for c in curva] == ["2026-06-01", "2026-07-01"]
    assert curva[0]["pm2"] == 101_000 and curva[0]["n"] == 2


# ═══ EL COTEJO ════════════════════════════════════════════════════════════════
def test_cotejo_verifica_con_tolerancia_y_caza_contradicciones():
    # m² con ±5% (los planos son "aproximados"): 113 vs 112 → coincide
    ok = CE.cotejar_numero("m2", {"lista": 113.0, "plano": 112.0})
    assert ok["veredicto"] == "coincide"
    # 113 vs 130 → contradice
    mal = CE.cotejar_numero("m2", {"lista": 113.0, "plano": 130.0})
    assert mal["veredicto"] == "contradice"
    # el caso FLEX de Almina: lista 3 rec, plano 2 → contradice CON nota
    flex = CE.cotejar_exacto("recamaras", {"lista": 3, "plano": 2}, nota_si_contradice="FLEX")
    assert flex["veredicto"] == "contradice" and flex["nota"] == "FLEX"
    # una sola fuente → sin sello (no se inventa verificación)
    una = CE.cotejar_numero("m2", {"lista": 113.0, "plano": None})
    assert una["veredicto"] == "solo_una_fuente"
    r = CE.resumen_cotejo([ok, mal, flex, una])
    assert r == {"coincide": 1, "contradice": 2, "solo_una_fuente": 1}


# ═══ PLAYBOOK DE PRECIOS ══════════════════════════════════════════════════════
def _ev(uid, ts, precio, disp=True):
    return {"unit_id": uid, "ts": ts, "precio": precio, "disponible": disp}


def test_playbook_detecta_ajustes_y_estima_regla():
    evs = []
    # foto 1: 4 unidades a 5M
    for u in ("a", "b", "c", "d"):
        evs.append(_ev(u, "2026-01-01", 5_000_000))
    # se venden 2 → foto 2 con ajuste +2% en las vivas
    evs += [_ev("a", "2026-02-01", 5_000_000, disp=False),
            _ev("b", "2026-02-01", 5_000_000, disp=False),
            _ev("c", "2026-02-01", 5_100_000), _ev("d", "2026-02-01", 5_100_000)]
    # se venden 2 más → foto 3 con otro ajuste +2%
    evs += [_ev("c", "2026-03-01", 5_202_000), _ev("d", "2026-03-01", 5_202_000)]
    ajustes = PB.detectar_ajustes(evs)
    assert len(ajustes) == 2 and abs(ajustes[0]["delta_pct"] - 2.0) < 0.01
    regla = PB.regla_del_dev(evs)
    assert regla["regla"]["n_ajustes"] == 2 and "sube ~2.0%" in regla["regla"]["humano"]


def test_playbook_honesto_sin_historia():
    """Con 1 sola lista NO se inventa regla — se dice qué falta (regla founder)."""
    evs = [_ev("a", "2026-07-01", 5_000_000)]
    r = PB.regla_del_dev(evs)
    assert r["regla"] is None and "2ª lista" in r["nota"]


# ═══ PROGRAMA ARQUITECTÓNICO ══════════════════════════════════════════════════
def test_parse_texto_plano_lee_lo_confiable():
    texto = """Tipo de Departamento: 3 RECÁMARAS 305
    Área: 130.00 m2\nTerraza: 14.25\nNIVEL 3, 5, 7, 9, 11, 13
    COCINA ESTANCIA COMEDOR ALCOBA Torre B NORTE"""
    p = PG.parse_texto_plano(texto)
    assert p["area_plano_m2"] == 130.0 and p["terraza_plano_m2"] == 14.25
    assert p["recamaras_plano"] == 3 and p["niveles_plano"] == [3, 5, 7, 9, 11, 13]
    assert "cocina" in p["espacios"] and "alcoba" in p["espacios"]
    assert p["torres_plano"] == ["B"]
    # el texto encimado del esquemático NO engaña al parser ("0RECAMARA" pegado)
    assert PG.parse_texto_plano("cl.3.5R0ECAMARA basura")["recamaras_plano"] is None


# ═══ LA ESCALERA (agregación por peldaño) ═════════════════════════════════════
def test_escalera_agrega_peldano():
    filas = [
        {"colocacion": {"total": 10, "vendidas": 5}, "absorcion": {"unidades_mes": 2.0},
         "curva_precio": [{"fecha": "2026-07-01", "pm2": 100_000}], "huella": "2r_84m2",
         "premium_piso": [{"premium_pct": 4.0}], "estado": "activo"},
        {"colocacion": {"total": 6, "vendidas": 6}, "absorcion": {"unidades_mes": None},
         "curva_precio": [], "huella": "3r_120m2", "premium_piso": [], "estado": "agotado"},
    ]
    r = MM._agrega_peldano(filas)
    assert r["unidades"] == 16 and r["vendidas"] == 11
    assert r["colocacion_pct"] == 68.8
    assert r["moldes_agotados"] == 1
    assert r["mix_por_tipo"] == {"2R": 10, "3R": 6}
    assert r["absorcion_u_mes"] == 2.0        # solo suma lo MEDIDO, no inventa
    assert r["pm2_prom"] == 100_000


# ═══ EL MOTOR DE CORTES (hipersegmentación universal) ═════════════════════════
def test_corte_cruza_dimensiones_hasta_el_atomo():
    import corte_engine as CO
    d = {"name": "Almina", "colonia_name": "Tetelpan", "alcaldia": "AO", "stage": "preventa"}
    m = {"nombre": "3R·113"}
    p = {"flex_visual": True, "espacios_detalle": ["cocina", "estancia"]}
    atomos = [
        {"u": {"unit_number": "A-107", "level": 1, "bedrooms": 3, "bathrooms": 2.5,
               "size_m2": 117.0, "price_mxn": 8_004_300, "patio_m2": 59.0,
               "enganche_pct": 20.0, "status": "disponible"}, "d": d, "m": m, "p": p},
        {"u": {"unit_number": "A-1507", "level": 15, "bedrooms": 3, "bathrooms": 2.5,
               "size_m2": 117.0, "price_mxn": 9_100_000, "m2_terrace": 9.0,
               "enganche_pct": 20.0, "status": "vendida"}, "d": d, "m": m, "p": p},
        {"u": {"unit_number": "B-201", "level": 2, "bedrooms": 2, "bathrooms": 2.0,
               "size_m2": 84.0, "price_mxn": 5_100_000, "status": "disponible"},
         "d": d, "m": m, "p": p},
    ]
    # cruce tipología × torre (hipersegmentación real)
    filas = CO.cortar(atomos, ["tipologia", "torre"])
    tres = next(f for f in filas if f["tipologia"] == "3R")
    assert tres["torre"] == "Torre A" and tres["unidades"] == 2
    assert tres["vendidas"] == 1 and tres["colocacion_pct"] == 50.0
    # átomo físico: exterior (patio vs terraza vs interior)
    ext = {f["exterior"] for f in CO.cortar(atomos, ["exterior"])}
    assert ext == {"con patio", "con terraza", "interior"}
    # financiero: bandas de precio y enganche
    bp = CO.cortar(atomos, ["banda_precio"])
    assert {f["banda_precio"] for f in bp} == {"7–9M", "9–12M", "5–7M"}
    # piso llega al átomo vertical
    assert {f["piso"] for f in CO.cortar(atomos, ["piso"])} == {"Piso 1", "Piso 15", "Piso 2"}
    # dimensión desconocida = error claro, no silencio
    try:
        CO.cortar(atomos, ["astrologia"])
        assert False
    except ValueError:
        pass


def test_corte_espejo_demanda_y_tension():
    """Oferta ⨯ DEMANDA: una búsqueda 'le queda' al corte solo si cumple TODOS sus
    criterios; tensión = búsquedas compatibles ÷ disponibles."""
    import corte_engine as CO
    u1 = {"unit_number": "A-101", "development_id": "dev1", "bedrooms": 2, "bathrooms": 2.0,
          "size_m2": 84.0, "price_mxn": 5_000_000, "status": "disponible",
          "_colonia_id": "tetelpan", "_edad_dias": 30}
    u2 = {"unit_number": "A-201", "development_id": "dev1", "bedrooms": 3, "bathrooms": 2.5,
          "size_m2": 117.0, "price_mxn": 9_000_000, "status": "disponible",
          "_colonia_id": "tetelpan", "_edad_dias": 10}
    ctx = {"busquedas": [
        {"id": "b1", "colonias": ["tetelpan"], "precio_max": 6_000_000, "recamaras_min": 2},
        {"id": "b2", "colonias": ["tetelpan"], "precio_max": 10_000_000, "recamaras_min": 3},
        {"id": "b3", "colonias": ["polanco"], "precio_max": 6_000_000},   # otra colonia: NO
        {"id": "b4", "colonias": [], "precio_max": 4_000_000},            # tope bajo: NO
    ], "senales_por_dev": {"dev1": {"n": 7, "visitantes": {"v1", "v2"}}},
       "leads_por_dev": {"dev1": 3}}
    d = {"name": "Alba"}
    filas = CO.cortar([{"u": u1, "d": d, "m": {}, "p": {}},
                       {"u": u2, "d": d, "m": {}, "p": {}}], ["tipologia"], ctx=ctx)
    dos = next(f for f in filas if f["tipologia"] == "2R")
    tres = next(f for f in filas if f["tipologia"] == "3R")
    assert dos["demanda_busquedas"] == 1 and dos["tension"] == 1.0     # b1
    assert tres["demanda_busquedas"] == 1 and tres["tension"] == 1.0   # b2
    assert dos["leads"] == 3 and dos["demanda_visitantes"] == 2        # atribución dev
    assert dos["dias_en_mercado_prom"] == 30 and tres["dias_en_mercado_prom"] == 10
    # cohorte llega como dimensión (mes de la primera foto)
    u1b = {**u1, "_primera_foto": "2026-07-14T09:00:00"}
    fc = CO.cortar([{"u": u1b, "d": d, "m": {}, "p": {}}], ["cohorte"], ctx=ctx)
    assert fc[0]["cohorte"] == "2026-07"
