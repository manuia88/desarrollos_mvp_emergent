"""Juez visual de galería a $0 (galeria_judex + extensiones de render_quality) — 07-17.

Casos reales que caza: flyer/lona con texto colada como foto, duplicados masivos del
mismo render, imágenes minúsculas y recorrido incompleto (sin foto de cocina/baño…).
Regla dura verificada: el juez MARCA, jamás borra."""
import pytest
from PIL import Image, ImageDraw, ImageFont

from galeria_judex import (MINIMOS, conceptos_faltantes, juzgar_galeria,
                           juzgar_galerias_todos)
from render_quality import (ES_FLYER_MIN, densidad_texto, es_duplicado, es_flyer,
                            hash_perceptual)


# ─── imágenes sintéticas ────────────────────────────────────────────────────

def _img_flyer(path, w=900, h=1100):
    """Flyer/lona: fondo claro con MUCHO texto grande (como los colados en galería)."""
    im = Image.new("RGB", (w, h), (245, 243, 238))
    d = ImageDraw.Draw(im)
    try:
        font = ImageFont.load_default(size=34)
    except TypeError:  # Pillow viejo sin size
        font = ImageFont.load_default()
    lineas = [
        "GRAN PREVENTA DEPARTAMENTOS", "DESDE $4,850,000 MXN",
        "ENTREGA DICIEMBRE 2027", "AMENIDADES ROOF GARDEN ALBERCA",
        "GIMNASIO COWORKING PET ZONE", "AGENDA TU CITA HOY MISMO",
        "TELEFONO 55 1234 5678", "CREDITO BANCARIO INFONAVIT",
        "UBICACION COLONIA DEL VALLE", "DOS Y TRES RECAMARAS CON BALCON",
        "ESTACIONAMIENTO TECHADO BODEGA", "PRECIOS SUJETOS A CAMBIO",
    ] * 2
    for i, t in enumerate(lineas):
        d.text((30, 20 + i * 44), t, fill=(25, 28, 40), font=font)
    im.save(path, "JPEG", quality=90)
    return str(path)


def _img_render(path, w=1000, h=750, seed=13):
    """Render sintético: gradiente + bloques de color, CERO texto."""
    im = Image.new("RGB", (w, h))
    px = im.load()
    for y in range(h):
        for x in range(w):
            px[x, y] = (30 + (x * 180) // w, 60 + (y * 140) // h,
                        90 + ((x + y + seed * 17) * 100) // (w + h))
    d = ImageDraw.Draw(im)
    d.rectangle([w // 8, h // 3, w // 2, h - 40], fill=(120 + seed, 90, 60))
    d.rectangle([w // 2 + 30, h // 4, w - 60, h - 90], fill=(200, 190, 170))
    im.save(path, "JPEG", quality=90)
    return str(path)


def _img_mini(path, w=320, h=240):
    return _img_render(path, w, h, seed=5)


# ─── densidad_texto / es_flyer ──────────────────────────────────────────────

def test_densidad_texto_flyer_alto_render_bajo(tmp_path):
    flyer = _img_flyer(tmp_path / "flyer.jpg")
    render = _img_render(tmp_path / "render.jpg")
    assert densidad_texto(flyer) >= ES_FLYER_MIN      # texto denso = flyer
    assert densidad_texto(render) < ES_FLYER_MIN      # render limpio, sin palabras
    assert es_flyer(flyer) is True
    assert es_flyer(render) is False


def test_densidad_texto_imagen_rota_no_truena(tmp_path):
    p = tmp_path / "rota.jpg"
    p.write_bytes(b"no soy una imagen")
    assert densidad_texto(str(p)) == 0.0


# ─── hash_perceptual / es_duplicado ─────────────────────────────────────────

def test_dhash_duplicado_exacto_y_casi_exacto(tmp_path):
    a = _img_render(tmp_path / "a.jpg", seed=13)
    b = _img_render(tmp_path / "b.jpg", seed=13)          # duplicado exacto
    # casi-exacto: mismo render re-encodeado más chico y un pelo más brillante
    im = Image.open(a).resize((640, 480))
    im = im.point(lambda v: min(255, v + 6))
    c = tmp_path / "c.jpg"
    im.save(c, "JPEG", quality=70)
    # imagen DISTINTA de verdad (otra composición: franjas verticales)
    im2 = Image.new("RGB", (1000, 750))
    d2 = ImageDraw.Draw(im2)
    for x in range(0, 1000, 100):
        d2.rectangle([x, 0, x + 50, 750], fill=(240, 240, 240))
        d2.rectangle([x + 50, 0, x + 100, 750], fill=(20, 20, 20))
    otro = tmp_path / "d.jpg"
    im2.save(otro, "JPEG", quality=90)
    ha, hb, hc, hd = (hash_perceptual(str(p)) for p in (a, b, c, otro))
    assert ha == hb and es_duplicado(ha, hb)              # exacto → 0 bits
    assert es_duplicado(ha, hc, umbral_bits=6)            # casi-exacto → ≤6 bits
    assert not es_duplicado(ha, hd)                       # distinta → lejos


def test_es_duplicado_none_nunca_es_duplicado(tmp_path):
    p = tmp_path / "rota.jpg"
    p.write_bytes(b"xx")
    assert hash_perceptual(str(p)) is None
    assert es_duplicado(None, 0) is False and es_duplicado(0, None) is False


# ─── conceptos_faltantes (pura) ─────────────────────────────────────────────

def test_conceptos_faltantes_recorrido():
    assets = [{"asset_type": "foto_hero", "concepto": None},       # cubre portada
              {"asset_type": "foto_galeria", "concepto": "sala"},
              {"asset_type": "foto_galeria", "concepto": "recamara principal"}]
    faltan = conceptos_faltantes(assets)
    assert faltan == ["cocina", "bano", "fachada"]                 # orden del recorrido
    assert conceptos_faltantes([]) == list(MINIMOS)                # sin fotos falta todo


# ─── juez completo (mongomock + imágenes reales en tmp) ─────────────────────

async def _seed_dev(db, tmp_path, developer_id="org_gdc"):
    await db.developments.insert_one(
        {"id": "d1", "name": "Torre Prueba", "developer_id": developer_id})
    flyer = _img_flyer(tmp_path / "f.jpg")
    r1 = _img_render(tmp_path / "r1.jpg", seed=13)
    r2 = _img_render(tmp_path / "r2.jpg", seed=13)                 # duplicado de r1
    mini = _img_mini(tmp_path / "m.jpg")
    docs = [
        {"id": "a_flyer", "development_id": "d1", "asset_type": "foto_galeria",
         "filename": "f.jpg", "storage_path": flyer, "concepto": "sala"},
        {"id": "a_r1", "development_id": "d1", "asset_type": "foto_hero",
         "filename": "r1.jpg", "storage_path": r1, "concepto": None},
        {"id": "a_r2", "development_id": "d1", "asset_type": "foto_galeria",
         "filename": "r2.jpg", "storage_path": r2, "concepto": "recamara"},
        {"id": "a_mini", "development_id": "d1", "asset_type": "foto_galeria",
         "filename": "m.jpg", "storage_path": mini, "concepto": "bano"},
        {"id": "a_plano", "development_id": "d1", "asset_type": "plano_nivel",
         "filename": "p.pdf", "storage_path": "/no/existe.pdf"},   # NO es foto: se ignora
    ]
    await db.dev_assets.insert_many(docs)


@pytest.mark.asyncio
async def test_juzgar_galeria_4_reglas(mock_db, tmp_path):
    await _seed_dev(mock_db, tmp_path)
    hallazgos = await juzgar_galeria(mock_db, "d1")
    por_regla = {}
    for h in hallazgos:
        por_regla.setdefault(h["regla"], []).append(h)

    flyer = por_regla["galeria_flyer"]
    assert [h["ref"] for h in flyer] == ["a_flyer"]
    assert flyer[0]["severidad"] == "alerta"
    assert "revisar con ojos" in flyer[0]["accion"]                # jamás borrar solo

    dups = por_regla["galeria_duplicados"]
    assert {"a_r1", "a_r2"} in [set(h["ref"]) for h in dups]
    assert all(h["severidad"] == "aviso" for h in dups)

    minis = por_regla["galeria_resolucion"]
    assert any(h["ref"] == "a_mini" for h in minis)

    rec = por_regla["galeria_recorrido_incompleto"][0]
    assert rec["accion"] == "pedir al dev"
    assert "cocina" in rec["detalle"] and "fachada" in rec["detalle"]

    # el juez NO borró nada
    assert await mock_db.dev_assets.count_documents({}) == 5


@pytest.mark.asyncio
async def test_solicitud_gdc_upsert_sin_duplicar(mock_db, tmp_path):
    await _seed_dev(mock_db, tmp_path, developer_id="org_gdc")
    await juzgar_galeria(mock_db, "d1")
    await juzgar_galeria(mock_db, "d1")                            # 2ª corrida = upsert
    docs = [d async for d in mock_db.solicitudes_gdc.find({})]
    assert len(docs) == 1                                          # sin duplicar
    s = docs[0]
    assert s["tipo"] == "galeria_recorrido" and s["estado"] == "pendiente"
    assert s["proyecto"] == "Torre Prueba"
    assert s["conceptos_faltantes"] == ["cocina", "fachada"]
    assert s["detalle"].startswith("Torre Prueba:")                # parseable en el hub
    assert await mock_db.solicitudes_class.count_documents({}) == 0


@pytest.mark.asyncio
async def test_solicitud_class_y_otros_orgs(mock_db, tmp_path):
    await _seed_dev(mock_db, tmp_path, developer_id="org_user_b2869298f9f2")
    await juzgar_galeria(mock_db, "d1")
    assert await mock_db.solicitudes_class.count_documents(
        {"tipo": "galeria_recorrido"}) == 1
    assert await mock_db.solicitudes_gdc.count_documents({}) == 0

    # org desconocida → hallazgo sí, solicitud NO (no hay canal con ese dev)
    await mock_db.developments.insert_one(
        {"id": "d2", "name": "Otro", "developer_id": "org_x"})
    await mock_db.dev_assets.insert_one(
        {"id": "z1", "development_id": "d2", "asset_type": "foto_galeria",
         "filename": "z.jpg", "storage_path": "/no/existe.jpg", "concepto": "sala"})
    h = await juzgar_galeria(mock_db, "d2")
    assert any(x["regla"] == "galeria_recorrido_incompleto" for x in h)
    assert await mock_db.solicitudes_gdc.count_documents({}) == 0
    assert await mock_db.solicitudes_class.count_documents({}) == 1  # solo la de d1


@pytest.mark.asyncio
async def test_juzgar_galerias_todos_resumen(mock_db, tmp_path):
    await _seed_dev(mock_db, tmp_path)
    r = await juzgar_galerias_todos(mock_db)
    assert r["n_devs"] == 1 and r["devs"][0]["name"] == "Torre Prueba"
    assert r["total_hallazgos"] == r["devs"][0]["n"] >= 4
    assert set(r["por_regla"]) == {"galeria_flyer", "galeria_duplicados",
                                   "galeria_resolucion",
                                   "galeria_recorrido_incompleto"}
