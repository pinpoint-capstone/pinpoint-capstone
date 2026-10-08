import os
from datetime import datetime, timezone
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
MODEL_VERSION = "stub"

load_dotenv(ROOT / "backend" / ".env")
supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])


def build_feature(video_path: str, video_id: str) -> str:
    """임시 가짜 함수. AI 팀원의 build_feature를 받으면 이 함수를 교체합니다."""
    FEATURE_DIR.mkdir(parents=True, exist_ok=True)
    out = FEATURE_DIR / f"{video_id}.stub"
    out.write_text(f"stub feature for {video_path}")
    return str(out)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


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


def check_status(youtube_video_id: str) -> dict | None:
    row = get_video(youtube_video_id)
    if not row:
        return None
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

    if row["status"] == "INDEXED" and feat:
        supabase.table("videos").update({"last_used_at": _now()}).eq("video_id", vid).execute()
        return {"state": "READY", "video_id": vid, "feature_path": feat["feature_path"]}

    if row["status"] == "PROCESSING":
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
        feature_path = build_feature(str(video_path), youtube_video_id)
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