"""Orientación de planos: convención OSD (Rotate = grados HORARIOS) y giro en sitio."""
import plano_orientacion as po


def test_es_imagen():
    assert po.es_imagen("/x/plano.jpg") is True
    assert po.es_imagen("/x/plano.PNG") is True
    assert po.es_imagen("/x/plano.pdf") is False   # los PDF no se giran (su preview PNG sí)
    assert po.es_imagen("") is False


def test_osd_parsea_rotate_y_confianza(monkeypatch):
    class R:
        stdout = "Page number: 0\nOrientation in degrees: 90\nRotate: 270\nOrientation confidence: 2.00\n"
        stderr = ""
    monkeypatch.setattr(po.subprocess, "run", lambda *a, **k: R())
    monkeypatch.setattr(po.os.path, "exists", lambda p: True)
    assert po.osd("x.jpg") == {"rotate": 270, "conf": 2.0}


def test_giro_necesario_respeta_umbral(monkeypatch):
    monkeypatch.setattr(po, "osd", lambda p, timeout=90: {"rotate": 270, "conf": 0.3})
    assert po.giro_necesario("x.jpg") == 0        # confianza baja → no girar (mejor quieto)
    monkeypatch.setattr(po, "osd", lambda p, timeout=90: {"rotate": 270, "conf": 2.0})
    assert po.giro_necesario("x.jpg") == 270


def test_enderezar_gira_en_sentido_horario(tmp_path):
    """Convención validada a ojo 07-16: Rotate:270 endereza la lámina Almina."""
    from PIL import Image
    p = tmp_path / "lamina.png"
    im = Image.new("RGB", (20, 10), "white")
    im.putpixel((0, 0), (255, 0, 0))              # marca en la esquina sup-izq
    im.save(p)
    assert po.enderezar_archivo(str(p), 270) is True
    out = Image.open(p)
    assert out.size == (10, 20)                   # giró de eje
    # 270° horario = 90° antihorario: la esquina sup-izq (0,0) termina abajo-izq
    assert out.getpixel((0, 19)) == (255, 0, 0)
    # 0 grados = no tocar
    assert po.enderezar_archivo(str(p), 0) is False


def test_score_texto_parsea_tsv(monkeypatch):
    class R:
        stdout = ("level\tpage\tblock\tpar\tline\tword\tleft\ttop\twidth\theight\tconf\ttext\n"
                  "5\t1\t1\t1\t1\t1\t0\t0\t9\t9\t95.0\tTORRE\n"
                  "5\t1\t1\t1\t1\t2\t0\t0\t9\t9\t30.0\txx\n")   # conf baja + corta: fuera
        stderr = ""
    monkeypatch.setattr(po.subprocess, "run", lambda *a, **k: R())
    assert po.score_texto("x.png") == 95.0 * 5
