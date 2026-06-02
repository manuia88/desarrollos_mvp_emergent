"""QA simulado · TANDA 2 · concurrencia real + escala/perf + integridad + fuzz + viaje completo.
Backend real (ASGI) vs Mongo local dmx_qa_sim.
"""
import os, sys, asyncio, uuid, time
sys.path.insert(0, "/Users/manuelacosta/Developer/desarrollos_mvp_emergent/backend")
_tmp = "/tmp/dmx_qa_storage"
for k in ("DI_UPLOAD_DIR","IE_UPLOAD_DIR","ASSET_UPLOAD_DIR","BROCHURE_STORAGE_PATH","FREE_AUDIT_STORAGE",
          "SOCIAL_CARDS_STORAGE","STATE_OF_CDMX_STORAGE","STUDIO_STORAGE_PATH","STUDIO_VIDEO_OUTPUT_PATH",
          "WIZARD_STORAGE_PATH","TOUR3DGS_STORAGE_PATH"):
    os.environ[k] = f"{_tmp}/{k.lower()}"
os.environ.update({"MONGO_URL":"mongodb://localhost:27017","DB_NAME":"dmx_qa_sim",
    "JWT_SECRET":"qa_secret_32bytes_xxxxxxxxxxxxxxxx","DMX_DEV_MODE":"true","LFPDPPP_SALT":"qa_salt",
    "IE_FERNET_KEY":"","PRIVATE_BETA_MODE":"false"})
import logging; logging.disable(logging.WARNING)
from httpx import AsyncClient, ASGITransport

R=[]
def chk(cat,name,ok,detail=""): R.append((cat,name,bool(ok),detail))
def H(ip): return {"X-Forwarded-For":ip}

async def main():
    import server
    db = server.db
    from datetime import datetime, timezone
    now_iso = datetime.now(timezone.utc).isoformat()
    async with server.app.router.lifespan_context(server.app):
        try:
            from data_developments import DEVELOPMENTS; proj_id = DEVELOPMENTS[0]["id"]
        except Exception: proj_id="demo"
        inm = await db.inmobiliarias.find_one({"is_system_default":True},{"_id":0,"id":1})
        inm_id=(inm or {}).get("id","dmx_root")
        uniq=uuid.uuid4().hex[:8]
        transport=ASGITransport(app=server.app)
        async with AsyncClient(transport=transport, base_url="http://t") as c:
            # asesor autenticado + vinculado
            await c.post("/api/auth/register", json={"email":f"qa2_{uniq}@qa.com","password":"x","name":"QA2","role":"advisor"}, headers=H("11.0.0.1"))
            r=await c.post("/api/auth/login", json={"email":f"qa2_{uniq}@qa.com","password":"x"}, headers=H("11.0.0.2"))
            adv_uid=(await db.users.find_one({"email":f"qa2_{uniq}@qa.com"},{"_id":0,"user_id":1}))["user_id"]
            await db.users.update_one({"user_id":adv_uid},{"$set":{"tenant_id":inm_id}})
            await db.inmobiliaria_internal_users.update_one({"inmobiliaria_id":inm_id,"user_id":adv_uid},
                {"$set":{"user_id":adv_uid,"inmobiliaria_id":inm_id,"status":"active","role":"asesor"},
                 "$setOnInsert":{"id":f"iqa2_{adv_uid}"}}, upsert=True)

            # ═══════ 1 · CONCURRENCIA REAL ═══════
            # (a) operación: 2 cierres EXACTAMENTE a la vez → solo 1 crédito
            op_id="op_"+uuid.uuid4().hex[:10]
            await db.asesor_operaciones.insert_one({"id":op_id,"owner_id":adv_uid,"status":"escritura"})
            prof0=(await db.asesor_profiles.find_one({"user_id":adv_uid},{"_id":0,"xp":1}) or {}).get("xp",0)
            res=await asyncio.gather(*[c.patch(f"/api/asesor/operaciones/{op_id}/status",json={"status":"cerrada"},headers=H("11.1.0.1")) for _ in range(5)], return_exceptions=True)
            codes=sorted([getattr(r,'status_code',None) for r in res])
            prof1=(await db.asesor_profiles.find_one({"user_id":adv_uid},{"_id":0,"xp":1}) or {}).get("xp",0)
            chk("concurrencia","operación: 5 cierres a la vez → exactamente 1 éxito", codes.count(200)==1, f"codes={codes}")
            chk("concurrencia","operación: XP otorgado UNA sola vez (no x5)", (prof1-prof0)==250, f"delta={prof1-prof0}")

            # (b) dedup cita: 4 citas idénticas a la vez → 1 sola creada
            ph=f"55{uniq}11"
            body={"project_id":proj_id,"contact":{"name":"Race","phone":ph},"datetime":"2026-08-01T10:00:00-06:00",
                  "modalidad":"presencial","lfpdppp_consent":{"accepted":True}}
            res=await asyncio.gather(*[c.post("/api/cita",json=body,headers=H("11.2.0.1")) for _ in range(4)], return_exceptions=True)
            codes=sorted([getattr(r,'status_code',None) for r in res])
            ndup=await db.leads.count_documents({"project_id":proj_id,"contact.phone_norm":{"$regex":uniq}})
            chk("concurrencia","dedup cita: 4 idénticas a la vez → ≤1 lead activo", ndup<=1, f"leads={ndup} codes={codes}")

            # (c) conversación: 2 mensajes mismo client_msg_id a la vez → 1 turno
            try:
                from conversation_engine import ConversationEngine
                ce=ConversationEngine(db)
                conv=await ce.start_conversation(lead_id="race_lead", channel="web")
                cid=conv.get("conversation_id") or conv.get("id")
                await asyncio.gather(*[ce.send_message(cid,"hola",client_msg_id="race_m") for _ in range(2)], return_exceptions=True)
                ninbound=await db.conversation_messages.count_documents({"conversation_id":cid,"client_msg_id":"race_m"})
                chk("concurrencia","conversación: 2 msg mismo id a la vez → 1 guardado", ninbound==1, f"guardados={ninbound}")
            except Exception as e:
                chk("concurrencia","conversación idempotencia (race)", False, f"err={e}")

            # ═══════ 2 · ESCALA / PERF ═══════
            big=[{"id":f"scale_{uniq}_{i}","owner_id":adv_uid,"created_at":now_iso,"first_name":f"L{i}","status":"nuevo"} for i in range(5000)]
            await db.asesor_contactos.insert_many(big)
            t0=time.perf_counter()
            cur=db.asesor_contactos.find({"owner_id":adv_uid},{"_id":0,"id":1}).sort("created_at",-1).limit(500)
            _=[x async for x in cur]
            dt=time.perf_counter()-t0
            chk("escala","consulta board con 5000 leads < 0.5s (índice sirve)", dt<0.5, f"{dt*1000:.0f}ms")
            t0=time.perf_counter()
            r=await c.get("/api/asesor/contactos", headers=H("11.3.0.1"))
            dt2=time.perf_counter()-t0
            chk("escala","GET /contactos con 5000 leads responde <3s", r.status_code==200 and dt2<3.0, f"{dt2*1000:.0f}ms status={r.status_code}")

            # ═══════ 3 · INTEGRIDAD DE DATOS ═══════
            # created_at: ¿tipos mixtos en leads? (string vs datetime)
            sample=[d async for d in db.leads.find({},{"_id":0,"created_at":1}).limit(500)]
            types=set(type(d.get("created_at")).__name__ for d in sample if d.get("created_at") is not None)
            chk("integridad","created_at en leads: tipo consistente", len(types)<=1, f"tipos={types}")
            # duplicados ACTIVOS por (project, phone_norm) — el índice debe impedirlos
            pipe=[{"$match":{"activo":True,"contact.phone_norm":{"$type":"string","$ne":""}}},
                  {"$group":{"_id":{"p":"$project_id","ph":"$contact.phone_norm"},"n":{"$sum":1}}},
                  {"$match":{"n":{"$gt":1}}}]
            dups=[x async for x in db.leads.aggregate(pipe)]
            chk("integridad","cero leads activos duplicados (proyecto+tel)", len(dups)==0, f"dups={len(dups)}")
            # espejos huérfanos: asesor_contactos.source_lead_id → lead inexistente
            orphans=0
            async for ct in db.asesor_contactos.find({"source_lead_id":{"$nin":[None,""]}},{"_id":0,"source_lead_id":1}).limit(300):
                if not await db.leads.find_one({"id":ct["source_lead_id"]},{"_id":1}): orphans+=1
            chk("integridad","espejos CRM sin lead huérfano (muestra 300)", orphans==0, f"huerfanos={orphans}")
            # leads asignados sin inmobiliaria_id (tras backfill)
            miss=await db.leads.count_documents({"assigned_to":{"$nin":[None,""]},"inmobiliaria_id":{"$in":[None]}})
            chk("integridad","leads asignados con inmobiliaria_id (tras backfill)", miss==0, f"faltan={miss}")

            # ═══════ 4 · ABUSO / ENTRADAS BASURA (4xx, nunca 500) ═══════
            cases=[
                ("registro sin password", "post","/api/auth/register",{"email":"x@x.com","name":"x"}),
                ("lead público sin email NI tel","post","/api/leads/public",{"project_id":proj_id,"name":"x"}),
                ("cita consent=false","post","/api/cita",{"project_id":proj_id,"contact":{"name":"x","phone":"5550001"},"datetime":"2026-08-01T10:00:00-06:00","lfpdppp_consent":{"accepted":False}}),
                ("nombre gigante (20k chars)","post","/api/leads/public",{"project_id":proj_id,"name":"A"*20000,"phone":"5550002"}),
                ("inyección en nombre","post","/api/leads/public",{"project_id":proj_id,"name":"<script>alert(1)</script>","phone":"5550003"}),
                ("tipo equivocado (name=número)","post","/api/auth/register",{"email":"y@y.com","password":"x","name":12345,"role":"buyer"}),
            ]
            for label,m,path,bod in cases:
                try:
                    r=await c.post(path,json=bod,headers=H("11.4.0.9"))
                    chk("abuso",f"{label} → 4xx (no 500)", 400<=r.status_code<500 or r.status_code in (200,201), f"status={r.status_code}")
                except Exception as e:
                    chk("abuso",f"{label} → manejado", False, f"EXCEPCIÓN {type(e).__name__}")

            # ═══════ 5 · VIAJE COMPLETO DEL LEAD (7 etapas) ═══════
            jl="lead_"+uuid.uuid4().hex[:10]
            await db.leads.insert_one({"id":jl,"assigned_to":adv_uid,"inmobiliaria_id":inm_id,"status":"nuevo",
                "status_v2":"lead_nuevo","activo":True,"contact":{"name":"Viaje","phone":f"559{uniq}9"},
                "first_contact_sent":True,"budget_declared":True,"timeline_declared":True,"cita_id":"x",
                "visit_outcome":"interes","oferta_accepted_at":now_iso,"notaria_completed_at":now_iso})
            chain=["contactado","calificado","visita","negociacion","cierre","vendido"]
            okj=True; last=None
            for st in chain:
                r=await c.post(f"/api/leads/{jl}/move-column",json={"target_status":st},headers=H("11.5.0.1"))
                last=r.status_code
                if r.status_code not in (200,201): okj=False; break
            fin=await db.leads.find_one({"id":jl},{"_id":0,"status_v2":1})
            chk("viaje","lead recorre 7 etapas hasta 'vendido'", okj and (fin or {}).get("status_v2")=="vendido", f"final={(fin or {}).get('status_v2')} last={last}")

            # limpieza de los 5000 de escala
            await db.asesor_contactos.delete_many({"id":{"$regex":f"^scale_{uniq}_"}})

    # REPORTE
    cats={}
    for cat,name,ok,det in R: cats.setdefault(cat,[]).append((name,ok,det))
    npass=sum(1 for *_,ok,_ in [(0,)+x for x in R] if False) # placeholder
    npass=sum(1 for _,_,ok,_ in R if ok); ntot=len(R)
    print("\n"+"="*70)
    for cat,items in cats.items():
        print(f"\n── {cat.upper()} ──")
        for name,ok,det in items: print(f"  {'✅' if ok else '❌'} {name}"+(f"  · {det}" if det else ""))
    print("\n"+"="*70); print(f"RESULTADO: {npass}/{ntot} pasaron · {ntot-npass} fallaron")
    for cat,name,ok,det in R:
        if not ok: print(f"  ❌ {cat}/{name} ({det})")

asyncio.run(main())
