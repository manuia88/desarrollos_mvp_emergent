#!/usr/bin/env python3
"""Auditoría de cableado de UN portal — reutilizable (marketplace/dev/asesor/superadmin).
Cruza: páginas (archivos) ↔ rutas en App.js ↔ endpoints que llaman ↔ backend real (openapi).
Salida: páginas ruteadas/anidadas/huérfanas · endpoints llamados que existen/no existen · endpoints backend del portal
sin caller (huérfanos). Maneja URLs dinámicas (BASE-const, base(scope), ${qs}) para no inflar falsos positivos.

Uso:  scripts/portal_wiring_audit.py <portal>   (portal ∈ marketplace|dev|asesor|superadmin)
"""
import json
import os
import re
import sys
import glob

ROOT = "/Users/manuelacosta/Developer/desarrollos_mvp_emergent"
FE = os.path.join(ROOT, "frontend", "src")

# Config por portal: carpetas de páginas + prefijos de API que le pertenecen.
PORTALS = {
    "marketplace": {
        "page_dirs": ["", "comprador", "public", "portal", "widgets"],
        "page_files": ["Marketplace", "DevelopmentDetail", "PropertyDetail", "Favoritos", "Barrios", "Mapa",
                       "Inteligencia", "FichaCockpit", "FichaDesarrollo", "AsesoresLanding"],
        "api_prefixes": ["/api/buyer", "/api/developments", "/api/public", "/api/colonias", "/api/favoritos",
                         "/api/marketplace", "/api/zona", "/api/atlax", "/api/comprador", "/api/avm", "/api/simulador",
                         "/api/insights", "/api/intent", "/api/booking", "/api/citas"],
    },
}
_QVARS = ("qs", "query", "params", "q", "queryString")


def norm(p):
    p = re.sub(r"/\$\{[^}]*\}?", "/*", p)
    p = re.sub(r"/\{[^}]*\}", "/*", p)
    p = re.split(r"\$\{|\?", p)[0]
    p = re.sub(r":[A-Za-z_]\w*", "*", p)
    p = re.sub(r"[`'\";).,]+$", "", p).rstrip("/")
    return re.sub(r"\*+", "*", p)


def main():
    portal = sys.argv[1] if len(sys.argv) > 1 else "marketplace"
    cfg = PORTALS[portal]
    prefixes = tuple(cfg["api_prefixes"])

    # ── páginas del portal ──
    pages = {}
    for d in cfg["page_dirs"]:
        base = os.path.join(FE, "pages", d) if d else os.path.join(FE, "pages")
        for f in glob.glob(os.path.join(base, "*.js")):
            nm = os.path.basename(f)[:-3]
            if d == "" and nm not in cfg["page_files"]:
                continue
            pages[nm] = f
    appjs = open(os.path.join(FE, "App.js")).read()
    routed = set(re.findall(r"import\('\./pages/(?:\w+/)?(\w+)'\)", appjs))

    # ── backend endpoints del portal (openapi) ──
    oa = json.load(open("/tmp/openapi.json"))["paths"]
    backend = {norm(k) for k in oa if any(pre in k for pre in prefixes)}

    # ── llamadas de API de cada página + globales del front ──
    fe_calls = {}        # norm -> set(files)
    page_calls = {}      # page -> set(norm)
    for nm, f in pages.items():
        src = open(f).read()
        calls = set()
        for m in re.finditer(r"/api/[A-Za-z0-9_/${}().\-]+", src):
            if any(pre in m.group(0) for pre in prefixes):
                calls.add(norm(m.group(0)))
        page_calls[nm] = calls
    # cualquier archivo del front que llame a estos prefijos (para huérfanos backend)
    for f in glob.glob(os.path.join(FE, "**", "*.js"), recursive=True):
        src = open(f).read()
        for m in re.finditer(r"/api/[A-Za-z0-9_/${}().\-]+", src):
            if any(pre in m.group(0) for pre in prefixes):
                fe_calls.setdefault(norm(m.group(0)), set()).add(os.path.relpath(f, FE))

    def covered(p, bset):
        if p in bset:
            return True
        for b in bset:
            pa, pb = p.split("/"), b.split("/")
            if len(pa) == len(pb) and all(x == y or "*" in (x, y) for x, y in zip(pa, pb)):
                return True
        return any(b == p or b.startswith(p + "/") for b in bset)

    fe = set(fe_calls)
    orphan_back = sorted(p for p in backend if not covered(p, fe))
    # huérfano "real": ni el último segmento aparece en el front
    truly_orphan = []
    import subprocess
    for p in orphan_back:
        segs = [s for s in p.replace("/api/", "").split("/") if s and s != "*"]
        last = segs[-1] if segs else ""
        if last and not subprocess.run(["grep", "-rqE", last, FE]).returncode == 0:
            truly_orphan.append(p)

    routed_pages = {p for p in pages if p in routed}
    nested = {p for p in pages if p not in routed}   # candidato anidado (verificar import)

    print(f"╔═══ AUDITORÍA PORTAL: {portal} ═══╗")
    print(f"  Páginas (archivos)        : {len(pages)}")
    print(f"  Ruteadas en App.js        : {len(routed_pages)}")
    print(f"  No ruteadas (anidadas?)   : {len(nested)}")
    print(f"  Endpoints backend (portal): {len(backend)}")
    print(f"  Endpoints sin caller      : {len(orphan_back)}  ·  HUÉRFANOS REALES: {len(truly_orphan)}")
    print(f"\n── páginas NO ruteadas (verificar si anidadas o muertas) ──")
    for p in sorted(nested):
        print(f"    {p}")
    print(f"\n── endpoints HUÉRFANOS REALES (backend del portal sin rastro en front) ──")
    for p in truly_orphan:
        print(f"    {p}")
    print(f"\n── páginas sin NINGUNA llamada API del portal (¿estáticas/stub?) ──")
    for p in sorted(pages):
        if not page_calls.get(p):
            print(f"    {p}")

    json.dump({"pages": sorted(pages), "routed": sorted(routed_pages), "nested": sorted(nested),
               "truly_orphan": truly_orphan, "page_calls": {k: sorted(v) for k, v in page_calls.items()}},
              open(f"/tmp/portal_{portal}.json", "w"), indent=1)
    print(f"\n→ /tmp/portal_{portal}.json")


if __name__ == "__main__":
    main()
