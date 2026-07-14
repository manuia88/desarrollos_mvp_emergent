"""MATRIZ HISTÓRICA — cero pérdida a través del TIEMPO (complemento de matriz_trazabilidad).

La matriz de Fase E probó el crawl reciente (24 páginas post-consolidación). Esta prueba va más
atrás: reconstruye TODAS las versiones del sidebar desde git (el pico fue 88 rutas), toma la
UNIÓN histórica (toda ruta que ALGUNA VEZ estuvo en el sidebar) y verifica que cada una tenga
casa HOY: ruta directa viva, o redirect vivo a su hub nuevo.

Hallazgo congelado (2026-07-14): unión histórica = 105 rutas → 25 directas + 74 redirects = 99
con casa. Las 6 restantes (ai-usage, analytics, audits, config, ie-engine, users, era Emergent
02-may) NUNCA tuvieron <Route> en App.js en toda la historia — links fantasma sin página detrás.
Cero funcionalidad perdida. Corre: python tools/matriz_historica.py (necesita git).
"""
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
NAV = "frontend/src/config/navByRole.js"
# Fantasmas verificados: aparecieron en el nav era-Emergent pero JAMÁS existieron como Route.
FANTASMAS_VERIFICADOS = {
    "/superadmin/ai-usage", "/superadmin/analytics", "/superadmin/audits",
    "/superadmin/config", "/superadmin/ie-engine", "/superadmin/users",
}


def _sh(*cmd):
    return subprocess.run(cmd, capture_output=True, text=True, cwd=ROOT).stdout


def union_historica():
    commits = _sh("git", "log", "--format=%h %ad", "--date=short", "--follow", "--", NAV).splitlines()
    union, pico = {}, (0, None, None)
    for line in commits:
        c, fecha = line.split()
        src = _sh("git", "show", f"{c}:{NAV}")
        rutas = set(re.findall(r"/superadmin/[a-z0-9-]+", src))
        for r in rutas:
            union.setdefault(r, fecha)
        if len(rutas) > pico[0]:
            pico = (len(rutas), c, fecha)
    return union, pico


def clasificar_hoy(union):
    app = open(os.path.join(ROOT, "frontend/src/App.js")).read()
    directas = set(re.findall(r'path="(/superadmin/[a-z0-9-]+)"', app))
    redirects = dict(re.findall(r'path="(/superadmin/[a-z0-9-]+)"\s+element=\{<Navigate to="([^"]+)"', app))
    out = {"directa": [], "redirect": [], "fantasma": [], "sin_casa": []}
    for r in sorted(union):
        if r in redirects:
            out["redirect"].append((r, redirects[r]))
        elif r in directas or any(d.startswith(r + "/") or r.startswith(d) for d in directas):
            out["directa"].append(r)
        elif r in FANTASMAS_VERIFICADOS:
            out["fantasma"].append(r)
        else:
            out["sin_casa"].append(r)
    return out


def nunca_fue_route(ruta):
    """True si la ruta JAMÁS apareció en App.js en toda la historia (link fantasma).
    Se busca con la comilla de cierre para no confundir con rutas que la contienen como
    prefijo (ej. ie-engine vs ie-engine-sources — falso positivo cazado en la auditoría)."""
    return _sh("git", "log", "--all", "--format=%h", "-S", f'{ruta}"',
               "--", "frontend/src/App.js").strip() == ""


def main():
    union, pico = union_historica()
    print(f"PICO histórico del sidebar: {pico[0]} rutas ({pico[1]} · {pico[2]})")
    print(f"UNIÓN histórica: {len(union)} rutas que alguna vez estuvieron en el sidebar\n")
    cls = clasificar_hoy(union)
    print(f"  ✅ directa viva hoy:            {len(cls['directa'])}")
    print(f"  ↪️  redirect vivo a hub nuevo:  {len(cls['redirect'])}")
    print(f"  👻 fantasma (nunca fue página): {len(cls['fantasma'])}")
    for r in cls["fantasma"]:
        estado = "verificado: jamás tuvo Route" if nunca_fue_route(r) else "⚠ SÍ fue Route alguna vez"
        print(f"       {r} — {estado}")
    print(f"  🔴 SIN CASA (pérdida real):     {len(cls['sin_casa'])}")
    for r in cls["sin_casa"]:
        print(f"       {r}")
    if not cls["sin_casa"]:
        print("\n✅ CERO PÉRDIDA HISTÓRICA: toda ruta que alguna vez existió como página tiene casa hoy.")
    return cls


if __name__ == "__main__":
    r = main()
    sys.exit(1 if r["sin_casa"] else 0)
