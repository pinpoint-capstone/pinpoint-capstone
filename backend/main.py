from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Header, Depends
from pydantic import BaseModel
from supabase import create_client
from dotenv import load_dotenv
import os
import uuid

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")

# DB/Storage 전용 클라이언트 (auth 작업에는 절대 사용하지 않음)
supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

app = FastAPI()


# ===================== 인증 =====================

class AuthRequest(BaseModel):
    email: str
    password: str

@app.post("/api/auth/signup")
def signup(body: AuthRequest):
    auth_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    try:
        result = auth_client.auth.sign_up({
            "email": body.email,
            "password": body.password,
        })
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {
        "user_id": result.user.id if result.user else None,
        "email": result.user.email if result.user else None,
    }

@app.post("/api/auth/login")
def login(body: AuthRequest):
    auth_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    try:
        result = auth_client.auth.sign_in_with_password({
            "email": body.email,
            "password": body.password,
        })
    except Exception:
        raise HTTPException(status_code=401, detail="이메일 또는 비밀번호가 올바르지 않습니다")

    return {
        "access_token": result.session.access_token,
        "refresh_token": result.session.refresh_token,
        "user_id": result.user.id,
        "email": result.user.email,
    }


# ===================== 공통: 토큰으로 현재 로그인한 유저 확인 =====================

def get_current_user(authorization: str = Header(...)):
    token = authorization.replace("Bearer ", "")
    auth_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    try:
        user_response = auth_client.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="유효하지 않은 토큰입니다")

    if not user_response or not user_response.user:
        raise HTTPException(status_code=401, detail="유효하지 않은 토큰입니다")

    return user_response.user.id


# ===================== 기본 =====================

@app.get("/")
def root():
    return {"status": "ok"}


# ===================== 영상 =====================

@app.get("/api/videos")
def get_videos():
    response = supabase.table("videos").select("*").execute()
    return response.data

@app.post("/api/videos")
async def upload_video(
    file: UploadFile = File(...),
    title: str = Form(...),
    genre: str = Form(None),
):
    video_id = str(uuid.uuid4())
    ext = file.filename.split(".")[-1]
    storage_path = f"{video_id}.{ext}"

    file_bytes = await file.read()
    supabase.storage.from_("videos").upload(
        storage_path,
        file_bytes,
        {"content-type": file.content_type},
    )

    video_url = supabase.storage.from_("videos").get_public_url(storage_path)

    supabase.table("videos").insert({
        "video_id": video_id,
        "title": title,
        "video_url": video_url,
        "genre": genre,
        "status": "PENDING",
    }).execute()

    return {"video_id": video_id, "status": "PENDING", "video_url": video_url}


# ===================== 검색 기록 =====================

@app.get("/api/users/me/history")
def get_history(user_id: str = Depends(get_current_user)):
    response = (
        supabase.table("search_history")
        .select("*")
        .eq("user_id", user_id)
        .order("searched_at", desc=True)
        .execute()
    )
    return {"history": response.data}


# ===================== 즐겨찾기 =====================

class FavoriteRequest(BaseModel):
    video_id: str
    start_time: float
    end_time: float

@app.post("/api/users/me/favorites")
def add_favorite(body: FavoriteRequest, user_id: str = Depends(get_current_user)):
    response = supabase.table("favorites").insert({
        "user_id": user_id,
        "video_id": body.video_id,
        "start_time": body.start_time,
        "end_time": body.end_time,
    }).execute()
    return response.data[0]

@app.delete("/api/users/me/favorites/{favorite_id}")
def delete_favorite(favorite_id: str, user_id: str = Depends(get_current_user)):
    supabase.table("favorites").delete().eq("favorite_id", favorite_id).eq("user_id", user_id).execute()
    return {"status": "deleted"}

@app.get("/api/users/me/favorites")
def get_favorites(user_id: str = Depends(get_current_user)):
    response = (
        supabase.table("favorites")
        .select("*")
        .eq("user_id", user_id)
        .execute()
    )
    return {"favorites": response.data}