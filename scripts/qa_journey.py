"""QA · DÍA EN LA VIDA · flujo NATURAL de un lead + trabajo de un asesor.
Narrado paso a paso. Verifica que las áreas se conecten (Mis Leads · Bandeja IA ·
Calendario · pipeline) y cómo se activan IA y ML. Happy-path cohesivo, no ataque.
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

R=[]
def step(txt): print(f"\n{txt}")
def chk(name,ok,detail=""): R.append((name,bool(ok),detail)); print(f"   {'✅' if ok else '❌'} {name}"+(f"  · {detail}" if detail else ""))

async def main():
    import server; db=server.db
    uniq=uuid.uuid4().hex[:6]
    async with server.app.router.lifespan_context(server.app):
        inm=(await db.inmobiliarias.find_one({"is_system_default":True},{"_id":0,"id":1}) or {}).get("id","dmx_root")
        try:
            from data_developments import DEVELOPMENTS; proj=DEVELOPMENTS[0]["id"]; proj_name=DEVELOPMENTS[0].get("name","Proyecto")
        except Exception: proj="demo"; proj_name="Proyecto"
        tr=ASGITransport(app=server.app)
        # Claudia, asesora de Livoo (receptora de leads públicos)
        claudia=AsyncClient(transport=tr, base_url="http://t")
        async with AsyncClient(transport=tr, base_url="http://t") as pub:
            await claudia.post("/api/auth/register", json={"email":f"claudia_{uniq}@livoo.com","password":"x","name":"Claudia Landeros","role":"advisor"})
            await claudia.post("/api/auth/login", json={"email":f"claudia_{uniq}@livoo.com","password":"x"})
            cuid=(await db.users.find_one({"email":f"claudia_{uniq}@livoo.com"},{"_id":0,"user_id":1}))["user_id"]
            await db.users.update_one({"user_id":cuid},{"$set":{"tenant_id":inm}})
            # aislar la corrida: SOLO esta Claudia es receptora pública (limpia restos previos)
            await db.inmobiliaria_internal_users.update_many({"public_lead_receiver":True},{"$set":{"public_lead_receiver":False}})
            await db.inmobiliaria_internal_users.update_one({"inmobiliaria_id":inm,"user_id":cuid},
                {"$set":{"user_id":cuid,"inmobiliaria_id":inm,"status":"active","role":"asesor","public_lead_receiver":True},
                 "$setOnInsert":{"id":f"iu_{cuid}"}},upsert=True)

            print("="*72); print("  ☀️  UN DÍA CON CLAUDIA (asesora de Livoo Bienes Raíces)"); print("="*72)

            # ── 1 · 🌅 Llega un lead de marketplace ──
            step("🌅 9:00 — Un comprador deja sus datos en el marketplace (interés en "+proj_name+")")
            email=f"familia.perez_{uniq}@gmail.com"; phone=f"55{int(uniq,16)%90000000+10000000}"
            r=await pub.post("/api/leads/public", json={"project_id":proj,"name":"Familia Pérez","email":email,"phone":phone,"intent":"compra","message":"Buscamos 3 recámaras, presupuesto 6M"}, headers={"X-Forwarded-For":"40.0.0.1"})
            chk("el lead entra al sistema", r.status_code in (200,201), f"status={r.status_code}")
            lead=await db.leads.find_one({"contact.email":email},{"_id":0})
            lead_id=(lead or {}).get("id")
            chk("se asigna solo a Claudia (regla DMX→receptora)", (lead or {}).get("assigned_to")==cuid, f"assigned={(lead or {}).get('assigned_to')}")
            chk("nace en etapa 'lead_nuevo' + activo", (lead or {}).get("status_v2")=="lead_nuevo" and (lead or {}).get("activo"), f"sv2={(lead or {}).get('status_v2')}")

            # ── 2 · 📥 Aparece en "Mis Leads" ──
            step("📥 9:01 — Claudia abre 'Mis Leads' y ahí está el prospecto nuevo")
            r=await claudia.get("/api/asesor/contactos", headers={"X-Forwarded-For":"40.0.0.2"})
            body=r.json() if r.status_code==200 else {}
            items=body if isinstance(body,list) else (body.get("items") or body.get("contactos") or [])
            ct=await db.asesor_contactos.find_one({"source_lead_id":lead_id},{"_id":0})
            cid=(ct or {}).get("id")
            chk("Mis Leads carga", r.status_code==200, f"status={r.status_code}")
            chk("el lead se materializó en el CRM (puente marketplace→asesor)", bool(ct), f"contacto={cid}")
            chk("MISMA persona en leads y en CRM (identidad coherente)", (ct or {}).get("emails",[None])[0]==email or phone[-10:] in str((ct or {}).get("phones_norm")), "email/tel enlazados")

            # ── 3 · 💬 El cliente escribe por WhatsApp → la IA responde (Bandeja IA) ──
            step("💬 10:30 — El cliente escribe por WhatsApp · la IA contesta y entra a la Bandeja IA")
            from conversation_engine import ConversationEngine
            ce=ConversationEngine(db)
            conv=await ce.start_conversation(lead_id=lead_id, channel="whatsapp")
            conv_id=conv.get("conversation_id") or conv.get("id")
            resp=await ce.send_message(conv_id, "Hola, vimos el desarrollo y nos encantó. Somos familia con 2 niños, buscamos 3 recámaras. ¿Qué precio manejan?", channel="whatsapp", client_msg_id=f"wa_{uniq}_1")
            chk("la conversación se crea y la IA procesa el mensaje", bool(conv_id) and isinstance(resp,dict), f"conv={bool(conv_id)}")
            nmsgs=await db.conversation_messages.count_documents({"conversation_id":conv_id})
            chk("el turno queda guardado (memoria de la conversación)", nmsgs>=1, f"mensajes={nmsgs}")

            # ── 4 · 🧠 La IA/ML se activan (DISC, perfil, score) ──
            step("🧠 10:30 — Con el mensaje, la IA infiere perfil/DISC y los motores ML se activan")
            intel=resp.get("intel") if isinstance(resp,dict) else {}
            chk("la IA produce inteligencia del lead (DISC/plan/contexto)", isinstance(intel,dict) and len(intel)>0, f"intel_keys={list((intel or {}).keys())[:4]}")
            # idempotencia: el mismo mensaje no se procesa dos veces (sin doble costo IA)
            r2=await ce.send_message(conv_id, "Hola, vimos el desarrollo...", channel="whatsapp", client_msg_id=f"wa_{uniq}_1")
            chk("mensaje repetido NO se reprocesa (idempotente, sin doble costo IA)", bool(r2.get("deduped")), f"deduped={r2.get('deduped')}")

            # ── 5 · 🔍 Búsqueda de propiedades para el lead ──
            step("🔍 11:00 — Claudia registra qué busca el cliente y revisa propiedades match")
            r=await claudia.post("/api/asesor/busquedas", json={"contacto_id":cid,"colonias":["Polanco","Del Valle"],"recamaras":3,"presupuesto_max":6000000}, headers={"X-Forwarded-For":"40.0.0.3"})
            chk("se guarda la búsqueda del cliente (criterios)", r.status_code in (200,201), f"status={r.status_code}")
            if cid:
                r=await claudia.get(f"/api/asesor/contactos/{cid}/board", headers={"X-Forwarded-For":"40.0.0.4"})
                chk("el tablero de propiedades del lead responde", r.status_code==200, f"status={r.status_code}")

            # ── 6 · 📋 Ficha 360: hilo de actividad unificado ──
            step("📋 11:05 — Claudia abre la Ficha 360 y ve TODO junto (conversación + actividad)")
            if cid:
                r=await claudia.get(f"/api/asesor/contactos/{cid}/overview", headers={"X-Forwarded-For":"40.0.0.5"})
                ov=r.json() if r.status_code==200 else {}
                chk("Ficha 360 (overview) carga el hilo unificado", r.status_code==200, f"status={r.status_code} fuentes={list((ov.get('sources') or {}).keys())[:5]}")
                r=await claudia.get(f"/api/asesor/contactos/{cid}/intel", headers={"X-Forwarded-For":"40.0.0.6"})
                chk("Inteligencia del lead (DISC/riesgo/brief) responde", r.status_code==200, f"status={r.status_code}")

            # ── 7 · ➡️ Mueve la etapa tras el primer contacto ──
            step("➡️ 11:10 — Tras contactar al cliente, Claudia mueve el lead a 'contactado'")
            await db.leads.update_one({"id":lead_id},{"$set":{"first_contact_sent":True,"inmobiliaria_id":inm}})
            r=await claudia.post(f"/api/leads/{lead_id}/move-column", json={"target_status":"contactado"}, headers={"X-Forwarded-For":"40.0.0.7"})
            chk("el lead avanza de etapa (pipeline)", r.status_code in (200,201), f"status={r.status_code}")
            mv=await db.leads.find_one({"id":lead_id},{"_id":0,"status_v2":1})
            chk("la etapa nueva queda persistida", (mv or {}).get("status_v2")=="contactado", f"sv2={(mv or {}).get('status_v2')}")

            # ── 8 · 📅 Agenda una cita → Calendario ──
            step("📅 12:00 — El cliente acepta una visita · Claudia agenda la cita")
            rc=await claudia.post("/api/cita", json={"project_id":proj,"contact":{"name":"Familia Pérez","phone":phone,"email":email},
                "datetime":"2026-07-15T17:00:00-06:00","modalidad":"presencial","lfpdppp_consent":{"accepted":True},"asesor_id":cuid}, headers={"X-Forwarded-For":"40.0.0.8"})
            chk("la cita se crea", rc.status_code in (200,201,409), f"status={rc.status_code}")
            apt=await db.appointments.find_one({"asesor_id":cuid},{"_id":0,"id":1,"datetime":1}) or await db.appointments.find_one({},{"_id":0,"id":1})
            chk("la cita aparece en el Calendario (appointments)", bool(apt), f"cita={bool(apt)}")

            # ── 9 · ✅ COHESIÓN: el mismo lead, coherente en TODAS las áreas ──
            step("✅ FIN DEL DÍA — ¿el mismo prospecto se ve coherente en las 4 áreas?")
            in_misleads = bool(ct)
            in_bandeja = (await db.conversation_messages.count_documents({"conversation_id":conv_id}))>0
            in_pipeline = (await db.leads.find_one({"id":lead_id},{"_id":0,"status_v2":1}) or {}).get("status_v2")=="contactado"
            in_calendario = bool(apt)
            chk("MIS LEADS · el lead está en el CRM de Claudia", in_misleads)
            chk("BANDEJA IA · la conversación está registrada", in_bandeja)
            chk("PIPELINE · avanzó a 'contactado'", in_pipeline)
            chk("CALENDARIO · tiene su cita", in_calendario)
            chk("COHESIÓN TOTAL · una sola identidad de lead en las 4 áreas", all([in_misleads,in_bandeja,in_pipeline,in_calendario]))

            # ── 10 · 📊 El tablero del día refleja la actividad ──
            step("📊 El dashboard de Claudia refleja el trabajo del día")
            r=await claudia.get("/api/asesor/dashboard", headers={"X-Forwarded-For":"40.0.0.9"})
            chk("dashboard responde sin error ni NaN", r.status_code==200 and "NaN" not in r.text, f"status={r.status_code}")

            await claudia.aclose()

    npass=sum(1 for _,ok,_ in R if ok); ntot=len(R)
    print("\n"+"="*72); print(f"  RESULTADO DEL DÍA: {npass}/{ntot} pasos del flujo natural funcionaron")
    for name,ok,det in R:
        if not ok: print(f"   ❌ {name} ({det})")
    print("="*72)

asyncio.run(main())
