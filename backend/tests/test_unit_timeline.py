"""Tests de unit_timeline — la biografía de cada depto y las métricas de película.

Cubre: biografía multi-fuente (alta + bitácora + dev_audit + audit_log + snapshots del
vigía + planos) · dedup entre fuentes · resumen honesto (sin historia = se dice, no se
inventa) · velocidad real u/mes con gate de ≥1 mes · estancadas SOLO con historia que lo
pruebe · frescura por desarrollador ordenada podrido→fresco.

Sin infra real: mongomock_motor (fixture mock_db de conftest). Sin LLM. $0.
Run: python -m pytest tests/test_unit_timeline.py -v
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from unit_timeline import (
    DIAS_ESTANCADA,
    _dedup_eventos,
    _fecha_iso,
    _mismo_proyecto,
    _plano_menciona_unidad,
    biografia,
    eventos_de_bitacora,
    eventos_de_snapshots,
    frescura_catalogo,
    metricas_pelicula,
    resumen_de_eventos,
)


def _hace(dias: float) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=dias)).isoformat()


# ─── puros: nombre de la unidad en archivos y proyectos ──────────────────────

@pytest.mark.unit
def test_plano_menciona_unidad_con_frontera_de_token():
    assert _plano_menciona_unidad("Cordobanes Departamento 202.pdf", "202")
    assert _plano_menciona_unidad("DEPARTAMENTOS 201 - 301.pdf", "201")
    assert _plano_menciona_unidad("Plano A 107 final.pdf", "A-107")   # fusión de tokens
    assert not _plano_menciona_unidad("Cordobanes Departamento 202.pdf", "20")
    assert not _plano_menciona_unidad("Brochure general.pdf", "202")
    assert not _plano_menciona_unidad("lo que sea", "")


@pytest.mark.unit
def test_mismo_proyecto_flexible_y_raiz():
    assert _mismo_proyecto("Cordobanes", "Cordobanes - ENTREGA INMEDIATA")
    assert _mismo_proyecto("Almina San Ángel", "(raíz)")          # raíz nunca bloquea
    assert _mismo_proyecto(None, "Cualquiera")                    # sin nombre no bloquea
    assert not _mismo_proyecto("Cordobanes", "Avalia Desierto de los Leones")


@pytest.mark.unit
def test_fecha_iso_ordena_espacio_y_t_igual():
    # oferta_timeline usa espacio, el vigía usa T — normalizados deben ordenar bien
    a = _fecha_iso("2026-07-14 07:23:39")
    b = _fecha_iso("2026-07-14T08:34:31+00:00")
    assert a < b


# ─── puros: bitácora → eventos de biografía ──────────────────────────────────

@pytest.mark.unit
def test_eventos_de_bitacora_precio_y_venta():
    evs = [
        {"unit_id": "u1", "ts": "2026-05-01 10:00:00", "precio": 5000000.0,
         "disponible": True, "status": "disponible", "fuente": "arranque"},
        {"unit_id": "u1", "ts": "2026-06-01 10:00:00", "precio": 5250000.0,
         "disponible": True, "status": "disponible", "fuente": "cron"},
        {"unit_id": "u1", "ts": "2026-07-01 10:00:00", "precio": 5250000.0,
         "disponible": False, "status": "vendido", "fuente": "cron"},
    ]
    out = eventos_de_bitacora(evs)
    tipos = [e["tipo"] for e in out]
    assert tipos[0] == "primera_observacion"
    assert "cambio_precio" in tipos
    assert "senal_venta" in tipos
    venta = next(e for e in out if e["tipo"] == "senal_venta")
    assert "confirmado" in venta["detalle"].lower() or "Vendida" in venta["detalle"]
    cambio = next(e for e in out if e["tipo"] == "cambio_precio")
    assert "5,000,000" in cambio["detalle"] and "5,250,000" in cambio["detalle"]
    # todos con el contrato {fecha, tipo, detalle, fuente, quien}
    for e in out:
        assert set(e) == {"fecha", "tipo", "detalle", "fuente", "quien"}


@pytest.mark.unit
def test_eventos_de_snapshots_diff_por_version_del_mismo_archivo():
    snaps = [
        {"archivo_id": "f1", "huella": "h1", "nombre": "Lista.pdf", "ts": "2026-06-01T00:00:00",
         "unidades": {"A107": {"unidad": "A-107", "precio": 8000000.0, "status": None},
                      "A108": {"unidad": "A-108", "precio": 8100000.0, "status": None}}},
        {"archivo_id": "f1", "huella": "h2", "nombre": "Lista.pdf", "ts": "2026-07-01T00:00:00",
         "unidades": {"A107": {"unidad": "A-107", "precio": 8200000.0, "status": None}}},
    ]
    # A-107: cambio de precio entre versiones
    ev107 = eventos_de_snapshots(snaps, "A-107")
    assert any(e["tipo"] == "cambio_precio" and "8,200,000" in e["detalle"] for e in ev107)
    # A-108: desapareció de la lista → señal de venta probable
    ev108 = eventos_de_snapshots(snaps, "A-108")
    assert any(e["tipo"] == "senal_venta" for e in ev108)
    # una unidad que nunca estuvo: nada (no se inventa)
    assert eventos_de_snapshots(snaps, "Z-999") == []


@pytest.mark.unit
def test_dedup_mismo_hecho_dos_fuentes():
    e1 = {"fecha": "2026-06-01T10:00:00", "tipo": "cambio_precio",
          "detalle": "$1 → $2", "fuente": "a", "quien": "x"}
    e2 = dict(e1, fuente="b")   # mismo día, mismo tipo, mismo detalle → duplicado
    assert len(_dedup_eventos([e1, e2])) == 1


@pytest.mark.unit
def test_resumen_honesto_sin_eventos():
    r = resumen_de_eventos([], [])
    assert r["dias_en_lista"] is None
    assert r["n_cambios_precio"] == 0
    assert r["delta_precio_total"] is None
    assert "sin historia suficiente" in r["nota"]


@pytest.mark.unit
def test_resumen_delta_precio_con_serie():
    eventos = [
        {"fecha": _hace(60), "tipo": "alta", "detalle": "", "fuente": "units", "quien": "s"},
        {"fecha": _hace(30), "tipo": "cambio_precio", "detalle": "", "fuente": "o", "quien": "s"},
    ]
    r = resumen_de_eventos(eventos, [(_hace(60), 5000000.0), (_hace(30), 5300000.0)])
    assert r["n_cambios_precio"] == 1
    assert r["delta_precio_total"] == 300000.0
    assert 59 <= r["dias_en_lista"] <= 61
    # con UN solo precio no se inventa delta
    r2 = resumen_de_eventos(eventos, [(_hace(60), 5000000.0)])
    assert r2["delta_precio_total"] is None


# ─── biografía end-to-end (todas las fuentes en mongomock) ───────────────────

@pytest.mark.unit
@pytest.mark.asyncio
async def test_biografia_junta_todas_las_fuentes(mock_db):
    await mock_db.units.insert_one({
        "id": "unit_x1", "unit_number": "202", "development_id": "dev_1",
        "status": "disponible", "price": 6200000.0,
        "created_at": _hace(90), "source": "bulk_ingest"})
    await mock_db.developments.insert_one({"id": "dev_1", "name": "Cordobanes",
                                           "developer_id": "org_class"})
    await mock_db.oferta_timeline.insert_many([
        {"unit_id": "unit_x1", "dev_id": "dev_1", "ts": _hace(80), "precio": 6000000.0,
         "disponible": True, "status": "disponible", "fuente": "arranque", "hash": "a"},
        {"unit_id": "unit_x1", "dev_id": "dev_1", "ts": _hace(40), "precio": 6200000.0,
         "disponible": True, "status": "disponible", "fuente": "cron", "hash": "b"},
    ])
    await mock_db.developer_audit.insert_one({
        "id": "aud1", "dev_id": "dev_1", "unit_id": "unit_x1", "user_id": "user_dev_1",
        "action": "unit_fields_change", "ts": _hace(20),
        "payload": {"dev_id": "dev_1", "unit_id": "unit_x1", "bodega": True}})
    await mock_db.audit_log.insert_one({
        "id": "al1", "ts": _hace(10), "action": "update", "entity_type": "unit",
        "entity_id": "unit_x1", "diff_keys": ["price"],
        "actor": {"user_id": "sa1", "role": "superadmin", "name": "Manuel"}})
    await mock_db.vigia_eventos.insert_one({
        "id": "vev1", "tipo": "archivo_nuevo", "dev": "DESARROLLOS-CLASS",
        "proyecto": "Cordobanes - ENTREGA INMEDIATA", "ts": _hace(5),
        "archivo": {"id": "f9", "nombre": "Cordobanes Departamento 202.pdf",
                    "carpeta": "PLANOS", "mime": "application/pdf"}})

    b = await biografia(mock_db, "unit_x1")
    assert b["unidad"]["en_catalogo"] is True
    assert b["unidad"]["desarrollo"] == "Cordobanes"
    tipos = {e["tipo"] for e in b["eventos"]}
    assert {"alta", "primera_observacion", "cambio_precio",
            "edicion_dev", "auditoria", "plano_aparece"} <= tipos
    # ordenados por fecha ascendente
    fechas = [e["fecha"] for e in b["eventos"]]
    assert fechas == sorted(fechas)
    # quién: cada fuente identifica a su actor
    assert any(e["quien"] == "Manuel" for e in b["eventos"])
    assert any(e["quien"] == "user_dev_1" for e in b["eventos"])
    assert b["resumen"]["n_cambios_precio"] == 1
    assert b["resumen"]["delta_precio_total"] == 200000.0


@pytest.mark.unit
@pytest.mark.asyncio
async def test_biografia_sin_historia_es_honesta(mock_db):
    b = await biografia(mock_db, "unit_fantasma")
    assert b["unidad"]["en_catalogo"] is False
    assert b["eventos"] == []
    assert b["resumen"]["dias_en_lista"] is None
    assert "sin historia suficiente" in b["lectura"].lower()


# ─── métricas de película por desarrollo ─────────────────────────────────────

async def _seed_dev_con_ventas(mock_db, dias_historia: float, n_ventas: int = 2):
    await mock_db.developments.insert_one({"id": "dev_p", "name": "Torre Peli",
                                           "developer_id": "org_p"})
    for i in range(4):
        await mock_db.units.insert_one({
            "id": f"u_{i}", "unit_number": f"10{i}", "development_id": "dev_p",
            "status": "vendido" if i < n_ventas else "disponible",
            "created_at": _hace(dias_historia), "price": 5000000.0 + i})
    for i in range(4):
        vendida = i < n_ventas
        await mock_db.oferta_timeline.insert_one(
            {"unit_id": f"u_{i}", "dev_id": "dev_p", "ts": _hace(dias_historia),
             "precio": 5000000.0 + i, "disponible": True, "status": "disponible",
             "fuente": "arranque", "hash": f"h{i}a"})
        if vendida:
            await mock_db.oferta_timeline.insert_one(
                {"unit_id": f"u_{i}", "dev_id": "dev_p", "ts": _hace(2),
                 "precio": 5000000.0 + i, "disponible": False, "status": "vendido",
                 "fuente": "cron", "hash": f"h{i}b"})


@pytest.mark.unit
@pytest.mark.asyncio
async def test_pelicula_velocidad_real_con_historia(mock_db):
    await _seed_dev_con_ventas(mock_db, dias_historia=62.0, n_ventas=2)
    m = await metricas_pelicula(mock_db, "dev_p")
    assert m["desarrollo"]["nombre"] == "Torre Peli"
    assert m["ventas_detectadas"] == 2
    assert m["meses_observados"] >= 1.9
    # 2 ventas en ~2 meses ≈ 1 u/mes — MEDIDO, no inventado
    assert 0.8 <= m["velocidad_real_u_mes"] <= 1.2
    assert m["tiempo_en_lista_promedio_disponibles"] >= 61


@pytest.mark.unit
@pytest.mark.asyncio
async def test_pelicula_sin_un_mes_no_inventa_velocidad(mock_db):
    await _seed_dev_con_ventas(mock_db, dias_historia=10.0, n_ventas=1)
    m = await metricas_pelicula(mock_db, "dev_p")
    assert m["velocidad_real_u_mes"] is None          # <1 mes: NUNCA un número
    assert "sin historia suficiente" in m["nota"]
    assert m["ventas_detectadas"] == 1                # lo detectado sí se reporta


@pytest.mark.unit
@pytest.mark.asyncio
async def test_pelicula_estancadas_solo_con_historia_que_lo_pruebe(mock_db):
    # dev A: 130 días de historia sin cambio de precio → estancada probada
    await mock_db.developments.insert_one({"id": "dev_e", "name": "Torre Quieta",
                                           "developer_id": "org_e"})
    await mock_db.units.insert_one({"id": "u_e1", "unit_number": "301",
                                    "development_id": "dev_e", "status": "disponible",
                                    "created_at": _hace(130), "price": 7000000.0})
    await mock_db.oferta_timeline.insert_many([
        {"unit_id": "u_e1", "dev_id": "dev_e", "ts": _hace(130), "precio": 7000000.0,
         "disponible": True, "status": "disponible", "fuente": "arranque", "hash": "x1"},
        {"unit_id": "u_e1", "dev_id": "dev_e", "ts": _hace(5), "precio": 7000000.0,
         "disponible": True, "status": "reservado", "fuente": "cron", "hash": "x2"},
    ])
    m = await metricas_pelicula(mock_db, "dev_e")
    assert len(m["unidades_estancadas"]) == 1
    fila = m["unidades_estancadas"][0]
    assert fila["unidad"] == "301"
    assert fila["dias_sin_cambio_precio"] >= DIAS_ESTANCADA

    # dev B: solo 30 días observados → NO se acusa estancamiento sin prueba
    await mock_db.developments.insert_one({"id": "dev_j", "name": "Torre Joven",
                                           "developer_id": "org_j"})
    await mock_db.units.insert_one({"id": "u_j1", "unit_number": "101",
                                    "development_id": "dev_j", "status": "disponible",
                                    "created_at": _hace(30), "price": 5000000.0})
    await mock_db.oferta_timeline.insert_one(
        {"unit_id": "u_j1", "dev_id": "dev_j", "ts": _hace(30), "precio": 5000000.0,
         "disponible": True, "status": "disponible", "fuente": "arranque", "hash": "y1"})
    m2 = await metricas_pelicula(mock_db, "dev_j")
    assert m2["unidades_estancadas"] == []
    assert "nota_estancadas" in m2


@pytest.mark.unit
@pytest.mark.asyncio
async def test_pelicula_frescura_desde_vigia(mock_db):
    await mock_db.developments.insert_one({"id": "dev_f", "name": "Cordobanes",
                                           "developer_id": "org_class"})
    await mock_db.vigia_manifiesto.insert_one({"dev_carpeta": "DESARROLLOS-CLASS",
                                               "fuente_id": "vf1", "dev_org_id": "org_class"})
    await mock_db.vigia_eventos.insert_many([
        {"id": "v1", "tipo": "lista_cambiada", "dev": "DESARROLLOS-CLASS",
         "proyecto": "Cordobanes - ENTREGA INMEDIATA", "ts": _hace(3)},
        {"id": "v2", "tipo": "lista_cambiada", "dev": "DESARROLLOS-CLASS",
         "proyecto": "Otro Proyecto", "ts": _hace(1)},
    ])
    m = await metricas_pelicula(mock_db, "dev_f")
    # prefiere la lista del PROYECTO exacto (hace 3 días), no la de otro proyecto
    assert m["frescura"]["alcance"] == "proyecto"
    assert 2 <= m["frescura"]["dias_sin_actualizar"] <= 4


# ─── frescura del catálogo completo ──────────────────────────────────────────

@pytest.mark.unit
@pytest.mark.asyncio
async def test_frescura_catalogo_podrido_primero(mock_db):
    await mock_db.dev_orgs.insert_many([
        {"tenant_id": "org_class", "name": "Class Bienes Raíces",
         "display_name": "Class Bienes Raíces"},
        {"tenant_id": "org_gdc", "name": "GDC"},
        {"tenant_id": "org_nuevo", "name": "Dev Sin Drive"},
    ])
    await mock_db.vigia_manifiesto.insert_many([
        {"dev_carpeta": "DESARROLLOS-CLASS", "fuente_id": "vf1", "dev_org_id": "org_class"},
        {"dev_carpeta": "CLIENTES EXTERNOS", "fuente_id": "vf1", "dev_org_id": "org_gdc"},
    ])
    await mock_db.vigia_eventos.insert_many([
        {"id": "v1", "tipo": "lista_cambiada", "dev": "DESARROLLOS-CLASS",
         "proyecto": "X", "ts": _hace(2)},
        {"id": "v2", "tipo": "lista_nueva", "dev": "CLIENTES EXTERNOS",
         "proyecto": "Y", "ts": _hace(40)},
    ])
    r = await frescura_catalogo(mock_db)
    assert r["n_desarrolladores"] == 3
    assert r["n_con_lista_vista"] == 2
    orden = [f["desarrollador"] for f in r["filas"]]
    # nunca-visto = lo más podrido, luego 40 días, luego 2 días
    assert orden == ["Dev Sin Drive", "GDC", "Class Bienes Raíces"]
    assert "nota" in r["filas"][0]                    # honesto: dice por qué no hay dato
    assert r["filas"][1]["dias_sin_lista"] >= 39
    assert r["filas"][2]["dias_sin_lista"] <= 3


@pytest.mark.unit
@pytest.mark.asyncio
async def test_pelicula_desarrollo_inexistente_honesto(mock_db):
    m = await metricas_pelicula(mock_db, "dev_fantasma")
    assert m["desarrollo"]["encontrado"] is False
    assert m["velocidad_real_u_mes"] is None
    assert m["unidades_estancadas"] == []
    assert m["frescura"]["ultima_lista"] is None
