"""Expediente de conducta por desarrollador — TODO derivado de datos reales.

Regla dura: donde no hay evidencia el campo dice 'sin evidencia aún' (nunca se inventa
conducta), y el resumen automático va a patron_notas_auto SIN pisar patron_notas."""
import pytest

from dev_expediente import (SIN_EVIDENCIA, cadencia_de, es_plano, expediente,
                            resumen_corto, senal_de_venta)


# ─── lógica pura ────────────────────────────────────────────────────────────

def test_cadencia_promedio_y_ultima():
    c = cadencia_de(["2026-07-01T10:00:00", "2026-07-08T09:00:00",
                     "2026-07-08T11:00:00", "2026-07-15T08:00:00"])
    assert c["frecuencia_dias"] == 7.0                 # 3 días distintos, brechas 7 y 7
    assert c["ultima"] == "2026-07-15" and c["n_actualizaciones"] == 3


def test_cadencia_con_un_solo_dia_no_afirma_frecuencia():
    c = cadencia_de(["2026-07-17T00:25:24"])
    assert c["frecuencia_dias"] == SIN_EVIDENCIA
    assert c["ultima"] == "2026-07-17"
    assert cadencia_de([])["ultima"] == SIN_EVIDENCIA


def test_es_plano_reconoce_los_naming_reales():
    assert es_plano("PLANO COTAS TIPO 4 ALTO 124.64 m2 (E).pdf")
    assert es_plano("ARQ_NIVEL 2-207.pdf")
    assert es_plano("sotano 2.pdf")
    assert es_plano("A-1503.pdf", carpeta="PLANOS TORRE A")
    assert not es_plano("ALMINA (18).jpeg", carpeta="302")       # render NO es plano
    assert not es_plano("VP_Lista_de_Precios- Avalia Torre A SF.pdf")


def test_senal_de_venta_solo_con_evidencia():
    assert senal_de_venta(0, 0, 0) == SIN_EVIDENCIA
    assert senal_de_venta(5, 0, 0) == SIN_EVIDENCIA    # planos borrados sin ventas ≠ señal
    s = senal_de_venta(5, 12, 4)
    assert "retira planos al vender" in s and "quita renglones de la lista" in s


def test_resumen_corto_es_una_linea_acotada():
    exp = {"convenciones": {"m2": SIN_EVIDENCIA},
           "cadencia_listas": {"frecuencia_dias": 7.0, "ultima": "2026-07-15"},
           "peleas_generadas": {"total": 3},
           "solicitudes": {"abiertas": 2, "edad_max": 16},
           "senal_de_venta": "retira planos al vender (5 planos borrados del Drive · 12 unidades vendidas)"}
    r = resumen_corto(exp)
    assert r.startswith("[auto ") and len(r) <= 600
    assert "listas cada ~7.0 días" in r and "la más vieja lleva 16 días" in r
    assert "retira planos al vender" in r


# ─── contra Mongo (mongomock) ───────────────────────────────────────────────

async def _siembra(db):
    await db.vigia_manifiesto.insert_one(
        {"dev_carpeta": "DESARROLLOS-CLASS", "dev_org_id": "org_class_x",
         "patron_notas": "NOTA DEL FOUNDER — intocable"})
    await db.developments.insert_one(
        {"id": "d1", "name": "Almina", "developer_id": "org_class_x",
         "esquema_pago_nota": "10% enganche / 90% contra entrega"})
    # 3 unidades con exteriores donde total = privativos (convención Almina) + ventas
    for i, (hab, tot) in enumerate([(80.0, 80.0), (90.0, 90.0), (100.0, 100.0)]):
        await db.units.insert_one({"development_id": "d1", "unit_number": f"A-{i}01",
                                   "m2_privative": hab, "m2_total": tot,
                                   "m2_balcony": 5.0, "status": "disponible"})
    await db.units.insert_one({"development_id": "d1", "unit_number": "A-501",
                               "status": "vendido"})
    await db.units.insert_one({"development_id": "d1", "unit_number": "A-502",
                               "status": "disponible", "created_at": "2026-07-15",
                               "inventario_pelea": "lista no la ofrece; maestro sí"})
    # listas en 3 días distintos → cadencia 7 días; y un plano borrado
    for ts in ("2026-07-01T10:00:00", "2026-07-08T10:00:00", "2026-07-15T10:00:00"):
        await db.vigia_eventos.insert_one({"dev": "DESARROLLOS-CLASS",
                                           "tipo": "lista_cambiada", "ts": ts})
    await db.vigia_eventos.insert_one(
        {"dev": "DESARROLLOS-CLASS", "tipo": "archivo_eliminado",
         "ts": "2026-07-10T10:00:00",
         "archivo": {"nombre": "ARQ_NIVEL 2-207.pdf", "carpeta": "PLANOS"}})
    await db.vigia_eventos.insert_one(
        {"dev": "DESARROLLOS-CLASS", "tipo": "archivo_eliminado",
         "ts": "2026-07-10T10:00:00",
         "archivo": {"nombre": "ALMINA (18).jpeg", "carpeta": "302"}})   # render: no cuenta
    await db.solicitudes_class.insert_one({"tipo": "laminas_faltantes",
                                           "estado": "pendiente", "ts": "2026-06-25",
                                           "detalle": "Almina: faltan láminas."})


@pytest.mark.asyncio
async def test_expediente_completo_aprende_de_los_datos(mock_db):
    await _siembra(mock_db)
    exp = await expediente(mock_db, "DESARROLLOS-CLASS")
    assert exp["encontrado"] and exp["org_id"] == "org_class_x"
    assert exp["proyectos"] == 1 and exp["unidades"] == 5
    # convenciones aprendidas (no asumidas)
    assert exp["convenciones"]["m2"].startswith("total_igual_privativos")
    assert exp["convenciones"]["esquema_pago"] == ["Almina: 10% enganche / 90% contra entrega"]
    assert exp["convenciones"]["vocabulario_status"] == {"disponible": 4, "vendido": 1}
    # cadencia de listas: 3 días distintos con brecha de 7
    assert exp["cadencia_listas"]["frecuencia_dias"] == 7.0
    assert exp["cadencia_listas"]["ultima"] == "2026-07-15"
    # peleas suyas (inventario_pelea + solicitud CLASS)
    assert exp["peleas_generadas"]["por_tipo"] == {"inventario_pelea": 1, "solicitud": 1}
    # solicitudes sin responder con su edad
    assert exp["solicitudes"]["abiertas"] == 1
    assert exp["solicitudes"]["edad_max"] is not None and exp["solicitudes"]["edad_max"] > 10
    # señal de venta: plano borrado + unidad vendida + renglón quitado (el render NO cuenta)
    assert "retira planos al vender (1 plano borrado" in exp["senal_de_venta"]
    assert "quita renglones de la lista" in exp["senal_de_venta"]


@pytest.mark.asyncio
async def test_expediente_guarda_resumen_sin_pisar_al_founder(mock_db):
    await _siembra(mock_db)
    exp = await expediente(mock_db, "org_class_x")           # también resuelve por org_id
    m = await mock_db.vigia_manifiesto.find_one({"dev_carpeta": "DESARROLLOS-CLASS"})
    assert m["patron_notas"] == "NOTA DEL FOUNDER — intocable"     # NI UN BYTE se toca
    assert m["patron_notas_auto"] == exp["resumen"]
    assert m["patron_notas_auto"].startswith("[auto ")
    assert "patron_notas_auto_ts" in m


@pytest.mark.asyncio
async def test_expediente_alias_parcial_e_insensible(mock_db):
    await _siembra(mock_db)
    exp = await expediente(mock_db, "class")                 # alias por carpeta
    assert exp["encontrado"] and exp["dev"] == "DESARROLLOS-CLASS"
    # alias por org: la carpeta de GDC se llama 'CLIENTES EXTERNOS' (no trae 'gdc')
    await mock_db.vigia_manifiesto.insert_one(
        {"dev_carpeta": "CLIENTES EXTERNOS", "dev_org_id": "org_gdc"})
    exp2 = await expediente(mock_db, "gdc")
    assert exp2["encontrado"] and exp2["org_id"] == "org_gdc"


@pytest.mark.asyncio
async def test_expediente_sin_datos_dice_sin_evidencia(mock_db):
    """Dev con manifiesto pero sin unidades/eventos: NADA se inventa."""
    await mock_db.vigia_manifiesto.insert_one(
        {"dev_carpeta": "CLIENTES EXTERNOS", "dev_org_id": "org_gdc"})
    exp = await expediente(mock_db, "org_gdc")
    assert exp["encontrado"]
    assert exp["convenciones"]["m2"] == SIN_EVIDENCIA
    assert exp["convenciones"]["esquema_pago"] == SIN_EVIDENCIA
    assert exp["convenciones"]["vocabulario_status"] == SIN_EVIDENCIA
    assert exp["cadencia_listas"]["frecuencia_dias"] == SIN_EVIDENCIA
    assert exp["senal_de_venta"] == SIN_EVIDENCIA
    assert exp["peleas_generadas"] == {"total": 0, "por_tipo": {}}
    assert exp["solicitudes"] == {"abiertas": 0, "edad_max": None}


@pytest.mark.asyncio
async def test_expediente_desconocido_no_encontrado(mock_db):
    exp = await expediente(mock_db, "quien-sabe")
    assert exp["encontrado"] is False
