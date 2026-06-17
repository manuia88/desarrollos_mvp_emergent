"""audit:routes — red de seguridad estructural del conteo de rutas.

Snapshot del número total de rutas registradas. Si BAJA respecto al baseline, FALLA:
significa que un router se dejó de registrar (riesgo directo del candado 6 — cortar server.py —
donde un import circular o un orden de registro roto puede dejar endpoints fuera EN SILENCIO,
sin que nada lo detecte porque no hay tests E2E sobre las 244 rutas). Subir rutas es OK.

Uso:
    python audit_routes.py            # falla si el conteo bajó vs baseline
    python audit_routes.py --update   # regenera el baseline (tras un cambio intencional)
"""
from __future__ import annotations

import json
import os
import sys

from _app_routes import load_routes

HERE = os.path.dirname(__file__)
BASELINE = os.path.join(HERE, "routes_baseline.json")


def main():
    routes = load_routes()
    # cuenta rutas únicas por (método, path) — ignora el ruido de getsource
    keys = sorted({f"{r.method} {r.path}" for r in routes})
    n = len(keys)

    if "--update" in sys.argv:
        json.dump({"count": n}, open(BASELINE, "w"), indent=2)
        print(f"[audit:routes] baseline actualizado · {n} rutas")
        return 0

    if not os.path.exists(BASELINE):
        print("[audit:routes] sin baseline · corre --update primero")
        return 0
    base = json.load(open(BASELINE)).get("count", 0)
    print(f"[audit:routes] rutas registradas: {n} · baseline: {base}")
    if n < base:
        print(f"[audit:routes] FALLA: el conteo BAJÓ {base - n} rutas. Un router dejó de "
              f"registrarse (¿import circular / orden de registro roto al cortar server.py?). "
              f"Revisa qué endpoints faltan antes de mergear.")
        return 1
    if n > base:
        print(f"[audit:routes] +{n - base} rutas nuevas (OK). Corre --update para fijar el nuevo piso.")
    else:
        print("[audit:routes] OK · conteo estable.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
