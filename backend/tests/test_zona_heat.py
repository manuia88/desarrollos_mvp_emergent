"""Calor de zonas: nombre bonito + orden por oferta/demanda/absorción (founder 07-17)."""
from zona_heat import _nombre_zona


def test_nombre_zona_bonito():
    assert _nombre_zona("del-valle") == "Del Valle"
    assert _nombre_zona("roma") == "Roma"
    assert _nombre_zona("san-rafael") == "San Rafael"
    assert _nombre_zona("lomas-de-los-angeles-tetelpan") == "Lomas de los Angeles Tetelpan"
