import re

import requests
from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

try:
    from . import indexer
    from .youtube_search import fetch_video_meta, search_youtube
except ImportError:
    import indexer
    from youtube_search import fetch_video_meta, search_youtube

YOUTUBE_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
MAX_DURATION_SEC = 30 * 60  # 임시값. 팀 합의 후 조정


class SearchRequest(BaseModel):
    youtube_video_id: str
    query: str
    top_k: int = 5

class MultiSearchRequest(BaseModel):
    query: str
    youtube_video_ids: list[str] | None = None
    top_k_per_video: int = 3
    max_videos: int = 10

def _err(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status,
                        content={"error": {"code": code, "message": message}})


def _youtube_error(e: requests.HTTPError) -> JSONResponse:
    quota = e.response is not None and e.response.status_code == 403
    return _err(503 if quota else 502,
                "YOUTUBE_QUOTA" if quota else "YOUTUBE_ERROR",
                "유튜브 API 호출에 실패했습니다.")


def predict_moments(video_id: str, feature_path: str, query: str, top_k: int = 5):
    """임시 가짜 함수. AI의 predict_moments_hybrid로 교체합니다.
    진짜 함수는 [{start_time, end_time, score, ...}, ...]를 돌려줍니다."""
    return [
        {"start_time": 10.0 + 15 * i, "end_time": 20.0 + 15 * i,
         "score": round(0.9 - 0.1 * i, 2)}
        for i in range(top_k)
    ]


def create_search_router(get_current_user) -> APIRouter:
    router = APIRouter()

    def optional_user(authorization: str | None = Header(None)):
        """로그인했으면 user_id, 아니면 None."""
        if not authorization:
            return None
        try:
            return get_current_user(authorization)
        except HTTPException:
            return None

    @router.get("/api/youtube/search")
    def youtube_search(q: str, max_results: int = 5):
        if not q.strip():
            return _err(400, "EMPTY_QUERY", "검색어가 비어 있습니다.")
        try:
            items = search_youtube(q.strip(), min(max(max_results, 1), 10))
        except requests.HTTPError as e:
            return _youtube_error(e)
        return {"items": items}

    @router.get("/api/videos/youtube/{youtube_video_id}/status")
    def video_status(youtube_video_id: str):
        if not YOUTUBE_ID_RE.match(youtube_video_id):
            return _err(400, "INVALID_YOUTUBE_ID", "올바르지 않은 영상 ID입니다.")
        s = indexer.check_status(youtube_video_id)
        if not s:
            return _err(404, "VIDEO_NOT_FOUND", "등록되지 않은 영상입니다.")
        return {"youtube_video_id": youtube_video_id,
                "status": s["status"], "error_message": s["error_message"]}

    @router.post("/api/search")
    def search(body: SearchRequest, background_tasks: BackgroundTasks,
               user_id=Depends(optional_user)):
        yid = body.youtube_video_id.strip()
        query = body.query.strip()
        top_k = min(max(body.top_k, 1), 10)

        if not YOUTUBE_ID_RE.match(yid):
            return _err(400, "INVALID_YOUTUBE_ID", "올바르지 않은 영상 ID입니다.")
        if not query:
            return _err(400, "EMPTY_QUERY", "검색어가 비어 있습니다.")

        row = indexer.get_video(yid)
        meta = {}
        if row is None:
            try:
                info = fetch_video_meta(yid)
            except requests.HTTPError as e:
                return _youtube_error(e)
            if not info:
                return _err(404, "VIDEO_NOT_FOUND", "유튜브에서 영상을 찾을 수 없습니다.")
            if info["duration"] and info["duration"] > MAX_DURATION_SEC:
                return _err(422, "VIDEO_TOO_LONG",
                            f"{MAX_DURATION_SEC // 60}분 이하 영상만 분석할 수 있습니다.")
            title = info["title"]
            meta = {"channel_name": info["channel_name"],
                    "published_at": info["published_at"],
                    "thumbnail_url": info["thumbnail_url"]}
        else:
            title = row["title"]

        r = indexer.prepare(yid, title, **meta)

        if r["state"] == "STARTED":
            background_tasks.add_task(indexer.run_indexing, r["video_id"], yid)
        if r["state"] in ("STARTED", "PROCESSING"):
            return JSONResponse(status_code=202, content={
                "status": "PROCESSING",
                "youtube_video_id": yid,
                "message": "영상을 분석 중입니다.",
            })

        feature = indexer.resolve_path(r["feature_path"])
        raw = predict_moments(yid, str(feature), query, top_k)
        results = [
            {"segment_id": f"{yid}-{i}", "start_time": m["start_time"],
             "end_time": m["end_time"], "score": m["score"]}
            for i, m in enumerate(raw, start=1)
        ]

        if user_id:
            try:
                indexer.supabase.table("search_history").insert(
                    {"user_id": user_id, "query": query}).execute()
            except Exception:
                pass  # 기록 저장 실패가 검색을 막지 않게 함

        v = indexer.get_video(yid)
        return {
            "status": "INDEXED",
            "video": {"video_id": v["video_id"], "youtube_video_id": yid,
                      "title": v["title"], "thumbnail_url": v.get("thumbnail_url")},
            "query": query,
            "results": results,
        }

    @router.post("/api/search/multi")
    def search_multi(body: MultiSearchRequest, user_id=Depends(optional_user)):
        query = body.query.strip()
        if not query:
            return _err(400, "EMPTY_QUERY", "검색어가 비어 있습니다.")

        ids = None
        if body.youtube_video_ids:
            ids = [i.strip() for i in body.youtube_video_ids][:20]
            if not all(YOUTUBE_ID_RE.match(i) for i in ids):
                return _err(400, "INVALID_YOUTUBE_ID", "올바르지 않은 영상 ID가 있습니다.")

        top_k = min(max(body.top_k_per_video, 1), 5)
        limit = min(max(body.max_videos, 1), 10)
        rows = indexer.list_indexed(ids, limit)

        videos = []
        for v in rows:
            yid = v["youtube_video_id"]
            try:
                feature = indexer.resolve_path(v["feature_path"])
                raw = predict_moments(yid, str(feature), query, top_k)
            except Exception:
                continue  # 한 영상이 실패해도 나머지는 계속
            moments = [
                {"segment_id": f"{yid}-{i}", "start_time": m["start_time"],
                 "end_time": m["end_time"], "score": m["score"]}
                for i, m in enumerate(raw, start=1)
            ]
            if not moments:
                continue
            videos.append({
                "video": {"video_id": v["video_id"], "youtube_video_id": yid,
                          "title": v["title"], "channel_name": v.get("channel_name"),
                          "thumbnail_url": v.get("thumbnail_url")},
                "best_score": max(m["score"] for m in moments),
                "moments": moments,
            })
        videos.sort(key=lambda x: x["best_score"], reverse=True)

        pending = []
        if ids:
            done = {v["video"]["youtube_video_id"] for v in videos}
            for yid in ids:
                if yid in done:
                    continue
                row = indexer.get_video(yid)
                pending.append({"youtube_video_id": yid,
                                "status": row["status"] if row else "NOT_ANALYZED"})

        if user_id:
            try:
                indexer.supabase.table("search_history").insert(
                    {"user_id": user_id, "query": query}).execute()
            except Exception:
                pass

        return {"query": query, "videos": videos, "pending": pending}

    return router