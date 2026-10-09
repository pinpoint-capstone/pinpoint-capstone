import os
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

try:
    from .acquire import download_video
except ImportError:
    from acquire import download_video

ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = ROOT / "data" / "raw"
FEATURE_DIR = ROOT / "data" / "features"

load_dotenv(ROOT / "backend" / ".env")
USE_REAL_AI = os.getenv("USE_REAL_AI", "0") == "1"
MODEL_VERSION = "moment-detr-clip" if USE_REAL_AI else "stub"
_AI_LOCK = threading.Lock()  # GPU를 한 번에 하나만 쓰게 함

supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])


def _usable(feat) -> bool:
    """진짜 모드는 같은 모델 버전만, 가짜 모드는 이미 분석된 기록을 그대로 인정."""
    return bool(feat) and (not USE_REAL_AI or feat.get("model_version") == MODEL_VERSION)


def reclaim_stale(video_id: str, minutes: int = 15) -> bool:
    """서버가 꺼지는 바람에 멈춘 PROCESSING을 PENDING으로 되돌립니다."""
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=minutes)).isoformat()
    res = (
        supabase.table("videos")
        .update({"status": "PENDING", "error_message": None})
        .eq("video_id", video_id)
        .eq("status", "PROCESSING")
        .lt("updated_at", cutoff)
        .execute()
    )
    return bool(res.data)


def build_feature(video_path: str, video_id: str) -> str:
    if USE_REAL_AI:
        from ai.features.moment_detr_features import build_feature as real_build_feature
        with _AI_LOCK:
            return str(real_build_feature(video_path=video_path, video_id=video_id))
    FEATURE_DIR.mkdir(parents=True, exist_ok=True)
    out = FEATURE_DIR / f"{video_id}.stub"
    out.write_text(f"stub feature for {video_path}")
    return str(out)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _to_stored_path(p: str) -> str:
    """레포 안의 경로는 상대경로(슬래시)로 저장합니다."""
    try:
        return Path(p).resolve().relative_to(ROOT).as_posix()
    except ValueError:
        return str(p)


def resolve_path(stored: str) -> Path:
    p = Path(stored)
    return p if p.is_absolute() else ROOT / p


def get_video(youtube_video_id: str) -> dict | None:
    res = (
        supabase.table("videos")
        .select("*")
        .eq("youtube_video_id", youtube_video_id)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


def get_feature(video_id: str) -> dict | None:
    res = (
        supabase.table("video_features")
        .select("*")
        .eq("video_id", video_id)
        .order("id", desc=True)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


def register_video(youtube_video_id, title, channel_name=None,
                   published_at=None, thumbnail_url=None) -> dict:
    row = get_video(youtube_video_id)
    if row:
        return row
    try:
        res = supabase.table("videos").insert({
            "title": title,
            "youtube_video_id": youtube_video_id,
            "video_url": f"https://www.youtube.com/watch?v={youtube_video_id}",
            "thumbnail_url": thumbnail_url,
            "channel_name": channel_name,
            "published_at": published_at,
            "source_type": "youtube",
            "status": "PENDING",
        }).execute()
        return res.data[0]
    except Exception:
        # 동시에 같은 영상을 등록한 경우(중복 방지 인덱스)
        row = get_video(youtube_video_id)
        if row:
            return row
        raise


def set_status(video_id: str, status: str, error_message: str | None = None) -> None:
    supabase.table("videos").update(
        {"status": status, "error_message": error_message}
    ).eq("video_id", video_id).execute()


def claim(video_id: str) -> bool:
    """PENDING/FAILED일 때만 PROCESSING으로 바꿉니다. 성공한 한 요청만 분석을 시작합니다."""
    res = (
        supabase.table("videos")
        .update({"status": "PROCESSING", "error_message": None})
        .eq("video_id", video_id)
        .in_("status", ["PENDING", "FAILED"])
        .execute()
    )
    return bool(res.data)


def list_indexed(youtube_ids: list[str] | None = None, limit: int = 10) -> list[dict]:
    """분석 완료된 유튜브 영상 목록 (feature 경로 포함)."""
    q = (
        supabase.table("videos")
        .select("*")
        .eq("status", "INDEXED")
        .eq("source_type", "youtube")
    )
    if youtube_ids:
        q = q.in_("youtube_video_id", youtube_ids)
    rows = q.order("last_used_at", desc=True).limit(limit).execute().data
    if not rows:
        return []
    feats = (
        supabase.table("video_features")
        .select("video_id, feature_path, model_version, id")
        .in_("video_id", [r["video_id"] for r in rows])
        .order("id")
        .execute()
        .data
    )
    fmap = {f["video_id"]: f["feature_path"] for f in feats if _usable(f)}
    return [{**r, "feature_path": fmap[r["video_id"]]} for r in rows if r["video_id"] in fmap]


def check_status(youtube_video_id: str) -> dict | None:
    row = get_video(youtube_video_id)
    if not row:
        return None
    if row["status"] == "PROCESSING" and reclaim_stale(row["video_id"]):
        row["status"] = "PENDING"
    feat = get_feature(row["video_id"])
    return {
        "youtube_video_id": youtube_video_id,
        "video_id": row["video_id"],
        "status": row["status"],
        "error_message": row.get("error_message"),
        "feature_path": feat["feature_path"] if feat else None,
    }


def prepare(youtube_video_id: str, title: str, **meta) -> dict:
    """state: READY(바로 검색 가능) / STARTED(분석을 시작해야 함) / PROCESSING(이미 분석 중)"""
    row = register_video(youtube_video_id, title, **meta)
    vid = row["video_id"]
    feat = get_feature(vid)

    if row["status"] == "INDEXED" and _usable(feat):
        supabase.table("videos").update({"last_used_at": _now()}).eq("video_id", vid).execute()
        return {"state": "READY", "video_id": vid, "feature_path": feat["feature_path"]}

    if row["status"] == "PROCESSING":
        if not reclaim_stale(vid):
            return {"state": "PROCESSING", "video_id": vid}

    if row["status"] == "INDEXED":  # INDEXED인데 feature가 없는 비정상 상태
        set_status(vid, "PENDING")

    if claim(vid):
        return {"state": "STARTED", "video_id": vid}
    return {"state": "PROCESSING", "video_id": vid}


def run_indexing(video_id: str, youtube_video_id: str) -> None:
    """다운로드 → feature 생성 → 저장 → mp4 삭제. 오래 걸려서 백그라운드로 실행합니다."""
    video_path = None
    try:
        video_path = download_video(youtube_video_id, out_dir=str(RAW_DIR))
        feature_path = _to_stored_path(build_feature(str(video_path), youtube_video_id))
        supabase.table("video_features").delete().eq("video_id", video_id).execute()
        supabase.table("video_features").insert({
            "video_id": video_id,
            "feature_path": feature_path,
            "model_version": MODEL_VERSION,
        }).execute()
        supabase.table("videos").update(
            {"status": "INDEXED", "error_message": None, "last_used_at": _now()}
        ).eq("video_id", video_id).execute()
    except Exception as e:
        set_status(video_id, "FAILED", str(e)[:500])
    finally:
        if video_path and Path(video_path).exists():
            Path(video_path).unlink()


if __name__ == "__main__":
    import sys

    yid = sys.argv[1]
    title = sys.argv[2] if len(sys.argv) > 2 else yid
    r = prepare(yid, title)
    print("1차:", r)
    if r["state"] == "STARTED":
        run_indexing(r["video_id"], yid)
        print("상태:", check_status(yid))
    print("2차:", prepare(yid, title))