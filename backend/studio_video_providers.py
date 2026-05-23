"""W5.16-B · Studio Video providers · Luma / Pika / Runway / Replicate Kling.

Interface unificada `BaseVideoAdapter.generate(script, image_url, duration_sec)`.
STUB-AWARE: si la API key no esta en env (o si la llamada falla), retorna
mock con `is_stub=True` y URL `stub://<provider>/<task_id>.mp4`. Esto permite
demo end-to-end sin credito en ningun provider externo.

Fallback chain preferido (manejado por `generate_with_fallback`):
    luma > pika > runway > replicate_kling

Reusa `studio_engines.video_kling_replicate` ya existente para el adapter Kling.
"""
from __future__ import annotations

import asyncio
import logging
import os
import uuid
from typing import Any, Dict, List, Optional

import httpx

log = logging.getLogger("dmx.studio_video_providers")

# Approx pricing per provider (USD per video · solo para budget tracking · NO real-time)
COST_USD_LUMA = 0.40
COST_USD_PIKA = 0.30
COST_USD_RUNWAY = 0.50
COST_USD_KLING = 0.35

# Preferred fallback order
FALLBACK_ORDER: List[str] = ["luma", "pika", "runway", "replicate_kling"]


def _stub_url(provider: str, task_id: str) -> str:
    return f"stub://{provider}/{task_id}.mp4"


def _stub_response(provider: str, task_id: str, reason: str = "no_api_key") -> Dict[str, Any]:
    return {
        "provider": provider,
        "url": _stub_url(provider, task_id),
        "is_stub": True,
        "cost_usd": 0.0,
        "tokens_in": 0,
        "tokens_out": 0,
        "duration_sec": 0,
        "reason": reason,
    }


class BaseVideoAdapter:
    name: str = "base"
    api_key_env: str = ""
    approx_cost_usd: float = 0.0

    def has_credentials(self) -> bool:
        if not self.api_key_env:
            return False
        return bool(os.environ.get(self.api_key_env))

    async def generate(self, script: str, image_url: Optional[str], duration_sec: int) -> Dict[str, Any]:
        raise NotImplementedError

    async def status(self, job_id: str) -> Dict[str, Any]:
        return {"provider": self.name, "job_id": job_id, "status": "completed", "is_stub": True}

    async def get_result(self, job_id: str) -> Dict[str, Any]:
        return _stub_response(self.name, job_id, "stub_get_result")


class LumaAdapter(BaseVideoAdapter):
    name = "luma"
    api_key_env = "LUMA_API_KEY"
    approx_cost_usd = COST_USD_LUMA

    async def generate(self, script: str, image_url: Optional[str], duration_sec: int) -> Dict[str, Any]:
        task_id = uuid.uuid4().hex[:14]
        if not self.has_credentials():
            return _stub_response(self.name, task_id, "no_api_key")

        api_key = os.environ.get(self.api_key_env)
        url = "https://api.lumalabs.ai/dream-machine/v1/generations"
        payload = {
            "prompt": (script or "")[:1500],
            "aspect_ratio": "16:9",
            "loop": False,
        }
        if image_url:
            payload["keyframes"] = {"frame0": {"type": "image", "url": image_url}}
        try:
            async with httpx.AsyncClient(timeout=60) as cli:
                resp = await cli.post(
                    url,
                    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                    json=payload,
                )
        except Exception as exc:
            log.warning(f"[luma] network error · stub fallback: {exc}")
            return _stub_response(self.name, task_id, "network_error")

        if resp.status_code in (200, 201, 202):
            try:
                body = resp.json()
            except Exception:
                body = {}
            video_url = (
                (body.get("assets") or {}).get("video")
                or body.get("video_url")
                or body.get("url")
            )
            job_id = body.get("id") or body.get("generation_id") or task_id
            if not video_url:
                # async job · poll briefly
                video_url = await self._poll_async(api_key, job_id)
            if not video_url:
                return _stub_response(self.name, task_id, "luma_no_url_after_poll")
            return {
                "provider": self.name,
                "url": video_url,
                "is_stub": False,
                "cost_usd": self.approx_cost_usd,
                "tokens_in": len(script or "") // 4,
                "tokens_out": 0,
                "duration_sec": duration_sec,
                "job_id": job_id,
            }

        log.warning(f"[luma] api error {resp.status_code} · stub fallback")
        return _stub_response(self.name, task_id, f"luma_api_{resp.status_code}")

    async def _poll_async(self, api_key: str, job_id: str, max_attempts: int = 6) -> Optional[str]:
        url = f"https://api.lumalabs.ai/dream-machine/v1/generations/{job_id}"
        for _ in range(max_attempts):
            await asyncio.sleep(5)
            try:
                async with httpx.AsyncClient(timeout=15) as cli:
                    r = await cli.get(url, headers={"Authorization": f"Bearer {api_key}"})
                if r.status_code == 200:
                    body = r.json()
                    if (body.get("state") in ("completed", "ready")) or body.get("assets", {}).get("video"):
                        return body.get("assets", {}).get("video") or body.get("video_url")
            except Exception:
                continue
        return None


class PikaAdapter(BaseVideoAdapter):
    name = "pika"
    api_key_env = "PIKA_API_KEY"
    approx_cost_usd = COST_USD_PIKA

    async def generate(self, script: str, image_url: Optional[str], duration_sec: int) -> Dict[str, Any]:
        task_id = uuid.uuid4().hex[:14]
        if not self.has_credentials():
            return _stub_response(self.name, task_id, "no_api_key")

        api_key = os.environ.get(self.api_key_env)
        url = "https://api.pika.art/v1/generate"
        payload = {
            "prompt": (script or "")[:1500],
            "aspect_ratio": "16:9",
            "duration": min(10, max(3, duration_sec // 6)),
        }
        if image_url:
            payload["image"] = image_url
        try:
            async with httpx.AsyncClient(timeout=60) as cli:
                resp = await cli.post(
                    url,
                    headers={"x-api-key": api_key, "Content-Type": "application/json"},
                    json=payload,
                )
        except Exception as exc:
            log.warning(f"[pika] network error · stub fallback: {exc}")
            return _stub_response(self.name, task_id, "network_error")

        if resp.status_code in (200, 201, 202):
            try:
                body = resp.json()
            except Exception:
                body = {}
            video_url = body.get("video_url") or body.get("url") or (body.get("data") or {}).get("video_url")
            if not video_url:
                return _stub_response(self.name, task_id, "pika_no_url")
            return {
                "provider": self.name,
                "url": video_url,
                "is_stub": False,
                "cost_usd": self.approx_cost_usd,
                "tokens_in": len(script or "") // 4,
                "tokens_out": 0,
                "duration_sec": duration_sec,
                "job_id": body.get("id") or task_id,
            }

        log.warning(f"[pika] api error {resp.status_code} · stub fallback")
        return _stub_response(self.name, task_id, f"pika_api_{resp.status_code}")


class RunwayAdapter(BaseVideoAdapter):
    name = "runway"
    api_key_env = "RUNWAY_API_KEY"
    approx_cost_usd = COST_USD_RUNWAY

    async def generate(self, script: str, image_url: Optional[str], duration_sec: int) -> Dict[str, Any]:
        task_id = uuid.uuid4().hex[:14]
        if not self.has_credentials():
            return _stub_response(self.name, task_id, "no_api_key")

        api_key = os.environ.get(self.api_key_env)
        url = "https://api.runwayml.com/v1/image_to_video"
        payload: Dict[str, Any] = {
            "promptText": (script or "")[:1500],
            "duration": min(10, max(5, duration_sec // 6)),
            "ratio": "1280:768",
            "model": "gen3a_turbo",
        }
        if image_url:
            payload["promptImage"] = image_url
        try:
            async with httpx.AsyncClient(timeout=60) as cli:
                resp = await cli.post(
                    url,
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                        "X-Runway-Version": "2024-11-06",
                    },
                    json=payload,
                )
        except Exception as exc:
            log.warning(f"[runway] network error · stub fallback: {exc}")
            return _stub_response(self.name, task_id, "network_error")

        if resp.status_code in (200, 201, 202):
            try:
                body = resp.json()
            except Exception:
                body = {}
            video_url = body.get("output_url") or body.get("url") or (body.get("output") or [None])[0]
            if not video_url:
                return _stub_response(self.name, task_id, "runway_no_url")
            return {
                "provider": self.name,
                "url": str(video_url),
                "is_stub": False,
                "cost_usd": self.approx_cost_usd,
                "tokens_in": len(script or "") // 4,
                "tokens_out": 0,
                "duration_sec": duration_sec,
                "job_id": body.get("id") or task_id,
            }

        log.warning(f"[runway] api error {resp.status_code} · stub fallback")
        return _stub_response(self.name, task_id, f"runway_api_{resp.status_code}")


class ReplicateKlingAdapter(BaseVideoAdapter):
    """Wrapper de `studio_engines.video_kling_replicate` ya existente."""
    name = "replicate_kling"
    api_key_env = "REPLICATE_API_TOKEN"
    approx_cost_usd = COST_USD_KLING

    async def generate(self, script: str, image_url: Optional[str], duration_sec: int) -> Dict[str, Any]:
        task_id = uuid.uuid4().hex[:14]
        if not self.has_credentials():
            return _stub_response(self.name, task_id, "no_api_key")
        try:
            from studio_engines import video_kling_replicate
            # video_kling_replicate signature: (script: Dict, duration: int, video_id: str)
            script_payload = {"text": script, "image_url": image_url}
            result = await video_kling_replicate(script_payload, duration_sec, task_id)
        except Exception as exc:
            log.warning(f"[replicate_kling] error · stub fallback: {exc}")
            return _stub_response(self.name, task_id, f"kling_error_{type(exc).__name__}")

        # result shape: {engine, file_path, size_bytes, cost_usd, prompt_used}
        file_path = result.get("file_path") if isinstance(result, dict) else None
        if not file_path:
            return _stub_response(self.name, task_id, "kling_no_file")
        url = f"file://{file_path}" if not str(file_path).startswith("http") else str(file_path)
        return {
            "provider": self.name,
            "url": url,
            "is_stub": False,
            "cost_usd": float(result.get("cost_usd") or self.approx_cost_usd),
            "tokens_in": len(script or "") // 4,
            "tokens_out": 0,
            "duration_sec": duration_sec,
            "job_id": task_id,
        }


_REGISTRY: Dict[str, BaseVideoAdapter] = {
    "luma": LumaAdapter(),
    "pika": PikaAdapter(),
    "runway": RunwayAdapter(),
    "replicate_kling": ReplicateKlingAdapter(),
}


def get_provider(name: str) -> BaseVideoAdapter:
    key = (name or "").strip().lower()
    if key not in _REGISTRY:
        raise ValueError(f"provider invalido: {name} · soportados: {sorted(_REGISTRY.keys())}")
    return _REGISTRY[key]


async def generate_with_fallback(
    script: str,
    image_url: Optional[str],
    duration_sec: int,
    preferred: Optional[str] = None,
) -> Dict[str, Any]:
    """Intenta provider preferred · si retorna is_stub + tenia credentials, sigue al siguiente.

    Fallback chain: si el preferred retorna stub por error (no por falta de api_key),
    se intenta el siguiente provider con credentials. Si todos fallan o ninguno tiene
    credentials, retorna stub del primer provider intentado.
    """
    order: List[str] = []
    if preferred and preferred in _REGISTRY:
        order.append(preferred)
    for p in FALLBACK_ORDER:
        if p not in order:
            order.append(p)

    last_result: Optional[Dict[str, Any]] = None
    attempts: List[Dict[str, Any]] = []
    for prov_name in order:
        adapter = _REGISTRY[prov_name]
        had_creds_before = adapter.has_credentials()
        try:
            res = await adapter.generate(script, image_url, duration_sec)
        except Exception as exc:
            log.warning(f"[provider_fallback] {prov_name} threw: {exc}")
            res = _stub_response(prov_name, uuid.uuid4().hex[:14], f"thrown_{type(exc).__name__}")
        attempts.append({"provider": prov_name, "is_stub": res.get("is_stub"), "reason": res.get("reason")})
        last_result = res
        # Si exito (no stub) -> done
        if not res.get("is_stub"):
            res["fallback_attempts"] = attempts
            return res
        # Si stub por falta de api_key, intentar siguiente provider que SI tenga key
        if res.get("reason") != "no_api_key" or not had_creds_before:
            # error real distinto a no_api_key · seguir intentando
            continue
        # no_api_key sin creds previo: continuar al siguiente

    if last_result is None:
        # No deberia pasar · safety
        last_result = _stub_response("luma", uuid.uuid4().hex[:14], "no_providers")
    last_result["fallback_attempts"] = attempts
    return last_result
