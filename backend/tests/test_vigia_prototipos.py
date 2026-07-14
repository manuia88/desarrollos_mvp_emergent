"""El Vigía (diff de fotos) + Prototipos v2 (cluster por medidas) — lógica pura, sin Drive ni IA."""
import asyncio

import vigia_engine as VE
import prototype_engine as PE


def _run(coro):
    return asyncio.run(coro)


# ═══ VIGÍA · diff_fotos ════════════════════════════════════════════════════
def _foto(devs):
    return {"fuente_id": "vf_x", "ts": "2026-07-14T00:00:00Z", "devs": devs}


def _archivo(fid, nombre, huella, proyecto="Torre A", es_lista=True):
    return {"id": fid, "nombre": nombre, "proyecto": proyecto, "carpeta": "", "mime":
            "application/vnd.google-apps.spreadsheet", "huella": huella,
            "modificado": "2026-07-14T02:14:00Z", "es_lista": es_lista}


def test_dev_nuevo_es_un_solo_evento():
    """Un dev recién conectado NO debe generar un evento por cada archivo (línea base)."""
    nueva = _foto({"Quiero Casa": {"folder_id": "f1", "ok": True, "proyectos": ["Torre A"],
                                   "archivos": [_archivo("a1", "lista.xlsx", "h1"),
                                                _archivo("a2", "precios.pdf", "h2")]}})
    evs = VE.diff_fotos(None, nueva)
    assert len(evs) == 1 and evs[0]["tipo"] == "dev_nuevo"
    assert evs[0]["detalle"]["n_archivos"] == 2


def test_lista_cambiada_por_huella_no_por_fecha():
    prev = _foto({"QC": {"folder_id": "f1", "ok": True, "proyectos": ["Torre A"],
                         "archivos": [_archivo("a1", "lista precios.xlsx", "md5_viejo")]}})
    nueva = _foto({"QC": {"folder_id": "f1", "ok": True, "proyectos": ["Torre A"],
                          "archivos": [_archivo("a1", "lista precios.xlsx", "md5_nuevo")]}})
    evs = VE.diff_fotos(prev, nueva)
    assert len(evs) == 1
    assert evs[0]["tipo"] == "lista_cambiada"
    assert evs[0]["antes"]["huella"] == "md5_viejo"      # linaje: se guarda el antes
    # misma huella = ningún evento (lo abrieron pero no cambió)
    assert VE.diff_fotos(nueva, nueva) == []


def test_proyecto_nuevo_y_acceso_roto():
    prev = _foto({"QC": {"folder_id": "f1", "ok": True, "proyectos": ["Torre A"], "archivos": []},
                  "Deca": {"folder_id": "f2", "ok": True, "proyectos": [], "archivos": []}})
    nueva = _foto({"QC": {"folder_id": "f1", "ok": True,
                          "proyectos": ["Torre A", "Reforma 2"], "archivos": []},
                   "Deca": {"folder_id": "f2", "ok": False, "proyectos": [], "archivos": []}})
    tipos = sorted(e["tipo"] for e in VE.diff_fotos(prev, nueva))
    assert tipos == ["acceso_roto", "proyecto_nuevo"]
    # dev que desaparece de la foto también es acceso_roto
    evs = VE.diff_fotos(prev, _foto({"QC": prev["devs"]["QC"]}))
    assert [e["tipo"] for e in evs] == ["acceso_roto"] and evs[0]["dev"] == "Deca"


def test_archivo_no_lista_solo_linaje():
    """Un brochure nuevo genera evento (linaje) pero NO es accionable (no llena la bandeja)."""
    prev = _foto({"QC": {"folder_id": "f1", "ok": True, "proyectos": ["Torre A"], "archivos": []}})
    nueva = _foto({"QC": {"folder_id": "f1", "ok": True, "proyectos": ["Torre A"],
                          "archivos": [_archivo("b1", "brochure.pdf", "h9", es_lista=False)]}})
    evs = VE.diff_fotos(prev, nueva)
    assert evs[0]["tipo"] == "archivo_nuevo"
    assert evs[0]["tipo"] not in VE.TIPOS_ACCIONABLES


def test_es_lista_detecta_nombres_reales():
    assert VE._es_lista("LISTA DE PRECIOS JULIO.xlsx", "application/vnd.ms-excel")
    assert VE._es_lista("disponibilidad torre alba", "application/pdf")
    assert not VE._es_lista("brochure torre alba", "application/pdf")
    assert not VE._es_lista("lista de precios", "image/png")      # imagen no es lista


# ═══ PROTOTIPOS v2 · clusterizar ═══════════════════════════════════════════
def _u(uid, rec=2, ban=2.0, m2=84.0, park=1, proto="", precio=4_500_000, num=""):
    return {"id": uid, "bedrooms": rec, "bathrooms": ban, "size_m2": m2,
            "parking_spots": park, "prototype": proto, "price_mxn": precio,
            "unit_number": num, "type": "depto"}


def test_cluster_agrupa_por_medidas_y_separa_por_m2():
    units = [_u("u1", m2=84, num="101"), _u("u2", m2=85, num="201"),      # mismos ±3%
             _u("u3", m2=120, num="102"),                                  # otro molde
             _u("u4", rec=3, m2=84)]                                       # 3 rec ≠ 2 rec
    res = PE.clusterizar(units)
    assert len(res["clusters"]) == 3 and res["cuarentena"] == []
    grande = next(c for c in res["clusters"] if c["n"] == 2)
    assert grande["confianza"] == "alta" and grande["recamaras"] == 2
    assert "84" in grande["nombre_auto"] or "85" in grande["nombre_auto"]
    assert grande["precio_desde"] == 4_500_000


def test_singleton_ph_y_cuarentena():
    units = [_u("ph", rec=3, m2=210, proto="PH Norte"),
             {"id": "x1", "bedrooms": None, "size_m2": None, "prototype": ""}]  # sin datos
    res = PE.clusterizar(units)
    ph = res["clusters"][0]
    assert ph["es_ph"] and ph["confianza"] == "media" and ph["nombre_auto"].startswith("PH")
    assert res["cuarentena"] == ["x1"]


def test_sin_medidas_pero_con_etiqueta_ia():
    units = [{"id": "a", "bedrooms": None, "size_m2": None, "prototype": "Tipo A"},
             {"id": "b", "bedrooms": None, "size_m2": None, "prototype": "tipo a"}]
    res = PE.clusterizar(units)
    assert len(res["clusters"]) == 1 and res["clusters"][0]["n"] == 2
    assert res["clusters"][0]["senales"]["origen"] == "etiqueta_ia"


def test_norm_proto_texto():
    assert PE.norm_proto_texto("1") == "01" == PE.norm_proto_texto("01")
    assert PE.norm_proto_texto("Tipo A") == "A" == PE.norm_proto_texto("tipo a")
    assert PE.norm_proto_texto("Modelo Luna") == "LUNA"
    assert PE.norm_proto_texto(None) == ""


# ═══ materializar: escribe el contrato del marketplace ══════════════════════
class _Coll:
    def __init__(self, rows=None):
        self.rows = list(rows or [])
        self.inserted, self.updates = [], []

    def find(self, q=None, proj=None):
        class _Cur:
            def __init__(s, rows): s.rows = rows
            async def to_list(s, n): return s.rows[:n]
        return _Cur(self.rows)

    async def find_one(self, q=None, proj=None):
        return self.rows[0] if self.rows else None

    async def delete_many(self, q): pass

    async def insert_one(self, doc): self.inserted.append(doc)

    async def update_many(self, q, u):
        self.updates.append((q, u))
        class _R: modified_count = len((q.get("id") or {}).get("$in", []))
        return _R()

    async def distinct(self, k):
        return sorted({r.get(k) for r in self.rows if r.get(k)})


class _FakeDB:
    def __init__(self, units):
        self.units = _Coll(units)
        self.dmx_prototypes = _Coll()
        self.developments = _Coll([{"id": "dev1", "name": "Torre Alba"}])

    def __getattr__(self, n):  # pragma: no cover
        raise AttributeError(n)


def test_materializar_llena_dmx_prototypes_y_asigna_ids():
    db = _FakeDB([_u("u1", m2=84, num="101"), _u("u2", m2=84.5, num="201"), _u("u3", m2=120)])
    for u in db.units.rows:
        u["development_id"] = "dev1"
    r = _run(PE.materializar(db, "dev1", bautizar=False))
    assert r["prototipos"] == 2 and r["unidades"] == 3 and r["cuarentena"] == 0
    # contrato del marketplace (schema Prototype): campos presentes
    doc = db.dmx_prototypes.inserted[0]
    for campo in ("prototype_id", "development_id", "nombre", "recamaras", "banos",
                  "precio_desde_mxn", "unidades_total", "confianza", "metodo"):
        assert campo in doc, f"falta {campo} en dmx_prototypes"
    assert doc["prototype_id"].startswith("dev1__p")
    # las unidades quedaron apuntando a su prototipo
    q, u = db.units.updates[0]
    assert u["$set"]["prototype_id"].startswith("dev1__p")


def test_aprobar_lista_en_raiz_no_filtra_con_raiz():
    """BUG cazado (founder 07-14): un Sheets suelto en la raíz del dev (p.ej. con varios
    desarrollos) generaba only_project='(raíz)' → la ingesta filtraba TODO y procesaba 0.
    La aprobación debe ingerir el dev completo (only_project=None)."""
    import asyncio as _a

    class _Pend:
        def __init__(self, doc): self.doc = doc; self.updated = None
        async def find_one(self, q, proj=None): return dict(self.doc)
        async def update_one(self, q, u): self.updated = u

    class _Jobs:
        def __init__(self): self.inserted = None
        async def insert_one(self, d): self.inserted = d

    class _Mani:
        async def find_one(self, q, proj=None): return {"dev_org_id": "qc"}   # QC ya mapeado

    class _DB:
        def __init__(self, pend):
            self.vigia_pendientes = pend
            self.bulk_ingest_jobs = _Jobs()
            self.vigia_manifiesto = _Mani()

    pend = _Pend({"id": "vp1", "estado": "pendiente", "tipo": "lista_cambiada",
                  "dev": "QC", "proyecto": "(raíz)", "dev_folder_id": "folder123",
                  "fuente_id": "vf_1",
                  "archivo": {"id": "a1", "nombre": "precios varios.gsheet"}})
    db = _DB(pend)

    import vigia_engine as _ve
    import bulk_ingest_engine as _bie
    orig = _bie.run
    async def _fake_run(db_, job_id): return None
    _bie.run = _fake_run
    try:
        r = _a.run(_ve.aprobar_pendiente(db, "vp1", "founder"))
    finally:
        _bie.run = orig
    assert r["accion"] == "ingesta_disparada"
    assert db.bulk_ingest_jobs.inserted["only_project"] is None      # ← el fix
    assert db.bulk_ingest_jobs.inserted["origen"]["via"] == "vigia"  # linaje intacto


def test_manifiesto_identidad_obligatoria():
    """La pregunta del founder: '¿cómo sabe que DESARROLLOS-CLASS es class?' — NO adivina:
    sin mapeo en el manifiesto la aprobación se NIEGA (nada al costal superadmin_global);
    con mapeo, el job de ingesta lleva el dev_org correcto."""
    import asyncio as _a
    import pytest as _pt

    class _Pend:
        def __init__(self, doc): self.doc = doc
        async def find_one(self, q, proj=None): return dict(self.doc)
        async def update_one(self, q, u): pass

    class _Jobs:
        def __init__(self): self.inserted = None
        async def insert_one(self, d): self.inserted = d

    class _Mani:
        def __init__(self, mapeo=None): self.mapeo = mapeo
        async def find_one(self, q, proj=None): return self.mapeo
        async def update_one(self, q, u, upsert=False): self.mapeo = u["$set"]

    class _DB:
        def __init__(self, mapeo=None):
            self.vigia_pendientes = _Pend({"id": "vp1", "estado": "pendiente",
                                           "tipo": "lista_cambiada", "dev": "DESARROLLOS-CLASS",
                                           "proyecto": "Almina San Angel", "fuente_id": "vf_1",
                                           "dev_folder_id": "fld_class"})
            self.bulk_ingest_jobs = _Jobs()
            self.vigia_manifiesto = _Mani(mapeo)
            self.extraction_profiles = _Mani()

    import vigia_engine as _ve
    import bulk_ingest_engine as _bie
    orig = _bie.run
    async def _fake_run(db_, job_id): return None
    _bie.run = _fake_run
    try:
        # SIN mapeo → se niega con mensaje claro
        with _pt.raises(LookupError):
            _a.run(_ve.aprobar_pendiente(_DB(mapeo=None), "vp1", "founder"))
        # CON mapeo → el job lleva la identidad correcta
        db = _DB(mapeo={"dev_org_id": "class"})
        r = _a.run(_ve.aprobar_pendiente(db, "vp1", "founder"))
        assert r["accion"] == "ingesta_disparada"
        assert db.bulk_ingest_jobs.inserted["target_dev_org_id"] == "class"
        assert db.bulk_ingest_jobs.inserted["only_project"] == "Almina San Angel"
    finally:
        _bie.run = orig


def test_patron_del_founder_llega_al_recon():
    """Las notas del manifiesto ('así trabaja este dev') viajan al prompt del RECON."""
    import asyncio as _a

    class _Prof:
        async def find_one(self, q, proj=None):
            return {"folder_key": "fld_class",
                    "notas_founder": "Las listas están en la pestaña DISPONIBLE de cada Sheets",
                    "correcciones": {"precio": 3}}

    class _DB:
        extraction_profiles = _Prof()

    from extraction_profiles import profile_hints
    hints = _a.run(profile_hints(_DB(), "fld_class"))
    assert "PATRÓN DE ESTE DEV" in hints and "pestaña DISPONIBLE" in hints
    assert "HUELLA DE ESTE DRIVE" in hints and "precio (3x)" in hints


def test_mapeo_crear_dev_al_vuelo_shape():
    """El PUT del manifiesto puede crear el dev AL VUELO (shell pending_claim) — misma forma
    que Alta manual. Aquí congelamos el contrato del body (crear_dev_nombre XOR dev_org_id)."""
    from routes.vigia import MapeoIn
    m = MapeoIn(fuente_id="vf_1", dev_carpeta="GDC", crear_dev_nombre="GDC Desarrollos")
    assert m.dev_org_id == "" and m.crear_dev_nombre == "GDC Desarrollos"
    m2 = MapeoIn(fuente_id="vf_1", dev_carpeta="DECA", dev_org_id="deca")
    assert m2.crear_dev_nombre == ""
