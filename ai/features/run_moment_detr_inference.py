from pathlib import Path
import sys

import torch
import torch.nn.functional as F


# ==================================================
# Path 설정
# ==================================================

PROJECT_ROOT = Path(__file__).resolve().parents[2]
MOMENT_DETR_ROOT = PROJECT_ROOT / "ai" / "external" / "moment_detr"

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

    top_predictions = []

    for start_time, end_time, score in predictions[:5]:
        start_time = max(0.0, min(start_time, video_duration))
        end_time = max(start_time, min(end_time, video_duration))

        top_predictions.append({
            "start_time": round(start_time, 4),
            "end_time": round(end_time, 4),
            "score": round(score, 4)
        })

    best_prediction = top_predictions[0]

    return {
        "video_id": video_id,
        "query": query,
        "start_time": best_prediction["start_time"],
        "end_time": best_prediction["end_time"],
        "score": best_prediction["score"],
        "top_predictions": top_predictions
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
