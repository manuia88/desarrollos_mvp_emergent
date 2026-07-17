"""Registro único de peleas — el dato en disputa nunca se esconde, ahora tampoco se riega.

Regla: cada pelea sale con su ruta de resolución (auto | otro_doc | dev) clasificada
por tipo, y las de ruta 'dev' envejecen (recordatorio al desarrollador)."""
from datetime import datetime, timedelta, timezone

import pytest

from peleas_registry import (clasifica_ruta, edad_dias, fila_pelea,
                             filtra_envejecidas, envejecidas, peleas_abiertas)


# ─── lógica pura ────────────────────────────────────────────────────────────

def test_clasifica_ruta_por_tipo():
    """La regla fija: inventario/solicitudes → dev · m²/fuentes → otro_doc · resto → auto."""
    assert clasifica_ruta("inventario_pelea") == "dev"
    assert clasifica_ruta("solicitud") == "dev"
    assert clasifica_ruta("m2_pelea") == "otro_doc"
    assert clasifica_ruta("pelea_fuente") == "otro_doc"
    assert clasifica_ruta("precio_pelea") == "auto"
    assert clasifica_ruta("esquema_pelea") == "auto"
    assert clasifica_ruta("status_nota") == "auto"


def test_edad_dias_prefiere_fecha_sobre_created_at():
    hoy = datetime(2026, 7, 17, tzinfo=timezone.utc)
    assert edad_dias({"fecha": "2026-07-10", "created_at": "2026-07-16"}, hoy) == 7
    assert edad_dias({"ts": "2026-07-15T20:15:37.869496+00:00"}, hoy) == 1
    assert edad_dias({"created_at": "2026-07-16T23:08:18.416Z"}, hoy) == 0


def test_edad_dias_sin_fecha_usa_el_id_de_mongo():
    from bson import ObjectId
    hoy = datetime.now(timezone.utc)
    oid = ObjectId.from_datetime(hoy - timedelta(days=12))
    assert edad_dias({"_id": oid}, hoy) == 12
    assert edad_dias({}) is None                      # sin nada NO se inventa edad


def test_fila_pelea_trae_ruta_y_su_explicacion_humana():
    f = fila_pelea("m2_pelea", "NUA Interlomas", "T2 - 2304",
                   "lista dice 124.98, plano medido dice 127.36", 2,
                   development_id="dev_nua", org_id="org_class")
    assert f["ruta"] == "otro_doc"
    assert "plano > lista > maestro" in f["ruta_humana"]
    assert f["unidad"] == "T2 - 2304" and f["edad_dias"] == 2


def test_filtra_envejecidas_solo_ruta_dev_y_mas_viejas_que_umbral():
    filas = [fila_pelea("inventario_pelea", "Jai", "16G", "x", 15),
             fila_pelea("inventario_pelea", "Jai", "25L", "x", 10),   # 10 NO es > 10
             fila_pelea("m2_pelea", "NUA", "T2", "x", 40),            # otro_doc no envejece
             fila_pelea("solicitud", "CLASS", None, "x", 22)]
    v = filtra_envejecidas(filas, umbral_dias=10)
    assert [f["edad_dias"] for f in v] == [22, 15]     # más vieja primero


# ─── contra Mongo (mongomock) ───────────────────────────────────────────────

async def _siembra(db):
    await db.developments.insert_one({"id": "d1", "name": "NUA Interlomas",
                                      "developer_id": "org_class_x"})
    await db.developments.insert_one(
        {"id": "d2", "name": "Único Coyoacán", "developer_id": "org_gdc",
         "created_at": "2026-07-01",
         "peleas_fuente": ["el plano rotula 1801-1804 pero la lista trae 1805",
                           "la presentación dice 'desde 91 m²' y la lista baja a 64"]})
    await db.units.insert_one({"development_id": "d1", "unit_number": "T2 - 2304",
                               "created_at": "2026-07-10",
                               "m2_pelea": "lista dice 124.98, plano dice 127.36"})
    await db.units.insert_one({"development_id": "d1", "unit_number": "16G",
                               "created_at": "2026-06-20",
                               "inventario_pelea": "lista no la ofrece; maestro sí"})
    await db.units.insert_one({"development_id": "d1", "unit_number": "PH03",
                               "created_at": "2026-07-15",
                               "status_nota": "sombreada = apartada en lista"})
    await db.vigia_manifiesto.insert_one({"dev_carpeta": "DESARROLLOS-CLASS",
                                          "dev_org_id": "org_class_x"})
    await db.vigia_manifiesto.insert_one({"dev_carpeta": "CLIENTES EXTERNOS",
                                          "dev_org_id": "org_gdc"})
    await db.solicitudes_class.insert_one({"tipo": "laminas_faltantes",
                                           "estado": "pendiente", "ts": "2026-06-01",
                                           "detalle": "Almina: faltan láminas."})
    await db.solicitudes_gdc.insert_one({"tipo": "planos_por_tipo", "estado": "resuelto",
                                         "ts": "2026-06-01"})     # resuelta → NO cuenta


@pytest.mark.asyncio
async def test_peleas_abiertas_junta_las_4_fuentes(mock_db):
    await _siembra(mock_db)
    r = await peleas_abiertas(mock_db)
    # 3 de units + 2 de peleas_fuente + 1 solicitud pendiente (la resuelta NO)
    assert r["n"] == 6
    assert r["por_tipo"] == {"m2_pelea": 1, "inventario_pelea": 1, "status_nota": 1,
                             "pelea_fuente": 2, "solicitud": 1}
    assert r["por_ruta"] == {"otro_doc": 3, "dev": 2, "auto": 1}
    # el renglón es uniforme y en humano (nombre del proyecto, no id crudo)
    m2 = next(f for f in r["peleas"] if f["tipo"] == "m2_pelea")
    assert m2["desarrollo"] == "NUA Interlomas" and m2["unidad"] == "T2 - 2304"
    assert m2["org_id"] == "org_class_x"
    sol = next(f for f in r["peleas"] if f["tipo"] == "solicitud")
    assert sol["desarrollo"].startswith("CLASS") and sol["unidad"] is None
    assert sol["org_id"] == "org_class_x"        # etiqueta → org real vía manifiesto
    assert "Láminas de planos faltantes" in sol["detalle"]


@pytest.mark.asyncio
async def test_envejecidas_solo_las_que_esperan_al_dev(mock_db):
    await _siembra(mock_db)
    v = await envejecidas(mock_db, umbral_dias=10)
    # inventario_pelea (06-20) y solicitud CLASS (06-01) pasan; m2/status/fuente no
    assert {f["tipo"] for f in v} == {"inventario_pelea", "solicitud"}
    assert all(f["ruta"] == "dev" and f["edad_dias"] > 10 for f in v)
    assert v[0]["tipo"] == "solicitud"            # la más vieja primero


@pytest.mark.asyncio
async def test_db_vacia_no_truena(mock_db):
    r = await peleas_abiertas(mock_db)
    assert r == {"peleas": [], "n": 0, "por_ruta": {}, "por_tipo": {}}
    assert await envejecidas(mock_db) == []
