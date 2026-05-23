"""W5.16-B · Multi-ratio video renderer · ffmpeg-python crop+pad.

Toma un MASTER video URL y produce 3 ratios en paralelo:
  - 1:1   reel        1080x1080
  - 9:16  stories     1080x1920
  - 16:9  youtube     1920x1080

STUB-AWARE: si ffmpeg no esta disponible (binario o `ffmpeg-python` package),
o si master_video_url empieza con `stub://`, genera 3 URLs stub sin tocar
filesystem · feature demo-able sin dependencias externas.

Estrategia crop+pad:
  - 1:1   → crop_to_square (centro)
  - 9:16  → crop_to_portrait (centro) o pad si master es 16:9
  - 16:9  → resize_to_landscape (sin distorsion · pad si necesario)
"""
from __future__ import annotations

import asyncio
import logging
import os
import shutil
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

log = logging.getLogger("dmx.multiratio_renderer")

OUTPUT_ROOT = Path(os.environ.get("STUDIO_VIDEO_OUTPUT_PATH", "/app/backend/outputs/studio_video"))

RATIO_SPECS: Dict[str, Tuple[int, int]] = {
    "1:1": (1080, 1080),
    "9:16": (1080, 1920),
    "16:9": (1920, 1080),
}


def _ffmpeg_available() -> bool:
    if shutil.which("ffmpeg") is None:
        return False
    try:
        import ffmpeg  # noqa: F401
        return True
    except Exception:
        return False


def _stub_output_url(task_id: str, ratio: str) -> str:
    safe_ratio = ratio.replace(":", "x")
    return f"stub://studio_video/{task_id}/{safe_ratio}.mp4"


def _stub_response(task_id: str, reason: str) -> Dict[str, Any]:
    return {
        "1:1": _stub_output_url(task_id, "1:1"),
        "9:16": _stub_output_url(task_id, "9:16"),
        "16:9": _stub_output_url(task_id, "16:9"),
        "is_stub": True,
        "reason": reason,
        "task_id": task_id,
    }


def _ensure_task_dir(task_id: str) -> Path:
    out_dir = OUTPUT_ROOT / task_id
    out_dir.mkdir(parents=True, exist_ok=True)
    return out_dir


async def _download_master(master_url: str, dest: Path) -> bool:
    """Descarga master_url a dest. Retorna True si exito, False fail-soft."""
    if not master_url:
        return False
    if master_url.startswith("file://"):
        src = Path(master_url[len("file://"):])
        if src.exists():
            try:
                shutil.copy2(src, dest)
                return True
            except Exception as exc:
                log.warning(f"[multiratio] local copy failed: {exc}")
                return False
        return False
    try:
        import httpx
        async with httpx.AsyncClient(timeout=120, follow_redirects=True) as cli:
            async with cli.stream("GET", master_url) as resp:
                if resp.status_code != 200:
                    log.warning(f"[multiratio] master download status {resp.status_code}")
                    return False
                with dest.open("wb") as fh:
                    async for chunk in resp.aiter_bytes(1024 * 64):
                        fh.write(chunk)
        return True
    except Exception as exc:
        log.warning(f"[multiratio] master download error: {exc}")
        return False


def _ratio_filter_chain(target_w: int, target_h: int) -> str:
    """Build ffmpeg vf chain: scale to cover target, center crop, pad if smaller."""
    return (
        f"scale=w={target_w}:h={target_h}:force_original_aspect_ratio=increase,"
        f"crop={target_w}:{target_h},"
        f"pad={target_w}:{target_h}:(ow-iw)/2:(oh-ih)/2:black"
    )


async def _render_one_ratio(
    master_local: Path,
    output_path: Path,
    target_w: int,
    target_h: int,
) -> bool:
    """Run ffmpeg-python pipeline · fail-soft retorna False."""
    try:
        import ffmpeg
    except Exception as exc:
        log.warning(f"[multiratio] ffmpeg-python import failed: {exc}")
        return False

    def _run() -> bool:
        try:
            stream = (
                ffmpeg
                .input(str(master_local))
                .output(
                    str(output_path),
                    vf=_ratio_filter_chain(target_w, target_h),
                    vcodec="libx264", acodec="aac",
                    preset="medium", crf=23, movflags="+faststart",
                    pix_fmt="yuv420p",
                )
                .overwrite_output()
            )
            ffmpeg.run(stream, capture_stdout=True, capture_stderr=True, quiet=True)
            return output_path.exists() and output_path.stat().st_size > 0
        except Exception as exc:
            log.warning(f"[multiratio] ffmpeg run failed {target_w}x{target_h}: {exc}")
            return False

    return await asyncio.to_thread(_run)


async def _verify_dimensions(path: Path, expected_w: int, expected_h: int) -> bool:
    """ffprobe verify width/height match. Fail-open True si ffprobe missing."""
    if shutil.which("ffprobe") is None:
        return True
    try:
        import ffmpeg
    except Exception:
        return True

    def _probe() -> bool:
        try:
            info = ffmpeg.probe(str(path))
            for stream in info.get("streams", []):
                if stream.get("codec_type") == "video":
                    w = int(stream.get("width") or 0)
                    h = int(stream.get("height") or 0)
                    return w == expected_w and h == expected_h
            return False
        except Exception as exc:
            log.warning(f"[multiratio] ffprobe failed: {exc}")
            return True  # fail-open

    return await asyncio.to_thread(_probe)


async def render_multiratio(master_video_url: str, task_id: str) -> Dict[str, Any]:
    """Genera 3 ratios desde master_video_url en paralelo.

    Returns:
        {"1:1": url, "9:16": url, "16:9": url, "is_stub": bool, "task_id": str}
    """
    if not master_video_url or master_video_url.startswith("stub://"):
        return _stub_response(task_id, "master_is_stub")

    if not _ffmpeg_available():
        log.warning("[multiratio] ffmpeg not available · stub outputs")
        return _stub_response(task_id, "ffmpeg_unavailable")

    out_dir = _ensure_task_dir(task_id)
    master_local = out_dir / "master.mp4"

    ok = await _download_master(master_video_url, master_local)
    if not ok:
        return _stub_response(task_id, "master_download_failed")

    # Render 3 ratios paralelo
    targets: List[Tuple[str, Path, int, int]] = []
    for ratio, (w, h) in RATIO_SPECS.items():
        safe_ratio = ratio.replace(":", "x")
        targets.append((ratio, out_dir / f"{safe_ratio}.mp4", w, h))

    results = await asyncio.gather(
        *[_render_one_ratio(master_local, p, w, h) for (_, p, w, h) in targets],
        return_exceptions=True,
    )

    output: Dict[str, Any] = {"task_id": task_id, "is_stub": False}
    any_failed = False
    for (ratio, path, w, h), ok_render in zip(targets, results):
        if isinstance(ok_render, Exception) or not ok_render:
            any_failed = True
            output[ratio] = _stub_output_url(task_id, ratio)
            continue
        # Optional dimension verify
        dim_ok = await _verify_dimensions(path, w, h)
        if not dim_ok:
            log.warning(f"[multiratio] dimension mismatch for {ratio}")
        # File URL · presigned URL R2 podra venir en futuro batch
        rel = path.relative_to(OUTPUT_ROOT.parent) if OUTPUT_ROOT.parent in path.parents else path
        output[ratio] = f"file://{path}"

    if any_failed:
        output["is_stub"] = True
        output["reason"] = "partial_render_failure"

    return output
