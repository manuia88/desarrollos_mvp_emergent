import os
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Annotated

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, Response, Depends
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, BeforeValidator

load_dotenv()

MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")

app = FastAPI(title="DesarrollosMX API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── MongoDB ────────────────────────────────────────────────────────────────
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]


# ─── Models ─────────────────────────────────────────────────────────────────
class UserBase(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    role: str = "buyer"
    tenant_id: Optional[str] = None
    created_at: datetime = None

class SessionCreate(BaseModel):
    session_id: str

class UserOut(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    role: str
    tenant_id: Optional[str] = None


# ─── Auth helpers ────────────────────────────────────────────────────────────
async def get_current_user(request: Request) -> Optional[UserOut]:
    token = None
    # Cookie first, then Authorization header
    cookie_token = request.cookies.get("session_token")
    if cookie_token:
        token = cookie_token
    else:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]

    if not token:
        return None

    session_doc = await db.user_sessions.find_one(
        {"session_token": token}, {"_id": 0}
    )
    if not session_doc:
        return None

    # Check expiry (timezone-aware)
    expires_at = session_doc.get("expires_at")
    if expires_at:
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at)
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < datetime.now(timezone.utc):
            await db.user_sessions.delete_one({"session_token": token})
            return None

    user_doc = await db.users.find_one(
        {"user_id": session_doc["user_id"]}, {"_id": 0}
    )
    if not user_doc:
        return None

    return UserOut(**user_doc)


async def require_auth(request: Request) -> UserOut:
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado")
    return user


# ─── Auth routes ─────────────────────────────────────────────────────────────
@app.post("/api/auth/session")
async def create_session(payload: SessionCreate, response: Response):
    """Exchange session_id from Emergent OAuth for a session token."""
    async with httpx.AsyncClient() as http:
        resp = await http.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": payload.session_id},
            timeout=10,
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="session_id inválido")

    data = resp.json()
    email = data.get("email")
    name = data.get("name", "")
    picture = data.get("picture", "")
    session_token = data.get("session_token")

    if not email or not session_token:
        raise HTTPException(status_code=401, detail="Datos de sesión incompletos")

    # Upsert user
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one(
            {"email": email},
            {"$set": {"name": name, "picture": picture}},
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one(
            {
                "user_id": user_id,
                "email": email,
                "name": name,
                "picture": picture,
                "role": "buyer",
                "tenant_id": None,
                "created_at": datetime.now(timezone.utc),
            }
        )

    # Single-session enforcement: remove old sessions for this user
    await db.user_sessions.delete_many({"user_id": user_id})

    # Store new session
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.insert_one(
        {
            "user_id": user_id,
            "session_token": session_token,
            "expires_at": expires_at,
            "created_at": datetime.now(timezone.utc),
        }
    )

    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=7 * 24 * 3600,
    )

    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {"user": UserOut(**user_doc)}


@app.get("/api/auth/me")
async def get_me(request: Request):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado")
    return user


@app.post("/api/auth/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get("session_token") or request.headers.get(
        "Authorization", ""
    ).replace("Bearer ", "")
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie("session_token", path="/", samesite="none", secure=True)
    return {"message": "Sesión cerrada"}


# ─── Colonias (seed data) ─────────────────────────────────────────────────────
COLONIAS_SEED = [
    {
        "id": "del-valle-centro",
        "name": "Del Valle Centro",
        "alcaldia": "Benito Juárez",
        "liv": 87, "mov": 91, "sec": 74, "eco": 82,
        "price": 58,
        "inventory": 142,
        "mom": {"pct": "+6%", "positive": True},
        "trend": [52,53,54,54,55,56,56,55,56,57,58,58,58,58,58,58,57,58,58,59,58,58,58,58],
        "facts": {
            "LIV": [
                {"k": "Parques a 10 min", "v": "8"},
                {"k": "Amenidades", "v": "412"},
                {"k": "Ruido promedio", "v": "58 dB"},
            ],
            "MOV": [
                {"k": "Estaciones Metro", "v": "3"},
                {"k": "Ecobici", "v": "14 cicloestaciones"},
                {"k": "Tiempo a Reforma", "v": "22 min"},
            ],
            "SEC": [
                {"k": "Incidentes / 100k hab", "v": "42"},
                {"k": "Cámaras C5", "v": "28"},
                {"k": "Alumbrado público", "v": "94%"},
            ],
            "ECO": [
                {"k": "Restaurantes y cafés", "v": "312"},
                {"k": "Supermercados", "v": "7"},
                {"k": "Vida nocturna", "v": "Alta"},
            ],
        },
    },
    {
        "id": "condesa",
        "name": "Condesa",
        "alcaldia": "Cuauhtémoc",
        "liv": 92, "mov": 88, "sec": 76, "eco": 94,
        "price": 72,
        "inventory": 89,
        "mom": {"pct": "+4%", "positive": True},
        "trend": [62,63,64,65,65,66,67,68,68,68,69,70,70,71,72,72,71,72,72,73,72,72,72,72],
        "facts": {
            "LIV": [
                {"k": "Parques a 10 min", "v": "12"},
                {"k": "Amenidades", "v": "681"},
                {"k": "Ruido promedio", "v": "54 dB"},
            ],
            "MOV": [
                {"k": "Estaciones Metro", "v": "2"},
                {"k": "Ecobici", "v": "22 cicloestaciones"},
                {"k": "Tiempo a Reforma", "v": "18 min"},
            ],
            "SEC": [
                {"k": "Incidentes / 100k hab", "v": "38"},
                {"k": "Cámaras C5", "v": "35"},
                {"k": "Alumbrado público", "v": "97%"},
            ],
            "ECO": [
                {"k": "Restaurantes y cafés", "v": "524"},
                {"k": "Supermercados", "v": "9"},
                {"k": "Vida nocturna", "v": "Muy alta"},
            ],
        },
    },
    {
        "id": "roma-norte",
        "name": "Roma Norte",
        "alcaldia": "Cuauhtémoc",
        "liv": 90, "mov": 85, "sec": 72, "eco": 91,
        "price": 68,
        "inventory": 115,
        "mom": {"pct": "+8%", "positive": True},
        "trend": [56,57,58,59,60,61,62,62,63,64,64,65,66,66,67,67,67,68,68,68,68,68,68,68],
        "facts": {
            "LIV": [
                {"k": "Parques a 10 min", "v": "9"},
                {"k": "Amenidades", "v": "537"},
                {"k": "Ruido promedio", "v": "56 dB"},
            ],
            "MOV": [
                {"k": "Estaciones Metro", "v": "3"},
                {"k": "Ecobici", "v": "18 cicloestaciones"},
                {"k": "Tiempo a Reforma", "v": "15 min"},
            ],
            "SEC": [
                {"k": "Incidentes / 100k hab", "v": "47"},
                {"k": "Cámaras C5", "v": "31"},
                {"k": "Alumbrado público", "v": "91%"},
            ],
            "ECO": [
                {"k": "Restaurantes y cafés", "v": "489"},
                {"k": "Supermercados", "v": "8"},
                {"k": "Vida nocturna", "v": "Muy alta"},
            ],
        },
    },
]

@app.get("/api/colonias")
async def get_colonias():
    return COLONIAS_SEED

@app.get("/api/colonias/{colonia_id}")
async def get_colonia(colonia_id: str):
    for c in COLONIAS_SEED:
        if c["id"] == colonia_id:
            return c
    raise HTTPException(status_code=404, detail="Colonia no encontrada")


# ─── Properties (seed data) ──────────────────────────────────────────────────
PROPERTIES_SEED = [
    {
        "id": "p001",
        "title": "Departamento en Del Valle Centro",
        "price": 4850000,
        "price_display": "$4,850,000",
        "ppm2": 58,
        "appreciation": "+6.2%",
        "beds": 2, "baths": 2, "parking": 1, "sqm": 84,
        "colonia": "Del Valle Centro",
        "alcaldia": "Benito Juárez",
        "scores": {"liv": 87, "mov": 91, "sec": 74},
        "advisor": {"name": "Carlos Mendoza", "initials": "CM"},
        "tag": "Preventa",
        "mom": {"pct": "+6%", "positive": True},
        "scene": "building",
    },
    {
        "id": "p002",
        "title": "Penthouse en Condesa",
        "price": 8900000,
        "price_display": "$8,900,000",
        "ppm2": 72,
        "appreciation": "+4.1%",
        "beds": 3, "baths": 3, "parking": 2, "sqm": 124,
        "colonia": "Condesa",
        "alcaldia": "Cuauhtémoc",
        "scores": {"liv": 92, "mov": 88, "sec": 76},
        "advisor": {"name": "Ana Gutiérrez", "initials": "AG"},
        "tag": "Entrega inmediata",
        "mom": {"pct": "+4%", "positive": True},
        "scene": "interior",
    },
    {
        "id": "p003",
        "title": "Loft moderno en Roma Norte",
        "price": 5200000,
        "price_display": "$5,200,000",
        "ppm2": 68,
        "appreciation": "+8.3%",
        "beds": 1, "baths": 1, "parking": 1, "sqm": 76,
        "colonia": "Roma Norte",
        "alcaldia": "Cuauhtémoc",
        "scores": {"liv": 90, "mov": 85, "sec": 72},
        "advisor": {"name": "Miguel Torres", "initials": "MT"},
        "tag": "Hot",
        "mom": {"pct": "+8%", "positive": True},
        "scene": "view",
    },
]

@app.get("/api/properties")
async def get_properties():
    return PROPERTIES_SEED


# ─── Health ───────────────────────────────────────────────────────────────────
@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "DesarrollosMX API"}
