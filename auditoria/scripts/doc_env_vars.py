#!/usr/bin/env python3
"""[AUD-001] Documenta las env vars usadas pero ausentes de .env.example.

Deploy a ciegas = riesgo. Este script toma ENV_VARS.csv (undocumented) y las AÑADE al .env.example
correcto (REACT_APP_* → frontend; resto → backend), agrupadas por prefijo, cada una con un comentario
`# usada en <archivo>` para trazabilidad. No pisa lo ya documentado: solo agrega un bloque al final.
Idempotente: si el bloque ya existe, lo regenera.
"""
import csv
import os
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MARK = "# ─── [AUD-001] Vars detectadas por la auditoría (documentar valor real antes de prod) ───"


def load_undoc():
    rows = [r for r in csv.DictReader(open(os.path.join(ROOT, "auditoria/ENV_VARS.csv")))
            if r["documentada_env_example"] == "NO"]
    front, back = defaultdict(list), defaultdict(list)
    for r in rows:
        (front if r["var"].startswith("REACT_APP_") else back)[r["var"].split("_")[0]].append(
            (r["var"], r["ejemplo_archivo"]))
    return front, back


def render(groups):
    out = ["", MARK, ""]
    for prefix in sorted(groups):
        out.append(f"# {prefix}*")
        for var, ejemplo in sorted(groups[prefix]):
            out.append(f"{var}=            # usada en {ejemplo}")
        out.append("")
    return "\n".join(out)


def apply(path, groups):
    if not groups:
        return 0
    existing = open(path, encoding="utf-8").read() if os.path.exists(path) else ""
    # recorta bloque previo del marcador para regenerar idempotente
    if MARK in existing:
        existing = existing[:existing.index(MARK)].rstrip() + "\n"
    n = sum(len(v) for v in groups.values())
    open(path, "w", encoding="utf-8").write(existing.rstrip() + "\n" + render(groups))
    return n


if __name__ == "__main__":
    front, back = load_undoc()
    nb = apply(os.path.join(ROOT, "backend/.env.example"), back)
    front_path = os.path.join(ROOT, "frontend/.env.example")
    nf = apply(front_path, front)
    print(f"backend/.env.example: +{nb} vars documentadas")
    print(f"frontend/.env.example: +{nf} vars documentadas ({'creado' if not os.path.exists(front_path) else 'actualizado'})")
