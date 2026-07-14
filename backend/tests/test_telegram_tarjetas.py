"""Bot de Telegram — las TARJETAS DE DECISIÓN son puras: datos → texto con contexto + botones."""
from telegram_bot import tarjeta_pendiente


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
    p = {"id": "vp3", "tipo": "lista_cambiada", "dev": "CLASS", "proyecto": "Almina",
         "archivo": {"nombre": "PRECIOS JULIO.xlsx", "modificado": "2026-07-14T02:14:00Z"}}
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
    assert "det:vp3" in botones                    # detalle sin gastar


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
