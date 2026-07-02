#!/usr/bin/env python3
"""[AUD-020] Enriquece ENDPOINTS.csv con detección de auth REAL (in-body, no solo Depends).

Este backend enforza auth dentro del cuerpo (`await require_auth(request)`, `get_current_user`,
`_auth`, `_require_*`, `verify_api_key`, `require_cron`, etc.), no solo con `Depends()`. La columna
`depends` original marcaba 1,498/1,539 como "sin auth" — falso. Este script lee el cuerpo de cada
endpoint y clasifica auth con honestidad: `depends` / `in-body` / `cron/webhook` / `PÚBLICO?`.

El set `PÚBLICO?` (sin ninguna señal de auth) es la lista real a revisar por IDOR/exposición.
"""
import csv
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
AUD = os.path.join(ROOT, "auditoria")

AUTH_BODY = re.compile(
    r"require_auth|get_current_user|_require_\w+|\b_auth\w*\(|require_role|require_dev|require_super"
    r"|require_advisor|require_buyer|verify_api_key|public_api_auth|_verified|assert_dev|tenant_filter"
    r"|_current_user|current_user\s*=|require_cron|verify_cron|CRON_SECRET|verify_webhook|verify_signature|construct_event",
    re.I)
AUTH_DEPENDS = re.compile(r"Depends\(")


def _func_body(src: str, start_line: int) -> str:
    """Extrae el cuerpo del endpoint: desde la línea del decorador hasta el próximo
    decorador @router / def a nivel superior (col 0)."""
    lines = src.splitlines()
    i = start_line - 1
    # avanza a la firma def / async def
    while i < len(lines) and not re.match(r"\s*(async\s+)?def\s", lines[i]):
        i += 1
    body = [lines[i]] if i < len(lines) else []
    i += 1
    while i < len(lines):
        ln = lines[i]
        if re.match(r"@\w+\.(get|post|put|delete|patch|websocket)", ln.strip()) or re.match(r"(async\s+)?def\s", ln):
            break
        body.append(ln)
        i += 1
    return "\n".join(body)


def _helper_body(src: str, name: str) -> str:
    """Cuerpo de una función helper `name` definida en el mismo archivo (para seguir delegación)."""
    m = re.search(rf"^\s*(async\s+)?def\s+{re.escape(name)}\s*\(", src, re.M)
    if not m:
        return ""
    return _func_body(src, src[:m.start()].count("\n") + 1)


def classify(path: str, line: int, depends: str) -> str:
    full = os.path.join(ROOT, path)
    try:
        src = open(full, encoding="utf-8", errors="replace").read()
    except OSError:
        return "?"
    body = _func_body(src, int(line))
    if depends.strip() and AUTH_DEPENDS.search(f"Depends({depends})"):
        return "depends"
    if re.search(r"require_cron|verify_cron|CRON_SECRET|verify_webhook|verify_signature|construct_event", body, re.I):
        return "cron/webhook"
    if AUTH_BODY.search(body):
        return "in-body"
    # Seguir UN nivel de delegación: si el endpoint llama a un helper _foo(request), auditar su cuerpo.
    for hm in re.finditer(r"\b(_\w+)\s*\(\s*request\b", body):
        hbody = _helper_body(src, hm.group(1))
        if hbody and AUTH_BODY.search(hbody):
            return "in-body(deleg)"
    if depends.strip():
        return "depends"
    return "PÚBLICO?"


if __name__ == "__main__":
    src_csv = os.path.join(AUD, "ENDPOINTS.csv")
    rows = list(csv.DictReader(open(src_csv, encoding="utf-8")))
    counts = {}
    for r in rows:
        a = classify(r["archivo"], r["linea"], r.get("depends", ""))
        r["auth"] = a
        counts[a] = counts.get(a, 0) + 1
    with open(src_csv, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader(); w.writerows(rows)
    print("auth detectada por endpoint:")
    for k, v in sorted(counts.items(), key=lambda kv: -kv[1]):
        print(f"  {v:>5}  {k}")
    # lista de públicos reales a una vista
    pub = [r for r in rows if r["auth"] == "PÚBLICO?"]
    with open(os.path.join(AUD, "ENDPOINTS_PUBLICOS.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["ruta", "metodo", "archivo", "linea"])
        w.writeheader()
        for r in pub:
            w.writerow({k: r[k] for k in ("ruta", "metodo", "archivo", "linea")})
    print(f"\nENDPOINTS_PUBLICOS.csv: {len(pub)} endpoints sin señal de auth (revisar IDOR/exposición)")
