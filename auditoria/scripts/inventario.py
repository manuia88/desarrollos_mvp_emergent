#!/usr/bin/env python3
"""FASE 0 — Inventarios de la auditoría forense DMX (re-ejecutable).

Genera (en auditoria/):
  COBERTURA.md      checklist maestro de TODOS los .py backend + .js/.jsx frontend con LOC
  ENDPOINTS.csv     cada @router.<método> con ruta resuelta (prefijo APIRouter + include_router), Depends, archivo:línea
  MOTORES.csv       engines + crons + agent_workforce: importado_por(n), expuesto/cron, estado preliminar
  MAPA_E2E.csv      semilla: llamadas fetch/axios del frontend con URL y archivo
  COLECCIONES.csv   colecciones Mongo → archivos que las leen/escriben
  ENV_VARS.csv      env vars usadas (backend+frontend) vs .env.example

Determinista y honesto: lo que no puede resolver lo marca (p.ej. prefijo dinámico → '?').
"""
import csv, os, re
from collections import defaultdict
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
AUD = os.path.join(ROOT, "auditoria")
HOY = date.today().isoformat()

SKIP_DIRS = {"node_modules", ".git", ".venv", "venv", "__pycache__", "build", "dist", ".playwright-mcp"}


def walk_files(base, exts):
    out = []
    for dp, dns, fns in os.walk(os.path.join(ROOT, base)):
        dns[:] = [d for d in dns if d not in SKIP_DIRS]
        for fn in fns:
            if any(fn.endswith(e) for e in exts):
                p = os.path.join(dp, fn)
                rel = os.path.relpath(p, ROOT)
                try:
                    with open(p, encoding="utf-8", errors="replace") as f:
                        loc = sum(1 for _ in f)
                except OSError:
                    loc = -1
                out.append((rel, loc))
    return sorted(out)


# ── 0.1 COBERTURA.md ─────────────────────────────────────────────────────────
def gen_cobertura(py_files, js_files):
    path = os.path.join(AUD, "COBERTURA.md")
    existing = {}
    if os.path.exists(path):  # preservar marcas de sesiones anteriores
        for line in open(path, encoding="utf-8"):
            m = re.match(r"\|\s*`([^`]+)`\s*\|\s*(\d+|-)\s*\|\s*([^|]+)\|\s*([^|]*)\|\s*([^|]*)\|", line)
            if m and m.group(3).strip() not in ("pendiente", "estado"):
                existing[m.group(1)] = (m.group(3).strip(), m.group(4).strip(), m.group(5).strip())
    with open(path, "w", encoding="utf-8") as f:
        f.write(f"# COBERTURA — checklist maestro (generado {HOY}, marcas preservadas)\n\n")
        f.write("Estados: `pendiente` | `auditado` | `n-a` (generado/asset). Nada cuenta como auditado sin fecha+batch.\n\n")
        for title, files in (("Backend (.py)", py_files), ("Frontend (.js/.jsx)", js_files)):
            done = sum(1 for r, _ in files if existing.get(r, ("pendiente",))[0] == "auditado")
            f.write(f"## {title} — {len(files)} archivos · auditados: {done} ({done*100//max(len(files),1)}%)\n\n")
            f.write("| archivo | LOC | estado | fecha | batch |\n|---|---|---|---|---|\n")
            for rel, loc in files:
                st, fe, ba = existing.get(rel, ("pendiente", "", ""))
                f.write(f"| `{rel}` | {loc} | {st} | {fe} | {ba} |\n")
            f.write("\n")
    return len(py_files), len(js_files)


# ── 0.2 ENDPOINTS.csv ────────────────────────────────────────────────────────
def gen_endpoints():
    # prefijos de include_router en server.py: include_router(x_router, prefix="/api/foo")
    server = open(os.path.join(ROOT, "backend/server.py"), encoding="utf-8", errors="replace").read()
    inc_prefix = {}
    for m in re.finditer(r"include_router\(\s*([\w.]+)\s*(?:,\s*prefix\s*=\s*[\"']([^\"']*)[\"'])?", server):
        inc_prefix[m.group(1).split(".")[-1]] = m.group(2) or ""
    # imports en server.py: from routes.foo import router as bar_router → módulo→alias
    mod_alias = {}
    for m in re.finditer(r"from\s+routes\.(\w+)\s+import\s+router(?:\s+as\s+(\w+))?", server):
        mod_alias[m.group(1)] = m.group(2) or "router"

    rows = []
    files = [os.path.join(ROOT, "backend/server.py")] + [
        os.path.join(ROOT, "backend/routes", f) for f in sorted(os.listdir(os.path.join(ROOT, "backend/routes")))
        if f.endswith(".py")]
    # también engines con APIRouter propio (p.ej. rag_engine public_router)
    for f in sorted(os.listdir(os.path.join(ROOT, "backend"))):
        if f.endswith(".py") and f not in ("server.py",):
            p = os.path.join(ROOT, "backend", f)
            try:
                head = open(p, encoding="utf-8", errors="replace").read(4000)
            except OSError:
                continue
            if "APIRouter(" in head:
                files.append(p)

    for path in files:
        rel = os.path.relpath(path, ROOT)
        try:
            src = open(path, encoding="utf-8", errors="replace").read()
        except OSError:
            continue
        # prefijo del APIRouter local (si hay varios routers toma nota por variable)
        router_prefix = {}
        for m in re.finditer(r"(\w+)\s*=\s*APIRouter\(([^)]*)\)", src):
            pm = re.search(r"prefix\s*=\s*[\"']([^\"']*)[\"']", m.group(2))
            router_prefix[m.group(1)] = pm.group(1) if pm else ""
        mod = os.path.splitext(os.path.basename(path))[0]
        alias = mod_alias.get(mod, "")
        inc = inc_prefix.get(f"{mod}_router", inc_prefix.get(alias, inc_prefix.get("router", "")))
        for m in re.finditer(r"@(\w+)\.(get|post|put|delete|patch|websocket)\(\s*[\"']([^\"']+)[\"']([^)]*)\)", src):
            var, method, route = m.group(1), m.group(2).upper(), m.group(3)
            line = src[:m.start()].count("\n") + 1
            # Depends en la firma de la función siguiente (ventana de 800 chars)
            window = src[m.end():m.end() + 800]
            deps = ",".join(sorted(set(re.findall(r"Depends\((\w+)", window)))) or ""
            has_req = "request: Request" in window or "request:Request" in window
            full = (router_prefix.get(var, "") or "") + route
            rows.append({"ruta": (inc or "") + full, "metodo": method, "archivo": rel, "linea": line,
                         "depends": deps, "usa_request": "sí" if has_req else "no",
                         "auth": "", "tenant_check": "", "rate_limit": "", "roles": "", "caller_frontend": "",
                         "auditado": ""})
    with open(os.path.join(AUD, "ENDPOINTS.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader(); w.writerows(rows)
    return len(rows)


# ── 0.3 MOTORES.csv ──────────────────────────────────────────────────────────
def gen_motores(py_files):
    all_src = {}
    for rel, _ in py_files:
        try:
            all_src[rel] = open(os.path.join(ROOT, rel), encoding="utf-8", errors="replace").read()
        except OSError:
            all_src[rel] = ""
    engines = [r for r, _ in py_files if (re.search(r"backend/(?:[\w]*engine[\w]*|[\w]*cron[\w]*)\.py$", r)
               or "/agent_workforce/" in r or "/conversation_channels/" in r or "/cerebro/" in r)
               and not r.endswith("__init__.py")]  # los __init__ son marcadores de paquete, no motores
    rows = []
    for eng in sorted(set(engines)):
        mod = os.path.splitext(os.path.basename(eng))[0]
        # importadores: import directo, `from X.mod import`, `import X.mod`, o el nombre como STRING
        # (carga dinámica por registry/hub, p.ej. engines_hub itera nombres de módulo en un tuple).
        importers = [r for r, s in all_src.items()
                     if r != eng and re.search(
                         rf"(?:from\s+(?:\w+\.)*{re.escape(mod)}\s+import|import\s+(?:\w+\.)*{re.escape(mod)}\b"
                         rf"|[\"']{re.escape(mod)}[\"'])", s)]
        in_routes = [r for r in importers if "/routes/" in r or r.endswith("server.py")]
        in_cron = [r for r in importers if "cron" in r or "scheduler" in r.lower()]
        src = all_src.get(eng, "")
        has_router = "APIRouter(" in src
        estado = "ACTIVO" if (in_routes or in_cron or has_router) else ("IMPORTADO" if importers else "HUÉRFANO?")
        rows.append({"engine": eng, "importado_por_n": len(importers),
                     "importado_por": ";".join(sorted(importers)[:6]),
                     "expuesto_en_endpoint": "router propio" if has_router else (";".join(sorted(in_routes)[:3]) or "no"),
                     "agendado_en_cron": ";".join(sorted(in_cron)[:3]) or "no",
                     "estado_preliminar": estado, "auditado": ""})
    with open(os.path.join(AUD, "MOTORES.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader(); w.writerows(rows)
    return len(rows), sum(1 for r in rows if r["estado_preliminar"] == "HUÉRFANO?")


# ── 0.4 MAPA_E2E.csv (semilla frontend) ──────────────────────────────────────
def gen_e2e(js_files):
    rows = []
    pat = re.compile(r"""(?:fetch|axios(?:\.\w+)?)\s*\(\s*[`"']([^`"']+)[`"']""")
    for rel, _ in js_files:
        try:
            src = open(os.path.join(ROOT, rel), encoding="utf-8", errors="replace").read()
        except OSError:
            continue
        for m in pat.finditer(src):
            url = m.group(1)
            if "/api/" not in url and not url.startswith("/api"):
                continue
            line = src[:m.start()].count("\n") + 1
            # método: axios.post → POST; fetch(..., {method:'X'}) en ventana
            mm = re.search(r"axios\.(\w+)", m.group(0))
            method = (mm.group(1).upper() if mm else "")
            if not method:
                w2 = src[m.end():m.end() + 200]
                m2 = re.search(r"method\s*:\s*[\"'](\w+)[\"']", w2)
                method = m2.group(1).upper() if m2 else "GET"
            # normaliza template literals ${x} → {var}
            norm = re.sub(r"\$\{[^}]+\}", "{var}", url)
            rows.append({"frontend_archivo": rel, "linea": line, "metodo": method, "url": norm,
                         "endpoint_existe": "", "schema_ok": "", "estado": "", "auditado": ""})
    with open(os.path.join(AUD, "MAPA_E2E.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader(); w.writerows(rows)
    return len(rows)


# ── 0.5 COLECCIONES.csv ──────────────────────────────────────────────────────
def gen_colecciones(py_files):
    colmap = defaultdict(set)
    pat = re.compile(r"\bdb\.([a-z][a-z0-9_]{2,})\.(find|find_one|insert|update|delete|aggregate|count|replace|bulk|distinct|estimated)")
    for rel, _ in py_files:
        try:
            src = open(os.path.join(ROOT, rel), encoding="utf-8", errors="replace").read()
        except OSError:
            continue
        for m in pat.finditer(src):
            colmap[m.group(1)].add(rel)
    rows = [{"coleccion": c, "n_archivos": len(fs), "archivos": ";".join(sorted(fs)[:8])}
            for c, fs in sorted(colmap.items(), key=lambda kv: -len(kv[1]))]
    with open(os.path.join(AUD, "COLECCIONES.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["coleccion", "n_archivos", "archivos"])
        w.writeheader(); w.writerows(rows)
    return len(rows)


# ── 0.6 ENV_VARS.csv ─────────────────────────────────────────────────────────
def gen_envvars(py_files, js_files):
    used = defaultdict(set)
    for rel, _ in py_files:
        try:
            src = open(os.path.join(ROOT, rel), encoding="utf-8", errors="replace").read()
        except OSError:
            continue
        for m in re.finditer(r"(?:os\.environ(?:\.get)?[\[(]|getenv\()\s*[\"'](\w+)[\"']", src):
            used[m.group(1)].add(rel)
    for rel, _ in js_files:
        try:
            src = open(os.path.join(ROOT, rel), encoding="utf-8", errors="replace").read()
        except OSError:
            continue
        for m in re.finditer(r"process\.env\.(\w+)", src):
            used[m.group(1)].add(rel)
    documented = set()
    for envf in ("backend/.env.example", "frontend/.env.example", ".env.example"):
        p = os.path.join(ROOT, envf)
        if os.path.exists(p):
            for line in open(p, encoding="utf-8", errors="replace"):
                m = re.match(r"([A-Z][A-Z0-9_]+)\s*=", line)
                if m:
                    documented.add(m.group(1))
    rows = [{"var": v, "usada_en_n": len(fs), "documentada_env_example": "sí" if v in documented else "NO",
             "ejemplo_archivo": sorted(fs)[0]} for v, fs in sorted(used.items())]
    with open(os.path.join(AUD, "ENV_VARS.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["var", "usada_en_n", "documentada_env_example", "ejemplo_archivo"])
        w.writeheader(); w.writerows(rows)
    undoc = sum(1 for r in rows if r["documentada_env_example"] == "NO")
    return len(rows), undoc


if __name__ == "__main__":
    py = walk_files("backend", (".py",)) + walk_files("scripts", (".py",))
    py = [(r, l) for r, l in py if "/.venv/" not in r]
    js = walk_files("frontend/src", (".js", ".jsx"))
    npy, njs = gen_cobertura(py, js)
    nep = gen_endpoints()
    nmot, nhuer = gen_motores(py)
    ne2e = gen_e2e(js)
    ncol = gen_colecciones(py)
    nenv, nundoc = gen_envvars(py, js)
    print(f"COBERTURA: {npy} py + {njs} js")
    print(f"ENDPOINTS: {nep} endpoints")
    print(f"MOTORES: {nmot} (huérfanos preliminares: {nhuer})")
    print(f"MAPA_E2E semilla: {ne2e} llamadas /api del frontend")
    print(f"COLECCIONES: {ncol} colecciones Mongo")
    print(f"ENV_VARS: {nenv} usadas ({nundoc} NO documentadas en .env.example)")
