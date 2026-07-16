"""Geocodificador OSM: las partes puras se prueban sin tocar la red (founder 07-16)."""
from geocodificar import _partes, _variantes, dentro_de_zmvm, limpiar_direccion


def test_bbox_zmvm():
    assert dentro_de_zmvm(19.43, -99.13)          # Centro CDMX
    assert dentro_de_zmvm(19.40, -99.29)          # Huixquilucan (conurbado)
    assert not dentro_de_zmvm(20.67, -103.35)     # Guadalajara → fuera
    assert not dentro_de_zmvm(0, 0)


def test_partes_descompone_direccion():
    p = _partes("Hortensia 122, Colonia Santa María la Ribera, CP 06400, Cuauhtémoc, "
                "Ciudad de México")
    assert p["calle"] == "Hortensia 122"
    assert "Santa María la Ribera" in p["colonia"]
    assert p["cp"] == "06400" and p["alcaldia"] == "Cuauhtémoc"


def test_partes_alcaldia_sin_acentos():
    p = _partes("Illinois 70, Col. Napoles, Benito Juarez, Ciudad de México")
    assert p["alcaldia"] == "Benito Juárez"       # detecta aun sin acentos
    assert p["colonia"] == "Napoles"


def test_variantes_de_mas_a_menos_especifica():
    v = _variantes("Av. de los Montes 35, Col. Portales Oriente, Benito Juárez, CDMX")
    assert v[0].get("street") == "Av. de los Montes 35"   # 1ª = estructurada por calle
    assert v[0].get("city") == "Ciudad de México"
    assert any("Portales Oriente" in (x.get("q") or "") for x in v)  # fallback colonia
    assert len(v) >= 2


def test_limpiar_agrega_ciudad():
    s = limpiar_direccion("Cordobanes 3, Col. San Jose Insurgentes, Benito Juarez")
    assert "México" in s and "Colonia San Jose" in s
