"""W5.22 Z.8.7 — Studio Copy Generator package."""
from .loader import load_prompt_md
from .router import TEMPLATE_REGISTRY, get_prompt_for_template, build_llm_input, generate_copy
from .llm_client import call_llm
from .schemas import CopyGenerationRequest, CopyGenerationResponse

__all__ = [
    "load_prompt_md",
    "TEMPLATE_REGISTRY",
    "get_prompt_for_template",
    "build_llm_input",
    "generate_copy",
    "call_llm",
    "CopyGenerationRequest",
    "CopyGenerationResponse",
]
