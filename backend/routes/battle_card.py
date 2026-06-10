"""W5.23 — Battle Card Routes.

Endpoints:
  GET /api/dev/battle-card/{project_id}                  T3+ only
  GET /api/dev/battle-card/{project_id}/competitors       T3+ only
  GET /api/dev/battle-card/{project_id}/history?weeks=N   T3+ only
  GET /api/dev/battle-card/{project_id}/recommendation    T3+ only
  GET /api/dev/battle-card/{project_id}/export.pdf        T3+ only (rate-limit 5/min)

Rate-limit: 60 req/min/IP general · 5/min/IP para PDF.
Auth: T3+ (developer roles auto-T3) · 403 si tier inferior.
Audit: action="battle_card_view" / "battle_card_pdf_export".
"""
from __future__ import annotations

import io
import logging
import time
from collections import defaultdict, deque
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import Response, JSONResponse

log = logging.getLogger("dmx.routes_battle_card")

router = APIRouter(tags=["battle-card"])

# ─── Auth helpers ─────────────────────────────────────────────────────────────

TIER_RANK = {
    "free": 0, "off": 0,
    "t1": 1, "T1": 1,
    "t2": 2, "T2": 2,
    "t3": 3, "T3": 3,
    "t4": 4, "T4": 4,
    "t5": 5, "T5": 5,
}

DEV_ROLES_T3 = {
    "developer_member", "developer_admin", "developer_director",
    "developer_advisor", "developer_obras", "developer_marketing",
    "inmobiliaria_member", "inmobiliaria_admin", "inmobiliaria_director",
    "inmobiliaria_advisor", "inmobiliaria_marketing",
    "superadmin",
}


def _db(request: Request):
    return request.app.state.db


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _assert_owner(user, project_id):
    """403 si el proyecto no es del usuario (o superadmin). Cierra el IDOR cross-tenant del Battle Card."""
    if project_id is None:
        return
    from tenant_scope import assert_dev_project
    assert_dev_project(user, project_id)


async def _require_t3(request: Request, project_id: str = None) -> Dict[str, Any]:
    """Obtiene el usuario y verifica T3+ Y pertenencia del proyecto. Lanza 403 si no aplica."""
    from server import get_current_user
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="auth_required")

    role = (getattr(user, "role", None) or user.get("role") or "").lower()
    if role in {r.lower() for r in DEV_ROLES_T3}:
        _assert_owner(user, project_id)
        return user  # roles developer ya son T3

    user_tier = (
        getattr(user, "tier", None) or
        user.get("tier") or
        user.get("plan_tier") or
        "free"
    ).lower()
    rank = TIER_RANK.get(user_tier, 0)
    if rank < 3:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "tier_locked",
                "required_tier": "T3",
                "current_tier": user_tier,
                "message": "Battle Card requiere tier T3+ (Enterprise).",
            },
        )
    _assert_owner(user, project_id)
    return user


def _user_id(user) -> str:
    return (
        getattr(user, "user_id", None) or
        user.get("user_id") or
        getattr(user, "user_id", None) or
        "anon"
    )


# ─── Rate limiting ─────────────────────────────────────────────────────────────

_RATE_BUCKET: Dict[str, deque] = defaultdict(lambda: deque(maxlen=60))
_RATE_BUCKET_PDF: Dict[str, deque] = defaultdict(lambda: deque(maxlen=5))
_RATE_WINDOW_S = 60


def _rate_limit(request: Request, limit: int = 60, bucket: Dict = None) -> None:
    ip = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    if not ip and request.client:
        ip = request.client.host
    ip = ip or "unknown"
    b_map = bucket or _RATE_BUCKET
    bkt = b_map[ip]
    now = time.time()
    while bkt and (now - bkt[0]) > _RATE_WINDOW_S:
        bkt.popleft()
    if len(bkt) >= limit:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit excedido · {limit}/min por IP",
        )
    bkt.append(now)


async def _audit(db, user, action: str, project_id: str, after: Dict = None) -> None:
    try:
        from audit_immutable_engine import log as audit_log
        await audit_log(
            db,
            actor={"user_id": _user_id(user), "role": "developer"},
            action=action,
            entity_type="battle_card",
            entity_id=project_id,
            before=None,
            after=after or {},
        )
    except Exception:
        pass


# ─── Endpoint 1 — Battle Card principal ───────────────────────────────────────

@router.get("/api/dev/battle-card/{project_id}")
async def get_battle_card(project_id: str, request: Request):
    _rate_limit(request)
    user = await _require_t3(request, project_id)
    db = _db(request)

    from battle_card_engine import (
        get_my_score,
        compute_ranking,
        get_top_competitors,
        recommend_next_action,
        insufficient_competitors_check,
    )
    from data_developments import DEVELOPMENTS_BY_ID

    dev = DEVELOPMENTS_BY_ID.get(project_id)
    if not dev:
        raise HTTPException(status_code=404, detail=f"Proyecto {project_id} no encontrado")

    zone_slug = dev.get("colonia_id") or dev.get("colonia") or ""

    # Check insufficient_competitors
    insuff = await insufficient_competitors_check(db, zone_slug)
    if insuff:
        from data_developments import DEVELOPMENTS
        competitors_count = sum(
            1 for d in DEVELOPMENTS
            if (d.get("colonia_id") or d.get("colonia") or "") == zone_slug
        )
        return JSONResponse({
            "state": "insufficient",
            "project_id": project_id,
            "zone_slug": zone_slug,
            "zone_competitors_count": competitors_count,
            "message": (
                f"Necesitamos al menos 3 desarrolladores en {zone_slug} "
                "para generar Battle Card. Zona acumulando data."
            ),
        })

    my_score = await get_my_score(db, project_id)
    ranking = await compute_ranking(db, project_id, zone_slug)
    competitors = await get_top_competitors(db, project_id, zone_slug, limit=3)
    recommendation = await recommend_next_action(db, project_id)

    # Snapshot semana actual
    week_iso = f"{_now().isocalendar()[0]}-W{_now().isocalendar()[1]:02d}"

    result = {
        "state": "ok",
        "project_id": project_id,
        "project_name": dev.get("name", project_id),
        "dev_org_id": dev.get("developer_id", ""),
        "zone_slug": zone_slug,
        "week_iso": week_iso,
        "my_score": my_score.get("composite_score"),
        "color": my_score.get("color"),
        "dim_scores": my_score.get("dim_scores", {}),
        "ranking": ranking,
        "competitors": competitors,
        "recommended_action": recommendation.get("action"),
        "weakest_dim": recommendation.get("weakest_dim"),
        "computed_at": _now().isoformat(),
    }

    await _audit(db, user, "battle_card_view", project_id, {"week_iso": week_iso})
    return JSONResponse(result)


# ─── Endpoint 2 — Competitors only ────────────────────────────────────────────

@router.get("/api/dev/battle-card/{project_id}/competitors")
async def get_competitors(project_id: str, request: Request):
    _rate_limit(request)
    user = await _require_t3(request, project_id)
    db = _db(request)

    from battle_card_engine import get_top_competitors, insufficient_competitors_check
    from data_developments import DEVELOPMENTS_BY_ID

    dev = DEVELOPMENTS_BY_ID.get(project_id)
    if not dev:
        raise HTTPException(status_code=404, detail=f"Proyecto {project_id} no encontrado")

    zone_slug = dev.get("colonia_id") or dev.get("colonia") or ""

    insuff = await insufficient_competitors_check(db, zone_slug)
    if insuff:
        return JSONResponse({"state": "insufficient", "zone_slug": zone_slug, "competitors": []})

    competitors = await get_top_competitors(db, project_id, zone_slug, limit=3)
    await _audit(db, user, "battle_card_view", project_id, {"section": "competitors"})
    return JSONResponse({"state": "ok", "project_id": project_id, "competitors": competitors})


# ─── Endpoint 3 — History (ranking timeline) ──────────────────────────────────

@router.get("/api/dev/battle-card/{project_id}/history")
async def get_history(
    project_id: str,
    request: Request,
    weeks: int = Query(default=12, ge=1, le=52),
):
    _rate_limit(request)
    user = await _require_t3(request, project_id)
    db = _db(request)

    # Recopilar snapshots históricos
    snapshots = []
    cursor = db.battle_card_snapshots.find(
        {"project_id": project_id},
        {"_id": 0, "week_iso": 1, "my_score": 1, "ranking": 1, "delta_pp": 1, "computed_at": 1},
    ).sort("computed_at", -1).limit(weeks)

    async for s in cursor:
        snapshots.append(s)

    snapshots.reverse()  # orden cronológico
    await _audit(db, user, "battle_card_view", project_id, {"section": "history", "weeks": weeks})
    return JSONResponse({"state": "ok", "project_id": project_id, "history": snapshots})


# ─── Endpoint 4 — Recommendation only ────────────────────────────────────────

@router.get("/api/dev/battle-card/{project_id}/recommendation")
async def get_recommendation(project_id: str, request: Request):
    _rate_limit(request)
    user = await _require_t3(request, project_id)
    db = _db(request)

    from battle_card_engine import recommend_next_action
    recommendation = await recommend_next_action(db, project_id)
    await _audit(db, user, "battle_card_view", project_id, {"section": "recommendation"})
    return JSONResponse(recommendation)


# ─── Endpoint 5 — PDF export ──────────────────────────────────────────────────

@router.get("/api/dev/battle-card/{project_id}/export.pdf")
async def export_pdf(project_id: str, request: Request):
    _rate_limit(request, limit=5, bucket=_RATE_BUCKET_PDF)
    user = await _require_t3(request, project_id)
    db = _db(request)

    from battle_card_engine import (
        get_my_score, compute_ranking, get_top_competitors,
        recommend_next_action, insufficient_competitors_check,
    )
    from data_developments import DEVELOPMENTS_BY_ID

    dev = DEVELOPMENTS_BY_ID.get(project_id)
    if not dev:
        raise HTTPException(status_code=404, detail=f"Proyecto {project_id} no encontrado")

    zone_slug = dev.get("colonia_id") or dev.get("colonia") or ""
    insuff = await insufficient_competitors_check(db, zone_slug)

    my_score = await get_my_score(db, project_id)
    ranking = await compute_ranking(db, project_id, zone_slug)
    competitors = (
        await get_top_competitors(db, project_id, zone_slug, limit=3)
        if not insuff else []
    )
    recommendation = await recommend_next_action(db, project_id)

    # Historial 12 semanas
    history: List[Dict] = []
    cursor = db.battle_card_snapshots.find(
        {"project_id": project_id},
        {"_id": 0, "week_iso": 1, "my_score": 1, "ranking": 1},
    ).sort("computed_at", -1).limit(12)
    async for s in cursor:
        history.append(s)
    history.reverse()

    pdf_bytes = _render_battle_card_pdf(
        project_id=project_id,
        project_name=dev.get("name", project_id),
        dev_org_id=dev.get("developer_id", ""),
        zone_slug=zone_slug,
        my_score=my_score,
        ranking=ranking,
        competitors=competitors,
        recommendation=recommendation,
        history=history,
    )

    await _audit(
        db, user, "battle_card_pdf_export", project_id,
        {"size_bytes": len(pdf_bytes), "zone_slug": zone_slug},
    )

    week_iso = f"{_now().isocalendar()[0]}-W{_now().isocalendar()[1]:02d}"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": (
                f'attachment; filename="battle_card_{project_id}_{week_iso}.pdf"'
            ),
        },
    )


# ─── PDF renderer ─────────────────────────────────────────────────────────────

def _render_battle_card_pdf(
    project_id: str,
    project_name: str,
    dev_org_id: str,
    zone_slug: str,
    my_score: Dict,
    ranking: Dict,
    competitors: List[Dict],
    recommendation: Dict,
    history: List[Dict],
) -> bytes:
    """ReportLab 4-page A4 institutional PDF (Fitch-style W5.15 pattern)."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib.colors import HexColor, white
    from reportlab.pdfgen import canvas as rl_canvas

    BG     = HexColor("#06080F")
    CREAM  = HexColor("#F0EBE0")
    INDIGO = HexColor("#6366F1")
    ROSE   = HexColor("#EC4899")
    GRAY   = HexColor("#6B7280")
    GREEN  = HexColor("#10B981")
    YELLOW = HexColor("#F59E0B")
    RED    = HexColor("#EF4444")

    def _score_color(score: float):
        if score >= 75:
            return GREEN
        if score >= 50:
            return YELLOW
        return RED

    buf = io.BytesIO()
    c = rl_canvas.Canvas(buf, pagesize=A4)
    W, H = A4
    M = 18 * mm
    total_pages = 4
    page_num = [0]

    week_iso = f"{_now().isocalendar()[0]}-W{_now().isocalendar()[1]:02d}"
    generated_str = _now().strftime("%Y-%m-%d %H:%M UTC")

    def _new_page():
        c.setFillColor(BG)
        c.rect(0, 0, W, H, fill=1, stroke=0)
        page_num[0] += 1

    def _footer():
        c.setFont("Helvetica", 7)
        c.setFillColor(GRAY)
        c.drawString(M, 11 * mm, "DMX Battle Card · audit chain SHA-256 · DesarrollosMX 2026")
        c.drawRightString(W - M, 11 * mm, f"Pagina {page_num[0]} de {total_pages}")

    def _header(title: str, subtitle: str = ""):
        c.setFont("Helvetica-Bold", 8.5)
        c.setFillColor(INDIGO)
        c.drawString(M, H - 13 * mm, "DESARROLLOSMX  ·  BATTLE CARD INSTITUCIONAL")
        c.setFont("Helvetica", 8)
        c.setFillColor(GRAY)
        c.drawRightString(W - M, H - 13 * mm, f"{week_iso}  ·  {generated_str}")
        c.setStrokeColor(INDIGO)
        c.setLineWidth(0.6)
        c.line(M, H - 15.5 * mm, W - M, H - 15.5 * mm)
        c.setFont("Helvetica-Bold", 19)
        c.setFillColor(CREAM)
        c.drawString(M, H - 26 * mm, title)
        if subtitle:
            c.setFont("Helvetica", 10)
            c.setFillColor(GRAY)
            c.drawString(M, H - 33 * mm, subtitle)

    # ── Page 1: Cover + Executive Summary ──────────────────────────────────────
    _new_page()
    _header("Battle Card", f"{project_name}  ·  {dev_org_id}  ·  Zona: {zone_slug}")

    y = H - 44 * mm
    composite = float(my_score.get("composite_score") or 0)
    score_col = _score_color(composite)

    # Score grande
    c.setFont("Helvetica-Bold", 54)
    c.setFillColor(score_col)
    c.drawString(M, y - 10 * mm, f"{composite:.1f}")
    c.setFont("Helvetica", 12)
    c.setFillColor(GRAY)
    c.drawString(M + 38 * mm, y - 3 * mm, "/ 100")
    c.setFont("Helvetica", 9)
    c.drawString(M, y - 17 * mm, "Score Compuesto · Semana Actual")

    # Ranking
    rank_val = ranking.get("rank") if ranking.get("available") else None
    total_zone = ranking.get("total_in_zone", 0)
    rank_str = f"#{rank_val} de {total_zone}" if rank_val else "—"
    delta_pos = ranking.get("delta_position", 0)
    c.setFont("Helvetica-Bold", 14)
    c.setFillColor(CREAM)
    c.drawString(W - M - 50 * mm, y - 5 * mm, f"Rank {rank_str}")
    delta_color = GREEN if delta_pos > 0 else (RED if delta_pos < 0 else GRAY)
    c.setFont("Helvetica-Bold", 10)
    c.setFillColor(delta_color)
    delta_str = f"(+{delta_pos})" if delta_pos > 0 else (f"({delta_pos})" if delta_pos < 0 else "(=)")
    c.drawString(W - M - 50 * mm, y - 15 * mm, delta_str)

    y -= 28 * mm
    # Separador
    c.setStrokeColor(INDIGO)
    c.setLineWidth(0.4)
    c.line(M, y, W - M, y)
    y -= 8 * mm

    # 5 KPIs dimensiones
    dims = my_score.get("dim_scores") or {}
    DIM_LABELS = {
        "precio": "Precio", "ventas": "Ventas", "zona": "Zona",
        "marketing": "Marketing", "lead_gen": "Lead Gen",
    }
    col_w = (W - 2 * M - 4 * 4 * mm) / 5
    for i, (dim_key, dim_label) in enumerate(DIM_LABELS.items()):
        x = M + i * (col_w + 4 * mm)
        val = float(dims.get(dim_key, 0))
        col = _score_color(val)
        c.setFont("Helvetica", 7)
        c.setFillColor(GRAY)
        c.drawString(x, y, dim_label.upper())
        c.setFont("Helvetica-Bold", 18)
        c.setFillColor(col)
        c.drawString(x, y - 10 * mm, f"{val:.0f}")

    y -= 22 * mm
    c.setStrokeColor(INDIGO)
    c.line(M, y, W - M, y)
    y -= 8 * mm

    # Acción recomendada
    c.setFont("Helvetica-Bold", 10)
    c.setFillColor(CREAM)
    c.drawString(M, y, "Accion Recomendada")
    y -= 8 * mm
    action_text = recommendation.get("action") or "—"
    c.setFont("Helvetica", 9)
    c.setFillColor(GRAY)
    # Wrap simple
    words = action_text.split()
    line_buf = []
    for w in words:
        line_buf.append(w)
        if len(" ".join(line_buf)) > 95:
            c.drawString(M, y, " ".join(line_buf[:-1]))
            y -= 5.5 * mm
            line_buf = [w]
    if line_buf:
        c.drawString(M, y, " ".join(line_buf))

    _footer()
    c.showPage()

    # ── Page 2: 5 dimensiones breakdown ────────────────────────────────────────
    _new_page()
    _header("Breakdown Dimensiones", f"{project_name}  ·  {zone_slug}")
    y = H - 40 * mm

    # Tabla: Dimension | Score Actual | Semana-1 | Zona Avg
    headers = ["Dimension", "Score Actual", "Semana-1", "Zona Avg"]
    col_xs = [M, M + 45 * mm, M + 80 * mm, M + 115 * mm]

    c.setFont("Helvetica-Bold", 8.5)
    c.setFillColor(INDIGO)
    for h, x in zip(headers, col_xs):
        c.drawString(x, y, h.upper())
    y -= 4 * mm
    c.setStrokeColor(INDIGO)
    c.line(M, y, W - M, y)
    y -= 6 * mm

    for dim_key, dim_label in DIM_LABELS.items():
        val = float(dims.get(dim_key, 0))
        col = _score_color(val)
        c.setFont("Helvetica", 9)
        c.setFillColor(CREAM)
        c.drawString(col_xs[0], y, dim_label)
        c.setFillColor(col)
        c.drawString(col_xs[1], y, f"{val:.1f}")
        c.setFillColor(GRAY)
        c.drawString(col_xs[2], y, "—")  # semana-1: usaría snapshot prev
        c.drawString(col_xs[3], y, "—")  # zona_avg: requiere aggregate
        y -= 8 * mm

    _footer()
    c.showPage()

    # ── Page 3: Top 3 competidores ──────────────────────────────────────────────
    _new_page()
    _header("Competidores · Top 3", f"Zona {zone_slug}")
    y = H - 40 * mm

    if not competitors:
        c.setFont("Helvetica", 11)
        c.setFillColor(GRAY)
        c.drawString(M, y, "Insuficientes competidores en zona · data acumulandose.")
    else:
        comp_col_w = (W - 2 * M) / (len(competitors) + 1)
        # Headers: yo + competidores
        headers_comp = [""] + [c_["name"][:20] for c_ in competitors]
        c.setFont("Helvetica-Bold", 8)
        c.setFillColor(INDIGO)
        for i, h in enumerate(headers_comp):
            c.drawString(M + i * comp_col_w, y, h.upper()[:18])
        y -= 4 * mm
        c.line(M, y, W - M, y)
        y -= 6 * mm

        my_dims = dims
        rows = list(DIM_LABELS.items()) + [("composite", "TOTAL")]
        for dim_key, dim_label in rows:
            my_val = composite if dim_key == "composite" else float(my_dims.get(dim_key, 0))
            c.setFont("Helvetica-Bold" if dim_key == "composite" else "Helvetica", 9)
            c.setFillColor(CREAM)
            c.drawString(M, y, dim_label[:14])
            c.setFillColor(_score_color(my_val))
            c.drawString(M + comp_col_w, y, f"{my_val:.1f}")
            for j, comp_ in enumerate(competitors):
                comp_val = (
                    float(comp_.get("composite_score", 0))
                    if dim_key == "composite"
                    else float((comp_.get("dim_scores") or {}).get(dim_key, 0))
                )
                c.setFillColor(_score_color(comp_val))
                c.drawString(M + (j + 2) * comp_col_w, y, f"{comp_val:.1f}")
            y -= 8 * mm

    _footer()
    c.showPage()

    # ── Page 4: Ranking timeline + Acción ──────────────────────────────────────
    _new_page()
    _header("Timeline Ranking · 12 Semanas", f"{project_name}")
    y = H - 40 * mm

    # Timeline textual (sin recharts → table)
    if history:
        c.setFont("Helvetica-Bold", 8)
        c.setFillColor(INDIGO)
        c.drawString(M, y, "SEMANA")
        c.drawString(M + 40 * mm, y, "SCORE")
        c.drawString(M + 70 * mm, y, "RANKING")
        y -= 4 * mm
        c.line(M, y, W - M, y)
        y -= 6 * mm
        for h_snap in history[-12:]:
            if y < 40 * mm:
                break
            c.setFont("Helvetica", 9)
            c.setFillColor(CREAM)
            c.drawString(M, y, h_snap.get("week_iso", "—"))
            score_h = float(h_snap.get("my_score") or 0)
            c.setFillColor(_score_color(score_h))
            c.drawString(M + 40 * mm, y, f"{score_h:.1f}")
            c.setFillColor(CREAM)
            c.drawString(M + 70 * mm, y, f"#{h_snap.get('ranking') or '—'}")
            y -= 7 * mm
    else:
        c.setFont("Helvetica", 10)
        c.setFillColor(GRAY)
        c.drawString(M, y, "Sin historial disponible aun · primer snapshot esta semana.")
        y -= 12 * mm

    y -= 8 * mm
    c.setStrokeColor(ROSE)
    c.setLineWidth(0.6)
    c.line(M, y, W - M, y)
    y -= 8 * mm

    c.setFont("Helvetica-Bold", 11)
    c.setFillColor(ROSE)
    c.drawString(M, y, "Accion Recomendada para Comite")
    y -= 8 * mm
    c.setFont("Helvetica", 9)
    c.setFillColor(CREAM)
    action_text = recommendation.get("action") or "—"
    words = action_text.split()
    line_buf2 = []
    for w in words:
        line_buf2.append(w)
        if len(" ".join(line_buf2)) > 95:
            c.drawString(M, y, " ".join(line_buf2[:-1]))
            y -= 5.5 * mm
            line_buf2 = [w]
    if line_buf2:
        c.drawString(M, y, " ".join(line_buf2))

    _footer()
    c.showPage()
    c.save()

    return buf.getvalue()

# W5.FF4 register_feature marker · NO duplicate
from feature_registry import register_feature as _w5ff4_register_feature
_w5ff4_register_feature("battle_card", plan_tier="pro",        monthly_price_mxn=299, category="intelligence", name="Battle Card")
