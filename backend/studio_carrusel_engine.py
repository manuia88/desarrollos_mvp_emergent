"""W5.22 Z.2 Sub-B — Studio Carrusel Engine.

Renderiza carruseles con Pillow para 5 aspect ratios:
  16:9 → 1920×1080  |  9:16 → 1080×1920  |  1:1 → 1080×1080
  4:5  → 1080×1350  |  21:9 → 2560×1080

Aplica Brand Kit activo (logo · colores · fuente) desde studio_brand_kit_engine.
Sube a Cloudflare R2 prefijo carruseles/.

Collections:
    studio_carruseles: {id, tenant_id, user_id, project_id, copy_id, brand_kit_id,
                        pages_data, aspect_ratios, r2_keys, variant_label, ab_group_id,
                        hook_score, clicks, conversions, status, created_at}
    studio_carrusel_ab_groups: {id, user_id, project_id, copy_id, variant_a_carrusel_id,
                                 variant_b_carrusel_id, winner_id, stats, status, created_at}
"""
from __future__ import annotations

import io
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from PIL import Image, ImageDraw, ImageFont

log = logging.getLogger("dmx.studio_carrusel")

# ─── R2 Config ───────────────────────────────────────────────────────────────
R2_BUCKET = os.environ.get("CLOUDFLARE_R2_BUCKET", "dmx-studio-assets")
R2_ACCOUNT = os.environ.get("CLOUDFLARE_R2_ACCOUNT_ID", "")
R2_KEY = os.environ.get("CLOUDFLARE_R2_ACCESS_KEY", "")
R2_SECRET = os.environ.get("CLOUDFLARE_R2_SECRET_KEY", "")

# ─── Aspect ratio dimensions ─────────────────────────────────────────────────
RATIO_DIMS: Dict[str, Tuple[int, int]] = {
    "16:9":  (1920, 1080),
    "9:16":  (1080, 1920),
    "1:1":   (1080, 1080),
    "4:5":   (1080, 1350),
    "21:9":  (2560, 1080),
}
ALL_RATIOS = list(RATIO_DIMS.keys())

# ─── Color palette defaults ──────────────────────────────────────────────────
BG_PIL = (6, 8, 15)
CREAM_PIL = (240, 235, 224)
INDIGO_PIL = (99, 102, 241)
ROSE_PIL = (236, 72, 153)
SUCCESS_PIL = (34, 197, 94)
DANGER_PIL = (239, 68, 68)


def _r2_live() -> bool:
    return bool(R2_ACCOUNT and R2_KEY and R2_SECRET)


def _pil_font(size: int, variant: str = "regular") -> ImageFont.ImageFont:
    LIB = "/usr/share/fonts/truetype/liberation/"
    mapping = {
        "bold": LIB + "LiberationSans-Bold.ttf",
        "regular": LIB + "LiberationSans-Regular.ttf",
        "serif_bold": LIB + "LiberationSerif-Bold.ttf",
    }
    p = mapping.get(variant)
    try:
        if p and os.path.exists(p):
            return ImageFont.truetype(p, size)
    except Exception:
        pass
    return ImageFont.load_default()


def _parse_color(hex_str: Optional[str], fallback: Tuple[int, int, int]) -> Tuple[int, int, int]:
    if not hex_str:
        return fallback
    h = hex_str.lstrip("#")
    if len(h) == 6:
        try:
            return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))
        except Exception:
            pass
    return fallback


def _draw_gradient_bar(draw: ImageDraw.ImageDraw, x0: int, y0: int, x1: int, y1: int,
                        c1: Tuple = INDIGO_PIL, c2: Tuple = ROSE_PIL):
    w = x1 - x0
    if w <= 0:
        return
    for i in range(w):
        t = i / max(w - 1, 1)
        r = int(c1[0] + t * (c2[0] - c1[0]))
        g = int(c1[1] + t * (c2[1] - c1[1]))
        b = int(c1[2] + t * (c2[2] - c1[2]))
        draw.line([(x0 + i, y0), (x0 + i, y1)], fill=(r, g, b))


def _fetch_logo(logo_url: Optional[str], max_h: int = 60) -> Optional[Image.Image]:
    if not logo_url:
        return None
    try:
        import httpx, asyncio
        # Sincronico para simplificar (se llama desde thread executor si necesario)
        import urllib.request
        with urllib.request.urlopen(logo_url, timeout=5) as r:
            data = r.read()
        img = Image.open(io.BytesIO(data)).convert("RGBA")
        # Scale to max_h preservando aspect ratio
        w, h = img.size
        if h > max_h:
            new_w = int(w * max_h / h)
            img = img.resize((new_w, max_h), Image.LANCZOS)
        return img
    except Exception as exc:
        log.debug(f"[carrusel] logo fetch failed: {exc}")
        return None


def _render_slide(
    w: int, h: int,
    *,
    title: str,
    subtitle: str = "",
    stats: Optional[List[Dict]] = None,
    cta_text: str = "",
    disclaimer: str = "",
    bg_color: Tuple = BG_PIL,
    accent1: Tuple = INDIGO_PIL,
    accent2: Tuple = ROSE_PIL,
    logo_img: Optional[Image.Image] = None,
    page_type: str = "hero",  # hero | stats | cta | disclaimer
) -> Image.Image:
    img = Image.new("RGB", (w, h), bg_color)
    draw = ImageDraw.Draw(img)

    pad_x = max(40, int(w * 0.04))
    pad_y = max(40, int(h * 0.04))

    # Top gradient bar
    bar_h = max(4, int(h * 0.005))
    _draw_gradient_bar(draw, 0, 0, w, bar_h, accent1, accent2)

    if page_type == "hero":
        # Hero: title grande + subtitle
        title_size = max(28, int(w * 0.045))
        sub_size = max(16, int(w * 0.022))
        fnt_title = _pil_font(title_size, "serif_bold")
        fnt_sub = _pil_font(sub_size, "regular")

        # Center vertically
        cy = h // 2
        draw.text((pad_x, cy - title_size * 2), title[:80], font=fnt_title,
                  fill=CREAM_PIL)
        if subtitle:
            draw.text((pad_x, cy), subtitle[:120], font=fnt_sub,
                      fill=(*CREAM_PIL[:3], 180))

        # CTA pill
        if cta_text:
            cta_font_size = max(14, int(w * 0.018))
            cta_fnt = _pil_font(cta_font_size, "bold")
            cta_y = h - pad_y - 60
            pill_w, pill_h = int(w * 0.35), max(36, int(h * 0.045))
            # Gradient pill
            pill_img = Image.new("RGBA", (pill_w, pill_h), (0, 0, 0, 0))
            pill_draw = ImageDraw.Draw(pill_img)
            _draw_gradient_bar(pill_draw, 0, 0, pill_w, pill_h, accent1, accent2)
            img.paste(pill_img.convert("RGB"), (pad_x, cta_y))
            draw = ImageDraw.Draw(img)
            draw.text((pad_x + 16, cta_y + 8), cta_text[:40], font=cta_fnt, fill=(255, 255, 255))

    elif page_type == "stats":
        stats = stats or []
        n = len(stats)
        if n == 0:
            return img
        fnt_label = _pil_font(max(12, int(w * 0.016)), "regular")
        fnt_value = _pil_font(max(24, int(w * 0.038)), "bold")
        fnt_title_sm = _pil_font(max(18, int(w * 0.024)), "serif_bold")

        draw.text((pad_x, pad_y + bar_h + 10), title[:60], font=fnt_title_sm, fill=CREAM_PIL)

        cols = min(n, 3)
        cell_w = (w - 2 * pad_x) // cols
        cell_h = int(h * 0.4)
        start_y = int(h * 0.25)

        for i, stat in enumerate(stats[:cols * 2]):
            col = i % cols
            row = i // cols
            bx = pad_x + col * cell_w
            by = start_y + row * (cell_h + 20)
            # Stat card
            draw.rectangle([bx, by, bx + cell_w - 10, by + cell_h], fill=(*bg_color, 0))
            # Gradient border top
            _draw_gradient_bar(draw, bx, by, bx + cell_w - 10, by + 2, accent1, accent2)
            draw.text((bx + 10, by + 12), str(stat.get("label", ""))[:30],
                      font=fnt_label, fill=(*CREAM_PIL[:3], 160))
            draw.text((bx + 10, by + 35), str(stat.get("value", ""))[:20],
                      font=fnt_value, fill=CREAM_PIL)

    elif page_type == "cta":
        cta_font_size = max(22, int(w * 0.032))
        fnt_cta = _pil_font(cta_font_size, "serif_bold")
        fnt_sub = _pil_font(max(14, int(w * 0.018)), "regular")
        cy = h // 2
        draw.text((pad_x, cy - 60), title[:80], font=fnt_cta, fill=CREAM_PIL)
        if subtitle:
            draw.text((pad_x, cy), subtitle[:120], font=fnt_sub,
                      fill=(*CREAM_PIL[:3], 180))
        if cta_text:
            pill_size = max(16, int(w * 0.02))
            cta_fnt = _pil_font(pill_size, "bold")
            pill_w = int(w * 0.4)
            pill_h = max(44, int(h * 0.05))
            pill_img = Image.new("RGBA", (pill_w, pill_h), (0, 0, 0, 0))
            pill_draw = ImageDraw.Draw(pill_img)
            _draw_gradient_bar(pill_draw, 0, 0, pill_w, pill_h, accent1, accent2)
            img.paste(pill_img.convert("RGB"), (pad_x, cy + 60))
            draw = ImageDraw.Draw(img)
            draw.text((pad_x + 16, cy + 72), cta_text[:40], font=cta_fnt, fill=(255, 255, 255))

    elif page_type == "disclaimer":
        fnt_dis = _pil_font(max(10, int(w * 0.013)), "regular")
        draw.text((pad_x, h - pad_y - 40), disclaimer[:200], font=fnt_dis,
                  fill=(*CREAM_PIL[:3], 100))

    # Logo top-right
    if logo_img:
        logo_x = w - pad_x - logo_img.width
        logo_y = pad_y + bar_h + 8
        try:
            if logo_img.mode == "RGBA":
                img.paste(logo_img, (logo_x, logo_y), logo_img)
            else:
                img.paste(logo_img, (logo_x, logo_y))
        except Exception:
            pass

    # Bottom gradient bar
    _draw_gradient_bar(draw, 0, h - bar_h, w, h, accent1, accent2)

    return img


def render_carrusel_ratio(
    ratio: str,
    *,
    pages_data: Dict[str, Any],
    brand_kit: Optional[Dict[str, Any]] = None,
    logo_img: Optional[Image.Image] = None,
) -> bytes:
    """Renderiza todas las slides del carrusel para un ratio. Retorna PNG bytes del hero."""
    dims = RATIO_DIMS.get(ratio, (1080, 1080))
    w, h = dims

    bk = brand_kit or {}
    bg_color = _parse_color(bk.get("color_primary"), BG_PIL)
    accent1 = _parse_color(bk.get("color_secondary", "#6366F1"), INDIGO_PIL)
    accent2 = _parse_color(bk.get("color_accent", "#EC4899"), ROSE_PIL)

    hero_data = pages_data.get("hero", {})
    title = hero_data.get("title", "")
    subtitle = hero_data.get("subtitle", "")
    cta_text = (pages_data.get("cta") or {}).get("text", "")
    disclaimer = pages_data.get("disclaimer", "")
    stats = pages_data.get("stats", [])

    # Render hero slide (primary asset stored in R2)
    hero_img = _render_slide(
        w, h,
        title=title, subtitle=subtitle, cta_text=cta_text,
        bg_color=bg_color, accent1=accent1, accent2=accent2,
        logo_img=logo_img, page_type="hero",
    )

    buf = io.BytesIO()
    hero_img.save(buf, "PNG", optimize=True)
    return buf.getvalue()


def _upload_r2(r2_key: str, data: bytes, content_type: str = "image/png") -> Optional[str]:
    if not _r2_live():
        return None
    try:
        import boto3
        from botocore.config import Config as BotoConfig
        client = boto3.client(
            "s3",
            endpoint_url=f"https://{R2_ACCOUNT}.r2.cloudflarestorage.com",
            aws_access_key_id=R2_KEY,
            aws_secret_access_key=R2_SECRET,
            config=BotoConfig(signature_version="s3v4"),
            region_name="auto",
        )
        client.put_object(
            Bucket=R2_BUCKET,
            Key=r2_key,
            Body=data,
            ContentType=content_type,
        )
        return f"https://{R2_BUCKET}.{R2_ACCOUNT}.r2.cloudflarestorage.com/{r2_key}"
    except Exception as exc:
        log.warning(f"[carrusel] R2 upload failed: {exc}")
        return None


async def generate_carrusel(
    db,
    *,
    carrusel_id: str,
    pages_data: Dict[str, Any],
    brand_kit: Optional[Dict[str, Any]] = None,
    aspect_ratios: Optional[List[str]] = None,
    variant_label: str = "single",
) -> Dict[str, Any]:
    """Renderiza y sube a R2. Retorna r2_keys dict."""
    ratios = aspect_ratios or ALL_RATIOS
    logo_img = None
    if brand_kit and brand_kit.get("logo_url"):
        logo_img = _fetch_logo(brand_kit["logo_url"], max_h=max(40, 60))

    r2_keys: Dict[str, str] = {}
    r2_urls: Dict[str, str] = {}

    for ratio in ratios:
        try:
            png_bytes = render_carrusel_ratio(
                ratio,
                pages_data=pages_data,
                brand_kit=brand_kit,
                logo_img=logo_img,
            )
            r2_key = f"carruseles/{carrusel_id}/{ratio.replace(':', 'x')}_hero.png"
            url = _upload_r2(r2_key, png_bytes, "image/png")
            r2_keys[ratio] = r2_key
            r2_urls[ratio] = url or ""
        except Exception as exc:
            log.warning(f"[carrusel] ratio {ratio} failed: {exc}")
            r2_keys[ratio] = ""
            r2_urls[ratio] = ""

    return {"r2_keys": r2_keys, "r2_urls": r2_urls}


async def generate_carrusel_job(
    db,
    *,
    tenant_id: str,
    user_id: str,
    copy_id: Optional[str],
    brand_kit_id: Optional[str],
    pages_data: Dict[str, Any],
    aspect_ratios: Optional[List[str]],
    ab_test_bool: bool = False,
    hook_score_pre_gate_min: int = 60,
    project_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Crea jobs de carrusel. Si ab_test_bool=True crea 2 variants."""
    from studio_hook_score_engine import compute_hook_score

    # Z.2.3 fix: hidratar pages_data desde copy_id si NO se proveyó pages_data
    # Schema real: pages_data está en TOP-LEVEL del documento (no anidado en output)
    if copy_id and (not pages_data or not pages_data.get("hero")):
        try:
            copy_doc = await db.studio_copy_jobs.find_one({"id": copy_id})
            if copy_doc and copy_doc.get("status") == "ready":
                hydrated = copy_doc.get("pages_data") or {}
                if hydrated.get("hero"):
                    pages_data = hydrated
                    log.info(f"[carrusel] hydrated pages_data from copy_id={copy_id}")
        except Exception as exc:
            log.warning(f"[carrusel] hydrate copy_id={copy_id} failed: {exc}")

    # Hook score gate
    hero_title = (pages_data.get("hero") or {}).get("title", "")
    copy_text = hero_title + " " + (pages_data.get("cta") or {}).get("text", "")
    hook_data = await compute_hook_score(copy_text.strip())
    hook_score = hook_data["total"]

    if hook_score < hook_score_pre_gate_min:
        return {
            "ok": False,
            "gate": True,
            "hook_score": hook_score,
            "hook_breakdown": hook_data["scores"],
            "suggestion": hook_data["suggestion"],
            "error": f"Hook score {hook_score} < minimo {hook_score_pre_gate_min}. Mejora el copy antes de generar.",
        }

    # Get active brand kit
    brand_kit = None
    if brand_kit_id:
        bk = await db.brand_kits.find_one({"id": brand_kit_id}, {"_id": 0})
        brand_kit = bk
    if not brand_kit:
        bk_active = await db.brand_kits.find_one({"user_id": user_id, "is_active": True}, {"_id": 0})
        brand_kit = bk_active

    import asyncio as _asyncio

    if not ab_test_bool:
        car_id = f"cr_{uuid.uuid4().hex[:16]}"
        now = datetime.now(timezone.utc)
        await db.studio_carruseles.insert_one({
            "id": car_id, "tenant_id": tenant_id, "user_id": user_id,
            "project_id": project_id, "copy_id": copy_id,
            "brand_kit_id": brand_kit_id or (brand_kit or {}).get("id"),
            "pages_data": pages_data, "aspect_ratios": aspect_ratios or ALL_RATIOS,
            "r2_keys": {}, "r2_urls": {}, "variant_label": "single", "ab_group_id": None,
            "hook_score": hook_score, "clicks": 0, "conversions": 0,
            "status": "rendering", "created_at": now,
        })
        _asyncio.create_task(_run_render(db, car_id, pages_data, brand_kit, aspect_ratios or ALL_RATIOS))
        return {"ok": True, "carrusel_id": car_id, "hook_score": hook_score}

    # A/B: crea 2 variants
    ab_id = f"ab_{uuid.uuid4().hex[:14]}"
    car_a_id = f"cr_{uuid.uuid4().hex[:16]}"
    car_b_id = f"cr_{uuid.uuid4().hex[:16]}"
    now = datetime.now(timezone.utc)

    for car_id, label in [(car_a_id, "A"), (car_b_id, "B")]:
        await db.studio_carruseles.insert_one({
            "id": car_id, "tenant_id": tenant_id, "user_id": user_id,
            "project_id": project_id, "copy_id": copy_id,
            "brand_kit_id": brand_kit_id or (brand_kit or {}).get("id"),
            "pages_data": pages_data, "aspect_ratios": aspect_ratios or ALL_RATIOS,
            "r2_keys": {}, "r2_urls": {}, "variant_label": label, "ab_group_id": ab_id,
            "hook_score": hook_score, "clicks": 0, "conversions": 0,
            "status": "rendering", "created_at": now,
        })
        _asyncio.create_task(_run_render(db, car_id, pages_data, brand_kit, aspect_ratios or ALL_RATIOS))

    await db.studio_carrusel_ab_groups.insert_one({
        "id": ab_id, "user_id": user_id, "project_id": project_id,
        "copy_id": copy_id,
        "variant_a_carrusel_id": car_a_id,
        "variant_b_carrusel_id": car_b_id,
        "winner_id": None,
        "stats": {"a_clicks": 0, "b_clicks": 0, "a_conversions": 0, "b_conversions": 0},
        "status": "active", "created_at": now,
    })
    return {"ok": True, "ab_group_id": ab_id, "carrusel_a_id": car_a_id, "carrusel_b_id": car_b_id, "hook_score": hook_score}


async def _run_render(db, car_id: str, pages_data: Dict, brand_kit: Optional[Dict], ratios: List[str]):
    try:
        result = await generate_carrusel(
            db, carrusel_id=car_id, pages_data=pages_data,
            brand_kit=brand_kit, aspect_ratios=ratios,
        )
        await db.studio_carruseles.update_one(
            {"id": car_id},
            {"$set": {"r2_keys": result["r2_keys"], "r2_urls": result["r2_urls"], "status": "done"}},
        )
        log.info(f"[carrusel] render done: {car_id}")
    except Exception as exc:
        log.warning(f"[carrusel] render failed {car_id}: {exc}")
        await db.studio_carruseles.update_one(
            {"id": car_id}, {"$set": {"status": "failed", "error": str(exc)}}
        )


async def track_event(db, carrusel_id: str, event_type: str, variant: Optional[str] = None) -> bool:
    inc = {}
    if event_type == "click":
        inc["clicks"] = 1
    elif event_type == "conversion":
        inc["conversions"] = 1
    elif event_type == "view":
        pass
    if inc:
        await db.studio_carruseles.update_one({"id": carrusel_id}, {"$inc": inc})

    # Update AB group stats
    car = await db.studio_carruseles.find_one({"id": carrusel_id}, {"_id": 0, "ab_group_id": 1, "variant_label": 1})
    if car and car.get("ab_group_id") and event_type in ("click", "conversion"):
        label = (car.get("variant_label") or "single").lower()
        ab_field = f"{label}_{event_type}s" if label in ("a", "b") else None
        if ab_field:
            await db.studio_carrusel_ab_groups.update_one(
                {"id": car["ab_group_id"]},
                {"$inc": {f"stats.{ab_field}": 1}},
            )
    return True


async def ensure_indexes(db) -> None:
    await db.studio_carruseles.create_index([("user_id", 1), ("created_at", -1)], background=True)
    await db.studio_carruseles.create_index("id", unique=True, background=True)
    await db.studio_carrusel_ab_groups.create_index([("user_id", 1), ("created_at", -1)], background=True)
    await db.studio_carrusel_ab_groups.create_index("id", unique=True, background=True)
    log.info("[studio_carrusel] indexes OK")
