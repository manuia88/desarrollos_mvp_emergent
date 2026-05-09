"""W4.5 Y.2A — Reusable resilience primitives for Phase Y sub-agents.

Exposes:
  LocalCache         — in-memory TTL cache with asyncio lock
  FallbackChain      — executes layers in order (llm → cache → heuristic)
  CircuitBreaker     — opens after N failures, recovers after M seconds
  CircuitOpenError   — raised when circuit is open
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Callable, Dict, List, Optional

log = logging.getLogger("dmx.sub_agents.resilience")


# ─── LocalCache ────────────────────────────────────────────────────────────────
class LocalCache:
    """In-memory TTL cache. NOT shared between processes."""

    def __init__(self, ttl_seconds: int = 3600):
        self.ttl = ttl_seconds
        self._store: Dict[str, Any] = {}
        self._timestamps: Dict[str, float] = {}
        self._lock = asyncio.Lock()

    async def get(self, key: str) -> Optional[Any]:
        async with self._lock:
            if key not in self._store:
                return None
            if time.monotonic() - self._timestamps[key] > self.ttl:
                del self._store[key]
                del self._timestamps[key]
                return None
            return self._store[key]

    async def set(self, key: str, value: Any) -> None:
        async with self._lock:
            self._store[key] = value
            self._timestamps[key] = time.monotonic()

    async def invalidate(self, pattern: str) -> int:
        """Removes keys containing pattern. Returns count removed."""
        async with self._lock:
            to_del = [k for k in list(self._store.keys()) if pattern in k]
            for k in to_del:
                del self._store[k]
                self._timestamps.pop(k, None)
            return len(to_del)


# ─── FallbackChain ─────────────────────────────────────────────────────────────
class FallbackChain:
    """
    Executes up to 3 async callable layers in order.
    layer1 → if fails/None → layer2 → if fails/None → layer3
    Returns dict: {result, layer_used, latency_ms}
    """

    LAYER_NAMES = ["llm", "cache", "heuristic"]

    def __init__(self, layers: List[Callable]):
        if not layers:
            raise ValueError("FallbackChain requires at least one layer")
        self._layers = layers[:3]

    async def execute(self, input_data: Any) -> Dict[str, Any]:
        t_start = time.monotonic()
        for i, layer in enumerate(self._layers):
            layer_name = self.LAYER_NAMES[i] if i < len(self.LAYER_NAMES) else f"layer{i}"
            try:
                result = await layer(input_data)
                if result is not None:
                    return {
                        "result": result,
                        "layer_used": layer_name,
                        "latency_ms": int((time.monotonic() - t_start) * 1000),
                    }
                log.debug(f"[FallbackChain] layer={layer_name} returned None, trying next")
            except Exception as exc:
                log.warning(f"[FallbackChain] layer={layer_name} failed: {exc}")
        return {
            "result": None,
            "layer_used": "none",
            "latency_ms": int((time.monotonic() - t_start) * 1000),
        }


# ─── CircuitBreaker ────────────────────────────────────────────────────────────
class CircuitOpenError(Exception):
    """Raised when the circuit breaker is open."""


class CircuitBreaker:
    """
    Per-agent_type circuit breaker. State is class-level (shared in-process).

    States:
      closed   — normal operation
      open     — rejecting requests after failure_threshold failures
      half_open — one attempt allowed after recovery_seconds

    Usage:
        cb = CircuitBreaker("pricing")
        if cb.is_open():
            raise CircuitOpenError(...)
        try:
            result = await cb.call(my_llm_func, *args)
        except CircuitOpenError:
            # skip to next layer
    """

    _state: Dict[str, Dict[str, Any]] = {}

    def __init__(self, agent_type: str, failure_threshold: int = 5, recovery_seconds: int = 60):
        self.agent_type = agent_type
        self.threshold = failure_threshold
        self.recovery = recovery_seconds
        if agent_type not in self._state:
            self._state[agent_type] = {
                "failures": 0,
                "status": "closed",
                "opened_at": None,
            }

    def _st(self) -> Dict[str, Any]:
        return self._state[self.agent_type]

    def is_open(self) -> bool:
        st = self._st()
        if st["status"] == "closed":
            return False
        if st["status"] == "open":
            if st["opened_at"] and (time.monotonic() - st["opened_at"]) >= self.recovery:
                st["status"] = "half_open"
                log.info(f"[CircuitBreaker] {self.agent_type} → half_open (recovery expired)")
                return False
            return True
        # half_open: allow one attempt
        return False

    def record_success(self) -> None:
        st = self._st()
        if st["status"] != "closed":
            log.info(f"[CircuitBreaker] {self.agent_type} → closed (success)")
        st["failures"] = 0
        st["status"] = "closed"
        st["opened_at"] = None

    def record_failure(self) -> None:
        st = self._st()
        st["failures"] += 1
        if st["failures"] >= self.threshold and st["status"] == "closed":
            st["status"] = "open"
            st["opened_at"] = time.monotonic()
            log.warning(
                f"[CircuitBreaker] {self.agent_type} circuit OPENED after {st['failures']} failures"
            )

    async def call(self, func: Callable, *args, **kwargs) -> Any:
        """Wraps async func call with circuit breaker logic."""
        if self.is_open():
            raise CircuitOpenError(f"Circuit breaker OPEN for agent_type={self.agent_type}")
        try:
            result = await func(*args, **kwargs)
            self.record_success()
            return result
        except CircuitOpenError:
            raise
        except Exception:
            self.record_failure()
            raise
