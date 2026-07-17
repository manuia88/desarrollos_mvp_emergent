"""Jueces de negocio: lógica de MERCADO (esquema↔etapa, negociabilidad entre listas,
precio estancado). La regla de oro: sin historia suficiente devuelven [] SIN inventar."""
import pytest

from jueces_negocio import (descuento_entre_listas, esquema_vs_etapa,
                            juzgar_negocio, olor_de_esquema, precio_estancado)


# ─── esquema_vs_etapa ─────────────────────────────────────────────────────────
def test_olor_de_esquema():
    assert olor_de_esquema("10/90 contra entrega") == "entrega_inmediata"
    assert olor_de_esquema("30/70 con mensualidades") == "preventa"
    assert olor_de_esquema("mensualidades durante obra") == "preventa"
    assert olor_de_esquema("20/80") is None          # ambiguo: mejor callar
    assert olor_de_esquema("") is None


def test_esquema_1090_con_preventa_alerta():
    """10/90 (casi todo contra entrega) declarado en preventa: alguien miente."""
    h = esquema_vs_etapa("10/90", "preventa")
    assert len(h) == 1
    assert h[0]["regla"] == "esquema_vs_etapa" and h[0]["severidad"] == "alerta"
    assert h[0]["olor_esquema"] == "entrega_inmediata"
    assert h[0]["etapa_declarada"] == "preventa"
    assert h[0]["accion"]


def test_esquema_3070_con_entrega_inmediata_alerta():
    h = esquema_vs_etapa("30/70 con mensualidades durante obra", "entrega_inmediata")
    assert len(h) == 1 and h[0]["olor_esquema"] == "preventa"


def test_esquema_coherente_silencio():
    assert esquema_vs_etapa("10/90", "entrega inmediata") == []
    assert esquema_vs_etapa("30/70", "preventa") == []
    assert esquema_vs_etapa("30/70", "en_construccion") == []   # obra ≈ preventa


def test_esquema_sin_senal_no_opina():
    assert esquema_vs_etapa("", "preventa") == []
    assert esquema_vs_etapa("10/90", "") == []
    assert esquema_vs_etapa("contado con descuento", "preventa") == []


# ─── descuento_entre_listas ───────────────────────────────────────────────────
def test_descuento_detecta_negociabilidad():
    """2 de 3 unidades comunes bajan 5% → alerta con métricas de negociabilidad."""
    viejo = {"A-101": {"precio": 5_000_000}, "A-102": {"precio": 4_800_000},
             "A-103": {"precio": 6_000_000}}
    nuevo = {"A-101": {"precio": 4_750_000}, "A-102": {"precio": 4_800_000},
             "A-103": {"precio": 5_700_000}}
    h = descuento_entre_listas(viejo, nuevo)
    assert len(h) == 1
    assert h[0]["regla"] == "descuento_entre_listas" and h[0]["severidad"] == "alerta"
    assert h[0]["pct_unidades_con_baja"] == 66.7
    assert h[0]["promedio_baja_pct"] == 5.0
    assert h[0]["n_comunes"] == 3
    assert {b["unidad"] for b in h[0]["bajas"]} == {"A-101", "A-103"}


def test_descuento_chico_es_aviso_no_alerta():
    """Una sola baja de 2% (10% del inventario común) informa sin gritar."""
    viejo = {f"A-{i}": {"precio": 5_000_000} for i in range(10)}
    nuevo = {**{f"A-{i}": {"precio": 5_000_000} for i in range(9)},
             "A-9": {"precio": 4_900_000}}
    h = descuento_entre_listas(viejo, nuevo)
    assert len(h) == 1 and h[0]["severidad"] == "aviso"


def test_descuento_sin_bajas_silencio():
    viejo = {"A-101": {"precio": 5_000_000}}
    nuevo = {"A-101": {"precio": 5_200_000}}          # subió, no bajó
    assert descuento_entre_listas(viejo, nuevo) == []


def test_descuento_sin_unidades_comunes_no_inventa():
    assert descuento_entre_listas({"A-101": {"precio": 5_000_000}},
                                  {"B-201": {"precio": 4_000_000}}) == []
    assert descuento_entre_listas({}, {}) == []


def test_redondeo_de_parser_no_es_descuento():
    """Una 'baja' de $1 o de 0.05% es ruido de lectura, no negociación."""
    viejo = {"A-101": {"precio": 5_000_000}}
    nuevo = {"A-101": {"precio": 4_999_999}}
    assert descuento_entre_listas(viejo, nuevo) == []


# ─── precio_estancado ─────────────────────────────────────────────────────────
def _unidades(n_disp, n_vendidas):
    us = [{"id": f"u{i}", "unit_number": f"10{i}", "status": "disponible"}
          for i in range(n_disp)]
    us += [{"id": f"v{i}", "unit_number": f"20{i}", "status": "vendida"}
           for i in range(n_vendidas)]
    return us


def test_precio_estancado_alerta_con_inventario_alto():
    """3 disponibles llevan 130+ días sin cambio con 50% del inventario disponible."""
    us = _unidades(5, 5)
    dias = {"100": 130, "101": 200, "102": 150, "103": 30}
    h = precio_estancado(us, dias)
    assert len(h) == 1
    assert h[0]["regla"] == "precio_estancado" and h[0]["severidad"] == "alerta"
    assert {e["unidad"] for e in h[0]["unidades"]} == {"100", "101", "102"}
    assert h[0]["inventario_disponible_pct"] == 50.0
    assert "dormido" in h[0]["detalle"] or "podrido" in h[0]["detalle"]


def test_precio_estancado_inventario_bajo_calla():
    """Con ≤20% disponible el precio quieto es normal (ya casi se vendió todo)."""
    us = _unidades(2, 8)                               # 20% exacto → no rebasa el umbral
    dias = {"100": 300, "101": 300}
    assert precio_estancado(us, dias) == []


def test_precio_estancado_sin_historia_no_inventa():
    assert precio_estancado(_unidades(5, 0), {}) == []
    assert precio_estancado([], {"100": 300}) == []


def test_precio_estancado_umbral_configurable():
    us = _unidades(5, 0)
    dias = {"100": 80}
    assert precio_estancado(us, dias) == []            # 80 < 120 default
    assert len(precio_estancado(us, dias, umbral_dias=60)) == 1


def test_precio_estancado_unidad_sin_dato_queda_fuera():
    """La unidad sin evento de precio registrado NO cuenta como estancada."""
    us = _unidades(5, 0)
    h = precio_estancado(us, {"100": 500})             # solo una tiene historia
    assert len(h) == 1 and len(h[0]["unidades"]) == 1


# ─── juzgar_negocio (fake Mongo) ──────────────────────────────────────────────
class _Cursor:
    def __init__(self, docs):
        self._docs = list(docs)

    async def to_list(self, n=None):
        return self._docs[:n] if n else list(self._docs)

    def __aiter__(self):
        self._it = iter(self._docs)
        return self

    async def __anext__(self):
        try:
            return next(self._it)
        except StopIteration:
            raise StopAsyncIteration


def _match(doc, q):
    for k, v in (q or {}).items():
        if isinstance(v, dict):
            if "$in" in v and doc.get(k) not in v["$in"]:
                return False
        elif k.startswith("$"):
            return False
        elif doc.get(k) != v:
            return False
    return True


class _Col:
    def __init__(self, docs=None):
        self.docs = list(docs or [])

    def find(self, q=None, proj=None):
        return _Cursor([dict(d) for d in self.docs if _match(d, q)])

    async def find_one(self, q=None, proj=None):
        for d in self.docs:
            if _match(d, q):
                return dict(d)
        return None


class _Db:
    def __init__(self, **cols):
        self._cols = cols

    def __getattr__(self, name):
        return self._cols.setdefault(name, _Col())


@pytest.mark.asyncio
async def test_juzgar_negocio_sin_historia_devuelve_vacio():
    """Dev sin esquema, sin snapshots y sin price_events: la película no existe → []."""
    db = _Db(developments=_Col([{"id": "dev1", "name": "Almina"}]))
    assert await juzgar_negocio(db, "dev1") == []


@pytest.mark.asyncio
async def test_juzgar_negocio_una_sola_foto_de_lista_no_opina():
    """Con UNA foto del Vigía no hay diff — [] sin inventar."""
    db = _Db(
        developments=_Col([{"id": "dev1", "name": "Almina Towers"}]),
        vigia_listas_snapshot=_Col([
            {"archivo_id": "f1", "huella": "h1", "ts": "2026-07-01",
             "dev": "ALMINA", "proyecto": "Almina",
             "unidades": {"A-101": {"precio": 5_000_000}}}]),
    )
    assert await juzgar_negocio(db, "dev1") == []


@pytest.mark.asyncio
async def test_juzgar_negocio_end_to_end():
    """Esquema contradictorio + 2 fotos del Vigía con bajas + price_events viejos →
    las 3 reglas opinan con el mismo shape de hallazgo."""
    from datetime import datetime, timedelta, timezone
    hace_200 = (datetime.now(timezone.utc) - timedelta(days=200)).isoformat()
    db = _Db(
        developments=_Col([{"id": "dev1", "name": "Almina Towers",
                            "esquema_pago_nota": "10/90 contra entrega",
                            "etapa_comercial": "preventa"}]),
        vigia_listas_snapshot=_Col([
            {"archivo_id": "f1", "huella": "h1", "ts": "2026-06-01",
             "dev": "ALMINA", "proyecto": "Almina Towers",
             "unidades": {"A-101": {"precio": 5_000_000},
                          "A-102": {"precio": 6_000_000}}},
            {"archivo_id": "f1", "huella": "h2", "ts": "2026-07-01",
             "dev": "ALMINA", "proyecto": "Almina Towers",
             "unidades": {"A-101": {"precio": 4_600_000},
                          "A-102": {"precio": 5_500_000}}},
            # snapshot de OTRO desarrollo: no debe contaminar el diff de Almina
            {"archivo_id": "f9", "huella": "h9", "ts": "2026-07-01",
             "dev": "GDC", "proyecto": "Otro",
             "unidades": {"X-1": {"precio": 1_000_000}}}]),
        price_events=_Col([
            {"dev_id": "dev1", "unit_id": "u1", "changed_at": hace_200},
            {"dev_id": "dev1", "unit_id": "u2", "changed_at": hace_200}]),
        units=_Col([
            {"development_id": "dev1", "id": "u1", "unit_number": "A-101",
             "status": "disponible"},
            {"development_id": "dev1", "id": "u2", "unit_number": "A-102",
             "status": "disponible"}]),
    )
    h = await juzgar_negocio(db, "dev1")
    reglas = {x["regla"] for x in h}
    assert reglas == {"esquema_vs_etapa", "descuento_entre_listas", "precio_estancado"}
    negoc = next(x for x in h if x["regla"] == "descuento_entre_listas")
    assert negoc["n_comunes"] == 2 and negoc["pct_unidades_con_baja"] == 100.0
    for x in h:
        assert set(x) >= {"regla", "severidad", "ref", "detalle", "accion"}
        assert x["severidad"] in ("alerta", "aviso")


@pytest.mark.asyncio
async def test_juzgar_negocio_dev_inexistente():
    assert await juzgar_negocio(_Db(), "no_existe") == []
