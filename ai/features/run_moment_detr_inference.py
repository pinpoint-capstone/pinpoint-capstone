from pathlib import Path
import sys

import torch
import torch.nn.functional as F


# --------------------------------------------------
# Moment-DETR repository 경로
# --------------------------------------------------

MOMENT_DETR_ROOT = Path(
    "ai/external/moment_detr"
)

sys.path.append(
    str(MOMENT_DETR_ROOT.resolve())
)


# --------------------------------------------------
# Moment-DETR import
# --------------------------------------------------

from run_on_video.data_utils import (
    ClipFeatureExtractor
)

from run_on_video.model_utils import (
    build_inference_model
)

from utils.tensor_utils import (
    pad_sequences_1d
)

from moment_detr.span_utils import (
    span_cxw_to_xx
)


# --------------------------------------------------
# 공통 설정
# --------------------------------------------------

DEVICE = "cpu"
CLIP_LEN = 2

CHECKPOINT_PATH = (
    MOMENT_DETR_ROOT
    / "run_on_video"
    / "moment_detr_ckpt"
    / "model_best.ckpt"
)


# --------------------------------------------------
# Predictor 함수
# --------------------------------------------------

def predict_moment(
    video_id,
    video_feature_path,
    query
):

    # ----------------------------------------------
    # 1. Video Feature 불러오기
    # ----------------------------------------------

    video_feats = torch.load(
        video_feature_path,
        map_location=DEVICE
    )

    video_feats = F.normalize(
        video_feats,
        dim=-1,
        eps=1e-5
    )

    n_frames = len(video_feats)


    # ----------------------------------------------
    # 2. TEF 추가
    # ----------------------------------------------

    tef_st = (
        torch.arange(
            0,
            n_frames,
            dtype=torch.float32
        )
        / n_frames
    )

    tef_ed = (
        tef_st
        + 1.0 / n_frames
    )

    tef = torch.stack(
        [
            tef_st,
            tef_ed
        ],
        dim=1
    ).to(DEVICE)

    video_feats = torch.cat(
        [
            video_feats,
            tef
        ],
        dim=1
    )

    video_feats = video_feats.unsqueeze(0)

    video_mask = torch.ones(
        1,
        n_frames,
        device=DEVICE
    )


    # ----------------------------------------------
    # 3. Query Feature 생성
    # ----------------------------------------------

    feature_extractor = ClipFeatureExtractor(
        framerate=1 / CLIP_LEN,
        size=224,
        centercrop=True,
        model_name_or_path="ViT-B/32",
        device=DEVICE
    )

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
    # 4. 모델 입력 구성
    # ----------------------------------------------

    model_inputs = {
        "src_vid": video_feats,
        "src_vid_mask": video_mask,
        "src_txt": query_feats,
        "src_txt_mask": query_mask
    }


    # ----------------------------------------------
    # 5. Moment-DETR 모델 로드
    # ----------------------------------------------

    model = build_inference_model(
        str(CHECKPOINT_PATH)
    )

    model = model.to(DEVICE)

    model.eval()


    # ----------------------------------------------
    # 6. Inference
    # ----------------------------------------------

    with torch.no_grad():

        outputs = model(
            **model_inputs
        )


    # ----------------------------------------------
    # 7. 결과 Decode
    # ----------------------------------------------

    prob = F.softmax(
        outputs["pred_logits"],
        dim=-1
    )

    scores = prob[..., 0]

    pred_spans = outputs[
        "pred_spans"
    ]

    video_duration = (
        n_frames
        * CLIP_LEN
    )

    spans = span_cxw_to_xx(
        pred_spans[0].cpu()
    )

    spans = (
        spans
        * video_duration
    )

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
    # 8. 가장 높은 결과
    # ----------------------------------------------

    best_prediction = predictions[0]

    result = {
        "video_id": video_id,
        "query": query,
        "start_time": round(
            best_prediction[0],
            4
        ),
        "end_time": round(
            best_prediction[1],
            4
        ),
        "score": round(
            best_prediction[2],
            4
        )
    }

    return result


# --------------------------------------------------
# 단독 실행 테스트
# --------------------------------------------------

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
        )
    )

    print()
    print("=== Prediction Result ===")

    print(result)