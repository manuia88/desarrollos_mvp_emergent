"""AUDITORÍA QA + STRESS — mide de verdad qué % del backend responde, en lugar de opinar.

Golpea TODOS los GET sin path-param del OpenAPI real (711), logueado como superadmin,
y clasifica: LIVE (2xx con datos) · VACÍO/dormant (2xx sin datos) · guardado (401/403) ·
necesita-params (422) · 404 · ROTO (5xx). Luego stress de concurrencia en endpoints calientes.

SEGURIDAD: solo GET (lecturas), con lista negra de rutas que gastan API o disparan procesos
(sync/ingest/airroi/llm/generate/...). No toca la llave del founder ni dispara ingesta.
Corre: python tools/qa_stress_auditoria.py
"""
import concurrent.futures as cf
import json
import os
import time
import urllib.request
import urllib.error

BASE = "http://127.0.0.1:8000"
ENV = {}
for line in open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")):
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, _, v = line.partition("=")
        ENV[k.strip()] = v.strip().strip('"').strip("'")

# rutas que NO se tocan (gastan API, disparan procesos o son destructivas aun en GET)
DENY = ("sync", "ingest", "scrape", "airroi", "/llm", "generate", "crawl", "backfill",
        "recompute", "rebuild", "enhance", "/run", "trigger", "refresh-external",
        "enrich", "seed", "reset", "migrate", "export", "download", "webhook")


def _req(method, path, cookie=None, timeout=25, body=None):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, method=method, data=data)
    if cookie:
        req.add_header("Cookie", cookie)          # sesión real (Set-Cookie del login)
    if data:
        req.add_header("Content-Type", "application/json")
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read(), (time.time() - t0) * 1000, r.headers
    except urllib.error.HTTPError as e:
        return e.code, e.read(), (time.time() - t0) * 1000, e.headers
    except Exception as e:
        return -1, str(e).encode(), (time.time() - t0) * 1000, None


def login():
    """Devuelve el header Cookie de sesión (access_token + refresh_token)."""
    st, raw, _, hdrs = _req("POST", "/api/auth/login",
                            body={"email": ENV["ADMIN_EMAIL"], "password": ENV["ADMIN_PASSWORD"]})
    if st != 200:
        raise SystemExit(f"login falló: {st} {raw[:200]}")
    cookies = []
    for k, v in (hdrs.items() if hdrs else []):
        if k.lower() == "set-cookie":
            cookies.append(v.split(";", 1)[0])
    if not cookies:  # fallback: token en el body
        tok = json.loads(raw).get("access_token") or json.loads(raw).get("token")
        cookies = [f"access_token={tok}"]
    return "; ".join(cookies)


def _tiene_datos(raw):
    try:
        d = json.loads(raw)
    except Exception:
        return len(raw) > 40
    if isinstance(d, dict):
        # ¿tiene contenido sustantivo?
        vals = [v for k, v in d.items() if k not in ("ok", "status", "success", "ts", "timestamp")]
        if any(isinstance(v, list) and v for v in vals):
            return True
        if any(isinstance(v, (dict,)) and v for v in vals):
            return True
        return any(bool(v) and not isinstance(v, bool) for v in vals)
    if isinstance(d, list):
        return len(d) > 0
    return bool(d)


def clasificar(st, raw):
    if st == -1:
        return "ERROR_RED"
    if st == 503 and (b"fallback" in raw or b"no disponible" in raw or b"use_relational" in raw):
        return "DEGRADADO_ok"           # 503 a propósito (ej. KG/Neo4j no cableado en local)
    if st >= 500:
        return "ROTO_5xx"
    if st in (401, 403):
        return "GUARDADO"
    if st == 404:
        return "404"
    if st == 422:
        return "NECESITA_PARAMS"
    if st >= 400:
        return "4xx"
    if 200 <= st < 300:
        return "LIVE" if _tiene_datos(raw) else "VACIO_dormant"
    return "OTRO"


def barrido(cookie):
    raw = urllib.request.urlopen(BASE + "/openapi.json", timeout=30).read()
    paths = json.loads(raw)["paths"]
    gets = [p for p, v in paths.items() if "get" in v and "{" not in p
            and not any(d in p.lower() for d in DENY)]
    resultados = {}

    def uno(p):
        st, body, ms, _ = _req("GET", p, cookie)
        return p, clasificar(st, body), st, ms

    with cf.ThreadPoolExecutor(max_workers=16) as ex:
        for p, cls, st, ms in ex.map(uno, gets):
            resultados[p] = (cls, st, ms)
    return resultados, len(gets)


def stress(cookie, path, n=120, workers=24):
    def uno(_):
        st, _b, ms, _ = _req("GET", path, cookie, timeout=30)
        return st, ms
    t0 = time.time()
    with cf.ThreadPoolExecutor(max_workers=workers) as ex:
        res = list(ex.map(uno, range(n)))
    wall = time.time() - t0
    lat = sorted(m for _, m in res)
    ok = sum(1 for s, _ in res if 200 <= s < 300)
    err = sum(1 for s, _ in res if s < 0 or s >= 500)
    p50 = lat[len(lat) // 2]
    p95 = lat[int(len(lat) * 0.95)]
    return {"n": n, "ok": ok, "err": err, "p50": round(p50), "p95": round(p95),
            "rps": round(n / wall, 1)}


def main():
    print("════ QA + STRESS · AUDITORÍA FUNCIONAL DEL BACKEND ════\n")
    cookie = login()
    print("login superadmin: ✅\n")

    print("── Barrido de los GET seguros (lecturas)…")
    res, n = barrido(cookie)
    from collections import Counter
    c = Counter(v[0] for v in res.values())
    print(f"\n{'CLASE':<18} {'#':>5}   qué significa")
    etiquetas = {
        "LIVE": "responde CON datos → prendido y funcional",
        "VACIO_dormant": "responde 200 pero sin datos → dormido/stub o sin dato aún",
        "NECESITA_PARAMS": "pide query-params (no es fallo; se prueba aparte)",
        "GUARDADO": "401/403 → protegido (correcto)",
        "404": "ruta no encontrada con GET directo",
        "4xx": "otro error de cliente",
        "ROTO_5xx": "🔴 error de servidor → DEFECTO REAL",
        "ERROR_RED": "🔴 no respondió (timeout/conn) → DEFECTO REAL",
    }
    for k in ("LIVE", "VACIO_dormant", "NECESITA_PARAMS", "GUARDADO", "404", "4xx",
              "ROTO_5xx", "ERROR_RED"):
        if c.get(k):
            print(f"{k:<18} {c[k]:>5}   {etiquetas[k]}")
    print(f"{'TOTAL':<18} {n:>5}")

    rotos = {p: v for p, v in res.items() if v[0] in ("ROTO_5xx", "ERROR_RED")}
    print(f"\n── 🔴 ENDPOINTS ROTOS (5xx / sin respuesta): {len(rotos)}")
    for p, (cls, st, ms) in sorted(rotos.items()):
        print(f"    {st}  {p}")

    # muestra de dormant para el founder (qué está apagado)
    dormant = [p for p, v in res.items() if v[0] == "VACIO_dormant"]
    print(f"\n── ⚪ VACÍOS/dormant (muestra de {min(15, len(dormant))} de {len(dormant)}):")
    for p in sorted(dormant)[:15]:
        print(f"    {p}")

    # ── STRESS en endpoints calientes
    print("\n── 🔥 STRESS de concurrencia (120 req · 24 hilos) en endpoints calientes:")
    calientes = ["/api/superadmin/catalogo", "/api/health",
                 "/api/superadmin/genoma/salud-dato"]
    calientes = [p for p in calientes if p in res or p == "/api/health"]
    for p in calientes:
        s = stress(cookie, p)
        flag = "✅" if s["err"] == 0 and s["p95"] < 3000 else "⚠️"
        print(f"    {flag} {p}")
        print(f"        ok {s['ok']}/{s['n']} · err {s['err']} · p50 {s['p50']}ms · "
              f"p95 {s['p95']}ms · {s['rps']} req/s")

    live = c.get("LIVE", 0)
    testeable = n - c.get("NECESITA_PARAMS", 0) - c.get("GUARDADO", 0) - c.get("404", 0)
    print("\n════ VEREDICTO ════")
    print(f"De {n} GET sin params: {live} LIVE con datos · {c.get('VACIO_dormant',0)} dormant · "
          f"{len(rotos)} ROTOS.")
    if rotos:
        print(f"🔴 Hay {len(rotos)} endpoints con error de servidor — NO es 100%. Lista arriba.")
    else:
        print("✅ CERO endpoints con error de servidor en el barrido de lecturas.")
    return {"rotos": rotos, "counter": dict(c), "n": n}


if __name__ == "__main__":
    main()
