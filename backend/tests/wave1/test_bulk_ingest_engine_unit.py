"""Wave 1 · Tests bulk_ingest_engine.py · 22 tests unidad sin DB.

Cubre 5 funciones puras críticas (lógica sin Mongo · 100% determinista):
- parse_folder_id (regex Drive URL → folder_id)
- _group_by_project (group files by parent_folder)
- _stub_extraction (fallback structure)
- effective_extracted (apply patches · last-write-wins)
- _validate_patch (validate editable fields)

Funciones async con Mongo (find_dedup_matches · insert_extracted_project · merge_into_dev ·
apply_inline_patch · build_diff · run) → diferidas a integration tests Wave X (necesitan mongomock).

NO toca infra · NO modifica código existente · solo lectura.
"""
import asyncio
import re

import pytest

from bulk_ingest_engine import (
    parse_folder_id,
    _group_by_project,
    _list_folder_recursive,
    _stub_extraction,
    effective_extracted,
    _validate_patch,
    FOLDER_MIME,
    EDITABLE_TOP_LEVEL,
    EDITABLE_PRICE_RANGE,
    EDITABLE_UNIT_KEYS,
)


def _fake_drive_service(tree):
    """svc falso: files().list(q="'FID' in parents ...").execute() → hijos de FID según `tree`."""
    class _Exec:
        def __init__(self, files):
            self._files = files
        def execute(self):
            return {"files": self._files, "nextPageToken": None}

    class _Files:
        def list(self, q=None, **kw):
            m = re.search(r"'([^']+)' in parents", q or "")
            fid = m.group(1) if m else ""
            return _Exec(tree.get(fid, []))

    class _Svc:
        def files(self):
            return _Files()

    return _Svc()


pytestmark = pytest.mark.unit


# ─── 1. parse_folder_id: parse Drive URL → folder ID ─────────────────────────


def test_parse_folder_id_from_full_url():
    """Drive URL con /folders/{id} → extrae el ID."""
    url = "https://drive.google.com/drive/folders/1A2B3C4D5E6F7G8H9I0"
    assert parse_folder_id(url) == "1A2B3C4D5E6F7G8H9I0"


def test_parse_folder_id_from_url_with_query_string():
    """URL con query params (?usp=sharing) sigue extrayendo el ID."""
    url = "https://drive.google.com/drive/folders/abc1234567xyz?usp=sharing"
    assert parse_folder_id(url) == "abc1234567xyz"


def test_parse_folder_id_raw_id_passthrough():
    """Raw folder ID (sin URL) se acepta directamente."""
    raw = "1A2B3C4D5E6F7G8H9"
    assert parse_folder_id(raw) == "1A2B3C4D5E6F7G8H9"


def test_parse_folder_id_empty_returns_none():
    """Empty string · None · short string → None."""
    assert parse_folder_id("") is None
    assert parse_folder_id(None) is None
    assert parse_folder_id("abc") is None  # too short (<10 chars)


def test_parse_folder_id_strips_whitespace():
    """Whitespace en raw ID se trim antes match."""
    assert parse_folder_id("  abcdefghij  ") == "abcdefghij"


# ─── 2. _group_by_project: grupo por parent_folder ───────────────────────────


def test_group_by_project_single_root():
    """Files al root mismo folder → 1 group."""
    files = [
        {"id": "f1", "parent_folder_id": "ROOT", "parent_folder_name": ""},
        {"id": "f2", "parent_folder_id": "ROOT", "parent_folder_name": ""},
    ]
    groups = _group_by_project(files, "ROOT")
    assert len(groups) == 1
    assert "ROOT" in groups
    assert len(groups["ROOT"]["files"]) == 2


def test_group_by_project_multiple_subfolders():
    """Files en subfolders distintos → multiple groups."""
    files = [
        {"id": "f1", "parent_folder_id": "PROJ_A", "parent_folder_name": "Polanco"},
        {"id": "f2", "parent_folder_id": "PROJ_A", "parent_folder_name": "Polanco"},
        {"id": "f3", "parent_folder_id": "PROJ_B", "parent_folder_name": "Roma"},
    ]
    groups = _group_by_project(files, "ROOT")
    assert len(groups) == 2
    assert len(groups["PROJ_A"]["files"]) == 2
    assert len(groups["PROJ_B"]["files"]) == 1
    assert groups["PROJ_A"]["parent_folder_name"] == "Polanco"


def test_group_by_project_empty_returns_empty():
    """Lista vacía de files → grupo vacío."""
    assert _group_by_project([], "ROOT") == {}


def test_group_by_project_default_name_for_root():
    """Files sin parent_folder_name → 'Proyecto principal'."""
    files = [{"id": "f1", "parent_folder_id": "ROOT", "parent_folder_name": ""}]
    groups = _group_by_project(files, "ROOT")
    assert groups["ROOT"]["parent_folder_name"] == "Proyecto principal"


# ─── 3. _stub_extraction: fallback structure ─────────────────────────────────


def test_stub_extraction_has_required_fields():
    """Stub fallback contiene todos los campos requeridos por schema · _stub flag."""
    stub = _stub_extraction("Polanco Norte")
    assert stub["project_name"] == "Polanco Norte"
    assert stub["_stub"] is True
    assert stub["_low_confidence"] is True
    assert stub["address_full"] == ""
    assert stub["total_units"] == 0
    assert stub["units"] == []
    assert stub["amenities"] == []
    assert stub["price_range"] == {"min_mxn": None, "max_mxn": None}
    assert stub["lat"] is None
    assert stub["lng"] is None


# ─── 4. effective_extracted: apply overrides last-write-wins ─────────────────


def test_effective_extracted_no_overrides_returns_base():
    """Sin overrides → retorna copia del extracted base."""
    item = {
        "extracted": {"project_name": "Polanco", "address_full": "Av Reforma 100"},
        "extracted_overrides": [],
    }
    eff = effective_extracted(item)
    assert eff["project_name"] == "Polanco"
    assert eff["address_full"] == "Av Reforma 100"


def test_effective_extracted_single_override_applied():
    """1 override patch → aplicado."""
    item = {
        "extracted": {"project_name": "Polanco V1"},
        "extracted_overrides": [
            {"patch": {"project_name": "Polanco V2"}, "user_id": "u1"},
        ],
    }
    eff = effective_extracted(item)
    assert eff["project_name"] == "Polanco V2"


def test_effective_extracted_multiple_overrides_last_wins():
    """Multiple overrides · último aplicado gana."""
    item = {
        "extracted": {"project_name": "V1"},
        "extracted_overrides": [
            {"patch": {"project_name": "V2"}, "user_id": "u1"},
            {"patch": {"project_name": "V3"}, "user_id": "u2"},
            {"patch": {"project_name": "V4"}, "user_id": "u3"},
        ],
    }
    eff = effective_extracted(item)
    assert eff["project_name"] == "V4"


def test_effective_extracted_price_range_merges_nested():
    """price_range override merge · NO replace completo."""
    item = {
        "extracted": {"price_range": {"min_mxn": 1000000, "max_mxn": 5000000}},
        "extracted_overrides": [
            {"patch": {"price_range": {"min_mxn": 1500000}}, "user_id": "u1"},
        ],
    }
    eff = effective_extracted(item)
    assert eff["price_range"]["min_mxn"] == 1500000
    assert eff["price_range"]["max_mxn"] == 5000000  # preserved


def test_effective_extracted_units_array_replaces():
    """units array override → replace completo (no merge)."""
    item = {
        "extracted": {"units": [{"unit_number": "OLD-1"}]},
        "extracted_overrides": [
            {"patch": {"units": [{"unit_number": "NEW-1"}, {"unit_number": "NEW-2"}]}, "user_id": "u1"},
        ],
    }
    eff = effective_extracted(item)
    assert len(eff["units"]) == 2
    assert eff["units"][0]["unit_number"] == "NEW-1"


# ─── 5. _validate_patch: validate editable fields ────────────────────────────


def test_validate_patch_empty_returns_error():
    """Patch vacío o non-dict → error."""
    assert _validate_patch({}) == "Patch vacío"
    assert _validate_patch(None) == "Patch vacío"


def test_validate_patch_valid_simple_field():
    """Patch con campo editable simple → OK (None)."""
    assert _validate_patch({"project_name": "Nuevo Nombre"}) is None
    assert _validate_patch({"address_full": "Av X 100"}) is None


def test_validate_patch_invalid_top_level_field_rejected():
    """Campo NO editable top-level → error."""
    err = _validate_patch({"_internal_field": "hack"})
    assert err is not None
    assert "no editable" in err


def test_validate_patch_price_range_subfield_validated():
    """price_range debe ser dict con sub-fields editables."""
    assert _validate_patch({"price_range": {"min_mxn": 1000000}}) is None
    assert _validate_patch({"price_range": {"max_mxn": 9000000}}) is None
    # Sub-field no editable
    err = _validate_patch({"price_range": {"hacked_field": 1}})
    assert err is not None
    assert "price_range.hacked_field" in err
    # price_range no es dict
    err2 = _validate_patch({"price_range": "string"})
    assert err2 == "price_range debe ser objeto"


def test_validate_patch_units_must_be_list_of_dicts():
    """units debe ser lista · cada item dict con campos editables."""
    valid = {"units": [{"unit_number": "U1", "bedrooms": 2, "price_mxn": 5000000}]}
    assert _validate_patch(valid) is None

    err1 = _validate_patch({"units": "not-a-list"})
    assert err1 == "units debe ser lista"

    err2 = _validate_patch({"units": ["string-not-dict"]})
    assert err2 == "Cada unit debe ser objeto"

    err3 = _validate_patch({"units": [{"hacked_field": 1}]})
    assert err3 is not None
    assert "no editable" in err3


def test_validate_patch_type_checks_lat_lng_total_units():
    """lat/lng deben ser numéricos · total_units int · amenities list."""
    assert _validate_patch({"lat": 19.4326}) is None
    assert _validate_patch({"lng": -99.1332}) is None
    assert _validate_patch({"lat": None}) is None
    assert _validate_patch({"total_units": 50}) is None
    assert _validate_patch({"amenities": ["pool", "gym"]}) is None

    # Invalid types
    assert "lat debe ser numérico" in _validate_patch({"lat": "string"})
    assert "total_units debe ser entero" in _validate_patch({"total_units": "50"})
    assert "amenities debe ser lista" in _validate_patch({"amenities": "pool,gym"})


def test_validate_patch_string_fields_must_be_string():
    """project_name · address_full deben ser string o None."""
    assert _validate_patch({"project_name": "Polanco"}) is None
    assert _validate_patch({"project_name": None}) is None
    err = _validate_patch({"project_name": 12345})
    assert err is not None
    assert "project_name" in err


# ─── 6. Constants integrity (catch silent regressions) ───────────────────────


def test_editable_constants_intact():
    """EDITABLE_* constants tienen los campos canónicos."""
    assert EDITABLE_TOP_LEVEL == {
        "project_name", "address_full", "lat", "lng",
        "total_units", "amenities",
    }
    assert EDITABLE_PRICE_RANGE == {"min_mxn", "max_mxn"}
    assert EDITABLE_UNIT_KEYS == {
        "unit_number", "type", "bedrooms", "bathrooms", "size_m2", "price_mxn",
    }


# ─── _list_folder_recursive: recorre subcarpetas anidadas a CUALQUIER profundidad ─────

def test_list_folder_recursive_descends_any_depth(monkeypatch):
    """carpeta → sub → sub-sub → sub-sub-sub con 10 PDFs: los 10 se recolectan y se atribuyen
    a la subcarpeta de PRIMER nivel (= el proyecto), no se pierden por estar anidados."""
    tree = {
        "ROOT": [{"id": "Sub", "name": "Torre Aurora", "mimeType": FOLDER_MIME}],
        "Sub": [{"id": "SubSub", "name": "Documentos", "mimeType": FOLDER_MIME}],
        "SubSub": [{"id": "SubSubSub", "name": "Planos", "mimeType": FOLDER_MIME}],
        "SubSubSub": [
            {"id": f"pdf{i}", "name": f"doc{i}.pdf", "mimeType": "application/pdf"}
            for i in range(10)
        ],
    }
    import drive_engine
    monkeypatch.setattr(drive_engine, "_drive_service", lambda conn: _fake_drive_service(tree))
    files = asyncio.run(_list_folder_recursive({}, "ROOT"))
    assert len(files) == 10                                    # llegó al fondo (antes: 0)
    assert all(f["parent_folder_id"] == "Sub" for f in files)  # todo bajo la subcarpeta directa
    assert all(f["parent_folder_name"] == "Torre Aurora" for f in files)
    groups = _group_by_project(files, "ROOT")
    assert len(groups) == 1                                    # = un solo proyecto


def test_list_folder_recursive_two_projects_and_root_file(monkeypatch):
    """dos subcarpetas de primer nivel = dos proyectos; un archivo suelto en la raíz = proyecto raíz."""
    tree = {
        "ROOT": [
            {"id": "A", "name": "Proyecto A", "mimeType": FOLDER_MIME},
            {"id": "B", "name": "Proyecto B", "mimeType": FOLDER_MIME},
            {"id": "rootpdf", "name": "portada.pdf", "mimeType": "application/pdf"},
        ],
        "A": [{"id": "a1", "name": "a1.pdf", "mimeType": "application/pdf"},
              {"id": "Anest", "name": "mas", "mimeType": FOLDER_MIME}],
        "Anest": [{"id": "a2", "name": "a2.pdf", "mimeType": "application/pdf"}],
        "B": [{"id": "b1", "name": "b1.pdf", "mimeType": "application/pdf"}],
    }
    import drive_engine
    monkeypatch.setattr(drive_engine, "_drive_service", lambda conn: _fake_drive_service(tree))
    files = asyncio.run(_list_folder_recursive({}, "ROOT"))
    groups = _group_by_project(files, "ROOT")
    assert len(groups) == 3                       # A (con su anidado), B, y la raíz
    a_files = [f for f in files if f["parent_folder_id"] == "A"]
    assert {f["id"] for f in a_files} == {"a1", "a2"}   # el anidado a2 quedó bajo A


# ─── _parse_llm_json: parseo tolerante del JSON del LLM (fences/comas/truncado) ──

def test_parse_llm_json_plain():
    from bulk_ingest_engine import _parse_llm_json
    assert _parse_llm_json('{"a": 1, "units": [{"x": 2}]}')["a"] == 1


def test_parse_llm_json_code_fences():
    from bulk_ingest_engine import _parse_llm_json
    assert _parse_llm_json('```json\n{"a": 2}\n```')["a"] == 2


def test_parse_llm_json_trailing_commas():
    from bulk_ingest_engine import _parse_llm_json
    assert _parse_llm_json('{"a": 3, "b": [1, 2,],}')["b"] == [1, 2]


def test_parse_llm_json_truncated_mid_string_rescues_complete_units():
    """max_tokens agotado -> JSON cortado a mitad de una unidad: rescata las unidades completas."""
    from bulk_ingest_engine import _parse_llm_json
    trunc = '{"project_name": "X", "total_units": 50, "units": [{"n": "1"}, {"n": "2"}, {"n": "3'
    r = _parse_llm_json(trunc)
    assert r["project_name"] == "X"
    assert len(r["units"]) == 2


def test_parse_llm_json_no_object_raises():
    from bulk_ingest_engine import _parse_llm_json
    with pytest.raises(Exception):
        _parse_llm_json("no hay json aqui")


# ─── detección de carpeta-proyecto vs contenedor (devs con estructura distinta) ──

def test_folder_container_pure_status_is_container():
    from bulk_ingest_engine import _folder_is_container
    assert _folder_is_container("ENTREGA INMEDIATA") is True
    assert _folder_is_container("PREVENTA") is True
    assert _folder_is_container("Fichas") is True
    assert _folder_is_container("Desarrollos Vendidos") is True


def test_folder_project_with_name_is_not_container():
    from bulk_ingest_engine import _folder_is_container
    assert _folder_is_container("Cervantes 101 - ENTREGA INMEDIATA") is False
    assert _folder_is_container("SLP96 (VENDIDO)") is False
    assert _folder_is_container("Amsterdam 257") is False


def test_folder_skip_material_and_cv():
    from bulk_ingest_engine import _folder_is_skip
    assert _folder_is_skip("MATERIALES SIN MARCA") is True
    assert _folder_is_skip("historico de inflacion") is True
    assert _folder_is_skip("Comisiones base") is True
    assert _folder_is_skip("Cervantes 101") is False
