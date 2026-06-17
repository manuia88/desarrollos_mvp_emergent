"""audit:tenant — el candado estructural que traduce "RLS siempre ON" a Mongo.

Marca handlers de routes/ que tocan una colección CON DUEÑO sin NINGÚN guard de tenant/auth
en el cuerpo. Heurística deliberada (lección del filtro Sr): NO busca "filtro de tenant dentro
del find" (el patrón real es guard-en-otra-línea + find-by-id → daría falsos positivos masivos);
busca "toca colección-con-dueño Y el cuerpo no menciona ningún token de guard".

Modo: imprime TODOS los hallazgos (WARN). Compara contra scripts/audit/tenant_baseline.json
(el set aceptado tras revisión). Sale 1 SOLO si aparece un hallazgo NUEVO (no en baseline) →
así un endpoint nuevo sin guard truena el build, sin castigar los patrones ya verificados.

Uso:
    python audit_tenant.py            # WARN + falla si hay hallazgos fuera del baseline
    python audit_tenant.py --update   # regenera el baseline (tras revisar a ojo)
"""
from __future__ import annotations

import json
import os
import re
import sys

from _app_routes import load_routes

HERE = os.path.dirname(__file__)
BASELINE = os.path.join(HERE, "tenant_baseline.json")

# Colecciones con DUEÑO (acceso por id del request debe ir con guard). NO incluye las
# públicas/catálogo (developments, colonias, ie_scores, zone_scores, drpi_*, cube_*, etc.).
OWNED = {
    "leads", "users", "appointments", "asesor_contactos", "asesor_busquedas",
    "report_templates", "report_files", "developer_unit_overrides", "unit_holds",
    "inmobiliaria_internal_users", "inmobiliarias", "tracking_links", "operaciones",
    "tareas", "saved_searches", "dev_overlays", "projects", "bulk_upload_jobs",
    "cash_flow_forecasts", "di_documents", "brand_kits", "creative_assets",
    "creative_briefs", "captaciones", "pre_registros", "contactos", "user_preferences",
    "asesor_lead_properties", "report_schedules", "watchlists",
}

# Tokens que, si aparecen en el cuerpo del handler, lo consideran GUARDADO (auth o tenant).
GUARD_TOKENS = (
    "assert_dev_project", "assert_dev_org", "assert_db_project_owner", "assert_lead_owner",
    "assert_inm_owner", "assert_dev_access", "guard_project", "_assert_unit_in_dev",
    "dev_can_access", "tenant_of(", "tenant_filter(", "scoped(", "is_superadmin(",
    "_auth", "require_superadmin", "require_advisor", "require_user", "require_buyer",
    "require_dev_admin", "require_dev_or_superadmin", "require_authorized", "require_auth",
    "require_studio", "require_tier", "require_role", "require_developer", "_require_owner",
    "_require_superadmin", "_require_user", "check_role", "owner_id", "assigned_to",
    "get_current_user", "_get_user", "_require_role", "_require_dev",
)

# Ops que cuentan como "toca la colección" (lectura por id o mutación).
OP = re.compile(r"\.(insert_one|insert_many|update_one|update_many|replace_one|delete_one|"
                r"delete_many|find_one_and_update|find_one_and_delete|bulk_write|find_one|find|aggregate)\(")


def _owned_hits(body: str) -> set:
    hits = set()
    for coll in OWNED:
        if re.search(rf"\bdb\.{coll}\b", body) or re.search(rf'\["{coll}"\]', body):
            # confirma que hay una op de Mongo cerca del nombre de la colección
            if OP.search(body):
                hits.add(coll)
    return hits


def _guarded(body: str) -> bool:
    return any(tok in body for tok in GUARD_TOKENS)


def find_findings():
    findings = []
    for r in load_routes():
        if not r.file or not r.file.startswith("routes/"):
            continue
        if not r.body:
            continue
        owned = _owned_hits(r.body)
        if owned and not _guarded(r.body):
            findings.append({
                "key": f"{r.func_name}",
                "method": r.method, "path": r.path,
                "file": r.file, "line": r.line,
                "collections": sorted(owned),
            })
    # dedup por key (un handler con varios métodos)
    seen, uniq = set(), []
    for f in findings:
        if f["key"] in seen:
            continue
        seen.add(f["key"])
        uniq.append(f)
    return sorted(uniq, key=lambda x: x["key"])


def main():
    findings = find_findings()
    keys = sorted(f["key"] for f in findings)

    if "--update" in sys.argv:
        with open(BASELINE, "w") as fh:
            json.dump({"accepted": keys}, fh, indent=2)
        print(f"[audit:tenant] baseline actualizado · {len(keys)} hallazgos aceptados")
        return 0

    baseline = set()
    if os.path.exists(BASELINE):
        baseline = set(json.load(open(BASELINE)).get("accepted", []))

    nuevos = [f for f in findings if f["key"] not in baseline]
    print(f"[audit:tenant] {len(findings)} handlers tocan colección-con-dueño sin guard en el cuerpo "
          f"({len(baseline)} aceptados en baseline · {len(nuevos)} NUEVOS)")
    for f in nuevos:
        print(f"  🔴 NUEVO sin guard: {f['method']} {f['path']}  ({f['file']}:{f['line']}) "
              f"→ {', '.join(f['collections'])}  · handler {f['key']}")
    if nuevos:
        print("\n[audit:tenant] FALLA: hay handlers nuevos que tocan datos con dueño sin guard de "
              "tenant/auth. Añade el guard (assert_*/_auth*) o, si es intencional (público/superadmin "
              "ya cubierto por otra vía), revisa y corre con --update para aceptarlo en el baseline.")
        return 1
    print("[audit:tenant] OK · cero handlers nuevos sin guard.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
