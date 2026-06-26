"""Cliente LLM DIRECTO (Anthropic / OpenAI) — reemplazo drop-in de `emergentintegrations.llm.chat`.

INDEPENDENCIA DE EMERGENT: en vez de mandar las llamadas por el proxy de Emergent (EMERGENT_LLM_KEY), van
DIRECTO a Anthropic/OpenAI con las llaves PROPIAS del founder (ANTHROPIC_API_KEY / OPENAI_API_KEY). Misma
interfaz exacta que la librería de Emergent, así que los ~71 archivos solo cambian el `import` (cero reescritura):

    from llm_client import LlmChat, UserMessage          # antes: from llm_client import ...
    chat = LlmChat(api_key=..., session_id=..., system_message=sys).with_model("anthropic", model)
    resp = await chat.send_message(UserMessage(text=prompt))   # -> str

Sin proxy, sin markup, sin dependencia de la plataforma. Si una llave no está, lanza RuntimeError (igual que antes).
"""
from __future__ import annotations

import logging
import os
from typing import Any, Optional

log = logging.getLogger("dmx.llm_client")

# Algunos IDs vienen abreviados; los normalizamos a un ID válido del API directo de Anthropic.
_MODEL_ALIASES = {
    "claude-haiku-4-5": "claude-haiku-4-5-20251001",
    "claude-sonnet-4-5": "claude-sonnet-4-5-20250929",
    "claude-sonnet-4": "claude-sonnet-4-5-20250929",
}
_DEFAULT_ANTHROPIC = "claude-sonnet-4-5-20250929"
_DEFAULT_OPENAI = "gpt-4o-mini"


class ImageContent:
    """Compat: imagen para visión (base64). dev_assets la usa para categorizar fotos."""

    def __init__(self, *args: Any, image_base64: Optional[str] = None, media_type: str = "image/jpeg", **_kw: Any):
        self.image_base64 = image_base64 or (args[0] if args else "")
        self.media_type = media_type or "image/jpeg"


class UserMessage:
    """Compat: un mensaje de usuario. Acepta text=/content= y file_contents=[ImageContent] (visión)."""

    def __init__(self, *args: Any, text: Optional[str] = None, content: Optional[str] = None,
                 file_contents: Optional[list] = None, **_kw: Any):
        val = text if text is not None else content
        if val is None and args:
            val = args[0]
        self.text = str(val or "")
        self.content = self.text
        self.file_contents = file_contents or []


class LlmChat:
    """Reemplazo drop-in de `emergentintegrations.llm.chat.LlmChat`. Va DIRECTO al SDK del proveedor."""

    def __init__(self, *args: Any, api_key: Optional[str] = None, session_id: Optional[str] = None,
                 system_message: Optional[str] = None, **_kw: Any):
        # api_key (la EMERGENT_LLM_KEY) se ignora a propósito: usamos las llaves propias por proveedor.
        self._system = system_message or ""
        self._session = session_id
        self._provider = "anthropic"
        self._model: Optional[str] = None
        self._max_tokens = 1024

    # ── fluent setters (igual que la librería) ──
    def with_model(self, provider: str, model: Optional[str] = None) -> "LlmChat":
        self._provider = (provider or "anthropic").lower()
        if model:
            self._model = model
        return self

    def with_max_tokens(self, n: Any) -> "LlmChat":
        try:
            self._max_tokens = max(1, min(int(n), 8192))
        except Exception:  # noqa: BLE001
            pass
        return self

    def with_system_message(self, msg: Optional[str]) -> "LlmChat":
        self._system = msg or ""
        return self

    # ── envío ──
    async def send_message(self, message: Any) -> str:
        text = getattr(message, "text", None)
        if text is None:
            text = message if isinstance(message, str) else str(message)
        images = list(getattr(message, "file_contents", []) or [])
        if self._provider == "openai":
            return await _openai_chat(self._system, text, self._model or _DEFAULT_OPENAI, self._max_tokens)
        return await _anthropic_chat(self._system, text, self._model or _DEFAULT_ANTHROPIC, self._max_tokens, images)

    # send_pulse: en la lib era una variante; aquí se comporta igual que send_message (devuelve el texto).
    async def send_pulse(self, message: Any) -> str:
        return await self.send_message(message)


async def _anthropic_chat(system: str, user_text: str, model: str, max_tokens: int, images: Optional[list] = None) -> str:
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        raise RuntimeError("ANTHROPIC_API_KEY no configurado")
    from anthropic import AsyncAnthropic
    model = _MODEL_ALIASES.get(model, model) or _DEFAULT_ANTHROPIC
    client = AsyncAnthropic(api_key=key)
    # Visión: si vienen imágenes (ImageContent), el contenido es una lista [texto, imagen…]; si no, texto plano.
    if images:
        content: Any = [{"type": "text", "text": user_text or ""}]
        for im in images:
            b64 = getattr(im, "image_base64", None)
            if b64:
                content.append({"type": "image", "source": {
                    "type": "base64", "media_type": getattr(im, "media_type", "image/jpeg"), "data": b64}})
    else:
        content = user_text or ""
    resp = await client.messages.create(
        model=model,
        max_tokens=max_tokens or 1024,
        system=system or "",
        messages=[{"role": "user", "content": content}],
    )
    parts = [getattr(b, "text", "") for b in (resp.content or []) if getattr(b, "type", "") == "text"]
    return "".join(parts).strip()


async def _openai_chat(system: str, user_text: str, model: str, max_tokens: int) -> str:
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        raise RuntimeError("OPENAI_API_KEY no configurado")
    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=key)
    msgs = []
    if system:
        msgs.append({"role": "system", "content": system})
    msgs.append({"role": "user", "content": user_text or ""})
    resp = await client.chat.completions.create(
        model=model or _DEFAULT_OPENAI,
        max_tokens=max_tokens or 1024,
        messages=msgs,
    )
    return (resp.choices[0].message.content or "").strip()


class OpenAIImageGeneration:
    """Compat: generación de imágenes (gpt-image-1) DIRECTO con OpenAI. Reemplaza la de emergentintegrations."""

    def __init__(self, *args: Any, api_key: Optional[str] = None, **_kw: Any):
        pass  # usa OPENAI_API_KEY propia

    async def generate_images(self, prompt: str = "", model: str = "gpt-image-1",
                              number_of_images: int = 1, **_kw: Any) -> list:
        import base64 as _b64
        key = os.environ.get("OPENAI_API_KEY")
        if not key:
            raise RuntimeError("OPENAI_API_KEY no configurado")
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=key)
        resp = await client.images.generate(
            model=model or "gpt-image-1", prompt=prompt or "", n=max(1, int(number_of_images or 1)))
        out = []
        for d in (resp.data or []):
            b64 = getattr(d, "b64_json", None)
            if b64:
                out.append(_b64.b64decode(b64))
        return out


def llm_available(provider: str = "anthropic") -> bool:
    """¿Hay llave para el proveedor? Útil para guards que antes miraban EMERGENT_LLM_KEY."""
    if (provider or "").lower() == "openai":
        return bool(os.environ.get("OPENAI_API_KEY"))
    return bool(os.environ.get("ANTHROPIC_API_KEY"))
