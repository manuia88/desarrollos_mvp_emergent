"""Bot de Telegram — las TARJETAS DE DECISIÓN son puras: datos → texto con contexto + botones."""
from telegram_bot import (tarjeta_pendiente, _resumen_auto, _resumen_primeras,
                          _cambios_humanos, _es_primera, _tiene_nuevas)


def test_dev_nuevo_sin_mapeo_pide_identidad_primero():
    p = {"id": "vp1", "tipo": "dev_nuevo", "dev": "GDC",
         "detalle": {"proyectos": ["Torre A", "Torre B"], "n_archivos": 40}}
    card = tarjeta_pendiente(p, {})   # sin mapeo
    assert "Desarrollador nuevo" in card["texto"] and "2 proyectos" in card["texto"]
    assert "no me dices de quién es" in card["texto"]
    # el flujo: primero mapear, no aprobar a ciegas
    botones = [b["callback_data"] for fila in card["botones"] for b in fila]
    assert f"mapmenu:vp1" in botones and "ap:vp1" not in botones


def test_dev_nuevo_mapeado_explica_consecuencia():
    p = {"id": "vp2", "tipo": "dev_nuevo", "dev": "GDC", "detalle": {"proyectos": [], "n_archivos": 3}}
    card = tarjeta_pendiente(p, {"mapeado_a": "GDC Desarrollos"})
    assert "GDC Desarrollos" in card["texto"]
    assert "gasta API" in card["texto"]          # la consecuencia, explícita
    botones = [b["callback_data"] for fila in card["botones"] for b in fila]
    assert "ap:vp2" in botones and "rj:vp2" in botones


def test_lista_cambiada_trae_contexto_para_decidir():
    # Cambio REAL (bajó un precio) → tarjeta de DECISIÓN con contexto y botón Aprobar.
    p = {"id": "vp3", "tipo": "lista_cambiada", "dev": "CLASS", "proyecto": "Almina",
         "archivo": {"nombre": "PRECIOS JULIO.xlsx", "modificado": "2026-07-14T02:14:00Z"},
         "cambios": {"base": "la versión anterior", "cambios_precio": [
             {"unidad": "A 101", "antes": 5000000, "ahora": 4800000}],
             "cambios_status": [], "ya_no_estan": [], "nuevas": [], "totales": {"cambios_precio": 1}}}
    ctx = {"mapeado_a": "Class Bienes Raíces", "n_unidades_proyecto": 24,
           "eventos_previos": 3, "ultima_ingesta": "2026-07-01T10:00:00Z"}
    card = tarjeta_pendiente(p, ctx)
    t = card["texto"]
    assert "PRECIOS JULIO.xlsx" in t and "CAMBIÓ" in t
    assert "24 unidades" in t                      # estado actual del proyecto
    assert "2026-07-01" in t                       # última ingesta
    assert "SOLO este proyecto" in t               # alcance de aprobar
    assert "bitácora" in t                         # consecuencia
    botones = [b["callback_data"] for fila in card["botones"] for b in fila]
    assert "det:vp3" in botones and "ap:vp3" in botones   # detalle + aprobar (es cambio real)


def test_lista_resubida_sin_cambios_es_honesta_y_no_ofrece_aprobar():
    """UX 07-22: el dev re-subió el MISMO archivo (mismos datos). La tarjeta NO debe gritar
    'CAMBIÓ' ni ofrecer 'Aprobar (gasta API)' — es honesta y solo deja archivar/ver linaje."""
    p = {"id": "vp3b", "tipo": "lista_cambiada", "dev": "CLASS", "proyecto": "Avalia",
         "archivo": {"nombre": "VP_Torre A.pdf", "modificado": "2026-07-22T01:00:00Z"},
         "cambios": {"base": "la versión anterior", "cambios_precio": [], "cambios_status": [],
                     "ya_no_estan": [], "nuevas": [], "totales": {}}}
    card = tarjeta_pendiente(p, {"mapeado_a": "Class Bienes Raíces"})
    t = card["texto"]
    assert "re-subió (mismos datos)" in t and "CAMBIÓ" not in t
    assert "nada que aprobar" in t.lower()
    botones = [b["callback_data"] for fila in card["botones"] for b in fila]
    assert "ap:vp3b" not in botones                 # NO Aprobar: no gasta API que el founder no tiene
    assert "det:vp3b" in botones and "rj:vp3b" in botones


def test_lista_sin_mapeo_avisa_y_ofrece_mapear():
    p = {"id": "vp4", "tipo": "lista_nueva", "dev": "NUEVO-DEV", "proyecto": "X",
         "archivo": {"nombre": "lista.xlsx"}}
    card = tarjeta_pendiente(p, {})
    assert "no está mapeado" in card["texto"]
    assert any("mapmenu:vp4" == b["callback_data"] for fila in card["botones"] for b in fila)


def test_acceso_roto_explica_causas():
    card = tarjeta_pendiente({"id": "vp5", "tipo": "acceso_roto", "dev": "Deca"}, {})
    assert "Perdí acceso" in card["texto"] and "permiso" in card["texto"]
    assert any("ap:vp5" == b["callback_data"] for fila in card["botones"] for b in fila)


def test_lista_cambiada_muestra_el_diff_exacto():
    """Founder 07-17: 'cuando dicen lista modificada, ¿qué se modificó?' — la tarjeta lo dice."""
    p = {"id": "vp7", "tipo": "lista_cambiada", "dev": "CLASS", "proyecto": "Avalia",
         "archivo": {"nombre": "VP_Lista Torre B.pdf"},
         "cambios": {"base": "la versión anterior de la lista",
                     "cambios_precio": [{"unidad": "B 204", "antes": 6194300, "ahora": 5981600}],
                     "cambios_status": [], "ya_no_estan": [], "nuevas": [],
                     "totales": {"cambios_precio": 1}}}
    t = tarjeta_pendiente(p, {})["texto"]
    assert "Qué cambió exactamente" in t
    assert "B 204" in t and "$6,194,300" in t and "$5,981,600" in t and "-3.4%" in t
    assert "DESARROLLADOR" in t          # quién: fue el dev en su Drive, no el founder


def test_proyecto_nuevo_advierte_si_ya_existe_en_catalogo():
    """Cordobanes 07-17: carpeta renombrada gritaba 'proyecto nuevo' — la tarjeta ahora avisa."""
    p = {"id": "vp8", "tipo": "proyecto_nuevo", "dev": "CLASS",
         "proyecto": "Cordobanes 3, Col. San Jose Insurgentes - ENTREGA INMEDIATA",
         "ya_en_catalogo": {"dev_id": "d1", "name": "Cordobanes 3", "unidades": 8}}
    t = tarjeta_pendiente(p, {})["texto"]
    assert "no parece nuevo" in t and "Cordobanes 3" in t and "8 unidades" in t


def test_proyecto_renombrado_solo_informa():
    p = {"id": "vp9", "tipo": "proyecto_renombrado", "dev": "CLASS",
         "proyecto": "Cordobanes 3 - ENTREGA", "antes": {"proyecto": "Cordobanes - ENTREGA"}}
    card = tarjeta_pendiente(p, {})
    assert "renombró" in card["texto"] and "MISMO proyecto" in card["texto"]
    botones = [b["callback_data"] for fila in card["botones"] for b in fila]
    assert "ap:vp9" not in botones       # nada que ingerir: solo 'Enterado'


# ─── DIGEST del parte (UX 07-23): lo auto-aplicado y las primeras lecturas NO gritan tarjetas ───
def test_cambios_humanos_no_confunde_no_disponible_con_disponible():
    """Bug real: 'dispon' es substring de 'no_disponible'. Un depa que pasó a no_disponible
    NO debe leerse 'volvió a estar disponible' — debe leerse 'se apartó'."""
    aparta = _cambios_humanos({"cambios_status": [{"unidad": "101", "antes": "disponible", "ahora": "no_disponible"}]})
    assert aparta == ["101 se apartó"]
    vuelve = _cambios_humanos({"cambios_status": [{"unidad": "C-105", "antes": "no_disponible", "ahora": "disponible"}]})
    assert vuelve == ["C-105 volvió a estar disponible"]
    vendido = _cambios_humanos({"cambios_status": [{"unidad": "B2", "antes": "disponible", "ahora": "vendido"}]})
    assert vendido == ["B2 se vendió"]


def test_resumen_auto_dice_que_ya_quedo_sin_pedir_nada():
    auto = [{"proyecto": "Bau", "aplicado": {"precios": 0, "status": 1, "senales_venta": 1},
             "cambios": {"cambios_status": [{"unidad": "101", "antes": "disponible", "ahora": "no_disponible"}],
                         "ya_no_estan": ["201"]}}]
    t = _resumen_auto(auto)
    assert "Ya lo actualicé solo" in t and "no tienes que hacer nada" in t
    assert "101 se apartó" in t and "probable" in t
    assert "gasta API" not in t and "Aprobar" not in t   # NO botón, NO amenaza de costo


def test_resumen_primeras_no_es_alarma_de_cambio():
    primeras = [{"proyecto": "Dessea 1", "cambios": {"nota": "primera lectura: 1 unidades", "n_leidas": 1}},
                {"proyecto": "Dessea 2", "cambios": {"nota": "primera lectura: 1 unidades", "n_leidas": 1}}]
    t = _resumen_primeras(primeras)
    assert "Empecé a vigilar" in t and "CAMBIÓ" not in t
    assert "poquitos depas" in t          # aviso de PDF flaco, humano
    assert "Dessea 1" in t and "Dessea 2" in t


def test_helpers_de_cubeta():
    assert _es_primera({"cambios": {"nota": "primera lectura: 3 unidades"}}) is True
    assert _es_primera({"cambios": {"cambios_precio": [{"unidad": "A1"}]}}) is False
    assert _tiene_nuevas({"cambios": {"nuevas": ["B2"]}}) is True
    assert _tiene_nuevas({"cambios": {"nuevas": []}}) is False


def test_tarjeta_decision_no_filtra_jerga_forense():
    """El founder NO debe ver tokens crudos ('caso Jai 25L', 'DD-4E0P6TO') — solo la línea humana."""
    p = {"id": "vpF", "tipo": "lista_cambiada", "dev": "CLASS", "proyecto": "Panorama",
         "archivo": {"nombre": "L D.pdf"},
         "cambios": {"base": "la versión anterior", "nuevas": ["X-9"],
                     "cambios_precio": [], "cambios_status": [], "ya_no_estan": [],
                     "totales": {"nuevas": 1},
                     "alertas_forenses": ["⚠️ texto ENTRELAZADO (['DD-4E0P6TO']) — caso Jai 25L: leer por coordenadas"]}}
    t = tarjeta_pendiente(p, {"mapeado_a": "Class"})["texto"]
    assert "Jai 25L" not in t and "DD-4E0P6TO" not in t and "coordenadas" not in t
    assert "texto encimado" in t          # la versión humana sí
