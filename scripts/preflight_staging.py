#!/usr/bin/env python3
"""
preflight_staging.py — Verificación go/no-go de UN comando contra una URL desplegada.

Prueba DESDE AFUERA que los fixes de seguridad de las Tandas 1-18 se sostienen en el
deploy (staging o prod). No necesita 2 tenants ni tokens: solo verifica lo observable
sin credenciales (headers, rate-limits, auth obligatoria, webhook firmado).

Uso:
    python scripts/preflight_staging.py https://staging.desarrollosmx.io
    python scripts/preflight_staging.py            # default http://localhost:8000

⚠️ Dispara intentos de login fallidos y ráfagas → CORRER CONTRA STAGING (o localhost),
   NO contra producción con tráfico real (deja una IP/email bloqueados ~5 min).

Cero dependencias (stdlib urllib). Salida: tabla PASS/FAIL/WARN + exit code (0 = todo OK).
"""
import json
import sys
import time
import urllib.request
import urllib.error

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000").rstrip("/")
IS_PROD_URL = BASE.startswith("https://") and "localhost" not in BASE and "127.0.0.1" not in BASE

results = []  # (nombre, estado, detalle)


def _req(method, path, *, body=None, headers=None, timeout=10):
    url = f"{BASE}{path}"
    data = None
    h = {"User-Agent": "dmx-preflight/1.0"}
    if body is not None:
        data = json.dumps(body).encode()
        h["Content-Type"] = "application/json"
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers or {}), (e.read() if hasattr(e, "read") else b"")
    except Exception as e:
        return None, {}, str(e).encode()


def check(name, fn):
    try:
        estado, detalle = fn()
    except Exception as e:
        estado, detalle = "ERROR", str(e)[:80]
    results.append((name, estado, detalle))


# ── 1 · Cabeceras de seguridad (P1.13 / P2.14) ──
def c_headers():
    st, h, _ = _req("GET", "/api/avm-public/colonias/top?limit=3")
    if st is None:
        return "ERROR", "no respondió (¿URL correcta? ¿backend arriba?)"
    hl = {k.lower(): v for k, v in h.items()}
    faltan = [x for x in ("x-content-type-options", "x-frame-options", "referrer-policy") if x not in hl]
    if faltan:
        return "FAIL", f"faltan: {', '.join(faltan)}"
    return "PASS", "nosniff + X-Frame-Options + Referrer-Policy presentes"


# ── 2 · CSP en respuestas JSON (P1.13) ──
def c_csp():
    st, h, _ = _req("GET", "/api/avm-public/colonias/top?limit=3")
    hl = {k.lower(): v for k, v in h.items()}
    if "content-security-policy" in hl:
        return "PASS", hl["content-security-policy"][:48]
    return "WARN", "sin CSP en JSON (revisa middleware security_headers)"


# ── 3 · HSTS en prod (P1.13) ──
def c_hsts():
    st, h, _ = _req("GET", "/api/avm-public/colonias/top?limit=3")
    hl = {k.lower(): v for k, v in h.items()}
    if not IS_PROD_URL:
        return "SKIP", "HSTS solo aplica en prod (https)"
    return ("PASS", "Strict-Transport-Security presente") if "strict-transport-security" in hl \
        else ("FAIL", "falta HSTS en prod")


# ── 4 · Rate-limit avm-public (P2.9) ──
def c_ratelimit_avm():
    got429 = False
    for _ in range(35):  # límite 30/60s
        st, _, _ = _req("GET", "/api/avm-public/colonias/top?limit=1", timeout=5)
        if st == 429:
            got429 = True
            break
    return ("PASS", "429 tras la ráfaga") if got429 else ("FAIL", "nunca devolvió 429 (sin rate-limit)")


# ── 5 · Freno a fuerza bruta en login (P1.9) ──
def c_login_bruteforce():
    email = f"preflight_{int(time.time())}@example.invalid"
    got429 = False
    for _ in range(12):  # bloquea tras 8 fallos
        st, _, _ = _req("POST", "/api/auth/login", body={"email": email, "password": "x"}, timeout=5)
        if st == 429:
            got429 = True
            break
    return ("PASS", "429 tras intentos fallidos") if got429 else ("FAIL", "login sin freno a fuerza bruta")


# ── 6 · Auth obligatoria en endpoint protegido (P0.1 / auth) ──
def c_auth_required():
    st, _, _ = _req("GET", "/api/asesor/contactos")
    return ("PASS", "401 sin sesión") if st in (401, 403) else ("FAIL", f"esperaba 401/403, dio {st}")


# ── 7 · Endpoint dev con datos requiere auth (IDOR · P0.1) ──
def c_idor_auth():
    st, _, _ = _req("GET", "/api/dev/grafo-comprador?colonia_id=polanco")
    return ("PASS", "401/403 sin sesión") if st in (401, 403) else ("WARN", f"dio {st} (revisa que exija sesión)")


# ── 8 · Stripe webhook rechaza sin firma (P0.6) ──
def c_stripe_webhook():
    st, _, _ = _req("POST", "/api/stripe/webhook", body={"fake": "event"})
    if st == 400:
        return "PASS", "400 sin firma"
    if not IS_PROD_URL:
        return "SKIP", f"en dev test-mode puede pasar (dio {st}); valida en prod"
    return ("FAIL", f"aceptó webhook sin firma en prod (dio {st})") if st == 200 else ("WARN", f"dio {st}")


for nombre, fn in [
    ("Cabeceras de seguridad (P1.13/P2.14)", c_headers),
    ("CSP en JSON (P1.13)", c_csp),
    ("HSTS en prod (P1.13)", c_hsts),
    ("Rate-limit avm-public (P2.9)", c_ratelimit_avm),
    ("Freno fuerza bruta login (P1.9)", c_login_bruteforce),
    ("Auth obligatoria /contactos (P0.1)", c_auth_required),
    ("Auth en grafo dev (IDOR · P0.1)", c_idor_auth),
    ("Stripe webhook firmado (P0.6)", c_stripe_webhook),
]:
    check(nombre, fn)

# ── Reporte ──
ICON = {"PASS": "✅", "FAIL": "❌", "WARN": "⚠️ ", "SKIP": "➖", "ERROR": "💥"}
print(f"\n  PRE-FLIGHT DMX · {BASE}  ({'PROD' if IS_PROD_URL else 'dev/staging'})\n" + "  " + "─" * 64)
for nombre, estado, detalle in results:
    print(f"  {ICON.get(estado, '?')} {estado:5s} · {nombre:38s} {detalle}")
fails = [r for r in results if r[1] in ("FAIL", "ERROR")]
warns = [r for r in results if r[1] == "WARN"]
print("  " + "─" * 64)
print(f"  {len(results)-len(fails)-len(warns)} OK · {len(warns)} warn · {len(fails)} fail")
if fails:
    print("\n  ❌ NO-GO: hay verificaciones en rojo. Revisa antes de prender.\n")
    sys.exit(1)
print("\n  ✅ GO: las verificaciones de seguridad externas pasaron.\n")
sys.exit(0)
