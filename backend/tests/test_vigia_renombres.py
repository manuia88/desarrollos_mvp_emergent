"""Vigía anti-falsas-alarmas (caso real Cordobanes 07-17): CLASS renombró su carpeta y el
robot gritó 'proyecto nuevo'. Ahora: renombre = mismos archivos (IDs de Drive sobreviven)
bajo otro nombre; re-subida = misma huella md5 con ID nuevo; y el 2º candado compara el
nombre de la carpeta contra el catálogo existente."""
from vigia_engine import diff_fotos, proyecto_ya_en_catalogo


def _foto(devs):
    return {"devs": devs}


def _arch(fid, nombre, proyecto, huella, es_lista=False):
    return {"id": fid, "nombre": nombre, "proyecto": proyecto, "carpeta": "",
            "mime": "application/pdf", "huella": huella, "modificado": "",
            "es_lista": es_lista, "tipo_doc": "otro"}


def test_renombre_de_carpeta_no_es_proyecto_nuevo():
    """Cordobanes: 28/29 archivos conservan su ID de Drive → es la MISMA carpeta."""
    prev = _foto({"CLASS": {"ok": True, "proyectos": ["Cordobanes - ENTREGA"],
                            "archivos": [_arch(f"f{i}", f"p{i}.pdf", "Cordobanes - ENTREGA", f"h{i}")
                                         for i in range(5)]}})
    nueva = _foto({"CLASS": {"ok": True, "proyectos": ["Cordobanes 3, San Jose - ENTREGA"],
                             "archivos": [_arch(f"f{i}", f"p{i}.pdf", "Cordobanes 3, San Jose - ENTREGA", f"h{i}")
                                          for i in range(5)]
                             + [_arch("fN", "ESTACIONAMIENTO.pdf", "Cordobanes 3, San Jose - ENTREGA", "hN")]}})
    evs = diff_fotos(prev, nueva)
    tipos = [e["tipo"] for e in evs]
    assert "proyecto_nuevo" not in tipos
    ren = next(e for e in evs if e["tipo"] == "proyecto_renombrado")
    assert ren["antes"]["proyecto"] == "Cordobanes - ENTREGA"
    assert ren["proyecto"] == "Cordobanes 3, San Jose - ENTREGA"
    # el archivo genuinamente nuevo SÍ se reporta; los renombrados no hacen ruido
    assert sum(1 for t in tipos if t == "archivo_nuevo") == 1
    assert "archivo_eliminado" not in tipos and "proyecto_desaparecido" not in tipos


def test_carpeta_genuinamente_nueva_si_es_proyecto_nuevo():
    prev = _foto({"CLASS": {"ok": True, "proyectos": ["Almina"],
                            "archivos": [_arch("f1", "a.pdf", "Almina", "h1")]}})
    nueva = _foto({"CLASS": {"ok": True, "proyectos": ["Almina", "Torre Nueva"],
                             "archivos": [_arch("f1", "a.pdf", "Almina", "h1"),
                                          _arch("f9", "b.pdf", "Torre Nueva", "h9")]}})
    evs = diff_fotos(prev, nueva)
    assert any(e["tipo"] == "proyecto_nuevo" and e["proyecto"] == "Torre Nueva" for e in evs)
    assert not any(e["tipo"] == "proyecto_renombrado" for e in evs)


def test_carpeta_que_desaparece_sin_renombre_queda_en_linaje():
    prev = _foto({"CLASS": {"ok": True, "proyectos": ["Viejo"],
                            "archivos": [_arch("f1", "a.pdf", "Viejo", "h1")]}})
    nueva = _foto({"CLASS": {"ok": True, "proyectos": [], "archivos": []}})
    evs = diff_fotos(prev, nueva)
    assert any(e["tipo"] == "proyecto_desaparecido" and e["proyecto"] == "Viejo" for e in evs)


def test_resubida_misma_huella_es_reemplazo_no_borrar_y_subir():
    """Panorama 07-17: 15 'eliminados' + 15 'nuevos' con las mismas huellas = re-subida."""
    prev = _foto({"CLASS": {"ok": True, "proyectos": ["Panorama"],
                            "archivos": [_arch("v1", "plano 101.pdf", "Panorama", "md5AA"),
                                         _arch("v2", "plano 102.pdf", "Panorama", "md5BB")]}})
    nueva = _foto({"CLASS": {"ok": True, "proyectos": ["Panorama"],
                             "archivos": [_arch("n1", "PLANO_101_v2.pdf", "Panorama", "md5AA"),
                                          _arch("n2", "PLANO_102_v2.pdf", "Panorama", "md5BB")]}})
    evs = diff_fotos(prev, nueva)
    tipos = [e["tipo"] for e in evs]
    assert tipos.count("archivo_reemplazado") == 2
    assert "archivo_nuevo" not in tipos and "archivo_eliminado" not in tipos
    r = next(e for e in evs if e["archivo"]["id"] == "n1")
    assert r["antes"]["nombre"] == "plano 101.pdf"


def test_huellas_de_fecha_no_aparean_reemplazos():
    """Las huellas 'mt:<fecha>' (Google nativos sin md5) NO identifican contenido."""
    prev = _foto({"D": {"ok": True, "proyectos": ["P"],
                        "archivos": [_arch("v1", "a", "P", "mt:2026-01-01")]}})
    nueva = _foto({"D": {"ok": True, "proyectos": ["P"],
                         "archivos": [_arch("n1", "b", "P", "mt:2026-01-01")]}})
    evs = diff_fotos(prev, nueva)
    tipos = sorted(e["tipo"] for e in evs)
    assert tipos == ["archivo_eliminado", "archivo_nuevo"]


def test_candado_catalogo_reconoce_proyecto_existente():
    """'Cordobanes 3, Col. San Jose Insurgentes - ENTREGA INMEDIATA' ≈ 'Cordobanes 3'."""
    candidatos = [{"id": "d1", "name": "Cordobanes 3"}, {"id": "d2", "name": "Almina"}]
    hit = proyecto_ya_en_catalogo(
        "Cordobanes 3, Col. San Jose Insurgentes - ENTREGA INMEDIATA", candidatos)
    assert hit and hit["id"] == "d1"
    assert proyecto_ya_en_catalogo("Torre Jamás Vista - PREVENTA", candidatos) is None
    # las palabras de etapa no engañan al candado
    assert proyecto_ya_en_catalogo("Almina - ENTREGA INMEDIATA", candidatos)["id"] == "d2"
