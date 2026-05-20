"""W5.22 Z.8.7 Sub-B · Pydantic schemas para copy generation request/response."""
from __future__ import annotations

from typing import Any, Dict, Optional

from pydantic import BaseModel, Field


class CopyGenerationRequest(BaseModel):
    intake_id: str = Field(..., min_length=4, max_length=64)
    force_regenerate: bool = False


class CopyGenerationResponse(BaseModel):
    copy_json: Optional[Dict[str, Any]] = None
    cached: bool = False
    generation_time_ms: int = 0
    fallback: bool = False
    error: Optional[str] = None
