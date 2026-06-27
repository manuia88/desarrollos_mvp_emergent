"""Genera los archivos SEO/GEO ESTÁTICOS (frontend/public/llms.txt + sitemap.xml) desde el inventario REAL.

En prod (K8s) los paths non-/api van al frontend estático → ESTOS archivos son los que ven los crawlers
(Google + los motores IA permitidos por robots.txt). El router /api/seo es solo un mirror para clientes API.

Correr en cada deploy (prebuild) para que el inventario esté al día. REUSA la lógica de routes/seo_files.py
(cero duplicación). Ejecutar desde backend/:  ../scripts/.venv/bin/python3 generate_seo_static.py
"""
import os

from routes.seo_files import _LLMS_TXT, _dev_inventory_md, _SITEMAP_URLS, _all_dev_slugs, BASE_URL

PUBLIC_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "frontend", "public"))


def build_llms() -> str:
    return _LLMS_TXT.replace("## Contact", _dev_inventory_md() + "## Contact")


def build_sitemap() -> str:
    entries = list(_SITEMAP_URLS)
    entries.extend(f"/desarrollo/{s}" for s in _all_dev_slugs())
    try:
        from routes.seo_themed import all_theme_paths
        entries.extend(all_theme_paths())
    except Exception:
        pass
    seen, uniq = set(), []
    for e in entries:
        if e not in seen:
            seen.add(e)
            uniq.append(e)
    urls = "\n".join(
        f"  <url>\n    <loc>{BASE_URL}{p}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>{'1.0' if p == '/' else '0.7'}</priority>\n  </url>"
        for p in uniq
    )
    return f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{urls}\n</urlset>\n'


def main():
    llms = build_llms()
    sitemap = build_sitemap()
    with open(os.path.join(PUBLIC_DIR, "llms.txt"), "w", encoding="utf-8") as f:
        f.write(llms)
    with open(os.path.join(PUBLIC_DIR, "sitemap.xml"), "w", encoding="utf-8") as f:
        f.write(sitemap)
    n_devs = len(_all_dev_slugs())
    print(f"SEO estático generado en {PUBLIC_DIR} · {n_devs} desarrollos · llms.txt {len(llms)}b · sitemap {sitemap.count('<url>')} urls")


if __name__ == "__main__":
    main()
