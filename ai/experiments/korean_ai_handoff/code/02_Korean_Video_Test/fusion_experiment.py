
from functools import lru_cache
from sentence_transformers import SentenceTransformer

@lru_cache(maxsize=1)
def get_semantic_model():
    return SentenceTransformer(
        "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
    )

from sentence_transformers import util
from ai.features.run_moment_detr_inference import predict_moments

# temporal_iou는 아래에 별도로 정의


def temporal_iou(a, b):
    intersection = max(
        0,
        min(a["end_time"], b["end_time"])
        - max(a["start_time"], b["start_time"])
    )

    union = (
        max(a["end_time"], b["end_time"])
        - min(a["start_time"], b["start_time"])
    )

    return intersection / union if union > 0 else 0


def get_semantic_subtitle_candidates(
    query,
    subtitles,
    model,
    top_k=5
):
    windows = []

    for size in (1, 2, 3):
        for i in range(len(subtitles) - size + 1):
            group = subtitles[i:i + size]

            windows.append({
                "start_time": group[0]["start_time"],
                "end_time": group[-1]["end_time"],
                "text": " ".join(s["text"] for s in group)
            })

    embeddings = model.encode(
        [w["text"] for w in windows],
        convert_to_tensor=True
    )

    query_embedding = model.encode(
        query,
        convert_to_tensor=True
    )

    scores = util.cos_sim(
        query_embedding,
        embeddings
    )[0]

    candidates = []

    for idx in scores.topk(min(top_k, len(windows))).indices.tolist():
        w = windows[idx]

        candidates.append({
            **w,
            "score": round(scores[idx].item(), 4),
            "source": "subtitle"
        })

    return candidates


def get_multilingual_subtitle_candidates(
    korean_query,
    english_query,
    subtitles,
    model,
    top_k=5
):
    candidates = []

    for language, query in [
        ("ko", korean_query),
        ("en", english_query)
    ]:
        results = get_semantic_subtitle_candidates(
            query=query,
            subtitles=subtitles,
            model=model,
            top_k=top_k
        )

        for r in results:
            candidates.append({
                **r,
                "language": language,
                "query_used": query
            })

    return candidates


def deduplicate_multilingual_candidates(
    candidates,
    iou_threshold=0.5,
    start_gap=5.0
):
    # 언어 간 점수를 비교하지 않고
    # 원래 후보 순서를 유지
    selected = []

    for candidate in candidates:
        duplicate = any(
            temporal_iou(candidate, kept) >= iou_threshold
            or (
                abs(
                    candidate["start_time"]
                    - kept["start_time"]
                ) < start_gap
            )
            for kept in selected
        )

        if not duplicate:
            selected.append(candidate)

    return selected


def make_fusion_result(
    video_id,
    query,
    candidate
):
    source = candidate["source"]

    return {
        "video_id": video_id,
        "query": query,
        "start_time": round(float(candidate["start_time"]), 4),
        "end_time": round(float(candidate["end_time"]), 4),
        "score": candidate.get("score") if source == "visual" else None,
        "source": source,
        "visual_score": (
            candidate.get("score") if source == "visual" else None
        ),
        "subtitle_score": (
            candidate.get("score") if source == "subtitle" else None
        ),
        "language": candidate.get("language")
    }


def predict_moments_fusion(
    video_id, feature_path, subtitles,
    korean_query, english_query,
    video_duration, top_k=5
):
    visual = [
        dict(r, source="visual")
        for r in predict_moments(
            video_id=video_id,
            video_feature_path=feature_path,
            query=english_query,
            video_duration=video_duration,
            top_k=top_k
        )
    ]

    subtitle = get_multilingual_subtitle_candidates(
        korean_query=korean_query,
        english_query=english_query,
        subtitles=subtitles,
        model=get_semantic_model(),
        top_k=top_k
    )

    ko = [r for r in subtitle if r["language"] == "ko"]
    en = [r for r in subtitle if r["language"] == "en"]

    # 첫 후보부터 세 검색 방식의 순서를 번갈아 사용
    ordered = []
    for i in range(max(len(visual), len(ko), len(en))):
        for group in (visual, ko, en):
            if i < len(group):
                ordered.append(group[i])

    selected = []

    for candidate in ordered:
        duplicate = any(
            temporal_iou(candidate, kept) >= 0.5
            or abs(candidate["start_time"] - kept["start_time"]) < 5.0
            for kept in selected
        )

        if not duplicate:
            selected.append(candidate)

        if len(selected) >= top_k:
            break

    return [
        make_fusion_result(video_id, korean_query, r)
        for r in selected
    ]
