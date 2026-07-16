"""Masivo GDC: nombre/dirección del folder, estatus de la carpeta padre, filtro CDMX."""
from masivo_gdc import (es_cdmx_residencial, estatus_de_carpeta, nombre_y_direccion)
from masivo_gdc_run import es_oficina, tiene_disponible


def test_es_oficina_por_contenido_no_por_nombre():
    # Medellín 219: sin columna de recámaras + unidades 'Oficina' → oficina (WorkLab)
    medellin = {"campos_detectados": ["unit_number", "m2_total", "parking_spots"],
                "unidades": [{"unit_number": "Oficina 103"}, {"unit_number": "Depto 101"}]}
    assert es_oficina(medellin) is True
    # Vía Insurgentes: lofts (sin recámaras) PERO sin etiqueta oficina → residencial
    lofts = {"campos_detectados": ["unit_number", "m2_total"],
             "unidades": [{"unit_number": "201"}, {"unit_number": "202"}]}
    assert es_oficina(lofts) is False
    # residencial normal: trae columna de recámaras
    resi = {"campos_detectados": ["unit_number", "bedrooms", "m2_total"],
            "unidades": [{"unit_number": "101"}]}
    assert es_oficina(resi) is False


def test_tiene_disponible():
    assert tiene_disponible([{"status": "vendido"}, {"status": "disponible"}]) is True
    assert tiene_disponible([{"status": "vendido"}, {"status": "reservado"}]) is False
    assert tiene_disponible([{"price_mxn": 5_000_000, "status": "disponible"}]) is True


def test_nombre_y_direccion_del_folder():
    assert nombre_y_direccion("CASA CONDESA (Vasconcelos 107)") == ("Casa Condesa", "Vasconcelos 107")
    assert nombre_y_direccion("ÚNICO DEL VALLE (Gabriel Mancera 1134)") == ("Único Del Valle", "Gabriel Mancera 1134")
    assert nombre_y_direccion("LLANURA") == ("Llanura", None)   # sin paréntesis


def test_estatus_de_la_carpeta_padre():
    assert estatus_de_carpeta("PREVENTA") == "preventa"
    assert estatus_de_carpeta("ENTREGA INMEDIATA") == "entrega inmediata"
    assert estatus_de_carpeta("VENDIDO") == "vendido"
    assert estatus_de_carpeta("MATERIAL INFORMATIVO") is None


def test_filtro_cdmx_residencial():
    # dentro: CDMX + residencial
    assert es_cdmx_residencial("Casa Condesa", "Vasconcelos 107") is True
    assert es_cdmx_residencial("Icon Beyond", "Blvd. Adolfo López Mateos 1977") is True
    # dentro: 'Monterrey' y 'Medellín' son CALLES de la Roma (CDMX), no ciudades
    assert es_cdmx_residencial("Casa Roma 240", "Monterrey 240") is True
    assert es_cdmx_residencial("Vía Roma 386", "Monterrey 386") is True
    assert es_cdmx_residencial("Casa Roma 269", "Medellín 269") is True
    # fuera: ciudad real
    assert es_cdmx_residencial("Casa Juárez", "Tijuana") is False
    assert es_cdmx_residencial("Casa del Faro", "Puerto Escondido") is False
    # fuera: oficinas (WorkLab cae por su nombre aunque diga Monterrey)
    assert es_cdmx_residencial("Work Lab Monterrey", "Monterrey 243") is False
    assert es_cdmx_residencial("Work Lab Condesa", "Insurgentes Sur 427") is False
