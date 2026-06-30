#!/usr/bin/env python3
"""
COLONIA-BACKFILL · migración one-time idempotente del moat.

El código de la app ya canonicaliza la colonia con `data_developments.colonia_slug()`
en los escritores nuevos, pero los documentos históricos quedaron con el campo
`colonia` desincronizado ('Juárez', 'roma norte', 'lomas de chapultepec', ...).

Este script NO toca código de aplicación. Solo:
  1. Lee cada colección con campo colonia.
  2. Calcula el slug canónico con `data_developments.colonia_slug()`.
  3. Rellena un campo NUEVO `colonia_slug` (no borra el original).
  4. Mide el % de match contra el catálogo `db.colonias` ANTES y DESPUÉS.

Idempotente: re-correr produce exactamente el mismo estado (no duplica, no rompe).
Fail-soft: si una colección no existe o un doc no resuelve, se salta sin abortar.

Uso:
    scripts/.venv/bin/python3 scripts/migrate_colonia_backfill.py            # aplica
    scripts/.venv/bin/python3 scripts/migrate_colonia_backfill.py --dry-run  # solo mide
"""
import os
import sys
import argparse

# --- localizar el backend para importar el canonicalizador real de la app ---
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
BACKEND = os.path.join(REPO, "backend")
if BACKEND not in sys.path:
    sys.path.insert(0, BACKEND)

from data_developments import colonia_slug, slugify  # noqa: E402
from pymongo import MongoClient, UpdateOne  # noqa: E402

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "desarrollosmx")


# ---------------------------------------------------------------------------
# Resolución contra el catálogo db.colonias
# El catálogo usa ids con sufijo de alcaldía ('roma-norte-cuauhtemoc') y guarda
# el slug corto en el array `aliases`. Para medir match correctamente resolvemos
# un slug candidato contra {id, aliases, slug(name)}.
# ---------------------------------------------------------------------------
def build_catalog_resolution(db):
    resolve = {}          # slug-candidato -> id canónico del catálogo
    catalog_ids = set()
    for d in db.colonias.find({}, {"id": 1, "name": 1, "aliases": 1}):
        cid = d.get("id")
        if not cid:
            continue
        catalog_ids.add(cid)
        resolve.setdefault(cid, cid)
        for a in (d.get("aliases") or []):
            if a:
                resolve.setdefault(str(a), cid)
        nm = slugify(d.get("name") or "")
        if nm:
            resolve.setdefault(nm, cid)
    return resolve, catalog_ids


def resolves_to_catalog(slug, resolve):
    """¿el slug canónico cae en el catálogo (vía id/alias/nombre)?"""
    if not slug:
        return None
    if slug in resolve:
        return resolve[slug]
    s = slugify(str(slug))
    return resolve.get(s)


# ---------------------------------------------------------------------------
# Especificación de colecciones a backfillear.
#   kind 'scalar': fuente es un string -> colonia_slug string
#   kind 'list':   fuente es una lista de strings -> colonia_slug lista
#   nested: ruta dot para la fuente (p.ej. buyer_profile.colonias)
# El campo destino SIEMPRE es top-level `colonia_slug` (no borra el original).
# Si hay varios candidatos de fuente, se usa el primero no vacío en orden.
# ---------------------------------------------------------------------------
SPECS = [
    {
        "coll": "developments",
        "kind": "scalar",
        # ya existe colonia_id canónico en algunos; preferirlo, caer a colonia
        "sources": ["colonia_id", "colonia"],
    },
    {
        "coll": "buyer_signals",
        "kind": "scalar",
        "sources": ["colonia"],
    },
    {
        "coll": "marketplace_searches",
        "kind": "scalar",
        "sources": ["colonia_id"],
    },
    {
        "coll": "leads",
        "kind": "list",
        # la colonia de interés del lead vive en buyer_profile.colonias (lista)
        "sources": ["buyer_profile.colonias"],
    },
    {
        "coll": "colonias",
        "kind": "scalar",
        # auto-canonicaliza: el id ES la fuente. Da simetría de join cross-engine.
        "sources": ["id"],
    },
]


def get_path(doc, path):
    cur = doc
    for part in path.split("."):
        if not isinstance(cur, dict):
            return None
        cur = cur.get(part)
    return cur


def first_nonempty_source(doc, sources):
    """Devuelve el primer valor (escalar o lista) no vacío de las fuentes."""
    for s in sources:
        v = get_path(doc, s)
        if v not in (None, "", [], {}):
            return v
    return None


def compute_scalar_slug(value):
    if value in (None, ""):
        return ""
    return colonia_slug(value)


def compute_list_slugs(value):
    if not value:
        return []
    if not isinstance(value, (list, tuple)):
        value = [value]
    out = []
    for v in value:
        cs = colonia_slug(v)
        if cs and cs not in out:
            out.append(cs)
    return out


def measure(db, spec, resolve):
    """Mide match-vs-catalogo ANTES (campo crudo) y POTENCIAL (canonicalizado).

    Reporta DOS niveles:
      - distinto: cuántos slugs DISTINTOS resuelven al catálogo (calidad del vocabulario)
      - por-doc:  cuántos DOCUMENTOS quedarían apuntando a una colonia del catálogo
                  (esta es la métrica comparable con el audit '38/131')
    """
    coll = db[spec["coll"]]
    sources = spec["sources"]
    kind = spec["kind"]

    raw_vals = set()          # valores crudos distintos (no vacíos)
    canon_vals = set()        # slugs canónicos distintos
    docs_with_source = 0
    docs_raw_match = 0        # docs cuyo valor CRUDO ya cae en el catálogo
    docs_canon_match = 0      # docs que tras canonicalizar caen en el catálogo

    for doc in coll.find({}, {**{s.split(".")[0]: 1 for s in sources}}):
        src = first_nonempty_source(doc, sources)
        if src in (None, "", [], {}):
            continue
        docs_with_source += 1
        if kind == "list":
            items = src if isinstance(src, (list, tuple)) else [src]
        else:
            items = [src]
        doc_raw_hit = False
        doc_canon_hit = False
        for it in items:
            if it in (None, ""):
                continue
            sv = str(it)
            raw_vals.add(sv)
            if slugify(sv) in resolve:
                doc_raw_hit = True
            cs = colonia_slug(it)
            if cs:
                canon_vals.add(cs)
                if resolves_to_catalog(cs, resolve):
                    doc_canon_hit = True
        if doc_raw_hit:
            docs_raw_match += 1
        if doc_canon_hit:
            docs_canon_match += 1

    raw_in_catalog = sum(1 for v in raw_vals if slugify(v) in resolve)
    canon_in_catalog = sum(1 for v in canon_vals if resolves_to_catalog(v, resolve))

    return {
        "docs_with_source": docs_with_source,
        "docs_raw_match": docs_raw_match,
        "docs_canon_match": docs_canon_match,
        "raw_distinct": len(raw_vals),
        "raw_in_catalog": raw_in_catalog,
        "canon_distinct": len(canon_vals),
        "canon_in_catalog": canon_in_catalog,
        "unresolvable": sorted(
            v for v in canon_vals if not resolves_to_catalog(v, resolve)
        ),
    }


def backfill(db, spec, dry_run=False):
    """Aplica el backfill idempotente. Devuelve #docs actualizados (cambio real)."""
    coll = db[spec["coll"]]
    sources = spec["sources"]
    kind = spec["kind"]

    ops = []
    scanned = 0
    skipped_no_source = 0
    unchanged = 0

    proj = {s.split(".")[0]: 1 for s in sources}
    proj["colonia_slug"] = 1

    for doc in coll.find({}, proj):
        scanned += 1
        src = first_nonempty_source(doc, sources)
        if src in (None, "", [], {}):
            skipped_no_source += 1
            continue

        if kind == "list":
            new_val = compute_list_slugs(src)
            if not new_val:
                skipped_no_source += 1
                continue
        else:
            new_val = compute_scalar_slug(src)
            if not new_val:
                skipped_no_source += 1
                continue

        existing = doc.get("colonia_slug")
        # Idempotencia: si ya está igual, no escribir.
        if existing == new_val:
            unchanged += 1
            continue

        ops.append(UpdateOne({"_id": doc["_id"]}, {"$set": {"colonia_slug": new_val}}))

    updated = 0
    if ops and not dry_run:
        res = coll.bulk_write(ops, ordered=False)
        updated = res.modified_count + res.upserted_count
    elif ops and dry_run:
        updated = len(ops)  # lo que SE actualizaría

    return {
        "scanned": scanned,
        "skipped_no_source": skipped_no_source,
        "unchanged": unchanged,
        "to_update": len(ops),
        "updated": updated,
    }


def pct(n, d):
    return round(100.0 * n / d, 1) if d else 0.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="solo mide, no escribe")
    args = ap.parse_args()

    client = MongoClient(MONGO_URL)
    db = client[DB_NAME]

    resolve, catalog_ids = build_catalog_resolution(db)
    print(f"Mongo: {MONGO_URL}  db={DB_NAME}")
    print(f"Catálogo db.colonias: {len(catalog_ids)} ids | resolución (id+alias+nombre): {len(resolve)} claves")
    print("=" * 78)

    # ---- BEFORE ----
    before = {}
    tot_canon_distinct_b = tot_canon_match_b = 0
    tot_docs_b = tot_docs_raw_b = tot_docs_canon_b = 0
    print("\nANTES (match contra catálogo db.colonias · por-doc = métrica del audit '38/131'):")
    for spec in SPECS:
        if spec["coll"] not in db.list_collection_names():
            print(f"  · {spec['coll']:22} (no existe, skip)")
            continue
        m = measure(db, spec, resolve)
        before[spec["coll"]] = m
        tot_canon_distinct_b += m["canon_distinct"]
        tot_canon_match_b += m["canon_in_catalog"]
        tot_docs_b += m["docs_with_source"]
        tot_docs_raw_b += m["docs_raw_match"]
        tot_docs_canon_b += m["docs_canon_match"]
        print(
            f"  · {spec['coll']:22} docs={m['docs_with_source']:>4} | "
            f"por-doc crudo {m['docs_raw_match']}/{m['docs_with_source']} "
            f"({pct(m['docs_raw_match'], m['docs_with_source'])}%) → "
            f"por-doc canónico {m['docs_canon_match']}/{m['docs_with_source']} "
            f"({pct(m['docs_canon_match'], m['docs_with_source'])}%) | "
            f"slugs distintos {m['canon_in_catalog']}/{m['canon_distinct']}"
        )
        if m["unresolvable"]:
            print(f"      no resoluble (no inventamos): {m['unresolvable']}")

    print(
        f"\n  TOTAL por-doc: ANTES {tot_docs_raw_b}/{tot_docs_b} docs ya casaban "
        f"({pct(tot_docs_raw_b, tot_docs_b)}%) → tras canonicalizar {tot_docs_canon_b}/{tot_docs_b} "
        f"({pct(tot_docs_canon_b, tot_docs_b)}%)"
    )
    print(
        f"  TOTAL distinto: {tot_canon_match_b}/{tot_canon_distinct_b} "
        f"slugs distintos resuelven al catálogo ({pct(tot_canon_match_b, tot_canon_distinct_b)}%)"
    )

    # ---- APPLY ----
    print("\n" + "=" * 78)
    print("APLICANDO backfill (idempotente)" if not args.dry_run else "DRY-RUN (no escribe)")
    results = {}
    for spec in SPECS:
        if spec["coll"] not in db.list_collection_names():
            continue
        r = backfill(db, spec, dry_run=args.dry_run)
        results[spec["coll"]] = r
        print(
            f"  · {spec['coll']:22} escaneados={r['scanned']:>4} "
            f"sin-fuente={r['skipped_no_source']:>4} "
            f"sin-cambio={r['unchanged']:>4} "
            f"actualizados={r['updated']:>4}"
        )

    # ---- AFTER ----
    print("\n" + "=" * 78)
    print("DESPUÉS (cobertura del campo colonia_slug + match contra catálogo):")
    tot_field = tot_field_match = 0
    for spec in SPECS:
        coll_name = spec["coll"]
        if coll_name not in db.list_collection_names():
            continue
        coll = db[coll_name]
        with_field = coll.count_documents({"colonia_slug": {"$exists": True, "$nin": [None, "", []]}})
        # match de los valores escritos
        match_docs = 0
        field_vals = set()
        for doc in coll.find(
            {"colonia_slug": {"$exists": True, "$nin": [None, "", []]}}, {"colonia_slug": 1}
        ):
            cs = doc.get("colonia_slug")
            items = cs if isinstance(cs, list) else [cs]
            if any(resolves_to_catalog(x, resolve) for x in items if x):
                match_docs += 1
            for x in items:
                if x:
                    field_vals.add(x)
        distinct_match = sum(1 for v in field_vals if resolves_to_catalog(v, resolve))
        tot_field += len(field_vals)
        tot_field_match += distinct_match
        print(
            f"  · {coll_name:22} docs-con-colonia_slug={with_field:>4} | "
            f"docs-que-matchean-catálogo={match_docs:>4} | "
            f"slugs-distintos {distinct_match}/{len(field_vals)} "
            f"({pct(distinct_match, len(field_vals))}%)"
        )

    print(
        f"\n  TOTAL DESPUÉS: {tot_field_match}/{tot_field} slugs distintos del campo "
        f"colonia_slug resuelven al catálogo ({pct(tot_field_match, tot_field)}%)"
    )
    print(
        f"\n  Mejora de cobertura distinta: "
        f"{pct(tot_canon_match_b, tot_canon_distinct_b)}% (canónico potencial antes) "
        f"vs valores crudos previos. El campo colonia_slug ahora está poblado y unificado."
    )

    client.close()


if __name__ == "__main__":
    main()
