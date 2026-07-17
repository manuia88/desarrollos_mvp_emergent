"""Leads del superadmin + pedidos a devs (auditoría 07-17) — visibilidad total.

Regla: los 53 leads huérfanos (seeds borrados el 07-14) se MARCAN, jamás se esconden;
las solicitudes a CLASS/GDC salen de Mongo al frente en lenguaje humano."""
import pytest

from routes.superadmin_leads import (fila_lead, fila_solicitud, leads_todos,
                                     solicitudes_devs)


# ─── fila_lead (pura) ───────────────────────────────────────────────────────

def test_fila_lead_proyecto_vivo():
    f = fila_lead({"id": "l1", "name": "Ana", "development_id": "d1", "status": "nuevo",
                   "channel": "inhouse", "created_at": "2026-06-01T10:00:00", "budget_mxn": 5e6},
                  {"d1": "Almina San Ángel"}, {}, {})
    assert f["proyecto"] == "Almina San Ángel" and f["proyecto_borrado"] is False
    assert f["fecha"] == "2026-06-01" and f["fuente"] == "inhouse"


def test_fila_lead_huerfano_conserva_id_y_marca():
    """El proyecto seed ya no existe → proyecto_borrado=True y el id se CONSERVA."""
    f = fila_lead({"id": "l2", "development_id": "altavista-polanco", "status": "cita",
                   "proyecto_borrado": True, "nota": "seed demo borrado 2026-07-14"},
                  {}, {}, {})
    assert f["proyecto_borrado"] is True
    assert f["development_id"] == "altavista-polanco"
    assert f["nota"] == "seed demo borrado 2026-07-14"


def test_fila_lead_huerfano_se_detecta_sin_flag():
    """Aunque Mongo no traiga el flag, id sin proyecto vivo = huérfano (defensa doble)."""
    f = fila_lead({"id": "l3", "project_id": "borrado-x"}, {}, {}, {})
    assert f["proyecto_borrado"] is True and f["proyecto"] == "borrado-x"


def test_fila_lead_universo_contact_source():
    """Los leads reales (marketplace/asesor) traen contact/source/assigned_to, no channel."""
    f = fila_lead({"id": "l4", "source": "caya_bubble", "assigned_to": "u1",
                   "contact": {"name": "Test Audit", "phone": "5512345678", "email": None},
                   "inmobiliaria_id": "dmx_root"},
                  {}, {"u1": "Ana Gutiérrez"}, {"dmx_root": "Livoo Bienes Raíces"})
    assert f["nombre"] == "Test Audit" and f["telefono"] == "5512345678"
    assert f["asesor"] == "Ana Gutiérrez" and f["inmobiliaria"] == "Livoo Bienes Raíces"
    assert f["fuente"] == "caya_bubble"
    assert f["proyecto_borrado"] is False       # sin proyecto NO es huérfano


# ─── fila_solicitud (pura) ──────────────────────────────────────────────────

def test_fila_solicitud_extrae_proyecto_del_detalle():
    f = fila_solicitud({"tipo": "lista_precios_illinois", "estado": "pendiente",
                        "ts": "2026-07-17",
                        "detalle": "Illinois 70: la carpeta no trae lista de precios; "
                                   "el brochure menciona 14 deptos (5 disponibles)."},
                       "CLASS")
    assert f["desarrollador"] == "CLASS" and f["proyecto"] == "Illinois 70"
    assert f["que_falta"] == "Lista de precios"
    assert f["por_que"].startswith("la carpeta no trae")
    assert f["fecha"] == "2026-07-17" and f["estado"] == "pendiente"


def test_fila_solicitud_lista_de_proyectos():
    f = fila_solicitud({"tipo": "planos_por_tipo", "n": 26,
                        "proyectos": ["Casa Colon", "Casa Condesa", "Icon Beyond"],
                        "ts": "2026-07-16T16:41:39+00:00"}, "GDC")
    assert f["proyecto"] == "3 proyectos"
    assert f["que_falta"] == "Planos por tipo de depto"
    assert "Casa Colon" in f["por_que"]
    assert f["estado"] == "pendiente"           # default si el doc no lo trae


def test_fila_solicitud_sin_dos_puntos_no_rompe_detalle():
    """Un detalle sin 'Proyecto:' al inicio se queda entero como porqué."""
    f = fila_solicitud({"tipo": "columna_banos_listas",
                        "detalle": "Varias listas GDC no traen columna de BAÑOS"}, "GDC")
    assert f["proyecto"] == "—"
    assert f["por_que"] == "Varias listas GDC no traen columna de BAÑOS"


# ─── endpoints (mongomock) ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_leads_todos_totales_y_huerfanos(mock_db):
    await mock_db.developments.insert_one({"id": "d1", "name": "Almina"})
    await mock_db.users.insert_one({"user_id": "u1", "name": "Ana"})
    await mock_db.leads.insert_one({"id": "l1", "development_id": "d1", "status": "nuevo",
                                    "created_at": "2026-07-01"})
    await mock_db.leads.insert_one({"id": "l2", "development_id": "seed-borrado",
                                    "status": "nuevo", "proyecto_borrado": True,
                                    "nota": "seed demo borrado 2026-07-14",
                                    "created_at": "2026-06-01"})
    await mock_db.leads.insert_one({"id": "l3", "development_id": "d1", "status": "cita",
                                    "assigned_to": "u1", "created_at": "2026-07-10"})
    r = await leads_todos(mock_db)
    assert r["n"] == 3 and r["n_proyecto_borrado"] == 1
    assert r["totales"]["por_status"] == {"nuevo": 2, "cita": 1}
    assert r["totales"]["por_proyecto"]["Almina"] == 2
    assert r["totales"]["por_proyecto"]["seed-borrado"] == 1     # el huérfano NO desaparece
    assert r["leads"][0]["fecha"] == "2026-07-10"                # orden: más nuevo primero
    l3 = next(f for f in r["leads"] if f["id"] == "l3")
    assert l3["asesor"] == "Ana"


@pytest.mark.asyncio
async def test_solicitudes_devs_unificadas(mock_db):
    await mock_db.solicitudes_gdc.insert_one({"tipo": "planos_por_tipo", "estado": "pendiente",
                                              "proyectos": ["Casa Colon"], "ts": "2026-07-16"})
    await mock_db.solicitudes_class.insert_one({"tipo": "lista_precios_illinois",
                                                "estado": "pendiente", "ts": "2026-07-17",
                                                "detalle": "Illinois 70: falta la lista."})
    r = await solicitudes_devs(mock_db)
    assert r["n"] == 2 and r["pendientes"] == 2
    assert r["solicitudes"][0]["desarrollador"] == "CLASS"       # más reciente primero
    assert {s["desarrollador"] for s in r["solicitudes"]} == {"CLASS", "GDC"}


@pytest.mark.asyncio
async def test_leads_todos_db_vacia_no_truena(mock_db):
    r = await leads_todos(mock_db)
    assert r == {"leads": [], "n": 0, "n_proyecto_borrado": 0,
                 "totales": {"por_status": {}, "por_proyecto": {}}}
    r2 = await solicitudes_devs(mock_db)
    assert r2 == {"solicitudes": [], "n": 0, "pendientes": 0}
