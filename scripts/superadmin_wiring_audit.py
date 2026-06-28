#!/usr/bin/env python3
"""Auditoría SUPERADMIN — backend = OpenAPI del app corriendo (verdad), frontend = llamadas reconstruidas.
Cruce: cableados / huérfanos (back sin front) / muertos (front sin back) / páginas apagadas (sin ruta o nav)."""
import os
import re
import glob
import json

ROOT = "/Users/manuelacosta/Developer/desarrollos_mvp_emergent"
BE, FE = os.path.join(ROOT, "backend"), os.path.join(ROOT, "frontend", "src")
_QVARS = ("qs", "query", "params", "q", "queryString", "searchParams")


def norm(path):
    path = re.sub(r"/\$\{[^}]*\}?", "/*", path)   # /${id} segmento → /*
    path = re.sub(r"/\{[^}]*\}", "/*", path)       # /{id} openapi → /*
    path = re.split(r"\$\{|\?", path)[0]           # ${qs} pegado (query) o ? → corta ahí
    path = re.sub(r":[A-Za-z_]\w*", "*", path)
    path = re.sub(r"[`'\";).,]+$", "", path).rstrip("/")
    path = re.sub(r"\*+", "*", path)
    return path


# ── BACKEND: OpenAPI (verdad) + mapa path→archivo (regex best-effort para atribución) ──
oa = json.load(open("/tmp/openapi.json"))["paths"]
backend = {norm(k): k for k in oa if "/api/superadmin" in k}
file_map = {}
for f in glob.glob(os.path.join(BE, "routes", "*.py")):
    src = open(f).read()
    prefixes = re.findall(r"APIRouter\(\s*prefix\s*=\s*[\"']([^\"']+)[\"']", src) or [""]
    for m in re.finditer(r"@\w+\.\w+\(\s*[\"']([^\"']+)[\"']", src):
        p = m.group(1)
        for full in ([p] if p.startswith("/api/") else [pre + p for pre in prefixes]):
            if "/api/superadmin" in full:
                file_map.setdefault(norm(full), os.path.basename(f))

# ── FRONTEND: literales + BASE-relativos ──
fe_calls = {}


def add(np, f):
    np = norm(np)
    if np and np != "/api/superadmin":
        fe_calls.setdefault(np, set()).add(os.path.relpath(f, FE))


for f in glob.glob(os.path.join(FE, "**", "*.js"), recursive=True):
    src = open(f).read()
    for m in re.finditer(r"/api/superadmin/[A-Za-z0-9_/${}().\-]+", src):
        add(m.group(0), f)
    bases = {}
    for m in re.finditer(r"const\s+(\w+)\s*=\s*[`'\"][^`'\"]*?(/api/superadmin/[\w/\-]+)[`'\"]", src):
        bases[m.group(1)] = m.group(2)
    for var, basep in bases.items():
        for m in re.finditer(r"\$\{" + var + r"\}([/A-Za-z0-9_${}().\-]*)", src):
            if m.group(1).strip("/"):  # solo si hay sub-path (no el prefijo pelado)
                add(basep + m.group(1), f)
        for m in re.finditer(var + r"\s*\+\s*[`'\"]([/A-Za-z0-9_${}().\-]*)", src):
            if m.group(1).strip("/"):
                add(basep + m.group(1), f)


def match(a, bset):
    if a in bset:
        return True
    for b in bset:
        pa, pb = a.split("/"), b.split("/")
        if len(pa) == len(pb) and all(x == y or "*" in (x, y) for x, y in zip(pa, pb)):
            return True
    return False


be, fe = set(backend), set(fe_calls)


def covered(p, bset):  # ¿match exacto/wildcard, o p es prefijo (BASE) de un endpoint real?
    return match(p, bset) or any(b == p or b.startswith(p + "/") for b in bset)


orphan = sorted(p for p in be if not match(p, fe))
dead = sorted(p for p in fe if not covered(p, be))
wired = sorted(p for p in be if match(p, fe))

# páginas / rutas / nav
pages = {os.path.basename(p)[:-3] for p in glob.glob(os.path.join(FE, "pages", "superadmin", "*.js"))}
appjs = open(os.path.join(FE, "App.js")).read()
routed = set(re.findall(r"import\('\./pages/superadmin/(\w+)'\)", appjs))
routed_paths = set(re.findall(r'path="(/superadmin/[\w-]+)"', appjs))
nav_routes = set(re.findall(r"to:\s*'(/superadmin/[\w-]+)'", open(os.path.join(FE, "config", "navByRole.js")).read()))

print("╔═══ AUDITORÍA SUPERADMIN (openapi=verdad) ═══╗")
print(f"  Backend endpoints     : {len(be)}")
print(f"  Frontend llamadas     : {len(fe)}")
print(f"  CABLEADOS             : {len(wired)}")
print(f"  🔶 HUÉRFANOS back     : {len(orphan)}  (existen en back, ningún front los llama)")
print(f"  🔴 MUERTOS front      : {len(dead)}  (front llama, no existe en back)")
print(f"  Páginas archivo       : {len(pages)} · ruteadas {len(routed)} · nav {len(nav_routes)}")
print(f"  🟡 páginas sin ruta   : {len(pages - routed)}")
print(f"  🟡 ruteadas sin nav   : {len(routed_paths - nav_routes)}")

# huérfanos agrupados por archivo backend
from collections import defaultdict
byfile = defaultdict(list)
for p in orphan:
    byfile[file_map.get(p, "?desconocido")].append(p)
print("\n── 🔶 HUÉRFANOS por archivo backend (top) ──")
for fn, ps in sorted(byfile.items(), key=lambda x: -len(x[1]))[:18]:
    print(f"  {fn:34} {len(ps):>2}  ej: {ps[0].replace('/api/superadmin/','')}")

print("\n── 🔴 MUERTOS (muestra; revisar si es bug de mi parser o real) ──")
for p in dead[:25]:
    print(f"  {p:52} ← {sorted(fe_calls[p])[0]}")

print("\n── 🟡 PÁGINAS SIN RUTA (archivo existe, App.js no la importa) ──")
for pg in sorted(pages - routed):
    print(f"  {pg}")

json.dump({"orphan": orphan, "dead": dead, "wired": wired, "byfile": {k: v for k, v in byfile.items()},
           "pages_unrouted": sorted(pages - routed), "routed_no_nav": sorted(routed_paths - nav_routes)},
          open("/tmp/sa_audit.json", "w"), indent=1)
print("\n→ detalle en /tmp/sa_audit.json")
