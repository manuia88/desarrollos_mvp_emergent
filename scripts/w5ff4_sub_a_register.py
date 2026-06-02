#!/usr/bin/env python3
"""W5.FF4 Sub-A — idempotent helper to APPEND register_feature() calls to backend route files.

Strategy: APPEND at end of file (post all definitions). Module-load order guarantees
imports + class/function defs run first, then our register_feature call executes
once at import-time. Marker comment '# W5.FF4 register_feature marker' makes
re-runs idempotent (skips files already touched).

Usage: python3 scripts/w5ff4_sub_a_register.py
"""
from __future__ import annotations
import os
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND = os.path.join(REPO, "backend")

MARKER = "# W5.FF4 register_feature marker · NO duplicate"

# (relative_path_from_backend, key, kwargs_repr_str_or_None)
FEATURES = [
    ("routes/battle_card.py",                  "battle_card",            'plan_tier="pro",        monthly_price_mxn=299, category="intelligence", name="Battle Card"'),
    ("routes/accuracy.py",                     "fsd_accuracy",           'plan_tier="pro",        monthly_price_mxn=199, category="intelligence", name="FSD Accuracy"'),
    ("routes/accuracy.py",                     "forecast_accuracy",      'plan_tier="pro",        monthly_price_mxn=199, category="intelligence", name="Forecast Accuracy"'),
    ("routes/live_pulse.py",                   "live_pulse_alerts",      'plan_tier="pro",        monthly_price_mxn=199, category="intelligence", name="Live Pulse Alerts"'),
    ("routes/knowledge_graph.py",              "knowledge_graph_view",   'plan_tier="enterprise", monthly_price_mxn=499, category="intelligence", name="Knowledge Graph"'),
    ("routes/entity_resolution.py",            "entity_resolution",      'plan_tier="enterprise", monthly_price_mxn=399, category="operations",   name="Entity Resolution"'),
    ("routes/entity_resolution.py",            "audit_chain",            'plan_tier="enterprise", monthly_price_mxn=0,   category="operations",   name="Audit Chain"'),
    ("routes/entity_resolution.py",            "duplicates",             'plan_tier="enterprise", monthly_price_mxn=0,   category="operations",   name="Duplicates Review"'),
    ("routes/forecast_public.py",              "forecast",               'plan_tier="pro",        monthly_price_mxn=199, category="intelligence", name="Forecast Multi-Horizonte"'),
    ("routes/drpi.py",                         "drpi",                   'plan_tier="pro",        monthly_price_mxn=199, category="intelligence", name="DRPI"'),
    ("routes/buyer_score.py",                  "buyer_score",            'plan_tier="pro",        monthly_price_mxn=149, category="ai",          name="Buyer Score"'),
    ("routes/brochure.py",                     "brochure_generator",     'plan_tier="pro",        monthly_price_mxn=99,  category="marketing",   name="Brochure Generator"'),
    ("routes/tour_3dgs.py",                    "tour_3dgs",              'plan_tier="pro",        monthly_price_mxn=149, category="marketing",   name="Tour 3DGS"'),
    ("routes/lead_journey.py",                 "lead_journey",           'plan_tier="pro",        monthly_price_mxn=149, category="growth",      name="Lead Journey"'),
    ("routes/maps.py",                         "mapa_cdmx",              'plan_tier="free",       monthly_price_mxn=0,   category="intelligence", name="Mapa CDMX"'),
    ("routes/avm_public.py",                   "avm_public",             'plan_tier="free",       monthly_price_mxn=0,   category="intelligence", name="AVM Público"'),
    ("routes/avm_public.py",                   "valores_landing",        'plan_tier="free",       monthly_price_mxn=0,   category="growth",      name="Valores Landing"'),
    ("routes/studio.py",                       "studio_video",           'plan_tier="pro",        monthly_price_mxn=249, category="marketing",   name="Studio Video"'),
    ("routes/studio.py",                       "studio_ads",             'plan_tier="pro",        monthly_price_mxn=249, category="marketing",   name="Studio Ads"'),
    ("routes/private_beta.py",                 "private_beta_invites",   'plan_tier="enterprise", monthly_price_mxn=0,   category="operations",   name="Private Beta Invites"'),
    ("routes/marketplace_search.py",           "compradores_search",     'plan_tier="free",       monthly_price_mxn=0,   category="growth",      name="Marketplace Search"'),
    ("routes/whatsapp.py",                     "whatsapp_business",      'plan_tier="pro",        monthly_price_mxn=299, category="growth",      name="WhatsApp Business"'),
    ("routes/newsletter.py",                   "newsletter_pulse",       'plan_tier="enterprise", monthly_price_mxn=199, category="growth",      name="Newsletter Pulse"'),
    ("routes/superadmin_intelligence_hub.py",  "intelligence_hub",       'plan_tier="enterprise", monthly_price_mxn=0,   category="intelligence", name="Intelligence Hub"'),
    ("routes/transaction_network.py",          "transactions_network",   'plan_tier="enterprise", monthly_price_mxn=499, category="intelligence", name="Transactions Network"'),
    ("routes/superadmin_ai_cost.py",           "ai_cost_dashboard",      'plan_tier="enterprise", monthly_price_mxn=0,   category="monetization", name="AI Cost Dashboard"'),
    ("routes/superadmin_data_lake.py",         "data_lake",              'plan_tier="enterprise", monthly_price_mxn=599, category="monetization", name="Data Lake"'),
    ("routes/superadmin_metrics_cube.py",      "metrics_cube",           'plan_tier="enterprise", monthly_price_mxn=499, category="monetization", name="Metrics Cube"'),
    ("routes/data_licensing.py",               "data_licensing",         'plan_tier="enterprise", monthly_price_mxn=999, category="monetization", name="Data Licensing"'),
    ("routes/vertical_products.py",            "vertical_products",      'plan_tier="enterprise", monthly_price_mxn=0,   category="monetization", name="Vertical Products"'),
    ("routes/cross_sell.py",                   "cross_sell_analytics",   'plan_tier="enterprise", monthly_price_mxn=0,   category="monetization", name="Cross-Sell Analytics"'),
    ("routes/partners.py",                     "partners_directory",     'plan_tier="pro",        monthly_price_mxn=99,  category="growth",      name="Partners Directory"'),
    ("routes/bulletins.py",                    "bulletins",              'plan_tier="pro",        monthly_price_mxn=99,  category="growth",      name="Bulletins"'),
    ("routes/bulk_ingest.py",                  "bulk_drive_ingest",      'plan_tier="enterprise", monthly_price_mxn=399, category="operations",   name="Bulk Drive Ingest"'),
    ("asistente_engine.py",                    "atlax_chat",             'plan_tier="free",       monthly_price_mxn=0,   category="ai",          name="Atlax Chat"'),
    ("notifications_engine.py",                "smart_notifications",    'plan_tier="pro",        monthly_price_mxn=99,  category="growth",      name="Smart Notifications"'),
]


def append_register(rel_path: str, key: str, kwargs_repr: str) -> str:
    """Returns one of: 'added', 'skipped_marker', 'missing'."""
    full = os.path.join(BACKEND, rel_path)
    if not os.path.isfile(full):
        return "missing"
    with open(full, "r", encoding="utf-8") as f:
        content = f.read()
    # Idempotency by (file marker + feature key)
    key_marker = f'register_feature("{key}"'
    if MARKER in content and key_marker in content:
        return "skipped_marker"

    # Ensure file ends with newline before appending
    if not content.endswith("\n"):
        content += "\n"

    block = []
    if MARKER not in content:
        block.append("\n")
        block.append(f"{MARKER}\n")
        block.append("from feature_registry import register_feature as _w5ff4_register_feature\n")
    block.append(f'_w5ff4_register_feature("{key}", {kwargs_repr})\n')

    with open(full, "w", encoding="utf-8") as f:
        f.write(content + "".join(block))
    return "added"


def main() -> int:
    added = []
    skipped = []
    missing = []
    for rel, key, kw in FEATURES:
        if kw is None:
            missing.append((rel, key, "no_kwargs"))
            continue
        res = append_register(rel, key, kw)
        if res == "added":
            added.append((rel, key))
        elif res == "skipped_marker":
            skipped.append((rel, key))
        elif res == "missing":
            missing.append((rel, key, "file_missing"))
    print(f"ADDED  : {len(added)}")
    for r, k in added:
        print(f"   + {k:28s} → {r}")
    if skipped:
        print(f"SKIPPED: {len(skipped)} (already registered · idempotent)")
        for r, k in skipped:
            print(f"   · {k:28s} → {r}")
    if missing:
        print(f"MISSING: {len(missing)}")
        for r, k, why in missing:
            print(f"   ✗ {k:28s} → {r} ({why})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
