import logging
import os
import re

import requests
from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

try:
    from . import indexer
    from .subtitles import load_subtitles
    from .translate import to_english
    from .youtube_search import fetch_video_meta, search_youtube
except ImportError:
    import indexer
    from subtitles import load_subtitles
    from translate import to_english
    from youtube_search import fetch_video_meta, search_youtube

logger = logging.getLogger("uvicorn.error")

YOUTUBE_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
MAX_DURATION_SEC = 30 * 60  # 임시값. 팀 합의 후 조정
# 자막 검색 결과를 인정하는 최소 유사도(0~1). backend/.env의 SUBTITLE_MIN_SCORE로 조정
SUBTITLE_MIN_SCORE = float(os.getenv("SUBTITLE_MIN_SCORE", "0.35"))


class SearchRequest(BaseModel):
    youtube_video_id: str
    query: str
    top_k: int = 5

class MultiSearchRequest(BaseModel):
    query: str
    youtube_video_ids: list[str] | None = None
    top_k_per_video: int = 3
    max_videos: int = 10
    auto_analyze: bool = False      # true면 미분석 영상의 분석을 백그라운드로 시작
    max_new_analyses: int = 3       # 한 번의 요청으로 새로 시작할 최대 영상 수 (최대 5)

def _err(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status,
                        content={"error": {"code": code, "message": message}})


def _youtube_error(e: requests.HTTPError) -> JSONResponse:
    quota = e.response is not None and e.response.status_code == 403
    return _err(503 if quota else 502,
                "YOUTUBE_QUOTA" if quota else "YOUTUBE_ERROR",
                "유튜브 API 호출에 실패했습니다.")


def _score_of(r: dict) -> float:
    """영상 결과는 score, 자막 결과는 subtitle_score에 점수가 들어 있습니다."""
    s = r.get("score")
    if s is None:
        s = r.get("subtitle_score")
    return float(s) if s is not None else 0.0


def _overlap_ratio(a: dict, b: dict) -> float:
    """두 구간이 겹치는 정도 (겹치는 길이 / 더 짧은 구간 길이)."""
    inter = max(0.0, min(a["end_time"], b["end_time"]) - max(a["start_time"], b["start_time"]))
    shortest = min(a["end_time"] - a["start_time"], b["end_time"] - b["start_time"])
    return inter / shortest if shortest > 0 else 0.0


def _dedupe(moments: list[dict], top_k: int, threshold: float = 0.5) -> list[dict]:
    """점수 순서를 유지하면서, 이미 고른 구간과 많이 겹치는 구간은 건너뜁니다."""
    kept = []
    for m in moments:
        if all(_overlap_ratio(m, k) < threshold for k in kept):
            kept.append(m)
        if len(kept) == top_k:
            break
    return kept


def _visual_search(video_id: str, feature_path: str, english_query: str, top_k: int):
    from ai.features.run_moment_detr_inference import predict_moments_hybrid

    return predict_moments_hybrid(
        video_id=video_id, video_feature_path=feature_path,
        query=english_query, top_k=top_k,
    )


def predict_moments(video_id: str, feature_path: str, query: str, top_k: int = 5):
    """구간 검색. 한국어 자막이 있으면 자막(MiniLM) 우선, 없으면 영상(Moment-DETR)으로 검색합니다.
    자막 유사도가 SUBTITLE_MIN_SCORE보다 낮은 결과는 버리고, 남는 게 없으면 영상 검색으로 넘어갑니다."""
    if indexer.USE_REAL_AI:
        from ai.features.fusion_search import predict_moments_fusion

        subtitles, language = load_subtitles(video_id)
        if language != "ko":
            subtitles = []  # 한국어 자막이 아니면 영상 검색으로

        with indexer._AI_LOCK:
            english_query = to_english(query)
            try:
                raw = predict_moments_fusion(
                    video_id=video_id,
                    feature_path=feature_path,
                    subtitles=subtitles,
                    korean_query=query,
                    english_query=english_query,
                    video_duration=None,
                    top_k=top_k * 3,  # 겹치는 구간을 거른 뒤 top_k개를 남기기 위해 넉넉히
                )
            except Exception as e:
                # 모델 경로 설정 누락 등으로 자막 검색이 안 되면 영상 검색으로 대신합니다.
                logger.warning("fusion 검색 실패, 영상 검색으로 대체합니다: %s", e)
                raw = _visual_search(video_id, feature_path, english_query, top_k * 3)

            # 자막 유사도가 너무 낮은 결과(관련 없는 문장)는 버립니다.
            kept = [r for r in raw
                    if r.get("source") != "subtitle" or _score_of(r) >= SUBTITLE_MIN_SCORE]
            if not kept and raw:
                logger.info("자막 유사도가 모두 %.2f 미만이라 영상 검색으로 대체합니다.",
                            SUBTITLE_MIN_SCORE)
                try:
                    kept = _visual_search(video_id, feature_path, english_query, top_k * 3)
                except Exception as e:
                    logger.warning("영상 검색 대체도 실패: %s", e)
            raw = kept

        moments = [
            {"start_time": r["start_time"], "end_time": r["end_time"],
             "score": _score_of(r), "source": r.get("source")}
            for r in raw
        ]
        return _dedupe(moments, top_k)
    return [
        {"start_time": 10.0 + 15 * i, "end_time": 20.0 + 15 * i,
         "score": round(0.9 - 0.1 * i, 2), "source": "stub"}
        for i in range(top_k)
    ]


def _try_start_analysis(yid: str, row: dict | None, background_tasks: BackgroundTasks):
    """미분석 영상의 분석을 시작합니다.
    반환: (새 상태 or None, 이번에 새로 시작했는지)
    None이면 상태를 바꾸지 않고 그대로 둡니다."""
    meta = {}
    if row is None:
        try:
            info = fetch_video_meta(yid)
        except requests.RequestException:
            return None, False
        if not info:
            return "NOT_FOUND", False
        if info["duration"] and info["duration"] > MAX_DURATION_SEC:
            return "TOO_LONG", False
        title = info["title"]
        meta = {"channel_name": info["channel_name"],
                "published_at": info["published_at"],
                "thumbnail_url": info["thumbnail_url"]}
    else:
        title = row["title"]

    r = indexer.prepare(yid, title, **meta)
    if r["state"] == "STARTED":
        background_tasks.add_task(indexer.run_indexing, r["video_id"], yid)
        return "PROCESSING", True
    if r["state"] == "PROCESSING":
        return "PROCESSING", False  # 이미 다른 요청이 분석 중
    return None, False  # READY: 방금 분석이 끝남. 다음 검색부터 결과에 나옴


def _moment(yid: str, i: int, m: dict) -> dict:
    return {"segment_id": f"{yid}-{i}", "start_time": m["start_time"],
            "end_time": m["end_time"], "score": m["score"],
            "source": m.get("source")}


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
        results = [_moment(yid, i, m) for i, m in enumerate(raw, start=1)]

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
    def search_multi(body: MultiSearchRequest, background_tasks: BackgroundTasks,
                     user_id=Depends(optional_user)):
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
            moments = [_moment(yid, i, m) for i, m in enumerate(raw, start=1)]
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
            budget = min(max(body.max_new_analyses, 0), 5) if body.auto_analyze else 0
            for yid in ids:
                if yid in done:
                    continue
                row = indexer.get_video(yid)
                status = row["status"] if row else "NOT_ANALYZED"
                # FAILED는 자동 재시도하지 않음 (사용자가 클릭하면 POST /api/search로 재시도)
                if budget > 0 and status in ("NOT_ANALYZED", "PENDING"):
                    new_status, started = _try_start_analysis(yid, row, background_tasks)
                    if new_status:
                        status = new_status
                    if started:
                        budget -= 1
                pending.append({"youtube_video_id": yid, "status": status})

        if user_id:
            try:
                indexer.supabase.table("search_history").insert(
                    {"user_id": user_id, "query": query}).execute()
            except Exception:
                pass

        return {"query": query, "videos": videos, "pending": pending}

    return router

def warmup_ai() -> None:
    """서버 시작 직후 모델을 미리 올려 첫 검색 지연을 없앱니다."""
    if not indexer.USE_REAL_AI:
        return
    try:
        rows = indexer.list_indexed(limit=1)
        if rows:
            feature = indexer.resolve_path(rows[0]["feature_path"])
            predict_moments(rows[0]["youtube_video_id"], str(feature), "warm up", 1)
    except Exception:
        pass
    try:
        with indexer._AI_LOCK:
            to_english("워밍업")  # 번역 모델 미리 올리기
            from ai.features.fusion_search import get_semantic_model
            get_semantic_model(model_type="finetuned")  # 한국어 MiniLM 미리 올리기
    except Exception as e:
        logger.warning("자막 검색/번역 모델 워밍업 실패: %s", e)