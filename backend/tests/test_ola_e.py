"""OLA E — psicográfica + personas: Bayes de etapa de vida, saliencia visual, cohortes gemelas
y prima de marca. Números exactos + honestidad (es_estimado) + universalidad (etapas del dato)."""
from datetime import datetime, timedelta, timezone

import pytest

from test_market_timeline import _DB, _patch


async def _prior_4s(db):
    """Priors REALES-en-forma: ciclo_vida_pct de dos estudios (las etapas se descubren de aquí)."""
    for estudio, etapas in (
        ("coyoacan", {"soltero_joven": 16, "soltero_adulto": 11, "pareja_joven_sin_hijos": 14,
                      "pareja_adulta_sin_hijos": 9, "familia_joven": 30, "familia_adulta": 20}),
        ("periferico", {"soltero_joven": 20, "soltero_adulto": 13, "pareja_joven_sin_hijos": 16,
                        "pareja_adulta_sin_hijos": 11, "familia_joven": 25, "familia_adulta": 15}),
    ):
        for et, pct in etapas.items():
            await db.facts_4s.insert_one({"tema": "perfil", "pregunta": "ciclo_vida_pct",
                                          "estudio": estudio, "opcion": et, "valor": pct})


async def _atomo(db, visitor, dim, val, colonia="condesa"):
    await db.demand_atoms.insert_one({"visitor_id": visitor, "colonia": colonia,
                                      "dimension": dim, "valor": val, "peso": 1.0,
                                      "ts": datetime.now(timezone.utc).isoformat()})


@pytest.mark.asyncio
async def test_e1_bayes_familia_vs_soltero():
    """3 recámaras + ludoteca + 120m² → familia; 1 rec + 50m² + cowork → soltero joven.
    El prior 4S manda cuando no hay señal (etapas DESCUBIERTAS del dato, no hardcodeadas)."""
    from ola_e_engines import etapa_de_vida
    db = _DB()
    await _prior_4s(db)
    await _atomo(db, "fam", "producto.recamaras", "3")
    await _atomo(db, "fam", "producto.feature", "ludoteca")
    await _atomo(db, "fam", "producto.m2_banda", "120-130")
    await _atomo(db, "sol", "producto.recamaras", "1")
    await _atomo(db, "sol", "producto.m2_banda", "50-60")
    await _atomo(db, "sol", "producto.feature", "cowork")
    r = await etapa_de_vida(db)
    por_v = {f["visitor_id"]: f for f in r["visitantes"]}
    assert por_v["fam"]["etapa"] in ("familia_joven", "familia_adulta")
    assert por_v["sol"]["etapa"] == "soltero_joven"
    assert set(r["etapas_descubiertas"]) == {"soltero_joven", "soltero_adulto",
                                             "pareja_joven_sin_hijos", "pareja_adulta_sin_hijos",
                                             "familia_joven", "familia_adulta"}
    comp = {c["etapa"]: c for c in r["comparativa_demanda_vs_demografia"]}
    assert comp["soltero_joven"]["demografia_4s_pct"] == pytest.approx(18.0, abs=1.5)


@pytest.mark.asyncio
async def test_e2_saliencia_curva_y_etapa():
    """La foto 2 retiene 8s vs 1s de la foto 0 — y el dwell se cruza con la etapa inferida."""
    from ola_e_engines import saliencia_visual
    db = _DB()
    await _prior_4s(db)
    await _atomo(db, "v1", "producto.recamaras", "3")
    ahora = datetime.now(timezone.utc)
    for ms, foto in ((1000, "0"), (1200, "0"), (8000, "2"), (7500, "2")):
        await db.buyer_signals.insert_one({"type": "photo_dwell", "visitor_id": "v1",
                                           "entity_id": "torre-x", "value": foto,
                                           "dwell_ms": ms, "created_at_dt": ahora})
    await db.buyer_signals.insert_one({"type": "photo_zoom", "visitor_id": "v1",
                                       "entity_id": "torre-x", "value": "2", "created_at_dt": ahora})
    r = await saliencia_visual(db)
    assert r["top_fotos"][0]["foto"] == "2" and r["top_fotos"][0]["zooms"] == 1
    curva = {c["posicion"]: c["dwell_mediano_ms"] for c in r["curva_atencion_por_posicion"]}
    assert curva["2"] > curva["0"]
    assert r["saliencia_por_etapa"][0]["etapa"] in ("familia_joven", "familia_adulta")


@pytest.mark.asyncio
async def test_e3_gemelos_terminan_en_x():
    """a y b piden lo MISMO; b dejó lead en 'torre-y' → a recibe 'compradores como tú
    terminaron en torre-y'. El no-parecido no contamina."""
    from ola_e_engines import cohortes_gemelas
    db = _DB()
    for v in ("a", "b"):
        await _atomo(db, v, "producto.recamaras", "2")
        await _atomo(db, v, "producto.feature", "balcon")
        await _atomo(db, v, "finanzas.presupuesto_banda_mdp", "5.0-5.2")
    await _atomo(db, "otro", "producto.recamaras", "5", colonia="pedregal")
    await db.buyer_signals.insert_one({"type": "lead", "visitor_id": "b", "entity_id": "torre-y"})
    r = await cohortes_gemelas(db, visitor_id="a")
    assert r["n_gemelos"] == 1 and r["gemelos"][0]["visitor_id"] == "b"
    assert r["destinos_de_gemelos"][0]["destino"] == "torre-y"
    assert "torre-y" in r["lectura"]
    # vista global: 'a' tiene destino sugerido por su cohorte
    g = await cohortes_gemelas(db)
    fila_a = next(f for f in g["filas"] if f["visitor_id"] == "a")
    assert fila_a["destino_sugerido"] == "torre-y"


@pytest.mark.asyncio
async def test_e4_prima_marca_cobra_mas_y_vende(monkeypatch):
    """dev_caro cobra +25% sobre su colonia Y absorbe 75% → score de marca arriba del
    dev_barato que no vende ni lo buscan."""
    from ola_e_engines import prima_marca
    db = _DB()
    await db.developments.insert_one({"id": "dev_caro", "name": "Marca Fuerte"})
    await db.developments.insert_one({"id": "dev_flojo", "name": "Sin Marca"})
    unidades = []
    for i in range(4):   # dev_caro: pm2 100k, solo 1 disponible (75% absorbido)
        unidades.append({"colonia": "condesa", "dev_id": "dev_caro", "unit_id": f"c{i}",
                         "disponible": i == 0, "precio": 10000000.0, "m2": 100.0,
                         "vector": {}, "crudos": {}})
    for i in range(8):   # dev_flojo domina la colonia: pm2 80k, todo disponible (0% absorbido)
        unidades.append({"colonia": "condesa", "dev_id": "dev_flojo", "unit_id": f"f{i}",
                         "disponible": True, "precio": 8000000.0, "m2": 100.0,
                         "vector": {}, "crudos": {}})
    _patch(monkeypatch, unidades)
    for _ in range(8):
        await db.buyer_signals.insert_one({"type": "ficha_view", "entity_id": "dev_caro",
                                           "visitor_id": "v"})
    r = await prima_marca(db)
    top = {f["dev_id"]: f for f in r["filas"]}
    assert r["filas"][0]["dev_id"] == "dev_caro"
    assert top["dev_caro"]["score_marca"] > top["dev_flojo"]["score_marca"]
    assert top["dev_caro"]["prima_pm2_pct"] > 0 >= top["dev_flojo"]["prima_pm2_pct"]
    assert top["dev_caro"]["nombre"] == "Marca Fuerte"


@pytest.mark.asyncio
async def test_ola_e_honesta_sin_datos(monkeypatch):
    """UNIVERSAL (regla Lomas): los 4 motores con db vacía responden honesto, nada truena."""
    import ola_e_engines as oe
    db = _DB()
    _patch(monkeypatch, [])
    for fn in (oe.etapa_de_vida, oe.saliencia_visual, oe.cohortes_gemelas, oe.prima_marca):
        r = await fn(db)
        assert isinstance(r, dict) and "lectura" in r
