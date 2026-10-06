from pathlib import Path
import sys

import torch
import torch.nn.functional as F


# ==================================================
# Path 설정
# ==================================================

PROJECT_ROOT = Path(__file__).resolve().parents[2]
MOMENT_DETR_ROOT = PROJECT_ROOT / "ai" / "vendor" / "moment_detr"

sys.path.append(str(MOMENT_DETR_ROOT))


# ==================================================
# Moment-DETR import
# ==================================================

from run_on_video.data_utils import ClipFeatureExtractor
from run_on_video.model_utils import build_inference_model
from utils.tensor_utils import pad_sequences_1d
from moment_detr.span_utils import span_cxw_to_xx


# ==================================================
# 공통 설정
# ==================================================

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
CLIP_LEN = 2

CHECKPOINT_PATH = (
    PROJECT_ROOT
    / "models"
    / "moment_detr"
    / "scratch_clip_align_best.ckpt"
)


# ==================================================
# 모델 / CLIP extractor
# 서버 실행 중 한 번만 로드
# ==================================================

_MODEL = None
_FEATURE_EXTRACTOR = None


def get_model():
    global _MODEL

    if _MODEL is None:
        print(f"[AI] Loading Moment-DETR on {DEVICE}")

        _MODEL = build_inference_model(
            str(CHECKPOINT_PATH)
        )

        _MODEL = _MODEL.to(DEVICE)
        _MODEL.eval()

    return _MODEL


def get_feature_extractor():
    global _FEATURE_EXTRACTOR

    if _FEATURE_EXTRACTOR is None:
        print(f"[AI] Loading CLIP on {DEVICE}")

        _FEATURE_EXTRACTOR = ClipFeatureExtractor(
            framerate=1 / CLIP_LEN,
            size=224,
            centercrop=True,
            model_name_or_path="ViT-B/32",
            device=DEVICE
        )

    return _FEATURE_EXTRACTOR


# ==================================================
# Predictor
# ==================================================

def predict_moment(
    video_id,
    video_feature_path,
    query,
    video_duration=None
):
    """
    자연어 질의에 가장 관련된 영상 구간을 반환합니다.

    Parameters
    ----------
    video_id : str
        영상 ID

    video_feature_path : str | Path
        사전에 생성된 CLIP video feature (.pt)

    query : str
        자연어 검색 문장

    video_duration : float | None
        실제 영상 길이(초).
        전달하지 않으면 feature 개수 * 2초로 계산합니다.

    Returns
    -------
    dict
        {
            "video_id": str,
            "query": str,
            "start_time": float,
            "end_time": float,
            "score": float
        }
    """

    # ----------------------------------------------
    # 1. Video Feature
    # ----------------------------------------------

    video_feature_path = Path(video_feature_path)

    if not video_feature_path.is_absolute():
        video_feature_path = PROJECT_ROOT / video_feature_path

    if not video_feature_path.exists():
        raise FileNotFoundError(
            f"Video feature not found: {video_feature_path}"
        )

    video_feats = torch.load(
        video_feature_path,
        map_location=DEVICE
    )

    video_feats = video_feats.to(
        device=DEVICE,
        dtype=torch.float32
    )

    video_feats = F.normalize(
        video_feats,
        dim=-1,
        eps=1e-5
    )

    n_frames = len(video_feats)

    if n_frames == 0:
        raise ValueError("Video feature is empty.")


    # ----------------------------------------------
    # 2. TEF
    # ----------------------------------------------

    tef_st = (
        torch.arange(
            0,
            n_frames,
            dtype=torch.float32,
            device=DEVICE
        )
        / n_frames
    )

    tef_ed = tef_st + (1.0 / n_frames)

    tef = torch.stack(
        [tef_st, tef_ed],
        dim=1
    )

    video_feats = torch.cat(
        [video_feats, tef],
        dim=1
    )

    video_feats = video_feats.unsqueeze(0)

    video_mask = torch.ones(
        1,
        n_frames,
        device=DEVICE
    )


    # ----------------------------------------------
    # 3. Query Feature
    # ----------------------------------------------

    feature_extractor = get_feature_extractor()

    query_feats = feature_extractor.encode_text(
        [query]
    )

    query_feats, query_mask = pad_sequences_1d(
        query_feats,
        dtype=torch.float32,
        device=DEVICE,
        fixed_length=None
    )

    query_feats = F.normalize(
        query_feats,
        dim=-1,
        eps=1e-5
    )


    # ----------------------------------------------
    # 4. Model Input
    # ----------------------------------------------

    model_inputs = {
        "src_vid": video_feats,
        "src_vid_mask": video_mask,
        "src_txt": query_feats,
        "src_txt_mask": query_mask
    }


    # ----------------------------------------------
    # 5. Inference
    # ----------------------------------------------

    model = get_model()

    with torch.no_grad():
        outputs = model(**model_inputs)


    # ----------------------------------------------
    # 6. Decode
    # ----------------------------------------------

    prob = F.softmax(
        outputs["pred_logits"],
        dim=-1
    )

    scores = prob[..., 0]

    pred_spans = outputs["pred_spans"]

    if video_duration is None:
        video_duration = n_frames * CLIP_LEN

    video_duration = float(video_duration)

    spans = span_cxw_to_xx(
        pred_spans[0].cpu()
    )

    spans = spans * video_duration

    predictions = torch.cat(
        [
            spans,
            scores[0].cpu()[:, None]
        ],
        dim=1
    ).tolist()

    predictions = sorted(
        predictions,
        key=lambda x: x[2],
        reverse=True
    )


    # ----------------------------------------------
    # 7. Best prediction
    # ----------------------------------------------

    start_time, end_time, score = predictions[0]

    start_time = max(0.0, min(start_time, video_duration))
    end_time = max(start_time, min(end_time, video_duration))

    return {
        "video_id": video_id,
        "query": query,
        "start_time": round(start_time, 4),
        "end_time": round(end_time, 4),
        "score": round(score, 4)
    }



# ==================================================
# Hybrid start-time refinement
# ==================================================

import json
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from run_on_video.clip import clip


SUBTITLE_THRESHOLD = 0.35
START_OFFSET = 1.5
VISUAL_TOP_K = 8

_REFINE_CLIP_MODEL = None


def get_refine_clip_model():
    global _REFINE_CLIP_MODEL

    if _REFINE_CLIP_MODEL is None:
        print("[AI] Loading CLIP for visual refinement...")

        _REFINE_CLIP_MODEL, _ = clip.load(
            "ViT-B/32",
            device=DEVICE,
            jit=False
        )

        _REFINE_CLIP_MODEL.eval()

    return _REFINE_CLIP_MODEL


def _search_subtitle_start(
    query,
    subtitle_json_path
):
    """
    인접 자막 1~3개를 합친 window에 대해
    character n-gram TF-IDF 검색.

    Returns:
        None 또는 {
            score,
            start,
            end,
            text
        }
    """

    subtitle_json_path = Path(
        subtitle_json_path
    )

    if not subtitle_json_path.exists():
        return None

    with open(
        subtitle_json_path,
        "r",
        encoding="utf-8"
    ) as f:
        subtitles = json.load(f)

    if not subtitles:
        return None

    windows = []

    for window_size in (1, 2, 3):

        for i in range(
            len(subtitles) - window_size + 1
        ):
            group = subtitles[
                i:i + window_size
            ]

            windows.append({
                "start": float(
                    group[0]["start_time"]
                ),
                "end": float(
                    group[-1]["end_time"]
                ),
                "text": " ".join(
                    x["text"].strip()
                    for x in group
                )
            })

    if not windows:
        return None

    corpus = [
        x["text"]
        for x in windows
    ]

    vectorizer = TfidfVectorizer(
        lowercase=True,
        analyzer="char_wb",
        ngram_range=(3, 5),
        min_df=1
    )

    subtitle_matrix = (
        vectorizer.fit_transform(
            corpus
        )
    )

    query_vector = vectorizer.transform(
        [query]
    )

    scores = cosine_similarity(
        query_vector,
        subtitle_matrix
    )[0]

    best_idx = int(
        scores.argmax()
    )

    best = windows[best_idx]

    return {
        "score": float(
            scores[best_idx]
        ),
        "start": best["start"],
        "end": best["end"],
        "text": best["text"]
    }


@torch.no_grad()
def _encode_refine_query(query):

    clip_model = get_refine_clip_model()

    tokens = clip.tokenize(
        [query]
    ).to(DEVICE)

    output = clip_model.encode_text(
        tokens
    )

    query_feat = output[
        "pooler_output"
    ].float()

    query_feat = F.normalize(
        query_feat,
        dim=-1,
        eps=1e-6
    )

    return query_feat[0]


def _smooth_scores(scores):
    """
    자기 자신 + 앞뒤 1개 bin의 평균.
    """

    smoothed = torch.zeros_like(
        scores
    )

    for i in range(len(scores)):

        left = max(
            0,
            i - 1
        )

        right = min(
            len(scores),
            i + 2
        )

        smoothed[i] = scores[
            left:right
        ].mean()

    return smoothed


def _make_contiguous_clusters(indices):
    """
    정렬된 bin 번호를 연속 구간으로 묶음.
    예: [3, 5, 6, 20, 21, 22]
       -> [[3], [5,6], [20,21,22]]
    """

    if not indices:
        return []

    indices = sorted(indices)

    clusters = [
        [indices[0]]
    ]

    for idx in indices[1:]:

        if idx == clusters[-1][-1] + 1:
            clusters[-1].append(idx)

        else:
            clusters.append(
                [idx]
            )

    return clusters


@torch.no_grad()
def _refine_visual_start(
    query,
    video_feature_path,
    span_start,
    span_end
):
    """
    Moment-DETR 후보 내부의 2초 CLIP bin을 검색한 후
    smoothing + 연속 cluster 기반으로 시작 시점 보정.
    """

    video_feats = torch.load(
        video_feature_path,
        map_location=DEVICE
    ).float()

    video_feats = F.normalize(
        video_feats,
        dim=-1,
        eps=1e-6
    )

    query_feat = _encode_refine_query(
        query
    )

    start_idx = max(
        0,
        int(
            span_start // CLIP_LEN
        )
    )

    end_idx = min(
        len(video_feats),
        int(
            span_end // CLIP_LEN
        ) + 1
    )

    if end_idx <= start_idx:
        return max(
            0.0,
            float(span_start)
        )

    feats = video_feats[
        start_idx:end_idx
    ]

    raw_scores = feats @ query_feat

    smoothed = _smooth_scores(
        raw_scores
    )

    k = min(
        VISUAL_TOP_K,
        len(smoothed)
    )

    _, local_indices = torch.topk(
        smoothed,
        k=k
    )

    # 실제 전체 video bin 번호
    global_indices = [
        start_idx + int(i)
        for i in local_indices.tolist()
    ]

    clusters = _make_contiguous_clusters(
        global_indices
    )

    # 연속 bin이 2개 이상인 cluster 우선
    multi_clusters = [
        c
        for c in clusters
        if len(c) >= 2
    ]

    if multi_clusters:

        def cluster_score(cluster):

            local = [
                idx - start_idx
                for idx in cluster
            ]

            values = smoothed[
                torch.tensor(
                    local,
                    device=smoothed.device
                )
            ]

            # 긴 연속구간을 우선하되
            # 평균 similarity도 반영
            return (
                len(cluster),
                float(values.mean().item())
            )

        best_cluster = max(
            multi_clusters,
            key=cluster_score
        )

        selected_bin = min(
            best_cluster
        )

    else:

        # 연속 cluster가 없으면
        # smoothing Top-1 사용
        best_local = int(
            torch.argmax(
                smoothed
            ).item()
        )

        selected_bin = (
            start_idx
            + best_local
        )

    raw_start = (
        selected_bin
        * CLIP_LEN
    )

    final_start = max(
        0.0,
        raw_start - START_OFFSET
    )

    return float(
        final_start
    )


def predict_moment_hybrid(
    video_id,
    video_feature_path,
    query,
    subtitle_json_path=None,
    video_duration=None
):
    """
    서비스용 Hybrid inference.

    1. Visual-only Moment-DETR 실행
    2. subtitle TF-IDF score >= threshold:
       subtitle start 사용
    3. 그 외:
       Moment-DETR 후보 내부 visual CLIP
       smoothing + cluster refinement
    """

    visual_result = predict_moment(
        video_id=video_id,
        video_feature_path=video_feature_path,
        query=query,
        video_duration=video_duration
    )

    visual_start = float(
        visual_result["start_time"]
    )

    visual_end = float(
        visual_result["end_time"]
    )

    subtitle_result = None

    if subtitle_json_path is not None:

        subtitle_result = (
            _search_subtitle_start(
                query=query,
                subtitle_json_path=(
                    subtitle_json_path
                )
            )
        )

    # ----------------------------------------------
    # Subtitle confidence 충분
    # ----------------------------------------------

    if (
        subtitle_result is not None
        and subtitle_result["score"]
        >= SUBTITLE_THRESHOLD
    ):

        final_start = max(
            0.0,
            subtitle_result["start"]
            - START_OFFSET
        )

        # end는 현재 backend contract 유지를 위해 반환.
        # 실제 서비스에서는 start_time이 핵심.
        final_end = max(
            visual_end,
            subtitle_result["end"],
            final_start
        )

    # ----------------------------------------------
    # Subtitle confidence 낮음 / subtitle 없음
    # ----------------------------------------------

    else:

        final_start = (
            _refine_visual_start(
                query=query,
                video_feature_path=(
                    video_feature_path
                ),
                span_start=visual_start,
                span_end=visual_end
            )
        )

        final_end = max(
            visual_end,
            final_start
        )

    if video_duration is not None:

        duration = float(
            video_duration
        )

        final_start = min(
            final_start,
            duration
        )

        final_end = min(
            max(
                final_end,
                final_start
            ),
            duration
        )

    return {
        "video_id": video_id,
        "query": query,
        "start_time": round(
            final_start,
            4
        ),
        "end_time": round(
            final_end,
            4
        ),
        "score": visual_result[
            "score"
        ]
    }



# ==================================================
# 단독 테스트
# ==================================================

if __name__ == "__main__":

    result = predict_moment(
        video_id="video_001",
        video_feature_path=(
            "data/features/"
            "video_001_clip_features.pt"
        ),
        query=(
            "the steak is flipped "
            "while cooking in the pan"
        ),
        video_duration=54.32
    )

    print("\n=== Prediction Result ===")
    print(result)
