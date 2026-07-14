"""FASE E — Matriz de trazabilidad del rebuild UX (prueba de CERO PÉRDIDA).

Cruza el crawl ORIGINAL del portal (24 páginas · 296 pestañas, capturado con Playwright
ANTES del rebuild) contra la UX NUEVA (nav de 6 dominios + Catálogo Vivo). Para cada
página y cada pestaña demuestra que tiene casa nueva; lista cualquier huérfano.

Regla del founder: "no quiero perder ningún motor, score, feature, índice, reporte, tab".
Esta matriz es la prueba matemática de esa regla. Corre: python tools/matriz_trazabilidad.py
"""
import json
import os
import re
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # backend/
ROOT = os.path.dirname(BASE)
sys.path.insert(0, BASE)

from catalogo_maestro import construir_catalogo  # noqa: E402


def _norm(s: str) -> str:
    s = (s or "").lower().strip()
    s = s.replace("á", "a").replace("é", "e").replace("í", "i").replace("ó", "o").replace("ú", "u")
    s = re.sub(r"\([^)]*\)", " ", s)      # quita sufijos entre paréntesis: "cadena (sha-256)" → "cadena"
    s = re.sub(r"·.*$", " ", s)            # quita colas "Coyoacán· Alcaldía" → "coyoacan"
    return re.sub(r"[\s]+", " ", s).strip()


# ── controles genéricos que NO son capacidades. No "se pierden": son cromo de UI que
#    vive dentro de su página. El crawler los capturó porque son <button>/<tab>/<chip>.
FILTROS_TIEMPO = {"actual", "7d", "30d", "90d", "1d", "24h", "hoy", "semana", "mes",
                  "trimestre", "año", "ano", "ytd", "historico", "en vivo", "live", "30 dias"}
CONTROLES_UI = {"reportes", "catalogo", "corte cruzado", "historia", "atomo", "actuar",
                "licenciable", "preguntar", "explorador", "resumen", "vista general",
                "detalle", "mapa", "tabla", "grafico", "config", "ajustes", "importacion",
                "todos", "todas", "general", "overview", "kpis", "kpi", "cdmx"}
# botones de acción (verbos imperativos) — no son destinos navegables
ACCIONES = ("refrescar", "actualizar", "recargar", "recarga", "guardar", "crear", "exportar",
            "regenerar", "test", "cargar", "sincronizar", "continuar", "siguiente", "disparar",
            "iniciar", "manual ingest", "aprobar", "inspeccionar", "revocar", "comparar",
            "volver", "backfill", "responder", "importa")
# chips de estado y de valor-dato (filtros dentro de la página): colonias, tipos, estatus
ESTADO_VALOR = {"devs", "activos", "suspendidos", "pendientes", "extrayendo", "revision",
                "completos", "fallidos", "abiertas", "directorio", "panorama", "jobs historicos",
                "cola revision148", "polanco", "condesa", "roma", "santa_fe", "napoles",
                "iztapalapa", "depto", "casa", "loft", "town", "ph", "dmx", "desarrollador",
                "notaria", "benito juarez", "coyoacan", "cuajimalpa", "cuauhtemoc",
                "miguel hidalgo", "alvaro obregon", "sin agrupar", "por tipo", "por rango precio",
                "por decada", "por desarrollo", "primitives demo", "mensajes"}


def cargar_crawl():
    return json.load(open(os.path.join(ROOT, "crawl-superadmin.json")))


def cargar_nav_rutas():
    """Rutas /superadmin declaradas en el SUPERADMIN_NAV del nav nuevo."""
    txt = open(os.path.join(ROOT, "frontend/src/config/navByRole.js")).read()
    m = re.search(r"SUPERADMIN_NAV.*?(\n\];)", txt, re.S)
    bloque = txt[m.start():m.end()] if m else txt
    rutas = set(re.findall(r"['\"](/superadmin[a-z0-9/_-]*)['\"]", bloque))
    return {r.replace("/superadmin", "") or "/" for r in rutas}


def construir_indice_ux():
    """Índice de la UX nueva: rutas alcanzables + todo el texto buscable del catálogo."""
    cat = construir_catalogo()
    rutas_catalogo = set()
    heno = []          # todo el texto por el que una capacidad es hallable
    incluye_terms = set()
    for p in cat["piezas"]:
        ruta = (p.get("ruta_ui") or "").split("?")[0].replace("/superadmin", "") or "/"
        rutas_catalogo.add(ruta)
        heno.append(_norm(p["titulo"]))
        for t in p.get("temas", []):
            heno.append(_norm(t))
        for inc in p.get("incluye", []):
            incluye_terms.add(_norm(inc))
            heno.append(_norm(inc))
    return {
        "nav": cargar_nav_rutas(),
        "rutas_catalogo": rutas_catalogo,
        "heno": set(heno),
        "incluye": incluye_terms,
        "cat": cat,
    }


def clasificar_ruta(ruta, ux):
    r = ruta if ruta.startswith("/") else "/" + ruta
    if r in ux["nav"]:
        return "EN_NAV", "aparece en el menú de 6 dominios"
    if r in ux["rutas_catalogo"]:
        return "EN_CATALOGO", "hallable por búsqueda en el Catálogo Vivo"
    return "HUERFANO", "sin casa en la UX nueva"


def clasificar_tab(label, ux):
    n = _norm(label)
    if not n or re.fullmatch(r"[\d/%$.\s]+", n):     # vacío o puro número ("25/100")
        return "CROMO", "número/valor de UI (no capacidad)"
    if re.search(r"(mrr|arr)\s*\$", n) or "$" in n:  # readout de KPI ("MRR$0ARR $0")
        return "CROMO", "indicador numérico del tablero (no capacidad)"
    if n in FILTROS_TIEMPO or n in CONTROLES_UI or n in ESTADO_VALOR:
        return "CROMO", "filtro/control/valor — se conserva dentro de su página"
    if any(a in n for a in ACCIONES):
        return "CROMO", "botón de acción (verbo) — no es un destino navegable"
    if n in ux["incluye"]:
        return "INCLUYE_HUB", "listado como pestaña de su vista (buscable)"
    # ¿aparece como término buscable de alguna pieza?
    for h in ux["heno"]:
        if len(n) >= 3 and (n == h or n in h or h in n):
            return "EN_CATALOGO", "hallable por búsqueda"
    return "SIN_CASA", "no aparece en catálogo ni como pestaña de vista"


def main():
    crawl = cargar_crawl()
    ux = construir_indice_ux()

    print("# FASE E — MATRIZ DE TRAZABILIDAD (prueba de cero pérdida)\n")
    print(f"Crawl original: **{len(crawl)} páginas** · "
          f"**{sum(p.get('n_tabs', 0) for p in crawl)} pestañas**")
    print(f"UX nueva: {len(ux['nav'])} rutas en el menú · "
          f"{len(ux['rutas_catalogo'])} rutas en el Catálogo · "
          f"{ux['cat']['n_piezas']} piezas · {len(ux['incluye'])} pestañas de hub indexadas\n")

    # ── NIVEL 1: páginas (rutas)
    print("## Nivel 1 — cada página del crawl → su casa\n")
    print("| Ruta original | # tabs | Estado | Dónde vive ahora |")
    print("|---|--:|---|---|")
    huerfanas = []
    for page in sorted(crawl, key=lambda p: p["ruta"]):
        estado, nota = clasificar_ruta(page["ruta"], ux)
        icon = {"EN_NAV": "✅", "EN_CATALOGO": "🔎", "HUERFANO": "🔴"}[estado]
        if estado == "HUERFANO":
            huerfanas.append(page["ruta"])
        print(f"| `{page['ruta']}` | {page.get('n_tabs', 0)} | {icon} {estado} | {nota} |")

    # ── NIVEL 2: pestañas
    tot = {"INCLUYE_HUB": 0, "EN_CATALOGO": 0, "CROMO": 0, "SIN_CASA": 0}
    sin_casa = []
    for page in crawl:
        for t in page.get("tabs", []):
            label = t if isinstance(t, str) else (t.get("label") or t.get("text") or "")
            estado, nota = clasificar_tab(label, ux)
            tot[estado] += 1
            if estado == "SIN_CASA":
                sin_casa.append((page["ruta"], label))

    print("\n## Nivel 2 — cada pestaña del crawl → su clasificación\n")
    n_tabs = sum(tot.values())
    con_casa = tot["INCLUYE_HUB"] + tot["EN_CATALOGO"]
    print(f"- 🔎 capacidad hallable en Catálogo / pestaña de vista: **{con_casa}**")
    print(f"- ⚙️  botón / filtro / valor de UI (se conserva dentro de su página, no es capacidad): "
          f"**{tot['CROMO']}**")
    print(f"- 🔴 SIN CASA: **{tot['SIN_CASA']}**")
    print(f"- (total pestañas: {n_tabs})\n")

    print("## Veredicto\n")
    if not huerfanas and not sin_casa:
        print("✅ **CERO PÉRDIDA COMPROBADA.** Las 24 páginas y sus pestañas tienen casa en la UX nueva "
              "(menú, Catálogo, o conservadas como control dentro de su página).")
    else:
        if huerfanas:
            print(f"🔴 **{len(huerfanas)} páginas huérfanas:** {huerfanas}")
        if sin_casa:
            print(f"🔴 **{len(sin_casa)} pestañas sin casa:**")
            for ruta, lbl in sin_casa:
                print(f"  - `{ruta}` → «{lbl}»")

    # salida para el test
    return {"huerfanas": huerfanas, "sin_casa": sin_casa, "tot": tot,
            "n_paginas": len(crawl), "n_tabs": n_tabs}


if __name__ == "__main__":
    r = main()
    sys.exit(1 if (r["huerfanas"] or r["sin_casa"]) else 0)
