"""Juez cruzado: contradicciones ENTRE documentos del mismo desarrollo.

Fixtures sintéticos calcados de los casos reales 07-17:
  · folleto Único Coyoacán 'desde 91 m²' vs lista que arranca en 64,
  · plano de nivel que rotula el 1802 que la lista no trae,
  · 'Único Coyoacán' parado en Portales Norte.
"""
import pytest

from juez_cruzado import (desde_m2_de_folleto, desde_precio_de_folleto,
                          folleto_vs_lista, juzgar_cruzado, nombre_vs_colonia,
                          plano_vs_lista)


def _u(numero, m2=None, precio=None, tipo="departamento", **extra):
    return {"unit_number": numero, "size_m2": m2, "price_mxn": precio,
            "tipo": tipo, "id": f"u_{numero}", **extra}


# ─── folleto_vs_lista ─────────────────────────────────────────────────────────
def test_folleto_desde_91_pero_lista_arranca_en_64():
    """El caso Único Coyoacán: el folleto vende 'desde 91 m²', la lista dice 64."""
    texto = "ÚNICO COYOACÁN · Departamentos desde 91 m² con amenidades de lujo"
    unidades = [_u("101", m2=64, precio=3_200_000), _u("102", m2=91, precio=4_500_000)]
    h = folleto_vs_lista(texto, unidades)
    assert len(h) == 1
    assert h[0]["regla"] == "folleto_vs_lista" and h[0]["severidad"] == "alerta"
    assert h[0]["folleto"] == 91 and h[0]["lista"] == 64
    assert "91" in h[0]["detalle"] and "64" in h[0]["detalle"]
    assert h[0]["accion"]


def test_folleto_desde_precio_anzuelo():
    """'desde $2,590,000' con unidad más barata de $3.1M = anzuelo."""
    texto = "Vive aquí desde $2,590,000"
    unidades = [_u("101", m2=64, precio=3_100_000), _u("102", m2=80, precio=4_000_000)]
    h = folleto_vs_lista(texto, unidades)
    assert len(h) == 1 and h[0]["campo"] == "precio"
    assert h[0]["folleto"] == 2_590_000 and h[0]["lista"] == 3_100_000
    assert "anzuelo" in h[0]["detalle"]


def test_folleto_precio_en_mdp_y_dentro_de_tolerancia_no_grita():
    """'desde $3.1 MDP' con mínimo real 3,100,000 coincide → silencio."""
    unidades = [_u("101", m2=64, precio=3_100_000)]
    assert desde_precio_de_folleto("desde $3.1 MDP") == 3_100_000
    assert folleto_vs_lista("desde $3.1 MDP", unidades) == []


def test_folleto_coincide_en_m2_no_grita():
    unidades = [_u("101", m2=64.5, precio=3_000_000)]
    assert folleto_vs_lista("desde 64 m²", unidades) == []


def test_folleto_ignora_locales_para_el_minimo():
    """Un local de 28 m² NO desmiente un folleto que vende deptos 'desde 60 m²'."""
    unidades = [_u("L-01", m2=28, precio=2_000_000, tipo="local"),
                _u("101", m2=60, precio=3_500_000)]
    assert folleto_vs_lista("desde 60 m²", unidades) == []


def test_folleto_sin_texto_o_sin_unidades_no_opina():
    assert folleto_vs_lista("", [_u("101", m2=64)]) == []
    assert folleto_vs_lista("desde 91 m²", []) == []


def test_desde_m2_toma_el_menor_de_varias_tipologias():
    texto = "2 recámaras desde 91 m² · 1 recámara desde 64 m²"
    assert desde_m2_de_folleto(texto) == 64


def test_desde_precio_exige_senal_de_dinero():
    """'desde 91' sin $ ni MDP no es precio (era el propio 'desde 91 m²')."""
    assert desde_precio_de_folleto("departamentos desde 91 m²") is None


# ─── plano_vs_lista ───────────────────────────────────────────────────────────
def test_plano_rotula_1802_que_la_lista_no_trae():
    """El caso real: el plano de nivel rotula un 1802 ausente de la lista."""
    h = plano_vs_lista(["1801", "1802"], ["1801", "1803"])
    alertas = [x for x in h if x["origen"] == "plano_sin_lista"]
    assert len(alertas) == 1
    assert alertas[0]["ref"] == "1802" and alertas[0]["severidad"] == "alerta"
    assert "1802" in alertas[0]["detalle"]


def test_plano_con_torre_empata_con_lista_sin_torre():
    """'A-1802' del plano y '1802' de la lista son la misma unidad — sin falsa alarma."""
    assert plano_vs_lista(["A-1802"], ["1802"]) == []


def test_lista_sin_plano_avisa_solo_con_cobertura_alta():
    """Planos cubren 3 de 4 → la que falta merece aviso."""
    h = plano_vs_lista(["101", "102", "103"], ["101", "102", "103", "104"])
    avisos = [x for x in h if x["origen"] == "lista_sin_plano"]
    assert len(avisos) == 1 and avisos[0]["ref"] == "104"
    assert avisos[0]["severidad"] == "aviso"


def test_planos_parciales_no_inundan_de_avisos():
    """Planos de una sola torre (1 de 10 unidades): callar el 'falta en plano'."""
    lista = [f"10{i}" for i in range(1, 10)] + ["201"]
    h = plano_vs_lista(["201"], lista)
    assert [x for x in h if x["origen"] == "lista_sin_plano"] == []


def test_plano_vacio_o_lista_vacia_no_opina():
    assert plano_vs_lista([], ["101"]) == []
    assert plano_vs_lista(["101"], []) == []


# ─── nombre_vs_colonia ────────────────────────────────────────────────────────
def test_unico_coyoacan_en_portales_norte_avisa():
    """El caso real: el nombre alude a Coyoacán, la colonia real es Portales Norte."""
    h = nombre_vs_colonia("Único Coyoacán", "Portales Norte")
    assert len(h) == 1
    assert h[0]["regla"] == "nombre_vs_colonia" and h[0]["severidad"] == "aviso"
    assert h[0]["lugar_aludido"] == "coyoacan"
    assert "Portales Norte" in h[0]["detalle"]


def test_nombre_honesto_no_avisa():
    assert nombre_vs_colonia("Nuvo Nápoles", "Ampliación Nápoles") == []
    assert nombre_vs_colonia("Torre Central 123", "Portales Norte") == []


def test_alcaldia_salva_al_nombre():
    """'X Coyoacán' en colonia Del Carmen (alcaldía Coyoacán) es honesto."""
    assert nombre_vs_colonia("Vive Coyoacán", "Del Carmen",
                             alcaldia="Coyoacán") == []


def test_sin_colonia_no_opina():
    assert nombre_vs_colonia("Único Coyoacán", "") == []


# ─── juzgar_cruzado (fake Mongo, sin PDFs) ────────────────────────────────────
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
            return False                       # operadores raros → sin match (fail-open)
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
async def test_juzgar_cruzado_plano_y_nombre_end_to_end():
    """Con el dev en Mongo (fake): el plano fantasma 1802 y el nombre-colonia salen
    juntos; sin folleto PDF la regla de folleto simplemente no opina."""
    db = _Db(
        developments=_Col([{"id": "dev1", "name": "Único Coyoacán",
                            "colonia": "Portales Norte", "alcaldia": "Benito Juárez"}]),
        units=_Col([{"id": "u1", "development_id": "dev1", "unit_number": "1801",
                     "size_m2": 64, "price_mxn": 3_200_000},
                    {"id": "u2", "development_id": "dev1", "unit_number": "1803",
                     "size_m2": 91, "price_mxn": 4_500_000}]),
        dev_assets=_Col([{"development_id": "dev1", "asset_type": "plano_nivel",
                          "deptos": ["1801", "1802"],
                          "filename": "planta_nivel_18.png"}]),
    )
    h = await juzgar_cruzado(db, "dev1")
    reglas = {x["regla"] for x in h}
    assert reglas == {"plano_vs_lista", "nombre_vs_colonia"}
    # ambas direcciones: el 1802 rotulado que la lista no trae (alerta) y el 1803
    # de la lista que ningún plano rotula (aviso — cobertura 50% alcanza)
    fantasma = [x for x in h if x.get("origen") == "plano_sin_lista"]
    assert len(fantasma) == 1 and fantasma[0]["ref"] == "1802"
    sin_plano = [x for x in h if x.get("origen") == "lista_sin_plano"]
    assert len(sin_plano) == 1 and sin_plano[0]["ref"] == "1803"
    for x in h:
        assert set(x) >= {"regla", "severidad", "ref", "detalle", "accion"}
        assert x["severidad"] in ("alerta", "aviso")


@pytest.mark.asyncio
async def test_juzgar_cruzado_dev_inexistente_devuelve_vacio():
    assert await juzgar_cruzado(_Db(), "no_existe") == []


def test_plano_vs_lista_empata_por_nucleo_numerico():
    """07-17: el plano rotula '201' pelón y la lista trae 'Sauce 201'/'A-201' — el núcleo
    numérico los empata (antes salían 221 falsos positivos por prefijo de torre-palabra)."""
    from juez_cruzado import plano_vs_lista
    # ningún plano queda "huérfano": '201'↔'Sauce 201', '1507'↔'A-1507' por núcleo numérico
    r = plano_vs_lista(["201", "1507"], ["Sauce 201", "A-1507"])
    assert not [h for h in r if h.get("origen", "").startswith("plano_sin_lista")]


def test_plano_vs_lista_colapsa_desajuste_masivo():
    """Muchos huérfanos = esquema de numeración distinto → 1 aviso resumen, no N alertas."""
    from juez_cruzado import plano_vs_lista
    planos = [str(9000 + i) for i in range(40)]      # 40 números que la lista no trae
    r = plano_vs_lista(planos, ["A-101", "A-102", "A-103"])
    resumenes = [h for h in r if h.get("origen") == "plano_sin_lista_masivo"]
    assert len(resumenes) == 1 and resumenes[0]["severidad"] == "aviso"
    assert resumenes[0]["n"] == 40
    # pocos huérfanos SÍ se detallan como alerta concreta
    r2 = plano_vs_lista(["9999"], ["A-101", "A-102"])
    assert any(h["severidad"] == "alerta" for h in r2)
