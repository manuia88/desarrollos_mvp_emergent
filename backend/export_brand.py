"""W4.2C — Brand watermark + QR helpers for DMX exports.

add_watermark(image_path_or_bytes) — overlay "DesarrollosMX · dmx.mx" bottom-right.
generate_qr(url)                   — QR PNG in DMX brand colors.
"""
from __future__ import annotations

import logging
from io import BytesIO
from typing import Union

log = logging.getLogger("dmx.export_brand")

WATERMARK_TEXT = "DesarrollosMX · dmx.mx"
WATERMARK_COLOR = (240, 235, 224, 153)   # cream #F0EBE0 at opacity ~0.6
WATERMARK_FONT_SIZE = 18
WATERMARK_PADDING = 14


def add_watermark(image_path_or_bytes: Union[str, bytes], output_format: str = "PNG") -> bytes:
    """Add brand watermark bottom-right to a PNG/JPEG image.

    Args:
        image_path_or_bytes: file path string or raw bytes.
        output_format: "PNG" or "JPEG" (default PNG).

    Returns:
        Image bytes with watermark applied.
    """
    from PIL import Image, ImageDraw, ImageFont  # lazy import to avoid startup cost

    if isinstance(image_path_or_bytes, (bytes, bytearray)):
        img = Image.open(BytesIO(image_path_or_bytes)).convert("RGBA")
    else:
        img = Image.open(image_path_or_bytes).convert("RGBA")

    txt_layer = Image.new("RGBA", img.size, (255, 255, 255, 0))
    draw = ImageDraw.Draw(txt_layer)

    # Font — try DejaVuSans (available in most Linux environments), fallback to default
    font = None
    for font_path in [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/TTF/DejaVuSans.ttf",
        "DejaVuSans.ttf",
    ]:
        try:
            from PIL import ImageFont as _IF
            font = _IF.truetype(font_path, WATERMARK_FONT_SIZE)
            break
        except (IOError, OSError):
            continue
    if font is None:
        from PIL import ImageFont as _IF
        font = _IF.load_default()

    bbox = draw.textbbox((0, 0), WATERMARK_TEXT, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    pos = (img.size[0] - tw - WATERMARK_PADDING, img.size[1] - th - WATERMARK_PADDING)
    draw.text(pos, WATERMARK_TEXT, fill=WATERMARK_COLOR, font=font)

    out = Image.alpha_composite(img, txt_layer)
    buf = BytesIO()
    out.convert("RGB").save(buf, format=output_format)
    return buf.getvalue()


def generate_qr(url: str, size: int = 200) -> bytes:
    """Generate a QR code PNG in DMX brand colors.

    Args:
        url:  URL to encode.
        size: approximate pixel size (controls box_size).

    Returns:
        PNG bytes.
    """
    import qrcode  # already in requirements.txt

    box_size = max(4, size // 25)
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=box_size,
        border=3,
    )
    qr.add_data(url)
    qr.make(fit=True)

    img = qr.make_image(fill_color="#0D1017", back_color="#F0EBE0")
    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()
