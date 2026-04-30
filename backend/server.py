import os
import uuid
import bcrypt
import jwt as pyjwt
import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, Response, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel

load_dotenv()

MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME   = os.environ.get("DB_NAME")
JWT_SECRET = os.environ.get("JWT_SECRET", secrets.token_hex(32))
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")

app = FastAPI(title="DesarrollosMX API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# ─── Password helpers ─────────────────────────────────────────────────────────
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False

def create_access_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email,
               "exp": datetime.now(timezone.utc) + timedelta(hours=8),
               "type": "access"}
    return pyjwt.encode(payload, JWT_SECRET, algorithm="HS256")

def create_refresh_token(user_id: str) -> str:
    payload = {"sub": user_id,
               "exp": datetime.now(timezone.utc) + timedelta(days=30),
               "type": "refresh"}
    return pyjwt.encode(payload, JWT_SECRET, algorithm="HS256")

# ─── Models ───────────────────────────────────────────────────────────────────
class UserOut(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    role: str
    tenant_id: Optional[str] = None

class LoginIn(BaseModel):
    email: str
    password: str

class RegisterIn(BaseModel):
    email: str
    password: str
    name: str
    role: str = "buyer"

class SessionCreate(BaseModel):
    session_id: str

# ─── Auth helpers ─────────────────────────────────────────────────────────────
async def get_current_user(request: Request) -> Optional[UserOut]:
    # 1. Check session_token cookie (Google OAuth path)
    session_token = request.cookies.get("session_token")
    if session_token:
        sess = await db.user_sessions.find_one({"session_token": session_token}, {"_id": 0})
        if sess:
            exp = sess.get("expires_at")
            if exp:
                if isinstance(exp, str): exp = datetime.fromisoformat(exp)
                if exp.tzinfo is None: exp = exp.replace(tzinfo=timezone.utc)
                if exp < datetime.now(timezone.utc):
                    await db.user_sessions.delete_one({"session_token": session_token})
                    return None
            user_doc = await db.users.find_one({"user_id": sess["user_id"]}, {"_id": 0})
            if user_doc: return UserOut(**user_doc)

    # 2. Check JWT access_token cookie (email/password path)
    access_token = request.cookies.get("access_token")
    if not access_token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "): access_token = auth[7:]

    if access_token:
        try:
            payload = pyjwt.decode(access_token, JWT_SECRET, algorithms=["HS256"])
            if payload.get("type") != "access": return None
            user_doc = await db.users.find_one({"user_id": payload["sub"]}, {"_id": 0})
            if user_doc:
                user_doc.pop("password_hash", None)
                return UserOut(**user_doc)
        except Exception:
            return None
    return None

async def require_auth(request: Request) -> UserOut:
    user = await get_current_user(request)
    if not user: raise HTTPException(status_code=401, detail="No autenticado")
    return user

def require_role(*roles):
    async def checker(request: Request) -> UserOut:
        user = await require_auth(request)
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="Acceso denegado")
        return user
    return checker

# ─── Audit log ────────────────────────────────────────────────────────────────
async def audit(user_id: str, action: str, resource: str, data: dict = None):
    await db.audit_logs.insert_one({
        "user_id": user_id, "action": action, "resource": resource,
        "data": data or {}, "ts": datetime.now(timezone.utc)
    })

# ─── Startup ──────────────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id")
    await db.audit_logs.create_index("ts")
    # Seed superadmin
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@desarrollosmx.com")
    admin_pw    = os.environ.get("ADMIN_PASSWORD", "Admin2026!")
    existing    = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "user_id": "user_admin_0001",
            "email": admin_email,
            "name": "Admin DMX",
            "password_hash": hash_password(admin_pw),
            "role": "superadmin",
            "tenant_id": "dmx",
            "created_at": datetime.now(timezone.utc),
        })
    # Seed demo advisor
    adv_email = "asesor@demo.com"
    if not await db.users.find_one({"email": adv_email}):
        await db.users.insert_one({
            "user_id": "user_asesor_0001",
            "email": adv_email,
            "name": "Ana Gutiérrez",
            "password_hash": hash_password("Asesor2026!"),
            "role": "advisor",
            "tenant_id": "agencia_demo",
            "created_at": datetime.now(timezone.utc),
        })
    # Seed demo developer
    dev_email = "developer@demo.com"
    if not await db.users.find_one({"email": dev_email}):
        await db.users.insert_one({
            "user_id": "user_dev_0001",
            "email": dev_email,
            "name": "Constructora Ariel",
            "password_hash": hash_password("Dev2026!"),
            "role": "developer_admin",
            "tenant_id": "constructora_ariel",
            "created_at": datetime.now(timezone.utc),
        })

# ─── Auth routes ──────────────────────────────────────────────────────────────
@app.post("/api/auth/register")
async def register(payload: RegisterIn, response: Response):
    payload.email = payload.email.lower().strip()
    existing = await db.users.find_one({"email": payload.email})
    if existing:
        raise HTTPException(400, "El correo ya está registrado")
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    await db.users.insert_one({
        "user_id": user_id, "email": payload.email,
        "name": payload.name, "password_hash": hash_password(payload.password),
        "role": payload.role, "tenant_id": None,
        "created_at": datetime.now(timezone.utc),
    })
    access  = create_access_token(user_id, payload.email)
    refresh = create_refresh_token(user_id)
    response.set_cookie("access_token",  access,  httponly=True, secure=True, samesite="none", max_age=28800)
    response.set_cookie("refresh_token", refresh, httponly=True, secure=True, samesite="none", max_age=2592000)
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    return {"user": UserOut(**user_doc)}

@app.post("/api/auth/login")
async def login(payload: LoginIn, response: Response):
    payload.email = payload.email.lower().strip()
    user_doc = await db.users.find_one({"email": payload.email})
    if not user_doc or not verify_password(payload.password, user_doc.get("password_hash", "")):
        raise HTTPException(401, "Credenciales incorrectas")
    user_id = user_doc["user_id"]
    access  = create_access_token(user_id, payload.email)
    refresh = create_refresh_token(user_id)
    response.set_cookie("access_token",  access,  httponly=True, secure=True, samesite="none", max_age=28800)
    response.set_cookie("refresh_token", refresh, httponly=True, secure=True, samesite="none", max_age=2592000)
    user_doc.pop("_id", None); user_doc.pop("password_hash", None)
    return {"user": UserOut(**user_doc)}

@app.post("/api/auth/session")  # Google OAuth
async def create_session(payload: SessionCreate, response: Response):
    async with httpx.AsyncClient() as http:
        resp = await http.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": payload.session_id}, timeout=10)
    if resp.status_code != 200:
        raise HTTPException(401, "session_id inválido")
    data = resp.json()
    email = data.get("email"); name = data.get("name", ""); picture = data.get("picture", "")
    session_token = data.get("session_token")
    if not email or not session_token:
        raise HTTPException(401, "Datos de sesión incompletos")
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one({"email": email}, {"$set": {"name": name, "picture": picture}})
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id, "email": email, "name": name, "picture": picture,
            "role": "buyer", "tenant_id": None, "created_at": datetime.now(timezone.utc)
        })
    await db.user_sessions.delete_many({"user_id": user_id})
    await db.user_sessions.insert_one({
        "user_id": user_id, "session_token": session_token,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
        "created_at": datetime.now(timezone.utc),
    })
    response.set_cookie("session_token", session_token, httponly=True, secure=True, samesite="none", path="/", max_age=604800)
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {"user": UserOut(**user_doc)}

@app.get("/api/auth/me")
async def get_me(request: Request):
    user = await get_current_user(request)
    if not user: raise HTTPException(401, "No autenticado")
    return user

@app.post("/api/auth/logout")
async def logout(request: Request, response: Response):
    # Clear session_token
    token = request.cookies.get("session_token")
    if token: await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie("session_token", path="/", samesite="none", secure=True)
    response.delete_cookie("access_token",  path="/", samesite="none", secure=True)
    response.delete_cookie("refresh_token", path="/", samesite="none", secure=True)
    return {"message": "Sesión cerrada"}

# ─── Colonias seed data ───────────────────────────────────────────────────────
COLONIAS = [
    {"id":"polanco", "name":"Polanco", "alcaldia":"Miguel Hidalgo",
     "scores":{"Calidad de vida":88,"Movilidad":86,"Seguridad":79,"Comercio":95},
     "price":95, "inventory":67, "mom":{"pct":"+4%","positive":True},
     "trend":[84,85,86,87,88,89,90,91,92,92,93,93,94,94,95,95,94,95,95,96,95,95,95,95],
     "facts":{
       "Calidad de vida":[{"k":"Parques a 10 min","v":"14"},{"k":"Amenidades","v":"834"},{"k":"Ruido promedio","v":"54 dB"}],
       "Movilidad":[{"k":"Estaciones Metro","v":"2"},{"k":"Tiempo a Reforma","v":"12 min"},{"k":"Ecobici","v":"18 cicloestaciones"}],
       "Seguridad":[{"k":"Incidentes / 100k","v":"34"},{"k":"Cámaras C5","v":"42"},{"k":"Alumbrado","v":"98%"}],
       "Comercio":[{"k":"Restaurantes","v":"687"},{"k":"Supermercados","v":"12"},{"k":"Vida nocturna","v":"Muy alta"}],
     }},
    {"id":"coyoacan", "name":"Coyoacán", "alcaldia":"Coyoacán",
     "scores":{"Calidad de vida":91,"Movilidad":72,"Seguridad":78,"Comercio":83},
     "price":72, "inventory":94, "mom":{"pct":"+5%","positive":True},
     "trend":[62,63,64,64,65,65,66,66,67,68,68,69,70,70,71,71,71,72,72,72,72,72,72,72],
     "facts":{
       "Calidad de vida":[{"k":"Parques a 10 min","v":"18"},{"k":"Amenidades","v":"612"},{"k":"Ruido promedio","v":"50 dB"}],
       "Movilidad":[{"k":"Estaciones Metro","v":"1"},{"k":"Tiempo a Reforma","v":"38 min"},{"k":"Ecobici","v":"8 cicloestaciones"}],
       "Seguridad":[{"k":"Incidentes / 100k","v":"38"},{"k":"Cámaras C5","v":"29"},{"k":"Alumbrado","v":"92%"}],
       "Comercio":[{"k":"Restaurantes","v":"445"},{"k":"Supermercados","v":"8"},{"k":"Vida nocturna","v":"Alta"}],
     }},
    {"id":"narvarte", "name":"Narvarte Poniente", "alcaldia":"Benito Juárez",
     "scores":{"Calidad de vida":85,"Movilidad":89,"Seguridad":77,"Comercio":82},
     "price":58, "inventory":178, "mom":{"pct":"+7%","positive":True},
     "trend":[49,50,51,51,52,52,53,54,54,55,55,56,56,57,57,58,57,58,58,58,58,58,58,58],
     "facts":{
       "Calidad de vida":[{"k":"Parques a 10 min","v":"9"},{"k":"Amenidades","v":"478"},{"k":"Ruido promedio","v":"56 dB"}],
       "Movilidad":[{"k":"Estaciones Metro","v":"4"},{"k":"Tiempo a Reforma","v":"16 min"},{"k":"Ecobici","v":"16 cicloestaciones"}],
       "Seguridad":[{"k":"Incidentes / 100k","v":"44"},{"k":"Cámaras C5","v":"27"},{"k":"Alumbrado","v":"91%"}],
       "Comercio":[{"k":"Restaurantes","v":"318"},{"k":"Supermercados","v":"7"},{"k":"Vida nocturna","v":"Moderada"}],
     }},
    {"id":"doctores", "name":"Doctores", "alcaldia":"Cuauhtémoc",
     "scores":{"Calidad de vida":68,"Movilidad":87,"Seguridad":58,"Comercio":74},
     "price":38, "inventory":234, "mom":{"pct":"+9%","positive":True},
     "trend":[30,31,31,32,32,33,33,34,34,35,35,35,36,36,37,37,37,38,38,38,38,38,38,38],
     "facts":{
       "Calidad de vida":[{"k":"Parques a 10 min","v":"4"},{"k":"Amenidades","v":"287"},{"k":"Ruido promedio","v":"67 dB"}],
       "Movilidad":[{"k":"Estaciones Metro","v":"5"},{"k":"Tiempo a Reforma","v":"10 min"},{"k":"Ecobici","v":"12 cicloestaciones"}],
       "Seguridad":[{"k":"Incidentes / 100k","v":"72"},{"k":"Cámaras C5","v":"18"},{"k":"Alumbrado","v":"82%"}],
       "Comercio":[{"k":"Restaurantes","v":"198"},{"k":"Supermercados","v":"5"},{"k":"Vida nocturna","v":"Baja"}],
     }},
    {"id":"escandon", "name":"Escandón", "alcaldia":"Cuauhtémoc",
     "scores":{"Calidad de vida":82,"Movilidad":83,"Seguridad":70,"Comercio":88},
     "price":61, "inventory":142, "mom":{"pct":"-1%","positive":False},
     "trend":[57,58,59,59,60,60,61,61,62,62,62,62,62,62,62,62,62,62,62,61,61,61,61,61],
     "facts":{
       "Calidad de vida":[{"k":"Parques a 10 min","v":"7"},{"k":"Amenidades","v":"421"},{"k":"Ruido promedio","v":"61 dB"}],
       "Movilidad":[{"k":"Estaciones Metro","v":"3"},{"k":"Tiempo a Reforma","v":"20 min"},{"k":"Ecobici","v":"14 cicloestaciones"}],
       "Seguridad":[{"k":"Incidentes / 100k","v":"52"},{"k":"Cámaras C5","v":"22"},{"k":"Alumbrado","v":"88%"}],
       "Comercio":[{"k":"Restaurantes","v":"512"},{"k":"Supermercados","v":"9"},{"k":"Vida nocturna","v":"Muy alta"}],
     }},
    {"id":"lindavista", "name":"Lindavista", "alcaldia":"Gustavo A. Madero",
     "scores":{"Calidad de vida":76,"Movilidad":78,"Seguridad":69,"Comercio":71},
     "price":42, "inventory":312, "mom":{"pct":"+3%","positive":True},
     "trend":[36,37,37,38,38,39,39,40,40,40,41,41,41,41,42,42,42,42,42,42,42,42,42,42],
     "facts":{
       "Calidad de vida":[{"k":"Parques a 10 min","v":"6"},{"k":"Amenidades","v":"334"},{"k":"Ruido promedio","v":"59 dB"}],
       "Movilidad":[{"k":"Estaciones Metro","v":"3"},{"k":"Tiempo a Reforma","v":"28 min"},{"k":"Ecobici","v":"6 cicloestaciones"}],
       "Seguridad":[{"k":"Incidentes / 100k","v":"55"},{"k":"Cámaras C5","v":"16"},{"k":"Alumbrado","v":"85%"}],
       "Comercio":[{"k":"Restaurantes","v":"234"},{"k":"Supermercados","v":"6"},{"k":"Vida nocturna","v":"Baja"}],
     }},
    {"id":"del-valle", "name":"Del Valle Centro", "alcaldia":"Benito Juárez",
     "scores":{"Calidad de vida":87,"Movilidad":91,"Seguridad":74,"Comercio":82},
     "price":58, "inventory":142, "mom":{"pct":"+6%","positive":True},
     "trend":[52,53,54,54,55,56,56,55,56,57,58,58,58,58,58,58,57,58,58,59,58,58,58,58],
     "facts":{
       "Calidad de vida":[{"k":"Parques a 10 min","v":"8"},{"k":"Amenidades","v":"412"},{"k":"Ruido promedio","v":"58 dB"}],
       "Movilidad":[{"k":"Estaciones Metro","v":"3"},{"k":"Tiempo a Reforma","v":"22 min"},{"k":"Ecobici","v":"14 cicloestaciones"}],
       "Seguridad":[{"k":"Incidentes / 100k","v":"42"},{"k":"Cámaras C5","v":"28"},{"k":"Alumbrado","v":"94%"}],
       "Comercio":[{"k":"Restaurantes","v":"312"},{"k":"Supermercados","v":"7"},{"k":"Vida nocturna","v":"Alta"}],
     }},
    {"id":"condesa", "name":"Condesa", "alcaldia":"Cuauhtémoc",
     "scores":{"Calidad de vida":92,"Movilidad":88,"Seguridad":76,"Comercio":94},
     "price":72, "inventory":89, "mom":{"pct":"+4%","positive":True},
     "trend":[62,63,64,65,65,66,67,68,68,68,69,70,70,71,72,72,71,72,72,73,72,72,72,72],
     "facts":{
       "Calidad de vida":[{"k":"Parques a 10 min","v":"12"},{"k":"Amenidades","v":"681"},{"k":"Ruido promedio","v":"54 dB"}],
       "Movilidad":[{"k":"Estaciones Metro","v":"2"},{"k":"Tiempo a Reforma","v":"18 min"},{"k":"Ecobici","v":"22 cicloestaciones"}],
       "Seguridad":[{"k":"Incidentes / 100k","v":"38"},{"k":"Cámaras C5","v":"35"},{"k":"Alumbrado","v":"97%"}],
       "Comercio":[{"k":"Restaurantes","v":"524"},{"k":"Supermercados","v":"9"},{"k":"Vida nocturna","v":"Muy alta"}],
     }},
    {"id":"roma-norte", "name":"Roma Norte", "alcaldia":"Cuauhtémoc",
     "scores":{"Calidad de vida":90,"Movilidad":85,"Seguridad":72,"Comercio":91},
     "price":68, "inventory":115, "mom":{"pct":"+8%","positive":True},
     "trend":[56,57,58,59,60,61,62,62,63,64,64,65,66,66,67,67,67,68,68,68,68,68,68,68],
     "facts":{
       "Calidad de vida":[{"k":"Parques a 10 min","v":"9"},{"k":"Amenidades","v":"537"},{"k":"Ruido promedio","v":"56 dB"}],
       "Movilidad":[{"k":"Estaciones Metro","v":"3"},{"k":"Tiempo a Reforma","v":"15 min"},{"k":"Ecobici","v":"18 cicloestaciones"}],
       "Seguridad":[{"k":"Incidentes / 100k","v":"47"},{"k":"Cámaras C5","v":"31"},{"k":"Alumbrado","v":"91%"}],
       "Comercio":[{"k":"Restaurantes","v":"489"},{"k":"Supermercados","v":"8"},{"k":"Vida nocturna","v":"Muy alta"}],
     }},
]

PROPERTIES_SEED = [
    {"id":"p001","title":"Departamento en Polanco","price":7200000,"price_display":"$7,200,000",
     "ppm2":95,"appreciation":"+4.2%","beds":2,"baths":2,"parking":1,"sqm":76,
     "colonia":"Polanco","alcaldia":"Miguel Hidalgo",
     "scores":{"Calidad de vida":88,"Movilidad":86,"Seguridad":79},
     "advisor":{"name":"Carlos Mendoza","initials":"CM"},"tag":"Preventa",
     "mom":{"pct":"+4%","positive":True},"description":"Torre de lujo en corazón de Polanco. Acabados europeos, doble ventana, cocina integral y espacio para home office. Entrega Q3 2026.",
     "amenities":["Gym","Roof garden","Alberca","Concierge","Pet friendly","Vigilancia 24h"],
     "developer":"Ariel Desarrollos","start_date":"2025-03","delivery_date":"2026-09"},
    {"id":"p002","title":"Penthouse en Condesa","price":11400000,"price_display":"$11,400,000",
     "ppm2":72,"appreciation":"+4.1%","beds":3,"baths":3,"parking":2,"sqm":158,
     "colonia":"Condesa","alcaldia":"Cuauhtémoc",
     "scores":{"Calidad de vida":92,"Movilidad":88,"Seguridad":76},
     "advisor":{"name":"Ana Gutiérrez","initials":"AG"},"tag":"Últimas unidades",
     "mom":{"pct":"+4%","positive":True},"description":"Penthouse de 158 m² con terraza privada de 40 m², vista al Parque México. Sala de doble altura, cocina abierta y bodega.",
     "amenities":["Alberca","Gym","Spa","Concierge","Bodega","Cine privado"],
     "developer":"GIG Desarrollos","start_date":"2024-01","delivery_date":"2026-03"},
    {"id":"p003","title":"Loft en Roma Norte","price":5780000,"price_display":"$5,780,000",
     "ppm2":68,"appreciation":"+8.3%","beds":1,"baths":1,"parking":1,"sqm":85,
     "colonia":"Roma Norte","alcaldia":"Cuauhtémoc",
     "scores":{"Calidad de vida":90,"Movilidad":85,"Seguridad":72},
     "advisor":{"name":"Miguel Torres","initials":"MT"},"tag":"Hot",
     "mom":{"pct":"+8%","positive":True},"description":"Loft industrial-chic con dobles alturas (4.2m), plafones expuestos y ventanales que dan a la calle peatonal. Ideal inversión renta.",
     "amenities":["Roof garden","Bicicletas","Pet friendly","Co-working","Gym"],
     "developer":"Roma Housing","start_date":"2024-06","delivery_date":"2026-06"},
    {"id":"p004","title":"Studio en Narvarte Poniente","price":3250000,"price_display":"$3,250,000",
     "ppm2":58,"appreciation":"+7.1%","beds":1,"baths":1,"parking":1,"sqm":56,
     "colonia":"Narvarte Poniente","alcaldia":"Benito Juárez",
     "scores":{"Calidad de vida":85,"Movilidad":89,"Seguridad":77},
     "advisor":{"name":"Sofia Ramos","initials":"SR"},"tag":"Accesible",
     "mom":{"pct":"+7%","positive":True},"description":"Studio ultra-conectado a 5 min de 4 líneas de Metro. Acabados modernos y cocina equipada. Perfecto primer inmueble o inversión.",
     "amenities":["Gym","Terraza","Bodega","Vigilancia"],
     "developer":"Axis Inmobiliaria","start_date":"2025-01","delivery_date":"2026-12"},
    {"id":"p005","title":"Departamento en Coyoacán","price":5400000,"price_display":"$5,400,000",
     "ppm2":72,"appreciation":"+5.2%","beds":2,"baths":2,"parking":1,"sqm":75,
     "colonia":"Coyoacán","alcaldia":"Coyoacán",
     "scores":{"Calidad de vida":91,"Movilidad":72,"Seguridad":78},
     "advisor":{"name":"Roberto Vega","initials":"RV"},"tag":"Entrega inmediata",
     "mom":{"pct":"+5%","positive":True},"description":"Departamento jardín en edificio de solo 12 unidades. Diseño orgánico con madera y jardín privado de 30 m². Áreas comunes tipo spa.",
     "amenities":["Jardín privado","Yoga deck","Mascotas","Bodega","Vigilancia"],
     "developer":"Orígen Arquitectura","start_date":"2023-09","delivery_date":"2025-12"},
    {"id":"p006","title":"Departamento en Escandón","price":4100000,"price_display":"$4,100,000",
     "ppm2":61,"appreciation":"+2.8%","beds":2,"baths":1,"parking":1,"sqm":67,
     "colonia":"Escandón","alcaldia":"Cuauhtémoc",
     "scores":{"Calidad de vida":82,"Movilidad":83,"Seguridad":70},
     "advisor":{"name":"Carlos Mendoza","initials":"CM"},"tag":"Preventa",
     "mom":{"pct":"-1%","positive":False},"description":"Proyecto de 40 unidades en Escandón. Lobby curado, fachada de ladrillo artesanal y roof garden con vista a la ciudad.",
     "amenities":["Roof garden","Gym","Bike parking","Cowork"],
     "developer":"Quartier Desarrollos","start_date":"2025-04","delivery_date":"2027-01"},
]

@app.get("/api/colonias")
async def get_colonias():
    return COLONIAS

@app.get("/api/colonias/{colonia_id}")
async def get_colonia(colonia_id: str):
    for c in COLONIAS:
        if c["id"] == colonia_id: return c
    raise HTTPException(404, "Colonia no encontrada")

@app.get("/api/properties")
async def get_properties(
    colonia: Optional[str] = None, min_price: Optional[int] = None,
    max_price: Optional[int] = None, beds: Optional[int] = None,
    tipo: Optional[str] = None, tag: Optional[str] = None,
):
    results = list(PROPERTIES_SEED)
    if colonia:
        results = [p for p in results if colonia.lower() in p["colonia"].lower()]
    if min_price:
        results = [p for p in results if p["price"] >= min_price]
    if max_price:
        results = [p for p in results if p["price"] <= max_price]
    if beds:
        results = [p for p in results if p["beds"] == beds]
    if tag:
        results = [p for p in results if tag.lower() in p["tag"].lower()]
    return results

@app.get("/api/properties/{prop_id}")
async def get_property(prop_id: str):
    for p in PROPERTIES_SEED:
        if p["id"] == prop_id: return p
    raise HTTPException(404, "Propiedad no encontrada")

# ─── NLP Search (Claude Sonnet) ───────────────────────────────────────────────
class NLPSearchIn(BaseModel):
    query: str

@app.post("/api/search/nlp")
async def nlp_search(payload: NLPSearchIn):
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"nlp_search_{uuid.uuid4().hex[:8]}",
            system_message="""Eres un asistente de búsqueda inmobiliaria en CDMX. 
Extrae filtros de búsqueda del texto del usuario y sugiere hasta 3 propiedades del catálogo.

Catálogo disponible:
- p001: Polanco 2rec 2baños $7.2M Penthouse
- p002: Condesa 3rec 3baños $11.4M Penthouse  
- p003: Roma Norte 1rec $5.78M Loft
- p004: Narvarte 1rec $3.25M Studio
- p005: Coyoacán 2rec $5.4M con jardín
- p006: Escandón 2rec $4.1M Preventa

Responde en JSON estricto:
{"matches": ["p001","p003"], "reasoning": "Razón breve", "chips": ["2 recámaras","Roma Norte","<$6M"]}"""
        )
        resp = await chat.send_message(UserMessage(content=payload.query))
        import json, re
        text = resp.strip()
        m = re.search(r'\{.*\}', text, re.DOTALL)
        if m:
            result = json.loads(m.group())
            matched = [p for p in PROPERTIES_SEED if p["id"] in result.get("matches", [])]
            return {"properties": matched, "reasoning": result.get("reasoning", ""), "chips": result.get("chips", [])}
    except Exception as e:
        pass
    # Fallback: keyword search
    q = payload.query.lower()
    results = [p for p in PROPERTIES_SEED if q in p["colonia"].lower() or q in p["title"].lower()]
    return {"properties": results or PROPERTIES_SEED[:3], "reasoning": "Búsqueda por palabras clave", "chips": []}

# ─── Advisor routes ────────────────────────────────────────────────────────────
ADVISOR_ROLES = ["advisor", "advisor_admin", "superadmin"]

@app.get("/api/advisor/contacts")
async def get_contacts(request: Request):
    user = await require_auth(request)
    if user.role not in ADVISOR_ROLES: raise HTTPException(403, "Acceso denegado")
    contacts = await db.contacts.find(
        {"tenant_id": user.tenant_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    return contacts

@app.post("/api/advisor/contacts")
async def create_contact(request: Request):
    user = await require_auth(request)
    if user.role not in ADVISOR_ROLES: raise HTTPException(403)
    body = await request.json()
    contact_id = f"ct_{uuid.uuid4().hex[:10]}"
    contact = {
        "contact_id": contact_id, "tenant_id": user.tenant_id,
        "advisor_id": user.user_id,
        "name": body.get("name", ""), "email": body.get("email", ""),
        "phone": body.get("phone", ""), "source": body.get("source", "Manual"),
        "temperature": body.get("temperature", "frio"),
        "budget_min": body.get("budget_min"), "budget_max": body.get("budget_max"),
        "zones": body.get("zones", []), "notes": body.get("notes", ""),
        "tags": body.get("tags", []), "created_at": datetime.now(timezone.utc),
    }
    await db.contacts.insert_one(contact)
    await audit(user.user_id, "CREATE", "contact", {"contact_id": contact_id})
    return contact

@app.put("/api/advisor/contacts/{contact_id}")
async def update_contact(contact_id: str, request: Request):
    user = await require_auth(request)
    if user.role not in ADVISOR_ROLES: raise HTTPException(403)
    body = await request.json()
    body.pop("_id", None); body.pop("contact_id", None)
    await db.contacts.update_one(
        {"contact_id": contact_id, "tenant_id": user.tenant_id},
        {"$set": body}
    )
    await audit(user.user_id, "UPDATE", "contact", {"contact_id": contact_id})
    doc = await db.contacts.find_one({"contact_id": contact_id}, {"_id": 0})
    return doc

@app.delete("/api/advisor/contacts/{contact_id}")
async def delete_contact(contact_id: str, request: Request):
    user = await require_auth(request)
    if user.role not in ADVISOR_ROLES: raise HTTPException(403)
    await db.contacts.delete_one({"contact_id": contact_id, "tenant_id": user.tenant_id})
    await audit(user.user_id, "DELETE", "contact", {"contact_id": contact_id})
    return {"ok": True}

@app.post("/api/advisor/argumentario")
async def generate_argumentario(request: Request):
    user = await require_auth(request)
    if user.role not in ADVISOR_ROLES: raise HTTPException(403)
    body = await request.json()
    contact = body.get("contact", {})
    property_data = body.get("property", {})
    objective = body.get("objective", "persuadir")

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        system = """Eres un experto en argumentario de ventas inmobiliarias en CDMX.
Genera un mensaje persuasivo y personalizado para WhatsApp/email basado en el perfil del contacto y la propiedad.
El tono es profesional pero cálido. Usa datos reales del IE Score. Máximo 200 palabras. Sin emoji.
Responde con el mensaje listo para enviar."""
        prompt = f"""Contacto: {contact.get('name','')}, presupuesto ${contact.get('budget_max','')}, zona preferida: {', '.join(contact.get('zones',[]))}.
Propiedad: {property_data.get('title','')}, precio {property_data.get('price_display','')}, colonia {property_data.get('colonia','')}.
Objetivo: {objective}.
Genera el mensaje argumentario personalizado."""
        chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"arg_{uuid.uuid4().hex[:8]}", system_message=system)
        result = await chat.send_message(UserMessage(content=prompt))
        return {"message": result, "contact": contact.get("name"), "property": property_data.get("title")}
    except Exception as e:
        return {"message": f"Hola {contact.get('name','')},\n\nTengo una propiedad en {property_data.get('colonia','')} que podría interesarte — {property_data.get('title','')} a {property_data.get('price_display','')}. El IE Score de la zona es de 87/100 con muy buena conectividad. ¿Podemos coordinar una visita esta semana?\n\nSaludos,\n{user.name}", "contact": contact.get("name"), "property": property_data.get("title")}

# ─── Advisor pipeline (búsquedas kanban) ──────────────────────────────────────
BUSQUEDA_STAGES = ["Pendiente","Buscando","Visitando","Ofertando","Cerrando","Ganada"]

@app.get("/api/advisor/busquedas")
async def get_busquedas(request: Request):
    user = await require_auth(request)
    if user.role not in ADVISOR_ROLES: raise HTTPException(403)
    docs = await db.busquedas.find({"tenant_id": user.tenant_id}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return docs

@app.post("/api/advisor/busquedas")
async def create_busqueda(request: Request):
    user = await require_auth(request)
    if user.role not in ADVISOR_ROLES: raise HTTPException(403)
    body = await request.json()
    doc_id = f"bq_{uuid.uuid4().hex[:10]}"
    doc = {"busqueda_id": doc_id, "tenant_id": user.tenant_id, "advisor_id": user.user_id,
           "stage": "Pendiente", "contact_name": body.get("contact_name",""),
           "contact_id": body.get("contact_id"), "zones": body.get("zones",[]),
           "budget_max": body.get("budget_max"), "beds": body.get("beds"),
           "notes": body.get("notes",""), "priority": body.get("priority","media"),
           "created_at": datetime.now(timezone.utc)}
    await db.busquedas.insert_one(doc)
    return doc

@app.patch("/api/advisor/busquedas/{busqueda_id}/stage")
async def update_busqueda_stage(busqueda_id: str, request: Request):
    user = await require_auth(request)
    if user.role not in ADVISOR_ROLES: raise HTTPException(403)
    body = await request.json()
    new_stage = body.get("stage")
    if new_stage not in BUSQUEDA_STAGES: raise HTTPException(400, "Etapa inválida")
    await db.busquedas.update_one(
        {"busqueda_id": busqueda_id, "tenant_id": user.tenant_id},
        {"$set": {"stage": new_stage, "stage_updated_at": datetime.now(timezone.utc)}}
    )
    await audit(user.user_id, "STAGE_CHANGE", "busqueda", {"busqueda_id": busqueda_id, "new_stage": new_stage})
    doc = await db.busquedas.find_one({"busqueda_id": busqueda_id}, {"_id": 0})
    return doc

# ─── Developer routes ─────────────────────────────────────────────────────────
DEV_ROLES = ["developer_admin", "superadmin"]

@app.get("/api/developer/projects")
async def get_projects(request: Request):
    user = await require_auth(request)
    if user.role not in DEV_ROLES: raise HTTPException(403)
    docs = await db.projects.find({"tenant_id": user.tenant_id}, {"_id": 0}).to_list(100)
    if not docs:
        # Seed demo projects
        demo = [
            {"project_id":"proj_001","tenant_id": user.tenant_id,
             "name":"Torre Ariel Polanco","colonia":"Polanco","alcaldia":"Miguel Hidalgo",
             "units_total":48,"units_sold":31,"units_available":17,
             "price_from":6500000,"price_to":14000000,
             "delivery":"Q3 2026","status":"Construcción","progress":72,
             "created_at": datetime.now(timezone.utc)},
            {"project_id":"proj_002","tenant_id": user.tenant_id,
             "name":"Residencias Coyoacán Jardín","colonia":"Coyoacán","alcaldia":"Coyoacán",
             "units_total":24,"units_sold":18,"units_available":6,
             "price_from":4800000,"price_to":7200000,
             "delivery":"Q1 2026","status":"Entrega","progress":98,
             "created_at": datetime.now(timezone.utc)},
        ]
        await db.projects.insert_many(demo)
        return demo
    return docs

@app.post("/api/developer/projects")
async def create_project(request: Request):
    user = await require_auth(request)
    if user.role not in DEV_ROLES: raise HTTPException(403)
    body = await request.json()
    project_id = f"proj_{uuid.uuid4().hex[:8]}"
    doc = {**body, "project_id": project_id, "tenant_id": user.tenant_id,
           "created_at": datetime.now(timezone.utc)}
    await db.projects.insert_one(doc)
    await audit(user.user_id, "CREATE", "project", {"project_id": project_id})
    doc.pop("_id", None)
    return doc

@app.get("/api/developer/stats")
async def get_dev_stats(request: Request):
    user = await require_auth(request)
    if user.role not in DEV_ROLES: raise HTTPException(403)
    return {
        "units_sold_mtd": 8, "units_available": 23,
        "revenue_mtd": 52000000, "avg_days_to_close": 42,
        "top_colonia": "Polanco", "lead_conversion": 0.18,
        "velocity": 2.4, "pipeline_value": 187000000,
    }

@app.post("/api/developer/report")
async def generate_dev_report(request: Request):
    user = await require_auth(request)
    if user.role not in DEV_ROLES: raise HTTPException(403)
    projects = await db.projects.find({"tenant_id": user.tenant_id}, {"_id": 0}).to_list(10)
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        system = "Eres el Director de Inteligencia de DesarrollosMX. Genera reportes ejecutivos concisos y accionables para desarrolladoras inmobiliarias en CDMX. Usa datos reales proporcionados. Tono profesional, sin relleno."
        prompt = f"""Genera un reporte mensual ejecutivo para la desarrolladora con estos proyectos: {projects}

Incluye: 1) Resumen ejecutivo (1 párrafo), 2) Top 3 logros del mes, 3) Top 3 alertas/áreas de mejora, 4) Recomendaciones accionables, 5) Forecast próximo mes.
Formato: secciones claras, datos específicos, sin tablas."""
        chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"report_{uuid.uuid4().hex[:8]}", system_message=system)
        result = await chat.send_message(UserMessage(content=prompt))
        return {"report": result, "generated_at": datetime.now(timezone.utc).isoformat()}
    except Exception:
        return {"report": "**Resumen Ejecutivo**\n\nEl portafolio muestra absorción positiva con 8 unidades vendidas en el mes, destacando Torre Ariel Polanco con 72% de avance de obra. El precio promedio se mantiene estable en $95k/m² en el segmento premium.\n\n**Top 3 Logros:**\n1. Cierre récord Torre Polanco — 3 unidades en una semana\n2. NPS asesor aliado subió a 4.7/5\n3. Entrega Residencias Coyoacán programada en 30 días\n\n**Top 3 Alertas:**\n1. Velocidad de venta bajó 12% vs mes anterior en unidades tipo A\n2. 6 apartados sin confirmación de contrato después de 15 días\n3. Competidor GIG lanzó proyecto a $89k/m² a 3 cuadras\n\n**Recomendaciones:**\n- Activar campaña de seguimiento para los 6 apartados en riesgo\n- Evaluar ajuste de precio unitario tipo A (-3%) para acelerar absorción\n- Programar open house exclusivo para unidades de mayor ticket\n\n**Forecast Próximo Mes:**\nSe proyectan 7-9 unidades si se mantiene el ritmo actual. Alta probabilidad de cierre Residencias Coyoacán completo.", "generated_at": datetime.now(timezone.utc).isoformat()}

# ─── Demand heatmap (seed data) ───────────────────────────────────────────────
@app.get("/api/developer/demand")
async def get_demand(request: Request):
    user = await require_auth(request)
    if user.role not in DEV_ROLES: raise HTTPException(403)
    return [
        {"colonia":"Polanco","searches":487,"supply":67,"gap":420,"trend":"+18%"},
        {"colonia":"Condesa","searches":412,"supply":89,"gap":323,"trend":"+12%"},
        {"colonia":"Roma Norte","searches":389,"supply":115,"gap":274,"trend":"+24%"},
        {"colonia":"Narvarte","searches":356,"supply":178,"gap":178,"trend":"+8%"},
        {"colonia":"Del Valle","searches":298,"supply":142,"gap":156,"trend":"+6%"},
        {"colonia":"Coyoacán","searches":245,"supply":94,"gap":151,"trend":"+15%"},
        {"colonia":"Escandón","searches":221,"supply":142,"gap":79,"trend":"-2%"},
        {"colonia":"Doctores","searches":312,"supply":234,"gap":78,"trend":"+31%"},
        {"colonia":"Lindavista","searches":189,"supply":312,"gap":-123,"trend":"+3%"},
    ]

# ─── Health ────────────────────────────────────────────────────────────────────
@app.get("/api/health")
async def health():
    return {"status":"ok","service":"DesarrollosMX API v2","colonias":len(COLONIAS),"properties":len(PROPERTIES_SEED)}
