"""QA · OLA 3 · CARGA / VOLUMEN / CONCURRENCIA (single-process sim · ASGI vs Mongo local).
Siembra 10k leads, lanza ráfagas concurrentes mixtas y mide latencia/errores/throughput.
"""
import os, sys, asyncio, uuid, time, statistics
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
from datetime import datetime, timezone

def pct(xs,p):
    if not xs: return 0
    xs=sorted(xs); return xs[min(len(xs)-1,int(len(xs)*p/100))]

async def main():
    import server; db=server.db
    now=datetime.now(timezone.utc).isoformat(); uniq=uuid.uuid4().hex[:6]
    async with server.app.router.lifespan_context(server.app):
        inm=(await db.inmobiliarias.find_one({"is_system_default":True},{"_id":0,"id":1}) or {}).get("id","dmx_root")
        try:
            from data_developments import DEVELOPMENTS; proj=DEVELOPMENTS[0]["id"]
        except Exception: proj="demo"
        tr=ASGITransport(app=server.app)
        async with AsyncClient(transport=tr, base_url="http://t") as c:
            rr=await c.post("/api/auth/register", json={"email":f"load_{uniq}@qa.com","password":"x","name":"Load","role":"advisor"})
            rl=await c.post("/api/auth/login", json={"email":f"load_{uniq}@qa.com","password":"x"})
            udoc=await db.users.find_one({"email":f"load_{uniq}@qa.com"},{"_id":0,"user_id":1})
            if not udoc:
                print(f"  ❌ no se creó el advisor · register={rr.status_code} {rr.text[:120]} · login={rl.status_code}"); return
            uid=udoc["user_id"]
            await db.users.update_one({"user_id":uid},{"$set":{"tenant_id":inm}})

            print("── OLA 3 · CARGA / VOLUMEN ──")
            # VOLUMEN: 10k leads + 10k contactos del asesor
            t0=time.perf_counter()
            await db.leads.insert_many([{"id":f"ld_{uniq}_{i}","assigned_to":uid,"inmobiliaria_id":inm,
                "status":"nuevo","status_v2":"lead_nuevo","activo":True,"created_at":now,
                "contact":{"name":f"L{i}","phone":f"55{i:08d}"}} for i in range(10000)])
            await db.asesor_contactos.insert_many([{"id":f"ct_{uniq}_{i}","owner_id":uid,"created_at":now,
                "first_name":f"C{i}","emails":[f"c{i}@x.com"],"etapa":"nuevo"} for i in range(10000)])
            print(f"  sembrados 20k docs en {time.perf_counter()-t0:.1f}s")

            # CONSULTAS INDEXADAS bajo volumen
            for label,coro in [
                ("board leads (find+sort+limit500)", db.leads.find({"assigned_to":uid},{"_id":0,"id":1}).sort("created_at",-1).limit(500).to_list(500)),
                ("conteo contactos del asesor", db.asesor_contactos.count_documents({"owner_id":uid})),
            ]:
                t0=time.perf_counter(); await coro; print(f"  {label}: {(time.perf_counter()-t0)*1000:.0f}ms")

            # RÁFAGA CONCURRENTE MIXTA: N requests, concurrencia limitada
            N=2000; CONC=100
            sem=asyncio.Semaphore(CONC)
            lat=[]; codes={}
            mix=[("GET","/api/asesor/contactos",None),
                 ("GET","/api/asesor/dashboard",None),
                 ("POST","/api/leads/public",{"project_id":proj,"name":"Burst","phone":None}),  # phone set per-req
                 ("GET","/api/colonias",None)]
            async def one(i):
                m,path,body=mix[i%len(mix)]
                if body is not None:
                    body=dict(body); body["phone"]=f"559{i:07d}"
                async with sem:
                    t0=time.perf_counter()
                    try:
                        if m=="GET": r=await c.get(path, headers={"X-Forwarded-For":f"12.{i%250}.0.1"})
                        else: r=await c.post(path, json=body, headers={"X-Forwarded-For":f"12.{i%250}.0.1"})
                        sc=r.status_code
                    except Exception as e: sc=f"ERR:{type(e).__name__}"
                    lat.append((time.perf_counter()-t0)*1000)
                    codes[sc]=codes.get(sc,0)+1
            t0=time.perf_counter()
            await asyncio.gather(*[one(i) for i in range(N)])
            wall=time.perf_counter()-t0
            print(f"\n  RÁFAGA: {N} requests · concurrencia {CONC} · {wall:.1f}s · {N/wall:.0f} req/s")
            print(f"  latencia p50={pct(lat,50):.0f}ms p95={pct(lat,95):.0f}ms p99={pct(lat,99):.0f}ms max={max(lat):.0f}ms")
            print(f"  status: {dict(sorted(codes.items(), key=lambda x:str(x[0])))}")
            err5xx=sum(v for k,v in codes.items() if isinstance(k,int) and k>=500)
            errx=sum(v for k,v in codes.items() if not isinstance(k,int))
            ok2xx=sum(v for k,v in codes.items() if isinstance(k,int) and k<300)
            print(f"\n  ✅ 2xx={ok2xx} · 🔴 5xx={err5xx} · 💥 excepciones={errx}")
            print(f"  {'✅' if err5xx==0 and errx==0 else '❌'} sin 500s ni crashes bajo carga")
            print(f"  {'✅' if pct(lat,95)<1000 else '⚠️'} p95 < 1s")

            # CHURN: 200 leads creados→movidos→cerrados en concurrencia
            print("\n── CHURN de pipeline (200 leads crean→mueven→cierran) ──")
            async def churn(i):
                lid=f"churn_{uniq}_{i}"
                await db.leads.insert_one({"id":lid,"assigned_to":uid,"inmobiliaria_id":inm,"status":"nuevo",
                    "status_v2":"lead_nuevo","activo":True,"first_contact_sent":True,"lost_reason":"x",
                    "contact":{"name":f"Ch{i}","phone":f"5547{i:06d}"}})
                a=await c.post(f"/api/leads/{lid}/move-column", json={"target_status":"contactado"})
                b=await c.post(f"/api/leads/{lid}/move-column", json={"target_status":"cerrado_perdido"})
                return a.status_code, b.status_code
            res=await asyncio.gather(*[churn(i) for i in range(200)], return_exceptions=True)
            okc=sum(1 for r in res if isinstance(r,tuple) and r[0] in (200,201))
            print(f"  {okc}/200 movidos a contactado OK · {'✅' if okc>=190 else '⚠️'}")
            # verificar activo=False en los cerrados
            nclosed=await db.leads.count_documents({"id":{"$regex":f"^churn_{uniq}_"},"status":"cerrado_perdido","activo":False})
            print(f"  {nclosed}/200 cerrados con activo=False (consistencia) · {'✅' if nclosed>=180 else '⚠️'}")

            # limpieza
            for pre in (f"^ld_{uniq}_", f"^ct_{uniq}_", f"^churn_{uniq}_"):
                await db.leads.delete_many({"id":{"$regex":pre}})
                await db.asesor_contactos.delete_many({"id":{"$regex":pre}})
            print("\n  (limpieza de datos de carga hecha)")

asyncio.run(main())
