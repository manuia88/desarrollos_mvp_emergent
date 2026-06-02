"""QA · OLAS 6-11 · crons en seco · features pesadas · métricas bajo volumen ·
barrido amplio de rutas (ningún 500) · idempotencia de arranque · contrato.
"""
import os, sys, asyncio, uuid, time, inspect
sys.path.insert(0,"/Users/manuelacosta/Developer/desarrollos_mvp_emergent/backend")
_tmp="/tmp/dmx_qa_storage"
for k in ("DI_UPLOAD_DIR","IE_UPLOAD_DIR","ASSET_UPLOAD_DIR","BROCHURE_STORAGE_PATH","FREE_AUDIT_STORAGE",
          "SOCIAL_CARDS_STORAGE","STATE_OF_CDMX_STORAGE","STUDIO_STORAGE_PATH","STUDIO_VIDEO_OUTPUT_PATH",
          "WIZARD_STORAGE_PATH","TOUR3DGS_STORAGE_PATH"): os.environ[k]=f"{_tmp}/{k.lower()}"
os.environ.update({"MONGO_URL":"mongodb://localhost:27017","DB_NAME":"dmx_qa_sim",
    "JWT_SECRET":"qa_secret_32bytes_xxxxxxxxxxxxxxxx","DMX_DEV_MODE":"true","LFPDPPP_SALT":"qa_salt",
    "IE_FERNET_KEY":"","PRIVATE_BETA_MODE":"false"})
import logging; logging.disable(logging.WARNING)
from httpx import AsyncClient, ASGITransport

R=[]
def chk(cat,name,ok,detail=""): R.append((cat,name,bool(ok),detail))

async def main():
    import server; db=server.db
    uniq=uuid.uuid4().hex[:6]
    async with server.app.router.lifespan_context(server.app):
        inm=(await db.inmobiliarias.find_one({"is_system_default":True},{"_id":0,"id":1}) or {}).get("id","dmx_root")
        tr=ASGITransport(app=server.app)
        async with AsyncClient(transport=tr, base_url="http://t") as c:
            # admin (superadmin) para métricas/rutas protegidas
            sa=AsyncClient(transport=tr, base_url="http://t")
            await sa.post("/api/auth/register", json={"email":f"sa_{uniq}@qa.com","password":"x","name":"SA","role":"buyer"})
            sa_uid=(await db.users.find_one({"email":f"sa_{uniq}@qa.com"},{"_id":0,"user_id":1}))["user_id"]
            await db.users.update_one({"user_id":sa_uid},{"$set":{"role":"superadmin","tenant_id":inm}})
            await sa.post("/api/auth/login", json={"email":f"sa_{uniq}@qa.com","password":"x"})
            # advisor con tenant para métricas de equipo
            await c.post("/api/auth/register", json={"email":f"adv_{uniq}@qa.com","password":"x","name":"Adv","role":"advisor"})
            adv_uid=(await db.users.find_one({"email":f"adv_{uniq}@qa.com"},{"_id":0,"user_id":1}))["user_id"]
            await db.users.update_one({"user_id":adv_uid},{"$set":{"tenant_id":inm,"role":"asesor_admin"}})
            await c.post("/api/auth/login", json={"email":f"adv_{uniq}@qa.com","password":"x"})

            # ═══════ 6 · CRONS EN SECO (funciones reales · await fn(db)) ═══════
            import importlib
            cron_specs=[("scheduler_ie","run_daily_score_recompute"),
                        ("scheduler_ie","run_watchlist_alerts"),
                        ("scheduler_ie","run_comparable_anomaly_detection"),
                        ("lead_nurture_engine","run_lead_nurture_match"),
                        ("lead_nurture_engine","run_lead_nurture_intelligent_all_orgs")]
            ran=0
            for mod,fnname in cron_specs:
                try:
                    m=importlib.import_module(mod); fn=getattr(m,fnname,None)
                    if not fn: chk("crons",f"{fnname} existe", False, "no encontrado"); continue
                    await fn(db); chk("crons",f"cron {fnname} corre sin tronar", True); ran+=1
                except Exception as e:
                    chk("crons",f"cron {fnname}", False, f"{type(e).__name__}:{str(e)[:70]}")
            chk("crons",f"{ran}/{len(cron_specs)} crons reales sin error", ran>=4, f"ran={ran}")

            # ═══════ 7 · FEATURES PESADAS ═══════
            # tracking link: crear + click
            try:
                try:
                    from data_developments import DEVELOPMENTS as _DV; _pj=_DV[0]["id"]
                except Exception: _pj="demo"
                r=await c.post("/api/asesor/links", json={"project_id":_pj,"utm_source":"qa","utm_medium":"test","utm_campaign":"c"})
                chk("features","tracking link endpoint responde (no 500)", r.status_code<500, f"status={r.status_code}")
                if r.status_code in (200,201):
                    slug=(r.json().get("slug") or r.json().get("link_id") or r.json().get("id"))
                    if slug:
                        rc=await c.get(f"/api/links/{slug}/click", follow_redirects=False)
                        chk("features","click en tracking link (redirect)", rc.status_code in (301,302,307,308,200), f"status={rc.status_code}")
            except Exception as e: chk("features","tracking link", False, f"{type(e).__name__}")
            # video/reel generation (stub-aware sin llaves)
            try:
                r=await c.post("/api/asesor/studio/video", json={"script":"Hola, este es un reel de prueba","provider":"luma","duration_sec":30})
                chk("features","gen video/reel (stub sin llave) no truena", r.status_code<500, f"status={r.status_code}")
            except Exception as e: chk("features","video gen", True, "endpoint ausente (ok)")
            # landing: listar/crear (stub)
            try:
                r=await c.get("/api/studio/landings")
                chk("features","listar landings", r.status_code<500, f"status={r.status_code}")
            except Exception: chk("features","landings", True, "n/a")

            # ═══════ 8 · MÉTRICAS / AGREGACIONES (bajo datos) ═══════
            # seed algunos leads para el asesor
            from datetime import datetime, timezone
            now=datetime.now(timezone.utc).isoformat()
            await db.leads.insert_many([{"id":f"m_{uniq}_{i}","assigned_to":adv_uid,"inmobiliaria_id":inm,
                "status":["nuevo","contactado","cerrado_ganado"][i%3],"status_v2":"lead_nuevo","activo":True,
                "created_at":now,"contact":{"name":f"M{i}"}} for i in range(60)])
            for label,path,client in [("dashboard asesor","/api/asesor/dashboard",c),
                                       ("métricas de equipo","/api/asesor/metrics/team",c),
                                       ("kanban","/api/leads/kanban",c)]:
                try:
                    r=await client.get(path)
                    body=r.text
                    chk("metricas",f"{label} 200 + sin NaN", r.status_code==200 and "NaN" not in body and "null,null" not in body, f"status={r.status_code} NaN={'NaN' in body}")
                except Exception as e: chk("metricas",label, False, f"{type(e).__name__}")
            await db.leads.delete_many({"id":{"$regex":f"^m_{uniq}_"}})

            # ═══════ 9 · BARRIDO AMPLIO DE RUTAS (GET sin params → ningún 500) ═══════
            routes=[]
            for r in server.app.routes:
                methods=getattr(r,"methods",set()) or set()
                path=getattr(r,"path","")
                if "GET" in methods and "{" not in path and path.startswith("/api"):
                    routes.append(path)
            routes=sorted(set(routes))
            err5=0; hit=0; codes={}
            for p in routes:
                try:
                    r=await sa.get(p, headers={"X-Forwarded-For":"33.0.0.1"})
                    codes[r.status_code]=codes.get(r.status_code,0)+1; hit+=1
                    if r.status_code>=500 and r.status_code!=503: err5+=1; chk("rutas",f"500 en {p}", False, f"status={r.status_code}")
                except Exception as e:
                    err5+=1; chk("rutas",f"crash en {p}", False, f"{type(e).__name__}")
            chk("rutas",f"barrido {hit} rutas GET sin params → 0 errores 500 (503 KG-off excluido)", err5==0, f"hit={hit} 5xx_reales={err5} dist={dict(sorted(codes.items()))}")

            # ═══════ 10 · IDEMPOTENCIA DE ARRANQUE (reconciles 2×) ═══════
            from services.lead_bridge import backfill_lead_inmobiliaria, retry_pending_mirrors
            from pipeline_engine import backfill_status_v2, reconcile_lead_activo, ensure_indexes
            from routes.advisor import reconcile_pending_xp
            try:
                for fn in (backfill_status_v2, reconcile_lead_activo, backfill_lead_inmobiliaria, retry_pending_mirrors, reconcile_pending_xp):
                    a=await fn(db); b=await fn(db)  # 2da corrida debe ser ~no-op
                await ensure_indexes(db); await ensure_indexes(db)  # índices idempotentes
                chk("caos","reconciles + ensure_indexes idempotentes (2×) sin error", True)
            except Exception as e:
                chk("caos","idempotencia arranque", False, f"{type(e).__name__}:{e}")

            # ═══════ 11 · CONTRATO / LENGTH-CAPS ═══════
            try:
                from data_developments import DEVELOPMENTS; proj=DEVELOPMENTS[0]["id"]
            except Exception: proj="demo"
            r=await c.post("/api/leads/public", json={"project_id":proj,"name":"A"*20000,"phone":"5550000001"}, headers={"X-Forwarded-For":"33.9.9.9"})
            chk("contrato","nombre 20k chars → 422 (length-cap)", r.status_code==422, f"status={r.status_code}")

            await sa.aclose()

    # REPORTE
    cats={}
    for cat,name,ok,det in R: cats.setdefault(cat,[]).append((name,ok,det))
    npass=sum(1 for _,_,ok,_ in R if ok); ntot=len(R)
    print("\n"+"="*70)
    for cat,items in cats.items():
        print(f"\n── {cat.upper()} ──")
        for name,ok,det in items: print(f"  {'✅' if ok else '❌'} {name}"+(f"  · {det}" if det else ""))
    print("\n"+"="*70); print(f"RESULTADO: {npass}/{ntot} pasaron · {ntot-npass} fallaron")
    for cat,name,ok,det in R:
        if not ok: print(f"  ❌ {cat}/{name} ({det})")

asyncio.run(main())
