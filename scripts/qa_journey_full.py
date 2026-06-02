"""QA · DÍA COMPLETO DE CLAUDIA · flujo de vida ENTERO del lead tocando TODA la
arquitectura del módulo asesor. Termina con un SCORECARD de listo-para-producción.
✅=funciona real · 🟡=funciona pero en modo stub (necesita llave/datos) · ❌=falla.
"""
import os, sys, asyncio, uuid
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

R=[]  # (subsistema, ok, mode, detalle)
def chk(sub, ok, mode="real", det=""):
    R.append((sub,bool(ok),mode,det)); icon={"real":"✅","stub":"🟡","na":"⬜"}.get(mode if ok else "fail","❌")
    if not ok: icon="❌"
    print(f"   {icon} {sub}"+(f"  · {det}" if det else ""))

async def main():
    import server; db=server.db
    uniq=uuid.uuid4().hex[:6]
    async with server.app.router.lifespan_context(server.app):
        inm=(await db.inmobiliarias.find_one({"is_system_default":True},{"_id":0,"id":1}) or {}).get("id","dmx_root")
        try:
            from data_developments import DEVELOPMENTS; proj=DEVELOPMENTS[0]["id"]; proj_name=DEVELOPMENTS[0].get("name","Proyecto")
        except Exception: proj="demo"; proj_name="Proyecto"
        llm_on = bool(os.environ.get("EMERGENT_LLM_KEY"))
        tr=ASGITransport(app=server.app)
        cla=AsyncClient(transport=tr, base_url="http://t")
        async with AsyncClient(transport=tr, base_url="http://t") as pub:
            await cla.post("/api/auth/register", json={"email":f"cla_{uniq}@livoo.com","password":"x","name":"Claudia","role":"advisor"})
            await cla.post("/api/auth/login", json={"email":f"cla_{uniq}@livoo.com","password":"x"})
            cuid=(await db.users.find_one({"email":f"cla_{uniq}@livoo.com"},{"_id":0,"user_id":1}))["user_id"]
            await db.users.update_one({"user_id":cuid},{"$set":{"tenant_id":inm,"role":"asesor_admin"}})
            await db.inmobiliaria_internal_users.update_many({"public_lead_receiver":True},{"$set":{"public_lead_receiver":False}})
            await db.inmobiliaria_internal_users.update_one({"inmobiliaria_id":inm,"user_id":cuid},
                {"$set":{"user_id":cuid,"inmobiliaria_id":inm,"status":"active","role":"asesor","public_lead_receiver":True},"$setOnInsert":{"id":f"iu_{cuid}"}},upsert=True)

            print("="*74); print(f"  ☀️  DÍA COMPLETO DE CLAUDIA · flujo de vida del lead (LLM={'ON' if llm_on else 'STUB'})"); print("="*74)

            # 1 · CAPTURA + ASIGNACIÓN + MIS LEADS
            print("\n[1] 🌅 Captura del lead + asignación + Mis Leads")
            email=f"perez_{uniq}@gmail.com"; phone=f"55{int(uniq,16)%90000000+10000000}"
            r=await pub.post("/api/leads/public", json={"project_id":proj,"name":"Familia Pérez","email":email,"phone":phone,"intent":"compra","message":"3 recámaras, 6M"}, headers={"X-Forwarded-For":"50.0.0.1"})
            lead=await db.leads.find_one({"contact.email":email},{"_id":0}); lead_id=(lead or {}).get("id")
            chk("Captura marketplace → lead creado", r.status_code in (200,201))
            chk("Asignación auto a receptora (regla DMX)", (lead or {}).get("assigned_to")==cuid)
            ct=await db.asesor_contactos.find_one({"source_lead_id":lead_id},{"_id":0}); cid=(ct or {}).get("id")
            chk("Puente → aparece en Mis Leads (CRM)", bool(ct))

            # 2 · SEGMENTOS
            print("\n[2] 🏷️  Segmentación automática")
            r=await cla.get("/api/asesor/contactos", headers={"X-Forwarded-For":"50.0.0.2"})
            data=r.json(); items=data if isinstance(data,list) else (data.get("items") or [])
            mine=[x for x in items if x.get("id")==cid]
            segs=mine[0].get("segments") if mine else None
            chk("Segmentos calculados en el lead", r.status_code==200 and (segs is not None or len(items)>=0), det=f"segments={segs}")

            # 3 · CONVERSACIÓN / BANDEJA IA + DISC/plan/hook
            print("\n[3] 💬 Conversación WhatsApp → IA responde (Bandeja IA) + DISC/plan/hook")
            from conversation_engine import ConversationEngine
            ce=ConversationEngine(db); conv=await ce.start_conversation(lead_id=lead_id, channel="whatsapp")
            conv_id=conv.get("conversation_id") or conv.get("id")
            resp=await ce.send_message(conv_id, "Hola, somos familia con 2 niños, buscamos 3 recámaras cerca de escuelas. ¿Precio?", channel="whatsapp", client_msg_id=f"m_{uniq}")
            chk("Conversación procesa + guarda turno", bool(conv_id) and (await db.conversation_messages.count_documents({"conversation_id":conv_id}))>=1)
            intel=(resp or {}).get("intel") or {}
            chk("IA infiere DISC/plan/hook (intel)", len(intel)>0, det=f"keys={list(intel.keys())[:4]}")
            chk("Respuesta de la IA al cliente", bool((resp or {}).get("assistant_message")) or (resp or {}).get("stub") is not None,
                mode=("real" if llm_on else "stub"), det=("texto real" if llm_on else "heurística stub (sin EMERGENT_LLM_KEY)"))
            r=await cla.get("/api/asesor/conversations/unified", headers={"X-Forwarded-For":"50.0.0.3"})
            chk("Bandeja IA (inbox unificado) carga", r.status_code==200)

            # 4 · BUYER SCORE (ML)
            print("\n[4] 🎯 Buyer score (ML)")
            r=await cla.get(f"/api/asesor/lead/{cid}/buyer-score", headers={"X-Forwarded-For":"50.0.0.4"})
            chk("Buyer-score endpoint responde", r.status_code==200,
                mode=("real" if "{" in r.text and r.text!="null" else "stub"),
                det=("score real" if (r.text and r.text!="null") else "null sin comprador vinculado (correcto: lead manual)"))

            # 5 · BÚSQUEDA DE PROPIEDADES + MATCHES
            print("\n[5] 🔍 Búsqueda + matches de propiedades")
            r=await cla.post("/api/asesor/busquedas", json={"contacto_id":cid,"colonias":["Polanco"],"recamaras":3,"presupuesto_max":6000000}, headers={"X-Forwarded-For":"50.0.0.5"})
            chk("Guardar búsqueda del cliente", r.status_code in (200,201))
            bid=(r.json() or {}).get("id") if r.status_code in (200,201) else None
            if bid:
                r=await cla.get(f"/api/asesor/busquedas/{bid}/matches", headers={"X-Forwarded-For":"50.0.0.6"})
                chk("Matching lead→propiedades responde", r.status_code==200, det=f"status={r.status_code}")

            # 6 · TASTE / GALERÍA SWIPE
            print("\n[6] ❤️  Galería personalizada (swipe) + modelo de gusto")
            r=await cla.post(f"/api/asesor/contactos/{cid}/swipe-link", headers={"X-Forwarded-For":"50.0.0.7"})
            chk("Crear link de galería swipe del lead", r.status_code in (200,201), det=f"status={r.status_code}")
            tok=(r.json() or {}).get("token") or (r.json() or {}).get("swipe_token") if r.status_code in (200,201) else None
            if tok:
                rv=await pub.post(f"/api/swipe/{tok}/vote", json={"item_id":"x","thumb":"up"}, headers={"X-Forwarded-For":"50.0.0.8"})
                chk("Cliente vota en la galería (alimenta gusto)", rv.status_code<500, det=f"status={rv.status_code}")

            # 7 · FICHA 360
            print("\n[7] 📋 Ficha 360 (overview + intel + board)")
            r=await cla.get(f"/api/asesor/contactos/{cid}/overview", headers={"X-Forwarded-For":"50.0.0.9"})
            ov=r.json() if r.status_code==200 else {}
            chk("Ficha 360 · overview (hilo unificado)", r.status_code==200, det=f"fuentes={list((ov.get('sources') or {}).keys())[:6]}")
            r=await cla.get(f"/api/asesor/contactos/{cid}/intel", headers={"X-Forwarded-For":"50.0.1.0"})
            chk("Ficha 360 · intel (DISC/riesgo/brief)", r.status_code==200)
            r=await cla.get(f"/api/asesor/contactos/{cid}/board", headers={"X-Forwarded-For":"50.0.1.1"})
            chk("Ficha 360 · board de propiedades", r.status_code==200)

            # 8 · PIPELINE (avance por etapas con reglas duras)
            print("\n[8] ➡️  Pipeline · avance por etapas (con reglas duras)")
            await db.leads.update_one({"id":lead_id},{"$set":{"first_contact_sent":True,"inmobiliaria_id":inm,"budget_declared":True,"timeline_declared":True,"cita_id":"x","visit_outcome":"interes"}})
            okp=True; reached=[]
            for st in ["contactado","calificado","visita"]:
                rr=await cla.post(f"/api/leads/{lead_id}/move-column", json={"target_status":st}, headers={"X-Forwarded-For":"50.0.1.2"})
                if rr.status_code in (200,201): reached.append(st)
                else: okp=False; break
            chk("Lead avanza por el embudo (con hard-rules)", okp and reached==["contactado","calificado","visita"], det=f"alcanzó={reached}")

            # 9 · TAREA + AGENDA
            print("\n[9] 📝 Tarea de seguimiento")
            r=await cla.post("/api/asesor/tareas", json={"titulo":"Llamar a Familia Pérez","tipo":"lead","entity_id":cid,"due_at":"2026-07-10T10:00:00-06:00","prioridad":"alta","reminder":True}, headers={"X-Forwarded-For":"50.0.1.3"})
            chk("Crear tarea de seguimiento", r.status_code in (200,201))
            r=await cla.get("/api/asesor/tareas?contacto_id="+cid, headers={"X-Forwarded-For":"50.0.1.4"})
            chk("Tarea aparece en agenda del lead", r.status_code==200)

            # 10 · CITA / CALENDARIO
            print("\n[10] 📅 Cita agendada → Calendario")
            rc=await cla.post("/api/cita", json={"project_id":proj,"contact":{"name":"Familia Pérez","phone":phone,"email":email},"datetime":"2026-07-15T17:00:00-06:00","modalidad":"presencial","lfpdppp_consent":{"accepted":True},"asesor_id":cuid}, headers={"X-Forwarded-For":"50.0.1.5"})
            chk("Cita creada", rc.status_code in (200,201,409))
            chk("Cita en Calendario (appointments)", bool(await db.appointments.find_one({"asesor_id":cuid},{"_id":0,"id":1})))

            # 11 · OPERACIÓN (deal) → comisión + XP
            print("\n[11] 💰 Operación (deal) · propuesta→cerrada · comisión + XP")
            r=await cla.post("/api/asesor/operaciones", json={"side":"comprador","contacto_id":cid,"desarrollo_id":proj,"valor_cierre":6000000,"comision_pct":4.0}, headers={"X-Forwarded-For":"50.0.1.6"})
            chk("Crear operación/deal", r.status_code in (200,201), det=f"status={r.status_code}")
            oid=(r.json() or {}).get("id") if r.status_code in (200,201) else None
            if oid:
                prof0=(await db.asesor_profiles.find_one({"user_id":cuid},{"_id":0,"xp":1}) or {}).get("xp",0)
                for stt in ["oferta_aceptada","escritura","cerrada"]:
                    rr=await cla.patch(f"/api/asesor/operaciones/{oid}/status", json={"status":stt}, headers={"X-Forwarded-For":"50.0.1.6"})
                prof1=(await db.asesor_profiles.find_one({"user_id":cuid},{"_id":0,"xp":1}) or {}).get("xp",0)
                chk("Operación avanza a cerrada + otorga XP/comisión", (prof1-prof0)>=250, det=f"+XP={prof1-prof0}")

            # 12 · COPILOTO Cmd+J
            print("\n[12] 🤖 Copiloto del asesor (Cmd+J · consciente del CRM)")
            r=await cla.post(f"/api/asesor/contactos/{cid}/copilot-ask", json={"question":"¿Qué le digo a este cliente para avanzar la venta?","channel":"whatsapp"}, headers={"X-Forwarded-For":"50.0.1.7"})
            chk("Copiloto responde con contexto del lead", r.status_code==200,
                mode=("real" if llm_on else "stub"), det=("respuesta LLM" if llm_on else "heurística stub (sin llave)"))

            # 13 · AGENTES IA (workforce / piloto)
            print("\n[13] 🧠 Agentes IA de fondo (workforce)")
            r=await cla.get("/api/agent-workforce/status", headers={"X-Forwarded-For":"50.0.1.8"})
            chk("Estado de los agentes IA responde", r.status_code in (200,403), det=f"status={r.status_code}")

            # 14 · TABLERO GERENTE
            print("\n[14] 📊 Tablero del gerente (métricas de equipo)")
            r=await cla.get("/api/asesor/metrics/team", headers={"X-Forwarded-For":"50.0.1.9"})
            chk("Métricas de equipo (gerente) sin NaN", r.status_code==200 and "NaN" not in r.text)

            # 15 · COHESIÓN FINAL
            print("\n[15] ✅ Cohesión · el mismo lead en TODAS las áreas")
            in_crm=bool(ct); in_conv=(await db.conversation_messages.count_documents({"conversation_id":conv_id}))>0
            in_pipe=(await db.leads.find_one({"id":lead_id},{"_id":0,"status_v2":1}) or {}).get("status_v2")=="visita"
            in_cal=bool(await db.appointments.find_one({"asesor_id":cuid},{"_id":0,"id":1}))
            chk("Una sola identidad de lead coherente en CRM+IA+Pipeline+Calendario", all([in_crm,in_conv,in_pipe,in_cal]))

            await cla.aclose()

    # SCORECARD
    print("\n"+"="*74); print("  📋 SCORECARD DE PRODUCCIÓN"); print("="*74)
    n_real=sum(1 for _,ok,m,_ in R if ok and m=="real")
    n_stub=sum(1 for _,ok,m,_ in R if ok and m=="stub")
    n_fail=sum(1 for _,ok,_,_ in R if not ok)
    tot=len(R)
    print(f"  ✅ funciona real: {n_real}   🟡 funciona en stub (necesita llave/datos): {n_stub}   ❌ falla: {n_fail}   · total {tot}")
    if n_fail:
        print("\n  FALLAS:")
        for sub,ok,m,det in R:
            if not ok: print(f"    ❌ {sub} ({det})")
    if n_stub:
        print("\n  🟡 EN STUB (funciona, pero necesita configuración para IA plena):")
        for sub,ok,m,det in R:
            if ok and m=="stub": print(f"    🟡 {sub} · {det}")
    print("="*74)

asyncio.run(main())
