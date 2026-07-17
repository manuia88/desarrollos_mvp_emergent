"""PLANO PREVIEW — renderiza la 1ª página de un plano PDF a PNG para que SE VEA.

Bug 07-16 (founder cazó en Hortensia): los planos se anclan como PDF, pero la UI los
muestra con <img> → un PDF no se dibuja en <img> → caja BLANCA. 71 de 94 moldes y
420 de 583 unidades tenían plano PDF invisible.

Fix: preview PNG (poppler/pdftoppm, $0) para mostrar + el PDF se conserva para descarga.
El binario pdftoppm ya está instalado. Idempotente: si el PNG existe, no re-renderiza.
"""
from __future__ import annotations

import pathlib
import subprocess
from typing import Optional


def render_preview(pdf_path: str, salida_dir: pathlib.Path, base: str,
                   dpi: int = 110) -> Optional[str]:
    """PDF (1ª página) → PNG. Devuelve la ruta del PNG o None si falla."""
    pdf = pathlib.Path(pdf_path)
    if not pdf.exists():
        return None
    salida_dir.mkdir(parents=True, exist_ok=True)
    destino = salida_dir / f"{base}.png"
    if destino.exists() and destino.stat().st_size > 0:
        return str(destino)
    try:
        # pdftoppm agrega sufijo; usamos -singlefile para que sea exacto "<base>.png"
        subprocess.run(
            ["pdftoppm", "-png", "-singlefile", "-r", str(dpi), "-f", "1", "-l", "1",
             str(pdf), str(salida_dir / base)],
            capture_output=True, timeout=60, check=True)
        if not destino.exists():
            return None
        try:  # el plano debe leerse horizontal (láminas apaisadas guardadas de lado)
            from plano_orientacion import enderezar_si_hace_falta
            enderezar_si_hace_falta(str(destino))
        except Exception:  # noqa: BLE001
            pass
        return str(destino)
    except Exception:  # noqa: BLE001
        return None


async def previsualizar_planos(db) -> dict:
    """Backfill: cada plano PDF (de unidad o molde) obtiene su PNG y el *_url apunta al
    PNG; el PDF queda en plano_pdf_url. Dedupe por asset PDF (muchas unidades comparten)."""
    import secrets

    from dev_assets import ASSET_UPLOAD_DIR
    updir = pathlib.Path(ASSET_UPLOAD_DIR)

    async def _png_para(pdf_asset_id: str) -> Optional[str]:
        """Devuelve el /api/assets-static/<png> para un asset PDF, creándolo 1 vez."""
        existente = await db.dev_assets.find_one(
            {"preview_de": pdf_asset_id}, {"_id": 0, "id": 1, "storage_path": 1})
        if existente:
            return f"/api/assets-static/{pathlib.Path(existente['storage_path']).name}"
        pdf_asset = await db.dev_assets.find_one({"id": pdf_asset_id},
                                                {"_id": 0, "storage_path": 1,
                                                 "development_id": 1, "filename": 1})
        if not pdf_asset:
            return None
        aid = f"ast_{secrets.token_urlsafe(8)}"
        png = render_preview(pdf_asset["storage_path"], updir, aid)
        if not png:
            return None
        await db.dev_assets.insert_one({
            "id": aid, "development_id": pdf_asset.get("development_id"),
            "asset_type": "plano_preview", "mime_type": "image/png",
            "filename": (pdf_asset.get("filename") or "plano") + ".png",
            "storage_path": png, "preview_de": pdf_asset_id,
            "source": "plano_preview_render"})
        return f"/api/assets-static/{pathlib.Path(png).name}"

    def _asset_id_de_url(url: str) -> Optional[str]:
        if not url or ".pdf" not in url:
            return None
        return url.rsplit("/", 1)[-1].rsplit(".", 1)[0]

    n_u = n_m = fallos = 0
    async for u in db.units.find({"plano_url": {"$regex": r"\.pdf$"}},
                                 {"_id": 0, "id": 1, "plano_url": 1}):
        aid = _asset_id_de_url(u["plano_url"])
        png = await _png_para(aid) if aid else None
        if png:
            await db.units.update_one(
                {"id": u["id"]},
                {"$set": {"plano_url": png, "plano_pdf_url": u["plano_url"]}})
            n_u += 1
        else:
            fallos += 1
    async for m in db.dmx_prototypes.find({"floor_plan_url": {"$regex": r"\.pdf$"}},
                                          {"_id": 0, "prototype_id": 1,
                                           "floor_plan_url": 1}):
        aid = _asset_id_de_url(m["floor_plan_url"])
        png = await _png_para(aid) if aid else None
        if png:
            await db.dmx_prototypes.update_one(
                {"prototype_id": m["prototype_id"]},
                {"$set": {"floor_plan_url": png, "plano_pdf_url": m["floor_plan_url"]}})
            n_m += 1
        else:
            fallos += 1
    return {"unidades": n_u, "moldes": n_m, "fallos": fallos}
