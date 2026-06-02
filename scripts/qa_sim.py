"""QA simulado E2E · backend real (ASGI) contra Mongo local (dmx_qa_sim).
Siembra datos realistas y corre ~90 escenarios como llamadas HTTP reales,
verificando respuesta + estado persistido. Reporte pasa/falla al final.
"""
import os, sys, asyncio, json, uuid
sys.path.insert(0, "/Users/manuelacosta/Developer/desarrollos_mvp_emergent/backend")
_tmp = "/tmp/dmx_qa_storage"
for k in ("DI_UPLOAD_DIR","IE_UPLOAD_DIR","ASSET_UPLOAD_DIR","BROCHURE_STORAGE_PATH",
          "FREE_AUDIT_STORAGE","SOCIAL_CARDS_STORAGE","STATE_OF_CDMX_STORAGE",
          "STUDIO_STORAGE_PATH","STUDIO_VIDEO_OUTPUT_PATH","WIZARD_STORAGE_PATH","TOUR3DGS_STORAGE_PATH"):
    os.environ[k] = f"{_tmp}/{k.lower()}"
os.environ.update({
    "MONGO_URL":"mongodb://localhost:27017","DB_NAME":"dmx_qa_sim",
    "JWT_SECRET":"qa_secret_32bytes_xxxxxxxxxxxxxxxx","DMX_DEV_MODE":"true",
    "LFPDPPP_SALT":"qa_salt","IE_FERNET_KEY":"", "PRIVATE_BETA_MODE":"false",
})
import logging; logging.disable(logging.WARNING)
from httpx import AsyncClient, ASGITransport

R = []  # (categoria, nombre, ok, detalle)
def chk(cat, name, ok, detail=""):
    R.append((cat, name, bool(ok), detail))

def H(ip):  # header IP distinto por grupo para aislar rate-limit
    return {"X-Forwarded-For": ip}

async def jget(c, path, **kw):
    r = await c.get(path, **kw);
    try: return r.status_code, r.json()
    except Exception: return r.status_code, {}
async def jpost(c, path, body=None, **kw):
    r = await c.post(path, json=(body or {}), **kw)
    try: return r.status_code, r.json()
    except Exception: return r.status_code, {}

async def main():
    import server
    db = server.db
    async with server.app.router.lifespan_context(server.app):
        # ───────── SIEMBRA ─────────
        # proyecto real existente (para leads/citas)
        try:
            from data_developments import DEVELOPMENTS
            proj_id = DEVELOPMENTS[0]["id"]
        except Exception:
            proj = await db.developments.find_one({}, {"_id":0,"id":1,"slug":1})
            proj_id = (proj or {}).get("slug") or (proj or {}).get("id") or "demo"
        # inmobiliaria sembrada por startup
        inm = await db.inmobiliarias.find_one({"is_system_default":True}, {"_id":0,"id":1})
        inm_id = (inm or {}).get("id","dmx_root")
        await db.inmobiliaria_internal_users.delete_many({"id": None})  # limpia restos de corridas previas

        transport = ASGITransport(app=server.app)
        async with AsyncClient(transport=transport, base_url="http://t", follow_redirects=False) as c:

            # ═══════ 1 · AUTH & ROLES ═══════
            uniq = uuid.uuid4().hex[:8]
            sc,_ = await jpost(c, "/api/auth/register",
                {"email":f"buyer_{uniq}@qa.com","password":"x","name":"B","role":"buyer"}, headers=H("10.0.0.1"))
            chk("auth","registro buyer OK", sc==200, f"status={sc}")
            sc,j = await jpost(c, "/api/auth/register",
                {"email":f"hack_{uniq}@qa.com","password":"x","name":"H","role":"superadmin"}, headers=H("10.0.0.1"))
            chk("auth","registro superadmin BLOQUEADO (400)", sc==400, f"status={sc}")
            doc = await db.users.find_one({"email":f"hack_{uniq}@qa.com"})
            chk("auth","superadmin NO se creó en BD", doc is None, f"doc={'si' if doc else 'no'}")
            sc,j = await jpost(c, "/api/auth/register",
                {"email":f"adv_{uniq}@qa.com","password":"x","name":"Asesor QA","role":"advisor"}, headers=H("10.0.0.1"))
            chk("auth","registro advisor OK", sc==200, f"status={sc}")
            adv_uid = (j.get("user") or {}).get("user_id")
            # login del advisor (cliente con cookies)
            adv = AsyncClient(transport=transport, base_url="http://t")
            sc,_ = await jpost(adv, "/api/auth/login", {"email":f"adv_{uniq}@qa.com","password":"x"}, headers=H("10.0.0.2"))
            chk("auth","login advisor OK", sc==200, f"status={sc}")
            sc,j = await jget(adv, "/api/auth/me")
            chk("auth","/me autenticado", sc==200 and (j.get("user_id")==adv_uid or j.get("user",{}).get("user_id")==adv_uid), f"status={sc}")
            # vincular el advisor a la inmobiliaria (enlace canónico) + tenant
            await db.inmobiliaria_internal_users.update_one(
                {"inmobiliaria_id":inm_id,"user_id":adv_uid},
                {"$set":{"user_id":adv_uid,"inmobiliaria_id":inm_id,"status":"active","role":"asesor"},
                 "$setOnInsert":{"id":f"iqa_{adv_uid}"}}, upsert=True)
            await db.users.update_one({"user_id":adv_uid},{"$set":{"tenant_id":inm_id}})
            # 2do advisor en OTRA inmobiliaria (cross-tests)
            sc,j2 = await jpost(c, "/api/auth/register",
                {"email":f"adv2_{uniq}@qa.com","password":"x","name":"Asesor 2","role":"advisor"}, headers=H("10.0.0.1"))
            adv2_uid = (j2.get("user") or {}).get("user_id")
            await db.users.update_one({"user_id":adv2_uid},{"$set":{"tenant_id":"inmo_otra"}})
            await db.inmobiliaria_internal_users.update_one(
                {"inmobiliaria_id":"inmo_otra","user_id":adv2_uid},
                {"$set":{"user_id":adv2_uid,"inmobiliaria_id":"inmo_otra","status":"active","role":"asesor"},
                 "$setOnInsert":{"id":f"iqa_{adv2_uid}"}}, upsert=True)
            adv2 = AsyncClient(transport=transport, base_url="http://t")
            await jpost(adv2, "/api/auth/login", {"email":f"adv2_{uniq}@qa.com","password":"x"}, headers=H("10.0.0.3"))

            # ═══════ 2-3 · LEADS PÚBLICOS + DEDUP ═══════
            ip="10.1.0.1"
            sc,j = await jpost(c, "/api/leads/public",
                {"project_id":proj_id,"name":"Cliente Uno","email":f"c1_{uniq}@qa.com","phone":"5550000001"}, headers=H(ip))
            chk("leads","lead público marketplace creado", sc in (200,201), f"status={sc}")
            lead1 = await db.leads.find_one({"contact.email":f"c1_{uniq}@qa.com"},{"_id":0,"id":1,"assigned_to":1,"status":1,"activo":1})
            chk("leads","lead persistido en BD", bool(lead1), f"lead={bool(lead1)}")
            chk("leads","lead asignado a receptor (regla DMX)", bool((lead1 or {}).get("assigned_to")), f"assigned={lead1.get('assigned_to') if lead1 else None}")
            chk("leads","lead nace activo=True", (lead1 or {}).get("activo") is True, f"activo={(lead1 or {}).get('activo')}")
            # solo-email distinto, mismo proyecto → NO debe 409 (regresión arreglada)
            sc,_ = await jpost(c, "/api/leads/public",
                {"project_id":proj_id,"name":"Cliente Dos","email":f"c2_{uniq}@qa.com"}, headers=H(ip))
            chk("dedup","2do lead solo-email NO falso-bloqueo", sc in (200,201), f"status={sc}")

            # ═══════ 9 · SEGURIDAD / IDOR ═══════
            # wa-template sin auth → 401
            apt = await db.appointments.find_one({}, {"_id":0,"id":1})
            if apt:
                anon = AsyncClient(transport=transport, base_url="http://t")  # cliente SIN cookies
                sc,_ = await jget(anon, f"/api/cita/{apt['id']}/wa-template", headers=H("10.2.0.1"))
                await anon.aclose()
                chk("seg","wa-template SIN auth → 401", sc==401, f"status={sc}")
            # insights de lead ajeno → 404 (advisor adv no es dueño)
            if lead1:
                sc,_ = await jget(adv, f"/api/asesor/lead/{lead1['id']}/insights", headers=H("10.2.0.2"))
                chk("seg","insights de lead ajeno → 404/403", sc in (403,404), f"status={sc}")
            # _resolve_org: advisor sin tenant pasa ?org_id=victima → 403
            await db.users.update_one({"user_id":adv2_uid},{"$unset":{"tenant_id":""}})
            adv3 = AsyncClient(transport=transport, base_url="http://t")
            await jpost(adv3, "/api/auth/login", {"email":f"adv2_{uniq}@qa.com","password":"x"}, headers=H("10.2.0.9"))
            sc,_ = await jget(adv3, "/api/agentic-crm/routings?org_id=dmx_root", headers=H("10.2.0.9"))
            chk("seg","agentic-crm sin tenant + org_id ajeno → 403", sc==403, f"status={sc}")
            await db.users.update_one({"user_id":adv2_uid},{"$set":{"tenant_id":"inmo_otra"}})
            # cross-sell IDOR: oferta de OTRO buyer → 404
            other_offer = "offer_"+uuid.uuid4().hex[:10]
            await db.partner_offers.insert_one({"id":other_offer,"buyer_id_hash":"hash_de_otro","partner_id":"p1","offer_status":"presented"})
            bclient = AsyncClient(transport=transport, base_url="http://t")
            await jpost(bclient, "/api/auth/login", {"email":f"buyer_{uniq}@qa.com","password":"x"}, headers=H("10.2.0.4"))
            sc,_ = await jpost(bclient, f"/api/comprador/cross-sell/offers/{other_offer}/click", headers=H("10.2.0.4"))
            chk("seg","cross-sell oferta ajena → 404", sc==404, f"status={sc}")

            # ═══════ 11 · ATLAX allow-list (nivel motor) ═══════
            import asistente_engine as ae
            chk("atlax","tool privilegiada NO en allow-list", "query_buyer_score" not in ae.PUBLIC_TOOLS and "query_command_center" not in ae.PUBLIC_TOOLS)
            chk("atlax","tool pública SÍ en allow-list", "get_zone_info" in ae.PUBLIC_TOOLS and "search_developments_public" in ae.PUBLIC_TOOLS)
            res = await ae._exec_tool(db, "query_command_center", {"user_id":"x","tenant_id":"y"})
            chk("atlax","_exec_tool bloquea privilegiada", "no está disponible" in str(res.get("error","")), f"res={res}")

            # ═══════ 10 · RATE-LIMIT ═══════
            ipf="10.3.0.1"; codes=[]
            for i in range(13):
                r = await c.post("/api/leads/public", json={"project_id":proj_id,"name":"flood","phone":f"55500{i:05d}"}, headers=H(ipf))
                codes.append(r.status_code)
            chk("rate","leads_public flood → 429 tras 10", 429 in codes, f"codes={codes[-4:]}")

            # ═══════ 12 · CONTACTO GATED ═══════
            sc,j = await jget(c, f"/api/public/asesor/{adv_uid}/profile", headers=H("10.4.0.1"))
            chk("gate","perfil público NO expone teléfono", sc==200 and "phone" not in (j.get("asesor") or {}), f"keys={list((j.get('asesor') or {}).keys())}")
            sc,j = await jpost(c, f"/api/public/asesor/{adv_uid}/contact",
                {"name":"Interesado","phone":"5559998888"}, headers=H("10.4.0.2"))
            chk("gate","dejar datos → revela contacto + crea lead", sc==200 and "asesor" in j, f"status={sc}")
            gated_lead = await db.leads.find_one({"source":"perfil_publico_asesor","assigned_to":adv_uid},{"_id":0,"id":1})
            chk("gate","lead del contacto gated persistido", bool(gated_lead))

            # ═══════ 7 · DINERO · doble-cierre CAS ═══════
            # operación de prueba del advisor, status 'escritura' → cerrar 2 veces
            op_id = "op_"+uuid.uuid4().hex[:10]
            await db.asesor_operaciones.insert_one({"id":op_id,"owner_id":adv_uid,"status":"escritura","contacto_id":"c1"})
            prof0 = await db.asesor_profiles.find_one({"user_id":adv_uid},{"_id":0,"xp":1}) or {}
            xp0 = prof0.get("xp",0)
            r1 = await adv.patch(f"/api/asesor/operaciones/{op_id}/status", json={"status":"cerrada"}, headers=H("10.5.0.1"))
            r2 = await adv.patch(f"/api/asesor/operaciones/{op_id}/status", json={"status":"cerrada"}, headers=H("10.5.0.1"))
            chk("dinero","2do cierre rechazado (no doble crédito)", r1.status_code==200 and r2.status_code in (400,409), f"r1={r1.status_code} r2={r2.status_code}")
            prof1 = await db.asesor_profiles.find_one({"user_id":adv_uid},{"_id":0,"xp":1}) or {}
            chk("dinero","XP otorgado UNA sola vez (no doble)", (prof1.get("xp",0)-xp0)==250, f"delta={prof1.get('xp',0)-xp0}")

            # ═══════ 12b · AUTO-REPARABLE ═══════
            from services.lead_bridge import retry_pending_mirrors, backfill_lead_inmobiliaria, resolve_user_inmobiliaria
            # lead asignado al advisor sin espejo + mirror_pending → retry lo repara
            lp_id = "lead_"+uuid.uuid4().hex[:10]
            await db.leads.insert_one({"id":lp_id,"assigned_to":adv_uid,"mirror_pending":True,
                                       "contact":{"name":"Pend","phone":"5557776666"},"status":"nuevo"})
            n = await retry_pending_mirrors(db)
            mir = await db.asesor_contactos.find_one({"source_lead_id":lp_id},{"_id":0,"id":1})
            chk("autoreparable","mirror_pending → lead reaparece en Mis Leads", bool(mir), f"reparados={n}")
            # backfill inmobiliaria
            li_id = "lead_"+uuid.uuid4().hex[:10]
            await db.leads.insert_one({"id":li_id,"assigned_to":adv_uid,"status":"nuevo"})
            await backfill_lead_inmobiliaria(db)
            lib = await db.leads.find_one({"id":li_id},{"_id":0,"inmobiliaria_id":1})
            chk("autoreparable","backfill inmobiliaria desde asesor", (lib or {}).get("inmobiliaria_id")==inm_id, f"inm={(lib or {}).get('inmobiliaria_id')}")
            chk("autoreparable","resolver inmobiliaria del asesor", (await resolve_user_inmobiliaria(db, adv_uid))==inm_id)

            # ═══════ 4 · PIPELINE (mover etapas) ═══════
            # lead del advisor para mover · necesita inmobiliaria match para ownership
            pl_id = "lead_"+uuid.uuid4().hex[:10]
            await db.leads.insert_one({"id":pl_id,"assigned_to":adv_uid,"inmobiliaria_id":inm_id,
                "status":"nuevo","status_v2":"lead_nuevo","activo":True,"contact":{"name":"Mover","phone":"5551112222"}})
            r = await adv.post(f"/api/leads/{pl_id}/move-column", json={"target_status":"cerrado_perdido"}, headers=H("10.6.0.1"))
            chk("pipeline","cerrar perdido SIN lost_reason → 422", r.status_code==422, f"status={r.status_code}")
            await db.leads.update_one({"id":pl_id},{"$set":{"lost_reason":"sin_presupuesto"}})
            r = await adv.post(f"/api/leads/{pl_id}/move-column", json={"target_status":"cerrado_perdido"}, headers=H("10.6.0.1"))
            chk("pipeline","cerrar perdido CON lost_reason → OK", r.status_code in (200,201), f"status={r.status_code}")

            # ═══════ 5 · CRM Mis Leads (aislamiento) ═══════
            sc,j = await jget(adv, "/api/asesor/contactos", headers=H("10.7.0.1"))
            chk("crm","listar Mis Leads OK", sc==200, f"status={sc}")
            sc,j2 = await jget(adv2, "/api/asesor/contactos", headers=H("10.7.0.2"))
            chk("crm","otro asesor lista (aislado)", sc==200, f"status={sc}")

            # ═══════ 13 · DATOS / PERSISTENCIA ═══════
            idx = await db.leads.index_information()
            chk("datos","índice dedup leads existe", any("uniq_active_lead" in k for k in idx), f"idx={[k for k in idx if 'uniq' in k]}")
            ci = await db.asesor_contactos.index_information()
            chk("datos","índices asesor_contactos creados", len([k for k in ci if k!='_id_'])>=1, f"n={len(ci)-1}")

            # ═══════ 6 · CITAS (crear · HTTP) ═══════
            cita_body = {"project_id":proj_id,"contact":{"name":"Cita QA","phone":f"5{uniq[:9]}","email":f"cita_{uniq}@qa.com"},
                         "datetime":"2026-07-01T16:00:00-06:00","modalidad":"presencial","lfpdppp_consent":{"accepted":True}}
            sc,j = await jpost(c, "/api/cita", cita_body, headers=H("10.8.0.1"))
            chk("citas","crear cita pública", sc in (200,201), f"status={sc}")
            if sc in (200,201):
                cl_email = f"cita_{uniq}@qa.com"
                clead = await db.leads.find_one({"contact.email":cl_email},{"_id":0,"id":1,"status_v2":1,"created_at":1})
                chk("citas","cita → lead persistido", bool(clead))
                capt = await db.appointments.find_one({"lead_id":(clead or {}).get("id")},{"_id":0,"id":1}) if clead else None
                chk("citas","cita → appointment persistido", bool(capt))
                chk("datos","lead nuevo trae status_v2 + created_at", bool((clead or {}).get("status_v2")) and bool((clead or {}).get("created_at")), f"sv2={(clead or {}).get('status_v2')}")
                # wa-template del DUEÑO de la cita → 200 (si la cita quedó asignada al advisor)
                if capt:
                    aptdoc = await db.appointments.find_one({"id":capt["id"]},{"_id":0,"asesor_id":1})
                    if (aptdoc or {}).get("asesor_id"):
                        await db.users.update_one({"user_id":adv_uid},{"$set":{"role":"advisor"}})
                        # forzar dueño = adv para probar el 200
                        await db.appointments.update_one({"id":capt["id"]},{"$set":{"asesor_id":adv_uid}})
                        r = await adv.get(f"/api/cita/{capt['id']}/wa-template", headers=H("10.8.0.2"))
                        chk("seg","wa-template del DUEÑO → 200", r.status_code==200, f"status={r.status_code}")

            # ═══════ 4b · PIPELINE transición válida con hard-rule ═══════
            tl_id = "lead_"+uuid.uuid4().hex[:10]
            await db.leads.insert_one({"id":tl_id,"assigned_to":adv_uid,"inmobiliaria_id":inm_id,
                "status":"nuevo","status_v2":"lead_nuevo","activo":True,"first_contact_sent":True,
                "contact":{"name":"Trans","phone":"5550009999"}})
            r = await adv.post(f"/api/leads/{tl_id}/move-column", json={"target_status":"contactado"}, headers=H("10.6.0.2"))
            chk("pipeline","lead_nuevo→contactado con first_contact → OK", r.status_code in (200,201), f"status={r.status_code}")
            tl = await db.leads.find_one({"id":tl_id},{"_id":0,"status_v2":1})
            chk("pipeline","status_v2 persiste tras mover", (tl or {}).get("status_v2")=="contactado", f"sv2={(tl or {}).get('status_v2')}")

            # ═══════ 9b · outbound cross-inmobiliaria (HTTP) ═══════
            xl_id = "lead_"+uuid.uuid4().hex[:10]
            await db.leads.insert_one({"id":xl_id,"inmobiliaria_id":"inmo_otra","assigned_to":None,"status":"nuevo","activo":True})
            r = await adv.post(f"/api/leads/{xl_id}/outbound-claim", headers=H("10.6.0.3"))
            still = await db.leads.find_one({"id":xl_id},{"_id":0,"assigned_to":1})
            chk("seg","outbound-claim de OTRA inmobiliaria NO roba", (still or {}).get("assigned_to") in (None,""), f"assigned={(still or {}).get('assigned_to')}")

            # ═══════ 8 · CONVERSACIÓN IA · idempotencia (motor) ═══════
            try:
                from conversation_engine import ConversationEngine
                ce = ConversationEngine(db)
                conv = await ce.start_conversation(lead_id=tl_id, channel="web")
                cid = conv.get("conversation_id") or conv.get("id")
                if cid:
                    await ce.send_message(cid, "Hola, me interesa", client_msg_id="qa_msg_1")
                    r2 = await ce.send_message(cid, "Hola, me interesa", client_msg_id="qa_msg_1")
                    chk("conv","mensaje duplicado (client_msg_id) → deduped", bool(r2.get("deduped")), f"r2deduped={r2.get('deduped')}")
            except Exception as e:
                chk("conv","idempotencia conversación (motor)", False, f"err={type(e).__name__}:{e}")

            # ═══════ 12c · RECONCILES (auto-reparable) ═══════
            from pipeline_engine import backfill_status_v2, reconcile_lead_activo
            from routes.advisor import reconcile_pending_xp
            bs_id="lead_"+uuid.uuid4().hex[:8]
            await db.leads.insert_one({"id":bs_id,"status_v2":"nuevo"})  # valor V1 malo
            await backfill_status_v2(db)
            bsd=await db.leads.find_one({"id":bs_id},{"_id":0,"status_v2":1})
            chk("autoreparable","backfill_status_v2 repara 'nuevo'→'lead_nuevo'", (bsd or {}).get("status_v2")=="lead_nuevo", f"sv2={(bsd or {}).get('status_v2')}")
            ra_id="lead_"+uuid.uuid4().hex[:8]
            await db.leads.insert_one({"id":ra_id,"status":"cerrado_perdido","activo":True})  # inconsistente
            await reconcile_lead_activo(db)
            rad=await db.leads.find_one({"id":ra_id},{"_id":0,"activo":1})
            chk("autoreparable","reconcile_lead_activo: cerrado→activo False", (rad or {}).get("activo") is False, f"activo={(rad or {}).get('activo')}")
            xp_op="op_"+uuid.uuid4().hex[:8]
            await db.asesor_operaciones.insert_one({"id":xp_op,"owner_id":adv_uid,"status":"cerrada","xp_pending":True})
            await reconcile_pending_xp(db)
            xpd=await db.asesor_operaciones.find_one({"id":xp_op},{"_id":0,"xp_pending":1})
            chk("autoreparable","reconcile_pending_xp limpia bandera", "xp_pending" not in xpd, f"doc={xpd}")

            for cl in (adv,adv2,adv3,bclient): await cl.aclose()

    # ───────── REPORTE ─────────
    print("\n" + "="*70)
    cats = {}
    for cat,name,ok,det in R:
        cats.setdefault(cat,[]).append((name,ok,det))
    npass = sum(1 for _,_,ok,_ in R if ok); ntot=len(R)
    for cat, items in cats.items():
        print(f"\n── {cat.upper()} ──")
        for name,ok,det in items:
            print(f"  {'✅' if ok else '❌'} {name}" + (f"  · {det}" if (not ok and det) else ""))
    print("\n" + "="*70)
    print(f"RESULTADO: {npass}/{ntot} pasaron · {ntot-npass} fallaron")
    fails=[f"{cat}/{name} ({det})" for cat,name,ok,det in R if not ok]
    if fails:
        print("FALLAS:"); [print("  -",f) for f in fails]

asyncio.run(main())
