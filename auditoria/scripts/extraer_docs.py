#!/usr/bin/env python3
"""FASE 0.7 — Extrae los catálogos de los documentos-contrato → CSVs de trazabilidad.

Genera:
  TRAZABILIDAD_FEATURES.csv  las features de 02_FEATURES.md (tablas | # | Feature | por bloque)
  TRAZABILIDAD_SCORES.csv    los scores de 03_INTELLIGENCE.md (tablas por categoría, con fuente y nivel)
  FUENTES_DATOS.csv          las fuentes de datos de la sección 4 de 03_INTELLIGENCE.md
Cada fila lleva columnas de veredicto vacías que la auditoría llenará (estado, evidencia, tests).
"""
import csv, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
AUD = os.path.join(ROOT, "auditoria")


def extraer_features():
    src = open(os.path.join(ROOT, "02_FEATURES.md"), encoding="utf-8").read()
    rows = []
    seccion = bloque = ""
    fid = 0
    for line in src.splitlines():
        h2 = re.match(r"^##\s+(.+)", line)
        h4 = re.match(r"^####?\s+(.+)", line)
        if h2 and not line.startswith("####"):
            seccion = h2.group(1).strip()
        if h4 and line.startswith("####"):
            bloque = h4.group(1).strip()
        m = re.match(r"^\|\s*(\d+)\s*\|\s*(.+?)\s*\|\s*$", line)
        if m and bloque:
            fid += 1
            rows.append({"id_global": fid, "num_en_bloque": m.group(1), "seccion": seccion,
                         "bloque": bloque, "feature": m.group(2),
                         "estado": "", "evidencia_backend": "", "evidencia_frontend": "",
                         "tests": "", "nota": ""})
    with open(os.path.join(AUD, "TRAZABILIDAD_FEATURES.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader(); w.writerows(rows)
    return len(rows)


def extraer_scores():
    src = open(os.path.join(ROOT, "03_INTELLIGENCE.md"), encoding="utf-8").read()
    rows = []
    categoria = ""
    in_catalog = False
    for line in src.splitlines():
        if line.startswith("## 3."):
            in_catalog = True
        elif line.startswith("## ") and in_catalog and not line.startswith("## 3."):
            in_catalog = False
        h3 = re.match(r"^###\s+(.+)", line)
        if h3 and in_catalog:
            categoria = h3.group(1).strip()
        m = re.match(r"^\|\s*(IE_[A-Z0-9_]+|[A-Z][A-Z0-9_]{4,})\s*\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|", line)
        if m and in_catalog and categoria:
            rows.append({"codigo": m.group(1).strip(), "categoria": categoria,
                         "dimension": m.group(2).strip(), "fuente_input_doc": m.group(3).strip(),
                         "nivel": m.group(4).strip(),
                         "engine_existe": "", "formula_coincide": "", "fuente_real_vs_sintetica": "",
                         "persistencia": "", "endpoint_ui": "", "tests": "", "estado": "", "nota": ""})
    with open(os.path.join(AUD, "TRAZABILIDAD_SCORES.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader(); w.writerows(rows)
    return len(rows)


def extraer_fuentes():
    src = open(os.path.join(ROOT, "03_INTELLIGENCE.md"), encoding="utf-8").read()
    m = re.search(r"## 4\. Fuentes de datos.*?(?=\n## )", src, re.S)
    rows = []
    if m:
        for line in m.group(0).splitlines():
            mm = re.match(r"^\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|?", line)
            if mm and mm.group(1).strip() not in ("Fuente", "---", ""):
                first = mm.group(1).strip()
                if first.startswith("-") or first.startswith("Fuente"):
                    continue
                rows.append({"fuente": first, "detalle": mm.group(2).strip(), "extra": mm.group(3).strip(),
                             "conector_real": "", "agendado": "", "ultimo_dato_real": "",
                             "manejo_fallo": "", "licencia": "", "estado": ""})
    if rows:
        with open(os.path.join(AUD, "FUENTES_DATOS.csv"), "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            w.writeheader(); w.writerows(rows)
    return len(rows)


if __name__ == "__main__":
    nf = extraer_features()
    ns = extraer_scores()
    nd = extraer_fuentes()
    print(f"FEATURES extraídas: {nf} (doc dice 762)")
    print(f"SCORES extraídos: {ns} (doc dice 118-125)")
    print(f"FUENTES de datos: {nd} (doc dice 18)")
