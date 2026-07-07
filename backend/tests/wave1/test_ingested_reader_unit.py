"""Cobertura de ingested_reader: normalización de unidades ingeridas → vocabulario canónico (auditoría 07-07)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from ingested_reader import normalize_unit, dev_doc_to_card, apply_unit_aggregates, _parking_int


def test_normalize_legacy_unit_to_canonical():
    u = {"price_mxn": 5100000, "size_m2": 60, "size_m2_total": 72,
         "storage": "Bodega 12 m2", "parking": "2 cajones", "status": "available", "type": "depto"}
    n = normalize_unit(u)
    assert n["price"] == 5100000
    assert n["price_display"] == "$5,100,000"
    assert n["m2_privative"] == 60
    assert n["m2_total"] == 72
    assert n["parking_spots"] == 2
    assert n["bodega"] is True
    assert n["status"] == "disponible"      # inglés → español
    assert n["prototype"] == "depto"


def test_normalize_prefers_canonical_when_present():
    u = {"price": 100, "price_mxn": 999, "m2_total": 50, "size_m2_total": 999,
         "parking_spots": 3, "bodega": False, "storage": "x", "status": "vendido"}
    n = normalize_unit(u)
    assert n["price"] == 100          # price canónico gana sobre price_mxn
    assert n["m2_total"] == 50
    assert n["parking_spots"] == 3
    assert n["bodega"] is False       # bodega explícito gana sobre storage
    assert n["status"] == "vendido"


def test_status_defaults_to_disponible_when_unknown():
    assert normalize_unit({"status": None})["status"] == "disponible"
    assert normalize_unit({})["status"] == "disponible"
    assert normalize_unit({"status": "apartado"})["status"] == "reservado"


def test_parking_int_parses_strings():
    assert _parking_int({"parking_spots": 2}) == 2
    assert _parking_int({"parking": "2 cajones"}) == 2
    assert _parking_int({"parking": "incluido"}) == 1   # texto sin número → 1
    assert _parking_int({"parking": None}) == 0
    assert _parking_int({}) == 0


def test_dev_doc_to_card_shape():
    d = {"id": "dev_x", "name": "Proyecto X", "colonia_id": "roma-norte-cuauhtemoc",
         "price_min_mxn": 3000000, "price_max_mxn": 6000000, "total_units": 40,
         "lat": 19.4, "lng": -99.16, "amenities": ["gym"]}
    c = dev_doc_to_card(d)
    assert c["id"] == "dev_x"
    assert c["price_from"] == 3000000 and c["price_to"] == 6000000
    assert c["source"] == "ingesta" and c["verified"] is False
    assert c["center"] == {"lat": 19.4, "lng": -99.16}
    # claves que tocan los filtros del listado deben existir (nunca KeyError)
    for k in ("colonia_id", "stage", "featured", "units", "property_type", "bedrooms_range"):
        assert k in c


def test_dev_doc_to_card_no_id_returns_none():
    assert dev_doc_to_card({"name": "sin id"}) is None


def test_apply_unit_aggregates_recomputes_from_units():
    card = dev_doc_to_card({"id": "d1", "name": "n"})
    units = [
        {"price": 1000, "bedrooms": 1, "bathrooms": 1, "parking_spots": 1, "m2_total": 50, "status": "disponible"},
        {"price": 3000, "bedrooms": 3, "bathrooms": 2, "parking_spots": 2, "m2_total": 90, "status": "vendido"},
    ]
    apply_unit_aggregates(card, units)
    assert card["price_from"] == 1000 and card["price_to"] == 3000
    assert card["units_total"] == 2
    assert card["units_available"] == 1 and card["units_sold"] == 1
    assert card["bedrooms_range"] == [1, 3]
    assert card["m2_range"] == [50, 90]
