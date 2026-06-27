"""Rate-limiter en-proceso reutilizable (ventana deslizante por IP) para endpoints PÚBLICOS de escritura.

Evita que un bot infle/envenene colecciones (cubo de demanda, signals, favoritos) sin auth. Usa la IP del socket
real (request.client.host), NO x-forwarded-for (spoofable). Fail-soft: el caller decide saltarse la escritura cuando
`allow` devuelve False (no rompe la UX del usuario legítimo; solo frena el abuso masivo).
"""
import hashlib
import time
from collections import defaultdict, deque

_BUCKETS: dict = defaultdict(lambda: defaultdict(deque))


def client_ip(request) -> str:
    """IP REAL del cliente a prueba de spoofing — reusa el helper canónico (XFF salto-de-confianza en prod,
    socket en dev). Antes usaba SIEMPRE el socket → en prod agrupaba a TODOS por la IP del ingress (rate-limit
    demasiado agresivo). Ahora distingue al cliente real sin ser falsificable."""
    try:
        from ratelimit import client_ip as _canonical
        return _canonical(request) or "anon"
    except Exception:
        try:
            return (request.client.host if request and request.client else "") or "anon"
        except Exception:
            return "anon"


def allow(bucket: str, ip: str, limit: int, window: int = 60) -> bool:
    """True si esta IP puede escribir (≤ `limit` en los últimos `window` segundos) en `bucket`."""
    key = hashlib.sha256((ip or "anon").encode()).hexdigest()[:16]
    win = _BUCKETS[bucket][key]
    now = time.monotonic()
    while win and now - win[0] > window:
        win.popleft()
    if len(win) >= limit:
        return False
    win.append(now)
    return True
