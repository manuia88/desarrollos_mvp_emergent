"""Parallax 3D LOCAL (gratis, sin API de pago) — oportunidad P2 #4.

Genera un recorrido "entrando" a cada espacio desde las FOTOS del dev, en el ORDEN del gusto del comprador:
MiDaS (profundidad por foto) + cv2.remap (cámara con parallax por profundidad) + ffmpeg (xfade, todo-keyframe).

Se corre en BACKGROUND y se CACHEA por (dev_id, orden de fotos) → la 1ª visita ve el default, las siguientes el
personalizado. Idempotente. Fail-open: si algo falla, no rompe la experiencia (cae al video/foto normal).

Requiere: opencv (cv2) + ffmpeg en el entorno del backend. El modelo MiDaS-small (~66MB) se descarga 1 vez a .cache/.
"""
import os
import hashlib
import logging
import subprocess
import tempfile
import urllib.request

import numpy as np
import cv2

log = logging.getLogger("dmx.parallax")

_BASE = os.path.dirname(__file__)
_OUT_DIR = os.path.join(_BASE, "static_parallax")
_MODEL = os.path.join(_BASE, ".cache", "midas-small.onnx")
_MODEL_URL = "https://github.com/isl-org/MiDaS/releases/download/v2_1/model-small.onnx"
_MEAN = np.array([0.485, 0.456, 0.406], np.float32)
_STD = np.array([0.229, 0.224, 0.225], np.float32)
_net = None

W, H, FPS, SECS, XF = 1280, 720, 25, 6.5, 0.8
_Xg, _Yg = np.meshgrid(np.arange(W, dtype=np.float32), np.arange(H, dtype=np.float32))
_cx, _cy = np.float32(W / 2), np.float32(H / 2)


def out_dir() -> str:
    os.makedirs(_OUT_DIR, exist_ok=True)
    return _OUT_DIR


def key_for(dev_id: str, photo_urls) -> str:
    """Cache key = dev + hash del ORDEN de fotos (mismo orden = mismo parallax → buyers con igual gusto comparten)."""
    h = hashlib.sha1(("|".join(photo_urls or [])).encode("utf-8")).hexdigest()[:12]
    return f"{dev_id}-{h}"


def cached_url(dev_id: str, photo_urls):
    """URL pública si el parallax ya está generado, si no None."""
    key = key_for(dev_id, photo_urls)
    return f"/api/parallax-cache/{key}.mp4" if os.path.exists(os.path.join(out_dir(), f"{key}.mp4")) else None


def _ensure_model():
    global _net
    if _net is not None:
        return _net
    os.makedirs(os.path.dirname(_MODEL), exist_ok=True)
    if not os.path.exists(_MODEL):
        log.info("[parallax] descargando modelo MiDaS-small (1 vez)…")
        urllib.request.urlretrieve(_MODEL_URL, _MODEL)
    _net = cv2.dnn.readNetFromONNX(_MODEL)
    return _net


def _fit(arr):
    """Escala manteniendo aspecto + center-crop a WxH (sin distorsión)."""
    h, w = arr.shape[:2]
    s = max(W / w, H / h)
    r = cv2.resize(arr, (max(W, int(w * s + 0.5)), max(H, int(h * s + 0.5))))
    y = (r.shape[0] - H) // 2
    x = (r.shape[1] - W) // 2
    return r[y:y + H, x:x + W]


def _depth(net, img):
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    inp = cv2.resize(rgb, (256, 256))
    norm = (inp - _MEAN) / _STD
    net.setInput(np.transpose(norm, (2, 0, 1))[None].astype(np.float32))
    out = np.squeeze(net.forward())
    d = cv2.resize(out, (img.shape[1], img.shape[0]))
    d = (d - d.min()) / (d.max() - d.min() + 1e-6)
    return cv2.GaussianBlur(d, (0, 0), 4).astype(np.float32)


def _parallax_segment(net, img, seg_path):
    d = _depth(net, img)
    vw = cv2.VideoWriter(seg_path, cv2.VideoWriter_fourcc(*"mp4v"), FPS, (W, H))
    n = int(SECS * FPS)
    for f in range(n):
        t = f / max(1, n - 1)
        e = float(0.5 - 0.5 * np.cos(np.pi * t))
        zb = 1.0 - 0.09 * e
        zd = -0.05 * e
        sx = 42.0 * (2 * e - 1) * 0.6
        mapx = (_cx + (_Xg - _cx) * (zb + zd * d) - sx * (d - 0.5)).astype(np.float32)
        mapy = (_cy + (_Yg - _cy) * (zb + zd * d) - sx * 0.25 * (d - 0.5)).astype(np.float32)
        vw.write(cv2.remap(img, mapx, mapy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT))
    vw.release()


def generate(dev_id: str, photo_urls) -> str:
    """Genera (o reusa) el parallax de las fotos EN EL ORDEN dado → static_parallax/{key}.mp4. Idempotente."""
    photo_urls = [u for u in (photo_urls or []) if u][:6]
    if len(photo_urls) < 1:
        return None
    key = key_for(dev_id, photo_urls)
    out = os.path.join(out_dir(), f"{key}.mp4")
    if os.path.exists(out):
        return key
    tmp = tempfile.mkdtemp(prefix="parallax_")
    try:
        net = _ensure_model()
        segs = []
        for i, u in enumerate(photo_urls):
            try:
                from services.url_guard import is_safe_url  # anti-SSRF (fetch de URL del usuario)
                if not is_safe_url(u, label="parallax_photo"):
                    log.warning(f"[parallax] seg {i} URL bloqueada (anti-SSRF)")
                    continue
                req = urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"})
                data = urllib.request.urlopen(req, timeout=25).read()
                arr = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
                if arr is None:
                    continue
                seg = os.path.join(tmp, f"s{i}.mp4")
                _parallax_segment(net, _fit(arr), seg)
                segs.append(seg)
            except Exception as e:  # noqa: BLE001
                log.warning(f"[parallax] seg {i} fail: {e}")
        if not segs:
            return None
        inputs = []
        for s in segs:
            inputs += ["-i", s]
        if len(segs) == 1:
            mapflag = ["-map", "0:v"]
        else:
            fc = [f"[{i}:v]fps={FPS},setsar=1,format=yuv420p[v{i}]" for i in range(len(segs))]
            last = "v0"
            cum = SECS
            for k in range(1, len(segs)):
                off = round(cum - k * XF, 3)
                fc.append(f"[{last}][v{k}]xfade=transition=fade:duration={XF}:offset={off}[x{k}]")
                last = f"x{k}"
                cum += SECS
            mapflag = ["-filter_complex", ";".join(fc), "-map", f"[{last}]"]
        cmd = ["ffmpeg", "-y", *inputs, *mapflag, "-c:v", "libx264", "-pix_fmt", "yuv420p",
               "-crf", "24", "-x264-params", "keyint=1:scenecut=0", "-movflags", "+faststart", "-an", out]
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode != 0:
            log.warning(f"[parallax] ffmpeg fail: {r.stderr[-300:]}")
            return None
        log.info(f"[parallax] generado {key} ({len(segs)} espacios)")
        return key
    except Exception as e:  # noqa: BLE001
        log.warning(f"[parallax] generate fail-open: {e}")
        return None
    finally:
        try:
            import shutil
            shutil.rmtree(tmp, ignore_errors=True)
        except Exception:  # noqa: BLE001
            pass
