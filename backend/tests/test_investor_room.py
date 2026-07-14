"""Sala de Inversionistas — la matemática del dinero y el score YC no pueden mentir."""
import asyncio

import investor_room as IR


# ─── fakes async mínimos (mismo espíritu que test_market_timeline) ───────────
class _Cursor:
    def __init__(self, rows):
        self._rows = list(rows)

    def sort(self, *a, **k):
        return self

    async def to_list(self, n):
        return self._rows[:n]

    def __aiter__(self):
        self._i = iter(self._rows)
        return self

    async def __anext__(self):
        try:
            return next(self._i)
        except StopIteration:
            raise StopAsyncIteration


class _Col:
    def __init__(self, rows=None, n=0):
        self.rows = rows or []
        self.n = n

    async def estimated_document_count(self):
        return self.n

    async def count_documents(self, q):
        return self.n

    def find(self, *a, **k):
        return _Cursor(self.rows)

    async def find_one(self, *a, **k):
        return self.rows[0] if self.rows else None

    def aggregate(self, *a, **k):
        return _Cursor(self.rows)


class _DB:
    def __init__(self, cols=None):
        self._cols = cols or {}

    def __getattr__(self, name):
        return self._cols.get(name, _Col())

    def __getitem__(self, name):
        return self._cols.get(name, _Col())


def _run(coro):
    return asyncio.run(coro)   # loop propio por llamada: no choca con otros tests de la suite


# ─── economía: agrega el price book real sin inventar ────────────────────────
def test_economia_suma_el_price_book(monkeypatch):
    import feature_registry as FR
    monkeypatch.setattr(FR, "_REGISTRY", {
        "a": {"key": "a", "name": "A", "monthly_price_mxn": 100, "category": "data"},
        "b": {"key": "b", "name": "B", "monthly_price_mxn": 250, "category": "data"},
        "c": {"key": "c", "name": "C", "monthly_price_mxn": 0, "category": "ops"},  # gratis: no suma
    })
    e = IR.economia()
    assert e["features_total"] == 3 and e["features_con_precio"] == 2
    assert e["ticket_full_stack_mxn_mes"] == 350
    assert e["por_categoria"][0] == {"categoria": "data", "n": 2, "mxn_mes": 350}


# ─── TAM bottom-up: la fórmula es auditable ──────────────────────────────────
def test_tam_bottom_up_matematica():
    db = _DB({"catastro_predios": _Col(n=1_080_000)})
    t = _run(IR.tam(db, {}))
    universo = (350 * 7900 + 1200 * 2900) * 12
    assert t["universo_mxn_anual"] == universo
    assert t["alcanzable_mxn_anual"] == round(universo * 0.30)
    assert t["obtenible_mxn_anual"] == round(universo * 0.30 * 0.10)
    assert t["predios_con_dato"] == 1_080_000
    # supuestos editables cambian el resultado (así se defiende ante un VC)
    t2 = _run(IR.tam(db, {"pct_alcanzable": 50, "devs_cdmx": 100, "inmobiliarias_cdmx": 0,
                          "precio_dev_mxn": 1000}))
    assert t2["universo_mxn_anual"] == 100 * 1000 * 12
    assert t2["alcanzable_mxn_anual"] == round(100 * 1000 * 12 * 0.5)


# ─── burn: sin datos de IA = solo fijos; runway solo con caja ────────────────
def test_burn_y_runway():
    b = _run(IR.burn(_DB(), {}))
    assert b["ia_mxn_mes"] == 0
    assert b["burn_total_mxn_mes"] == IR.SUPUESTOS_DEFAULT["burn_fijo_mxn"]
    assert b["runway_meses"] is None          # sin caja declarada no se inventa runway
    b2 = _run(IR.burn(_DB(), {"caja_mxn": 80_000, "burn_fijo_mxn": 8_000}))
    assert b2["runway_meses"] == 10.0


# ─── score YC: honesto en cero y en cien ─────────────────────────────────────
def test_yc_score_honesto():
    frio = IR.yc_score(0, {}, 0, 8, demo_listo=False)
    assert frio["hechos"] == 0 and frio["score"] == 0
    listo = IR.yc_score(12, {"piloto": 2, "loi": 1, "pagando": 1}, 8, 8, demo_listo=True)
    assert listo["hechos"] == listo["de"] and listo["score"] == 100
    # con 10 entrevistas pero nada más, exactamente 1 criterio en verde
    solo_ent = IR.yc_score(10, {}, 0, 8, demo_listo=False)
    assert solo_ent["hechos"] == 1


# ─── métricas norte: registro completo y defensivo (colección rota ≠ crash) ──
def test_metricas_norte_registro_y_defensivo():
    for m in IR.METRICAS_NORTE:
        assert m["id"] and m["nombre"] and m["col"] and m["por_que"]

    class _Explota:
        def __getattr__(self, n):
            raise RuntimeError("colección rota")

        def __getitem__(self, n):
            raise RuntimeError("colección rota")

    filas = _run(IR.metricas_norte(_Explota()))
    assert len(filas) == len(IR.METRICAS_NORTE)
    assert all(f["total"] == 0 for f in filas)   # degrada a 0, nunca 500


# ─── resumen: todos los bloques presentes, cada uno con su fuente ────────────
def test_resumen_completo_con_fuentes():
    db = _DB({
        "investor_room_config": _Col(rows=[{"_id": "config", "checklist": {"constitucion": True}}]),
        "investor_interviews": _Col(n=3),
        "investor_pipeline": _Col(rows=[{"_id": "piloto", "n": 2}]),
        "catastro_predios": _Col(n=500),
    })
    r = _run(IR.resumen(db))
    for bloque in ("yc", "economia", "tam", "velocity", "burn", "metricas_norte",
                   "pipeline", "checklist", "supuestos"):
        assert bloque in r, f"bloque faltante: {bloque}"
    for con_fuente in ("economia", "tam", "velocity", "burn"):
        assert r[con_fuente].get("fuente"), f"{con_fuente} sin fuente declarada"
    assert r["entrevistas_n"] == 3
    assert r["pipeline"]["conteos"] == {"piloto": 2}
    ok = [c for c in r["checklist"] if c["ok"]]
    assert len(ok) == 1 and ok[0]["id"] == "constitucion"
    assert len(r["checklist"]) == len(IR.CHECKLIST_LEGAL)
