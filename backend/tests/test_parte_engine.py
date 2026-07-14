"""EL PARTE — cadencias y líneas de movimiento son puras: datos → reporte con emojis."""
from datetime import datetime
from parte_engine import cadencias_de_hoy, linea_movimiento, CADENCIAS, _specs


def test_cadencias_de_hoy():
    # lunes 1 de enero: TODAS las cadencias tocan
    todas = cadencias_de_hoy(datetime(2029, 1, 1))   # lunes
    assert set(todas) == {"diario", "semanal", "quincenal", "mensual", "trimestral", "semestral", "anual"}
    # martes 16: diario + quincenal
    assert set(cadencias_de_hoy(datetime(2026, 6, 16))) == {"diario", "quincenal"}
    # miércoles 15: solo diario
    assert cadencias_de_hoy(datetime(2026, 7, 15)) == ["diario"]
    # 1 de julio (miércoles): mensual + semestral, sin anual
    d = set(cadencias_de_hoy(datetime(2026, 7, 1)))
    assert {"diario", "quincenal", "mensual", "trimestral", "semestral"} <= d and "anual" not in d


def test_linea_vendida_con_specs_y_precio():
    r = {"tipo": "salida", "tipo_salida": "vendida", "unit_id": "dev1__105",
         "recamaras": 2, "banos": 2, "estacionamientos": 2, "m2": 84,
         "precio": 4_850_000, "dev_id": "Almina"}
    l = linea_movimiento(r)
    assert l.startswith("🔴 Vendida: 105")
    assert "2R·2B·2E · 84m²" in l and "$4.85M" in l and "Almina" in l


def test_linea_cambio_precio_con_delta():
    r = {"tipo": "cambio", "campo": "precio", "unit_id": "d__402",
         "antes": 4_650_000, "despues": 4_850_000, "dev_id": "Torre Alba"}
    l = linea_movimiento(r)
    assert "402" in l and "$4.65M → $4.85M" in l and "+4.3%" in l and l.startswith("💰")
    # baja de precio → otro emoji
    r2 = {**r, "antes": 4_850_000, "despues": 4_650_000}
    assert linea_movimiento(r2).startswith("📉") and "-4.1%" in linea_movimiento(r2)


def test_linea_alta_nueva():
    r = {"tipo": "alta", "unit_id": "d__PH1", "recamaras": 3, "m2": 210,
         "precio": 12_000_000, "dev_id": "Reforma 2"}
    l = linea_movimiento(r)
    assert l.startswith("🆕 Nueva: PH1") and "$12.00M" in l


def test_registro_de_cadencias_completo():
    """Las 7 cadencias que pidió el founder existen y toda sección referida existe."""
    from parte_engine import _SECCIONES
    assert set(CADENCIAS) == {"diario", "semanal", "quincenal", "mensual",
                              "trimestral", "semestral", "anual"}
    for cfg in CADENCIAS.values():
        for sec in cfg["secciones"]:
            assert sec in _SECCIONES, f"sección '{sec}' sin implementación"
