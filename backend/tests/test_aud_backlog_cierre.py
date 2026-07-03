"""Regresión · cierre de backlog a cero deuda (2026-07-03).

Cubre: AUD-031 (token HMAC de baja del newsletter), buyer score visitas (puente user→lead),
completado determinista del rango m² sobre parse LLM parcial, caches TTL de demand_by_feature/
substitution, y el fix del cron WhatsApp. Anclado a código en disco (patrón AUD-025) + behavioral
donde es barato sin server.
"""
import pathlib

BACKEND = pathlib.Path(__file__).resolve().parent.parent


def _src(name: str) -> str:
    return (BACKEND / name).read_text(encoding="utf-8")


# ── AUD-031 · newsletter opt-out con token firmado ────────────────────────────

def test_aud031_unsub_token_hmac():
    import sys
    sys.path.insert(0, str(BACKEND))
    from routes.newsletter import unsub_token
    t = unsub_token("user_x", "pulso")
    assert len(t) == 32
    assert t == unsub_token("user_x", "pulso")            # determinista
    assert t != unsub_token("user_y", "pulso")            # cambia por usuario
    assert t != unsub_token("user_x", "all")              # cambia por segmento


def test_aud031_handler_exige_token():
    src = _src("routes/newsletter.py")
    assert "compare_digest(token, unsub_token(user_id, segment))" in src
    assert 'raise HTTPException(403, "Link de baja inválido")' in src


def test_aud031_link_lleva_token():
    src = _src("newsletter_pulse_engine.py")
    assert "?token={_unsub_token(user_id, segment)}" in src
    # el link viejo sin token ya no se genera
    assert 'unsubscribe_url = f"{app_url}/api/users/{user_id}/newsletter-opt-out/{segment}"\n' not in src


# ── Buyer score · visitas ya no es siempre 0 ──────────────────────────────────

def test_buyer_score_visitas_puente_lead():
    src = _src("buyer_score_engine.py")
    assert '"contact.email_norm": _em' in src
    assert '{"lead_id": {"$in": _lids}}' in src
    # conserva el conteo directo por user_id por si a futuro se escribe
    assert 'count_documents({"user_id": user_id})' in src


# ── Parser búsqueda · rango m² completado sobre parse LLM parcial ─────────────

def test_parser_m2_completa_rango_llm_parcial():
    src = _src("routes/public.py")
    assert '("min_sqm" in filters) != ("max_sqm" in filters)' in src   # XOR: rango a medias
    assert "\\b(?!\\s*(?:mil\\b|k\\b|millones|mdp|pesos|\\$))" in src      # el 2º número NO es dinero
    assert 'cache_key = ("v3_"' in src                                  # invalida caché con parse viejo


def test_parser_m2_regex_caso_100m2_a_250():
    """Réplica exacta del bloque nuevo: '100m2 a 250' con LLM parcial → rango completo, sin precio fantasma."""
    import re as _re
    _U = r"(?:m2|m²|mts|metros\b|m\.?c)"
    _work = "100m2 a 250"
    filters = {"min_sqm": 100, "max_price": 250000}   # lo que dejó el LLM (parcial + precio fantasma)
    if ("min_sqm" in filters) != ("max_sqm" in filters):
        _rng = (_re.search(r"(\d{2,4})\s*(?:-|–|—|a|y)\s*(\d{2,4})\s*" + _U, _work)
                or _re.search(r"(\d{2,4})\s*" + _U + r"\s*(?:-|–|—|a|y|hasta)\s*(\d{2,4})\b(?!\s*(?:mil\b|k\b|millones|mdp|pesos|\$))", _work))
        if _rng:
            _lo, _hi = int(_rng.group(1)), int(_rng.group(2))
            for _pk in ("min_price", "max_price"):
                if filters.get(_pk) in (_lo, _hi, _lo * 1000, _hi * 1000, _lo * 1_000_000, _hi * 1_000_000):
                    filters.pop(_pk, None)
            filters["min_sqm"], filters["max_sqm"] = min(_lo, _hi), max(_lo, _hi)
    assert filters == {"min_sqm": 100, "max_sqm": 250}


def test_parser_m2_no_pisa_dinero():
    """'100m2 a 250 mil' → el 2º número ES dinero: el lookahead lo bloquea y no se toca el precio."""
    import re as _re
    _U = r"(?:m2|m²|mts|metros\b|m\.?c)"
    _work = "100m2 a 250 mil"
    filters = {"min_sqm": 100, "max_price": 250000}
    _rng = (_re.search(r"(\d{2,4})\s*(?:-|–|—|a|y)\s*(\d{2,4})\s*" + _U, _work)
            or _re.search(r"(\d{2,4})\s*" + _U + r"\s*(?:-|–|—|a|y|hasta)\s*(\d{2,4})\b(?!\s*(?:mil\b|k\b|millones|mdp|pesos|\$))", _work))
    assert _rng is None   # no debe interpretar 250 (mil pesos) como m²


# ── Caches TTL A2/A8 (cierran el re-escaneo para todos los callers) ───────────

def test_a2_a8_caches_ttl():
    di = _src("demand_intelligence.py")
    assert "_DBF_CACHE" in di and "_DBF_TTL" in di
    mg = _src("marketplace_granularity.py")
    assert "_SUB_CACHE" in mg and "_SUB_TTL" in mg


# ── Cron WhatsApp · proyección con _id (bug latente) ──────────────────────────

def test_whatsapp_cron_proyeccion_con_id():
    src = _src("notifications_engine.py")
    assert '{"lead_id": 1, "org_id": 1, "sent_at": 1}' in src
    # la proyección rota ya no existe en ese cursor
    idx = src.find("async def check_pending_whatsapp_replies")
    blk = src[idx:idx + 1200]
    assert '{"_id": 0},' not in blk
